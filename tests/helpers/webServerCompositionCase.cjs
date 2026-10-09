'use strict';
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// The fixture performs the fail-closed isolation validation and migrations before
// server.js is loaded, matching the production requirement that migrations run first.
require('./webApplicationFixture.cjs');
const db = require('../../db/database');
const { startServer } = require('../../server');

(async()=>{
  let server;
  try {
    const userId=Number(db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)').run('web_server_composition','组合测试用户').lastInsertRowid);
    const token=jwt.sign({userId,openid:'web_server_composition'},process.env.JWT_SECRET);
    server=startServer(0);
    await new Promise((resolve,reject)=>{if(server.listening)return resolve();server.once('listening',resolve);server.once('error',reject);});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const call=async(route,options={})=>{
      const response=await fetch(origin+route,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...options.headers}});
      const payload=await response.json().catch(()=>null);
      return {response,payload};
    };
    const page=await fetch(origin+'/web/');
    assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy')||'',/default-src 'self'/);
    assert.match(await page.text(),/id="code-login-form"/);
    const rootPage=await fetch(origin+'/');
    assert.equal(rootPage.status,200);assert.match(rootPage.headers.get('content-security-policy')||'',/default-src 'self'/);
    assert.match(await rootPage.text(),/id="code-login-form"/);

    const issued=await call('/api/web-session/code',{method:'POST',body:'{}'});
    assert.equal(issued.response.status,200);assert.equal(issued.response.headers.get('cache-control'),'no-store');
    const redeemed=await call('/api/web-session/redeem',{method:'POST',body:JSON.stringify({code:issued.payload.data.code}),headers:{Authorization:''}});
    assert.equal(redeemed.response.status,200);assert.equal(jwt.verify(redeemed.payload.data.token,process.env.JWT_SECRET).userId,userId);

    for(const route of ['/api/v4/applications/board','/api/v4/career/dashboard','/api/v4/jobs?pageSize=1','/api/ai/conversations?scope=general']){
      const result=await call(route);
      assert.equal(result.response.status,200,`${route} must be reachable through the real server`);
      assert.equal(result.response.headers.get('cache-control'),'no-store',`${route} must not be cached`);
    }
    const conflict=await call('/api/ai/conversations?scope=general&applicationId=1');
    assert.equal(conflict.response.status,400);
    const createdApplication=await call('/api/v4/applications',{method:'POST',body:JSON.stringify({jobId:'server-composition-writeback',status:'preparing',jobSnapshot:{company:'组合测试公司',title:'组合测试岗位'}})});
    assert.equal(createdApplication.response.status,200);
    const applicationId=createdApplication.payload.data.id;
    const conversationId=Number(db.prepare("INSERT INTO ai_conversations(user_id,application_id,title) VALUES (?,?,'Composition confirmation')").run(userId,applicationId).lastInsertRowid);
    const turnId=Number(db.prepare("INSERT INTO ai_conversation_turns(conversation_id,request_id,question,answer,status) VALUES (?,'composition-turn','Question','Answer','completed')").run(conversationId).lastInsertRowid);
    const save={actionId:`ai-save:${conversationId}:${turnId}`,applicationId,target:'note',content:'真实服务组合确认'};
    assert.equal((await call('/api/ai/assistant/save',{method:'POST',body:JSON.stringify(save)})).response.status,400);
    const firstSave=await call('/api/ai/assistant/save',{method:'POST',body:JSON.stringify({...save,confirm:true})});
    const replaySave=await call('/api/ai/assistant/save',{method:'POST',body:JSON.stringify({...save,confirm:true})});
    assert.equal(firstSave.response.status,201);assert.equal(firstSave.payload.data.replay,false);
    assert.equal(replaySave.response.status,200);assert.equal(replaySave.payload.data.replay,true);
    assert.equal(db.prepare('SELECT notes FROM applications WHERE id=?').pluck().get(applicationId).split('真实服务组合确认').length-1,1);
    console.log('Real server composition PASS: static Web, one-time login, applications, career, jobs, scoped AI and idempotent assistant save routes.');
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
