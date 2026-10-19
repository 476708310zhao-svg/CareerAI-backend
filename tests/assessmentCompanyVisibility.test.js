'use strict';

const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
const db = runtime.prepare();
const test = require('node:test');
runtime.registerCleanup(test);
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const path = require('node:path');
const companies = require('../services/companyService');

const stamp = `company-visibility-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const importedSource = 'assessment-feishu-import';
const createdIds = [];
let sequence = 0;

function fixture(source = importedSource, status = 'draft') {
  const name = `${stamp}-${++sequence}`;
  const id = Number(db.prepare('INSERT INTO companies (slug,display_name,source_primary,data_status) VALUES (?,?,?,?)')
    .run(name, name, source, status).lastInsertRowid);
  createdIds.push(id);
  return { id, name };
}

async function withHttp(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/companies', require('../routes/companies'));
  app.use('/admin', require('../routes/admin'));
  app.use('/api/v4/jobs', require('../routes/v4/jobs'));
  const server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await require('node:events').once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const adminToken = jwt.sign({ role: 'admin', permissions: ['*'], username: 'visibility-test' }, process.env.JWT_SECRET);
  async function request(url, { admin, token, body } = {}) {
    const headers = {};
    if (admin || token) headers.Authorization = `Bearer ${token || adminToken}`;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + url, { method: body ? 'PUT' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }
  try { await run(request); }
  finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test.after(() => {
  if (!db.open) return;
  for (const id of createdIds) {
    db.prepare('DELETE FROM company_aliases WHERE company_id=?').run(id);
    db.prepare('DELETE FROM companies WHERE id=?').run(id);
  }
});

test('assessment company visibility filters only the exact import source until published', () => {
  const matrix = [
    [importedSource, 'draft', false], [importedSource, 'archived', false],
    [importedSource, '', false], [importedSource, null, false],
    [importedSource, 'published', true], ['admin', 'draft', true],
    ['seed', 'draft', true], [`${importedSource}-other`, 'draft', true],
    [null, 'draft', true]
  ];
  for (const [source, status, visible] of matrix) {
    const company = fixture(source, status);
    const result = companies.listCompanies({ keyword: company.name }, { publicOnly: true });
    assert.equal(result.total, visible ? 1 : 0, `${source}/${status}`);
    assert.equal(result.list.some(row => row.id === company.id), visible);
    assert.equal(Boolean(companies.getCompanyById(company.id, { publicOnly: true })), visible);
    assert.equal(companies.getCompanyById(company.id).id, company.id);
  }
});

test('assessment company public list ignores query attempts to disable its visibility boundary', () => withHttp(async request => {
  const company = fixture();
  for (const suffix of ['', '&publicOnly=false', '&publicOnly=true', '&visibility[publicOnly]=false', '&source_primary=admin']) {
    const result = await request(`/api/companies?keyword=${encodeURIComponent(company.name)}${suffix}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.total, 0);
    assert.deepEqual(result.body.data.list, []);
  }
  const injected = await request(`/api/companies?keyword=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(injected.status, 200);
  assert.equal(injected.body.data.total, 0);
}));

test('assessment company direct public ID is hidden while unrelated drafts and published companies remain visible', () => withHttp(async request => {
  for (const [source, status, expected] of [[importedSource, 'draft', 404], ['admin', 'draft', 200], [importedSource, 'published', 200], ['seed', 'published', 200]]) {
    const company = fixture(source, status);
    const result = await request(`/api/companies/${company.id}?publicOnly=false`);
    assert.equal(result.status, expected);
    if (expected === 200) assert.equal(result.body.data.id, company.id);
    else assert.equal(result.body.message, '公司不存在');
  }
}));

test('assessment company draft remains available only through authorized admin list and detail', () => withHttp(async request => {
  const company = fixture();
  assert.equal((await request(`/admin/api/companies/${company.id}`)).status, 401);
  const detail = await request(`/admin/api/companies/${company.id}`, { admin: true });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.id, company.id);
  const list = await request(`/admin/api/companies?keyword=${encodeURIComponent(company.name)}&publicOnly=true`, { admin: true });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.total, 1);
  assert.equal(list.body.data.list[0].id, company.id);
}));

test('assessment company admin edit or archive preserves the marker until explicit publication', () => withHttp(async request => {
  const company = fixture();
  for (const body of [{ description: 'Reviewed later' }, { data_status: 'draft', source_primary: 'admin' }, { data_status: 'archived' }]) {
    const edited = await request(`/admin/api/companies/${company.id}`, { admin: true, body });
    assert.equal(edited.status, 200);
    assert.equal(db.prepare('SELECT source_primary FROM companies WHERE id=?').get(company.id).source_primary, importedSource);
    assert.equal((await request(`/api/companies/${company.id}`)).status, 404);
  }
  const published = await request(`/admin/api/companies/${company.id}`, { admin: true, body: { data_status: 'published' } });
  assert.equal(published.status, 200);
  assert.equal(db.prepare('SELECT source_primary FROM companies WHERE id=?').get(company.id).source_primary, 'admin');
  assert.equal((await request(`/api/companies/${company.id}`)).status, 200);
}));

test('assessment company user job detail does not reveal an imported unpublished company association', () => withHttp(async request => {
  const company = fixture();
  const jobFile = path.join(runtime.paths().dataDir, 'jobs.json');
  require('../utils/jobData').listJobs();
  const before = fs.readFileSync(jobFile);
  const jobs = JSON.parse(before);
  const jobId = `${stamp}-job`;
  jobs.jobs.push({ id: jobId, company: company.name, title: 'Visibility fixture', location: '上海', source: 'local' });
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)').run(`${stamp}-owner`, 'Visibility owner').lastInsertRowid);
  const token = jwt.sign({ userId }, process.env.JWT_SECRET);
  try {
    fs.writeFileSync(jobFile, JSON.stringify(jobs));
    const result = await request(`/api/v4/jobs/${jobId}/detail?publicOnly=false`, { token });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.company, null);
    db.prepare("UPDATE companies SET data_status='published' WHERE id=?").run(company.id);
    const published = await request(`/api/v4/jobs/${jobId}/detail`, { token });
    assert.equal(published.status, 200);
    assert.equal(published.body.data.company.id, company.id);
  } finally {
    fs.writeFileSync(jobFile, before);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
}));

test('assessment company filtered reads neither seed nor mutate an already populated company table', () => {
  const company = fixture();
  const before = db.prepare('SELECT id,slug,source_primary,data_status,updated_at FROM companies ORDER BY id').all();
  assert.ok(before.length > 0);
  companies.listCompanies({ keyword: company.name }, { publicOnly: true });
  companies.getCompanyById(company.id, { publicOnly: true });
  assert.deepEqual(db.prepare('SELECT id,slug,source_primary,data_status,updated_at FROM companies ORDER BY id').all(), before);
  assert.equal(companies.getCompanyById("0 OR 1=1", { publicOnly: true }), null);
});
