'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const Database = require('better-sqlite3');
const {readMigrations,applyPendingMigrations} = require('../db/migrate');
const importer = require('../services/assessmentImport');
const publicProfile = require('../docs/assessment-import-profile-20261019.json');
const copy = {usageInstructions:'使用测试电子资料。',claimInstructions:'付款后按订单指引领取。',updateInstructions:'范围以商品约定为准。',afterSalesInstructions:'问题请联系客服。'};
const clone = value => JSON.parse(JSON.stringify(value));

function source() {
  const rows = publicProfile.companies.map((company,index) => [company.companyName,`分享的文件：${company.companyName}备考文件\n链接：[https://pan.baidu.com/s/fakeShare${index}?pwd=aB12](https://pan.baidu.com/s/fakeShare${index}?pwd=aB12)`,['27届']]);
  for (let index = 0; index < 35; index++) rows.push(['未提供资料公司'+index,null,['27届']]);
  return {ok:true,data:{fields:['企业名称','测评资料网盘链接','届别'],field_id_list:['f-company','f-share','f-season'],record_id_list:rows.map((_,index) => 'rec-test-'+index),has_more:false,data:rows}};
}
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'assessment-import-test-'));
  const dbPath = path.join(directory,'target.db'), db = new Database(dbPath);
  const requirements = new Map();
  readMigrations().forEach(migration => migration.requirements.forEach(requirement => {
    const columns = requirements.get(requirement.table) || new Set();
    (requirement.columns.length ? requirement.columns : ['id']).forEach(column => columns.add(column));
    requirements.set(requirement.table,columns);
  }));
  for (const [table,columns] of requirements) {
    if (table === 'companies') for (const column of ['slug','source_primary','data_status']) columns.add(column);
    if (table === 'orders') for (const column of ['plan_id','plan_name','transaction_id']) columns.add(column);
    if (table === 'users') columns.add('is_vip');
    db.exec(`CREATE TABLE "${table}" (${[...columns].map(column => column === 'id' ? 'id INTEGER PRIMARY KEY' : `"${column}" ${['amount','plan_id','is_vip'].includes(column) ? 'INTEGER' : 'TEXT'}${column === 'slug' || (column === 'order_no' && table === 'orders') ? ' UNIQUE' : ''}`).join(',')})`);
  }
  db.exec('CREATE TABLE IF NOT EXISTS career_experience_library(id INTEGER PRIMARY KEY)');
  applyPendingMigrations(db);
  db.pragma('foreign_keys=ON');
  for (const company of publicProfile.companies.filter(item => item.companyName !== '拼多多')) db.prepare('INSERT INTO companies(slug,display_name,source_primary,data_status) VALUES (?,?,?,?)').run(company.companySlug,company.allowedCompanyNames[0],'existing','published');
  const clean = () => {
    if (db.open) db.close();
    assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('assessment-import-test-'));
    fs.rmSync(directory,{recursive:true,force:true});
  };
  return {directory,dbPath,db,clean};
}
function withFixture(callback) {
  const value = fixture();
  return Promise.resolve().then(() => callback(value)).finally(value.clean);
}
function counters(db) {
  return ['assessment_products','assessment_import_sources','assessment_product_companies','assessment_product_audit','companies'].map(table => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
}
function cliFiles(fixtureValue) {
  const {directory,dbPath} = fixtureValue;
  const sourcePath = path.join(directory,'private-source.json'), profilePath = path.join(directory,'public-profile.json'), copyPath = path.join(directory,'copy.json');
  fs.writeFileSync(sourcePath,JSON.stringify(source()));
  fs.writeFileSync(profilePath,JSON.stringify(publicProfile));
  fs.writeFileSync(copyPath,JSON.stringify(copy));
  const args = [`--db=${dbPath}`,`--source=${sourcePath}`,`--profile=${profilePath}`,`--instructions=${copyPath}`,'--target=local'];
  return {args,sourcePath,dbPath,backupPath:path.join(directory,'backup.db')};
}
function cli(args,extraEnvironment = {}) {
  return spawnSync(process.execPath,[path.join(__dirname,'../scripts/import_assessment_resources.js'),...args],{encoding:'utf8',timeout:20000,env:{...process.env,NODE_ENV:'test',...extraEnvironment}});
}

test('assessment import parses five mapped rows, skips 35 empty links and deduplicates Markdown URL', () => {
  const parsed = importer.parseSource(source(),publicProfile);
  assert.equal(parsed.records.length,5);assert.equal(parsed.totalRows,40);assert.equal(parsed.skippedEmpty,35);
  for (const record of parsed.records) {
    assert.equal(record.values.extraction_code,'aB12');assert.ok(!record.values.drive_url.includes('pwd'));
    assert.equal(record.values.price_cents,900);assert.equal(record.values.claim_days,null);assert.equal(record.contentNeedsReview,true);
    assert.match(record.values.catalog_text,/具体文件以网盘实际目录为准/);
    for (const column of ['title','summary','description','catalog_text','source_description']) assert.doesNotMatch(record.values[column],/https?:|aB12|fakeShare/);
  }
});
test('assessment import rejects ambiguous, insecure and malicious shares without echoing private values', () => {
  for (const share of ['https://pan.baidu.com/s/one https://pan.baidu.com/s/two','http://pan.baidu.com/s/one','https://pan.baidu.com.evil.test/s/one','https://evil.test/s/one','https://pan.baidu.com/s/one?pwd=toolong','https://pan.baidu.com/s/one?pwd=ab12 提取码: cd34','https://pan.baidu.com/s/one?x=ab12','<script>private()</script> https://pan.baidu.com/s/one']) {
    assert.throws(() => importer.parseShare(share),error => /^[A-Z_]+$/.test(error.message) && !error.message.includes('https'));
  }
  assert.equal(importer.parseShare('https://pan.baidu.com/s/one 提取码：ab12').extractionCode,'ab12');
});
test('assessment import rejects duplicate records/companies, unmapped links, incomplete snapshots and invalid profile prices', () => {
  const changes = [
    value => {value.data.has_more=true;},
    value => {value.data.record_id_list[1]=value.data.record_id_list[0];},
    value => {value.data.data[1][0]=value.data.data[0][0];},
    value => {value.data.data[1][0]='未映射公司';},
    value => {value.data.data[1].pop();},
    value => {value.data.fields[1]=value.data.fields[0];}
  ];
  for (const change of changes) { const value=source();change(value);assert.throws(() => importer.parseSource(value,publicProfile)); }
  const profile=clone(publicProfile);profile.companies[0].priceCents=9;assert.throws(() => importer.parseSource(source(),profile),/INVALID_PROFILE_PRICE/);
});
test('assessment import dry-run is redacted and does not write or initialize shared terms', () => withFixture(({db}) => {
  const before=counters(db),plan=importer.planImport(db,source(),publicProfile,copy),report=importer.summarize(plan);
  assert.deepEqual(counters(db),before);assert.equal(report.created,5);assert.equal(report.instructionsAction,'initialize');
  assert.equal(report.items.filter(item => item.companyAction === 'create-minimal').length,1);
  assert.doesNotMatch(JSON.stringify(report),/pan\.baidu|fakeShare|aB12|sourceRecordId|sourceFingerprint/);
  assert.equal(db.prepare('SELECT version FROM assessment_shared_instructions').pluck().get(),0);
}));
test('assessment import creates exactly five 9-yuan drafts with central copy and a minimal PDD company, then reruns without changes', () => withFixture(({db}) => {
  const result=importer.applyImport(db,source(),publicProfile,{instructions:copy});
  assert.equal(result.created,5);assert.equal(result.skippedEmpty,35);
  assert.equal(db.prepare('SELECT COUNT(*) FROM assessment_products WHERE status=\'draft\' AND price_cents=900 AND claim_days IS NULL').pluck().get(),5);
  assert.equal(db.prepare('SELECT COUNT(*) FROM assessment_import_sources WHERE content_needs_review=1').pluck().get(),5);
  assert.equal(db.prepare('SELECT COUNT(*) FROM assessment_home_config').pluck().get(),0);
  assert.equal(db.prepare('SELECT version FROM assessment_shared_instructions').pluck().get(),1);
  assert.equal(db.prepare('SELECT COUNT(*) FROM assessment_products WHERE usage_instructions<>\'\' OR claim_instructions<>\'\'').pluck().get(),0);
  assert.deepEqual(db.prepare('SELECT slug,display_name,source_primary,data_status FROM companies WHERE slug=?').get('pinduoduo'),{slug:'pinduoduo',display_name:'拼多多',source_primary:'assessment-feishu-import',data_status:'draft'});
  const before=counters(db),second=importer.applyImport(db,source(),publicProfile,{instructions:copy});
  assert.equal(second.unchanged,5);assert.deepEqual(counters(db),before);assert.equal(db.prepare('SELECT version FROM assessment_shared_instructions').pluck().get(),1);
}));
test('assessment import never adopts or overwrites a manual product with the same SKU', () => withFixture(({db}) => {
  db.prepare('INSERT INTO assessment_products(title,cover_url,summary,price_cents,virtual_product_id) VALUES (?,?,?,?,?)').run('手工商品','https://example.test/c.png','手工摘要',900,'assessment_jd');
  assert.throws(() => importer.applyImport(db,source(),publicProfile,{instructions:copy}),/SKU_ALREADY_OWNED/);
  assert.equal(db.prepare('SELECT title FROM assessment_products').pluck().get(),'手工商品');
  assert.equal(db.prepare('SELECT version FROM assessment_shared_instructions').pluck().get(),0);
  assert.equal(db.prepare('SELECT COUNT(*) FROM assessment_import_sources').pluck().get(),0);
}));
test('assessment import rejects foreign-namespace collisions and manual draft edits, but supports changed owned drafts', () => withFixture(({db}) => {
  importer.applyImport(db,source(),publicProfile,{instructions:copy});
  const foreign=clone(publicProfile);foreign.sourceNamespace='feishu:another-table';
  assert.throws(() => importer.applyImport(db,source(),foreign),/SKU_ALREADY_OWNED/);
  const changed=source();changed.data.data[0][1]=changed.data.data[0][1].replaceAll('fakeShare0','changedShare');
  assert.equal(importer.applyImport(db,changed,publicProfile).updated,1);
  const id=db.prepare('SELECT id FROM assessment_products WHERE virtual_product_id=?').pluck().get('assessment_jd');
  db.prepare('UPDATE assessment_products SET summary=? WHERE id=?').run('手工更新的摘要',id);
  const again=clone(changed);again.data.data[0][1]=again.data.data[0][1].replaceAll('changedShare','nextShare');
  assert.throws(() => importer.applyImport(db,again,publicProfile),/MANUAL_PRODUCT_EDIT_CONFLICT/);
  assert.equal(db.prepare('SELECT summary FROM assessment_products WHERE id=?').pluck().get(id),'手工更新的摘要');
}));
test('assessment import does not silently modify published products or replace configured common text', () => withFixture(({db}) => {
  importer.applyImport(db,source(),publicProfile,{instructions:copy});
  db.prepare("UPDATE assessment_products SET status='active' WHERE virtual_product_id='assessment_jd'").run();
  assert.equal(importer.applyImport(db,source(),publicProfile).items.find(item=>item.company==='京东').status,'active');
  const changed=source();changed.data.data[0][1]=changed.data.data[0][1].replaceAll('fakeShare0','changedShare');
  assert.throws(() => importer.applyImport(db,changed,publicProfile),/PUBLISHED_PRODUCT_CHANGE_REQUIRES_ADMIN/);
  assert.throws(() => importer.applyImport(db,source(),publicProfile,{instructions:{...copy,usageInstructions:'另一套说明'}}),/SHARED_INSTRUCTIONS_CONFLICT/);
  assert.equal(db.prepare('SELECT version FROM assessment_shared_instructions').pluck().get(),1);
}));
test('assessment import transaction rolls back shared copy, company, products and audit after a mid-batch failure', () => withFixture(({db}) => {
  // Fixture-only trigger injects a real SQLite failure after the first row.
  db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON assessment_products WHEN NEW.virtual_product_id='assessment_pdd' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  const before=counters(db);
  assert.throws(() => importer.applyImport(db,source(),publicProfile,{instructions:copy}),/fixture failure/);
  assert.deepEqual(counters(db),before);assert.equal(db.prepare('SELECT version FROM assessment_shared_instructions').pluck().get(),0);
}));
test('assessment import retains paid snapshots, deliveries, ledger and membership values', () => withFixture(({db}) => {
  db.prepare("INSERT INTO users(id,openid,is_vip) VALUES (1,'import-test-member',1)").run();
  db.prepare("INSERT INTO assessment_products(id,title,cover_url,summary,price_cents,virtual_product_id) VALUES (800,'历史资料','https://example.test/c.png','历史',900,'old-assessment')").run();
  db.prepare("INSERT INTO orders(id,order_no,user_id,provider,status,amount,plan_id) VALUES (1,'OLD-PAID',1,'virtual','paid',1990,-1),(2,'MEMBER',1,'virtual','paid',19000,3)").run();
  db.prepare("INSERT INTO assessment_order_details(order_no,product_id,user_id,snapshot,idempotency_key) VALUES ('OLD-PAID',800,1,?,?)").run('{"priceCents":1990,"usageInstructions":"历史约定"}','old-key');
  db.prepare("INSERT INTO assessment_deliveries(order_no,status) VALUES ('OLD-PAID','ready')").run();
  db.prepare("INSERT INTO commerce_ledger_v4(idempotency_key,event_type,user_id,order_no,amount_delta) VALUES ('old-ledger','payment_confirmed',1,'OLD-PAID',1990)").run();
  const tables=['orders','assessment_order_details','assessment_deliveries','commerce_ledger_v4','users'];
  const before=tables.map(table=>db.prepare(`SELECT * FROM ${table}`).all());
  importer.applyImport(db,source(),publicProfile,{instructions:copy});
  assert.deepEqual(tables.map(table=>db.prepare(`SELECT * FROM ${table}`).all()),before);
}));
test('assessment import CLI requires explicit target, defaults read-only and never outputs private links', () => withFixture(value => {
  const files=cliFiles(value),before=counters(value.db);
  const missing=cli(files.args.filter(arg=>!arg.startsWith('--target=')));assert.equal(missing.status,1);assert.match(missing.stderr,/EXPLICIT_TARGET/);
  const result=cli(files.args);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).mode,'dry-run');
  assert.deepEqual(counters(value.db),before);assert.doesNotMatch(result.stdout+result.stderr,/fakeShare|aB12|pan\.baidu/);
}));
test('assessment import CLI rejects absent backup, wrong target confirmation and unapproved production', () => withFixture(value => {
  const files=cliFiles(value),base=[...files.args,'--apply','--confirm=IMPORT_ASSESSMENT_DRAFTS',`--confirm-target=${files.dbPath}`];
  assert.match(cli(base).stderr,/NEW_EXTERNAL_BACKUP_PATH_REQUIRED/);
  assert.match(cli([...base.filter(arg=>!arg.startsWith('--confirm-target=')),'--confirm-target=wrong',`--backup=${files.backupPath}`]).stderr,/EXACT_RESOLVED_DATABASE/);
  const production=[...base.filter(arg=>!arg.startsWith('--target=')),'--target=production',`--backup=${files.backupPath}`];
  assert.match(cli(production).stderr,/PRODUCTION_APPROVAL_AND_MAINTENANCE/);
  assert.match(cli(files.args,{NODE_ENV:'production'}).stderr,/PRODUCTION_TARGET_CANNOT_BE_DOWNGRADED/);
  assert.equal(fs.existsSync(files.backupPath),false);assert.equal(value.db.prepare('SELECT COUNT(*) FROM assessment_products').pluck().get(),0);
}));
test('assessment import CLI makes and verifies a new external backup before applying five drafts', () => withFixture(value => {
  const files=cliFiles(value);
  const args=[...files.args,'--apply','--confirm=IMPORT_ASSESSMENT_DRAFTS',`--confirm-target=${files.dbPath}`,`--backup=${files.backupPath}`];
  const result=cli(args);assert.equal(result.status,0,result.stderr);
  const parsed=JSON.parse(result.stdout);assert.equal(parsed.created,5);assert.match(parsed.backupSha256,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(result.stdout+result.stderr,/fakeShare|aB12|pan\.baidu/);
  const backup=new Database(files.backupPath,{readonly:true});
  try {assert.equal(backup.pragma('integrity_check',{simple:true}),'ok');assert.equal(backup.prepare('SELECT COUNT(*) FROM assessment_products').pluck().get(),0);} finally {backup.close();}
  assert.equal(value.db.prepare('SELECT COUNT(*) FROM assessment_products').pluck().get(),5);
  assert.match(cli(args).stderr,/NEW_EXTERNAL_BACKUP_PATH_REQUIRED/);
}));
test('assessment import rejects wrong company identity and does not fabricate metadata or silently use a mismatched slug', () => withFixture(({db}) => {
  db.prepare("UPDATE companies SET display_name='另一个公司' WHERE slug='jd-com'").run();
  assert.throws(()=>importer.applyImport(db,source(),publicProfile),/COMPANY_SLUG_IDENTITY_CONFLICT/);
  assert.equal(db.prepare('SELECT COUNT(*) FROM assessment_products').pluck().get(),0);
}));
