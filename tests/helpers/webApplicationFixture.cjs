'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function validateIsolatedRuntime(env = process.env) {
  if (env.WEB_TEST_ISOLATED !== '1') throw new Error('Web tests require WEB_TEST_ISOLATED=1');
  const names = ['DB_PATH', 'DATA_DIR', 'UPLOAD_DIR'];
  const values = Object.fromEntries(names.map(name => [name, String(env[name] || '').trim()]));
  for (const name of names) {
    if (!values[name]) throw new Error(`Web tests require ${name}`);
    if (!path.isAbsolute(values[name])) throw new Error(`Web tests require absolute ${name}`);
    if (!fs.existsSync(values[name])) throw new Error(`Web tests require existing ${name}`);
    if (fs.lstatSync(values[name]).isSymbolicLink()) throw new Error(`Web tests reject symbolic ${name}`);
  }
  const dbStat = fs.statSync(values.DB_PATH);
  if (!dbStat.isFile()) throw new Error('Web tests require DB_PATH to be a file');
  if (dbStat.size !== 0) throw new Error('Web tests require DB_PATH to be an empty new file');
  if (dbStat.nlink !== 1) throw new Error('Web tests require DB_PATH to have exactly one hard link');
  for (const name of ['DATA_DIR', 'UPLOAD_DIR']) {
    if (!fs.statSync(values[name]).isDirectory()) throw new Error(`Web tests require ${name} to be a directory`);
  }
  const roots = [path.dirname(values.DB_PATH), path.dirname(values.DATA_DIR), path.dirname(values.UPLOAD_DIR)].map(value => path.resolve(value));
  if (new Set(roots).size !== 1) throw new Error('Web test paths must share one isolated temporary root');
  const root = fs.realpathSync(roots[0]);
  const temp = fs.realpathSync(os.tmpdir());
  const relative = path.relative(temp, root);
  if (!relative || relative.includes(path.sep) || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Web test root must be a direct child of the system temporary directory');
  const rootStat = fs.lstatSync(roots[0]);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || path.resolve(root) !== roots[0]) throw new Error('Web test root must be a real temporary directory');
  for (const name of names) {
    const resolved = fs.realpathSync(values[name]);
    if (path.resolve(path.dirname(resolved)) !== root) throw new Error(`Web tests require resolved ${name} inside the isolated root`);
  }
  return {root, ...values};
}

validateIsolatedRuntime();

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
// Match the legacy startup DDL that the baseline migration explicitly verifies.
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();
require('../../db/migrate').applyPendingMigrations(db);

async function start() {
  const userId = Number(db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)').run('web_case_owner','Web case owner').lastInsertRowid);
  const otherId = Number(db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)').run('web_case_other','Web case other').lastInsertRowid);
  const tokens = new Map([userId,otherId].map(id => [id, jwt.sign({userId:id},process.env.JWT_SECRET)]));
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use('/web', (_req,res,next) => {
    res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'");
    next();
  });
  app.use('/api/web-session', require('../../routes/web-session'));
  app.use(express.static(path.join(__dirname,'../../public')));
  app.use('/api/v4/applications', require('../../routes/v4/applications'));
  app.use('/api/v4/jobs', require('../../routes/v4/jobs'));
  app.use('/api/ai/conversations', require('../../routes/ai-conversations'));
  app.use('/api/ai', require('../../routes/ai'));
  app.use('/api/v4/career', require('../../routes/v4/career'));
  app.use('/api/v4/today', require('../../routes/v4/today'));
  app.use((err,req,res,next) => res.status(err.status || 500).json({code:-1,message:err.message}));
  const server = await new Promise(resolve => { const listening = app.listen(0,'127.0.0.1',() => resolve(listening)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function call(route, method='GET', body, user=userId) {
    const response = await fetch(url+'/api/v4/applications'+route, {method, headers:{'Content-Type':'application/json',...(user ? {Authorization:`Bearer ${tokens.get(user)}`} : {})}, body:body === undefined ? undefined : JSON.stringify(body)});
    return {status:response.status, body:await response.json(), headers:response.headers};
  }
  async function apiCall(route, method='GET', body, user=userId, extraHeaders={}) {
    const response = await fetch(url+route, {method, headers:{'Content-Type':'application/json',...(user ? {Authorization:`Bearer ${tokens.get(user)}`} : {}),...extraHeaders}, body:body === undefined ? undefined : JSON.stringify(body)});
    return {status:response.status, body:await response.json(), headers:response.headers};
  }
  let count=0;
  async function create(status='preparing', user=userId, overrides={}) {
    const result=await call('', 'POST', {jobId:`web_case_${++count}`,status,jobSnapshot:{company:'示例公司',title:`岗位 ${count}`,description:'岗位职责：分析和沟通'},...overrides}, user);
    if(result.status!==200) throw new Error(JSON.stringify(result));
    return result.body.data;
  }
  const close = async () => { await new Promise(resolve=>server.close(resolve)); db.close(); };
  return {url,call,apiCall,create,db,userId,otherId,token:tokens.get(userId),close};
}
module.exports={start,validateIsolatedRuntime};
