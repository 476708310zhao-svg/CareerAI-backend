'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { backupDatabase, restoreDatabase } = require('../db/backup');
const { assertSchema: assertAssistantConfirmationSchema } = require('../services/aiAssistantConfirmations');
const {
  DEFAULT_MIGRATIONS_DIR,
  applyPendingMigrations,
  getMigrationStatus,
  readMigrations
} = require('../db/migrate');

function withTempDir(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-migration-test-'));
  return Promise.resolve()
    .then(() => run(directory))
    .finally(() => fs.rmSync(directory, { recursive: true, force: true }));
}

function copyMigrationsThrough(targetDirectory, lastVersion) {
  fs.mkdirSync(targetDirectory, { recursive: true });
  readMigrations()
    .filter(migration => migration.version <= lastVersion)
    .forEach(migration => {
      fs.copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIR, migration.fileName),
        path.join(targetDirectory, migration.fileName)
      );
    });
}

function createRequiredBaselineTables(db) {
  const requirements = new Map();
  readMigrations().forEach(migration => migration.requirements.forEach(requirement => {
    const columns = requirements.get(requirement.table) || new Set();
    (requirement.columns.length > 0 ? requirement.columns : ['id']).forEach(column => columns.add(column));
    requirements.set(requirement.table, columns);
  }));
  requirements.forEach((columns, table) => {
    db.exec(`CREATE TABLE "${table}" (${Array.from(columns).map(column => (
      column === 'id' ? '"id" INTEGER PRIMARY KEY' : column === 'amount' && table === 'orders' ? '"amount" INTEGER' : `"${column}" TEXT`
    )).join(', ')})`);
  });
  // These legacy V4 parents predate the versioned runner but are referenced by
  // later additive migrations. Include them so foreign-key cascade tests model
  // the real startup baseline instead of an intentionally minimal stub.
  db.exec('CREATE TABLE IF NOT EXISTS career_experience_library (id INTEGER PRIMARY KEY)');
  db.exec('CREATE TABLE IF NOT EXISTS job_reminders (id INTEGER PRIMARY KEY)');
  // Production orders.order_no is UNIQUE; model that parent key for the new delivery FK.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS fixture_orders_number ON orders(order_no)');
}

test('database migration baseline is recorded once and exposes status', () => withTempDir(directory => {
  const db = new Database(path.join(directory, 'baseline.db'));
  try {
    createRequiredBaselineTables(db);

    const first = applyPendingMigrations(db);
    const second = applyPendingMigrations(db);
    const status = getMigrationStatus(db);

    assert.equal(first.appliedNow.length, readMigrations().length);
    assert.equal(second.appliedNow.length, 0);
    assert.equal(status.applied.length, readMigrations().length);
    assert.equal(status.pending.length, 0);
    assert.match(status.applied[0].checksum, /^[a-f0-9]{64}$/);
    assert.equal(status.applied.at(-1).version, '0033');
    assert.equal(
      db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('ai_conversations','ai_conversation_turns')").pluck().get(),
      2
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(application_history)').all()
        .filter(column => ['batch_id', 'batch_size'].includes(column.name))
        .map(column => ({ name: column.name, notnull: column.notnull })),
      [{ name: 'batch_id', notnull: 0 }, { name: 'batch_size', notnull: 0 }]
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_application_history_owner_batch)').all().map(column => column.name),
      ['user_id', 'batch_id', 'id']
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(ai_conversation_turns)').all()
        .filter(column => ['request_fingerprint', 'context_snapshot'].includes(column.name))
        .map(column => ({
          name: column.name,
          notnull: column.notnull,
          defaultValue: column.dflt_value
        })),
      [
        { name: 'request_fingerprint', notnull: 1, defaultValue: "''" },
        { name: 'context_snapshot', notnull: 1, defaultValue: "'{}'" }
      ]
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_conversations_owner_application)').all().map(column => column.name),
      ['user_id', 'application_id', 'id']
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_turns_conversation_status)').all().map(column => column.name),
      ['conversation_id', 'status', 'id']
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ai_assistant_confirmations'").pluck().get(),
      1
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_assistant_confirmations_application)').all().map(column => column.name),
      ['user_id', 'application_id', 'id']
    );
    assert.doesNotThrow(() => assertAssistantConfirmationSchema(db));
  } finally {
    db.close();
  }
}));

test('database migration upgrades an existing 0001-0006 database through 0027 exactly once', () => withTempDir(directory => {
  const legacyMigrationsDir = path.join(directory, 'migrations-through-0006');
  copyMigrationsThrough(legacyMigrationsDir, '0006');

  const db = new Database(path.join(directory, 'upgrade.db'));
  try {
    createRequiredBaselineTables(db);
    const legacy = applyPendingMigrations(db, { migrationsDir: legacyMigrationsDir });
    assert.deepEqual(legacy.appliedNow.map(migration => migration.version), [
      '0001', '0002', '0003', '0004', '0005', '0006'
    ]);

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.equal(
      db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').pluck().get(),
      '0033'
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('ai_conversations','ai_conversation_turns')").pluck().get(),
      2
    );
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration upgrades an existing 0001-0007 database with nullable batch metadata', () => withTempDir(directory => {
  const previousMigrationsDir = path.join(directory, 'migrations-through-0007');
  copyMigrationsThrough(previousMigrationsDir, '0007');

  const db = new Database(path.join(directory, 'batch-upgrade.db'));
  try {
    createRequiredBaselineTables(db);
    const previous = applyPendingMigrations(db, { migrationsDir: previousMigrationsDir });
    assert.equal(previous.appliedNow.at(-1).version, '0007');
    db.prepare('INSERT INTO application_history (id, application_id, user_id) VALUES (?, ?, ?)').run('1', '11', '21');

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.deepEqual(
      db.prepare('SELECT batch_id AS batchId, batch_size AS batchSize FROM application_history WHERE id=?').get('1'),
      { batchId: null, batchSize: null }
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_application_history_owner_batch)').all().map(column => column.name),
      ['user_id', 'batch_id', 'id']
    );
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration upgrades an existing 0001-0008 AI conversation schema through 0015 exactly once', () => withTempDir(directory => {
  const previousMigrationsDir = path.join(directory, 'migrations-through-0008');
  copyMigrationsThrough(previousMigrationsDir, '0008');

  const db = new Database(path.join(directory, 'ai-conversation-upgrade.db'));
  try {
    createRequiredBaselineTables(db);
    const previous = applyPendingMigrations(db, { migrationsDir: previousMigrationsDir });
    assert.equal(previous.appliedNow.at(-1).version, '0008');

    db.prepare('INSERT INTO users (id) VALUES (?)').run('1');
    db.prepare('INSERT INTO applications (id, user_id) VALUES (?, ?)').run('11', '1');
    const conversationId = db.prepare(`
      INSERT INTO ai_conversations (user_id, application_id, title)
      VALUES (?, ?, ?)
    `).run('1', '11', 'Legacy conversation').lastInsertRowid;
    const turnId = db.prepare(`
      INSERT INTO ai_conversation_turns
        (conversation_id, request_id, question, answer, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(conversationId, 'legacy-request', 'Legacy question', 'Legacy answer', 'completed').lastInsertRowid;

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.deepEqual(
      db.prepare(`
        SELECT request_fingerprint AS requestFingerprint,
               context_snapshot AS contextSnapshot
        FROM ai_conversation_turns
        WHERE id=?
      `).get(turnId),
      { requestFingerprint: '', contextSnapshot: '{}' }
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(ai_conversation_turns)').all()
        .filter(column => ['request_fingerprint', 'context_snapshot'].includes(column.name))
        .map(column => ({
          name: column.name,
          notnull: column.notnull,
          defaultValue: column.dflt_value
        })),
      [
        { name: 'request_fingerprint', notnull: 1, defaultValue: "''" },
        { name: 'context_snapshot', notnull: 1, defaultValue: "'{}'" }
      ]
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_conversations_owner_application)').all().map(column => column.name),
      ['user_id', 'application_id', 'id']
    );
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_turns_conversation_status)').all().map(column => column.name),
      ['conversation_id', 'status', 'id']
    );
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration upgrades an existing 0001-0009 database with an idempotency uniqueness ledger', () => withTempDir(directory => {
  const previousMigrationsDir = path.join(directory, 'migrations-through-0009');
  copyMigrationsThrough(previousMigrationsDir, '0009');

  const db = new Database(path.join(directory, 'assistant-confirmation-upgrade.db'));
  try {
    db.pragma('foreign_keys = ON');
    assert.equal(db.pragma('foreign_keys', { simple:true }), 1);
    createRequiredBaselineTables(db);
    const previous = applyPendingMigrations(db, { migrationsDir: previousMigrationsDir });
    assert.equal(previous.appliedNow.at(-1).version, '0009');
    assert.throws(() => assertAssistantConfirmationSchema(db), /migration 0010 is required/);

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.doesNotThrow(() => assertAssistantConfirmationSchema(db));
    assert.deepEqual(
      db.prepare('PRAGMA foreign_key_list(ai_assistant_confirmations)').all()
        .map(key => ({from:key.from,to:`${key.table}.${key.to}`,onDelete:key.on_delete}))
        .sort((left,right)=>left.from.localeCompare(right.from)),
      [
        {from:'application_id',to:'applications.id',onDelete:'CASCADE'},
        {from:'conversation_id',to:'ai_conversations.id',onDelete:'CASCADE'},
        {from:'turn_id',to:'ai_conversation_turns.id',onDelete:'CASCADE'},
        {from:'user_id',to:'users.id',onDelete:'CASCADE'},
      ]
    );
    const insert = db.prepare(`
      INSERT INTO ai_assistant_confirmations
        (user_id,action_id,request_fingerprint,application_id,conversation_id,turn_id,source_scope,action_target,response_json)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const createGraph = seed => {
      const userId=100+seed,applicationId=200+seed;
      db.prepare('INSERT INTO users (id,openid) VALUES (?,?)').run(userId,`migration-owner-${seed}`);
      db.prepare('INSERT INTO applications (id,user_id) VALUES (?,?)').run(applicationId,userId);
      const conversationId=Number(db.prepare("INSERT INTO ai_conversations(user_id,application_id,title) VALUES (?,?,?)").run(userId,applicationId,`Conversation ${seed}`).lastInsertRowid);
      const turnId=Number(db.prepare("INSERT INTO ai_conversation_turns(conversation_id,request_id,question,answer,status) VALUES (?,?,?,'Answer','completed')").run(conversationId,`request-${seed}`,`Question ${seed}`).lastInsertRowid);
      const actionId=`ai-save:${conversationId}:${turnId}`;
      insert.run(userId,actionId,`fingerprint-${seed}`,applicationId,conversationId,turnId,'application','note','{"target":"note"}');
      return {userId,applicationId,conversationId,turnId,actionId};
    };
    const unique=createGraph(1);
    assert.throws(
      () => insert.run(unique.userId,unique.actionId,'other-fingerprint',unique.applicationId,unique.conversationId,unique.turnId,'application','task','{"target":"task"}'),
      /UNIQUE constraint failed/
    );
    assert.equal(db.prepare('SELECT COUNT(*) FROM ai_assistant_confirmations').pluck().get(), 1);

    const byUser=createGraph(2);db.prepare('DELETE FROM users WHERE id=?').run(byUser.userId);
    const byApplication=createGraph(3);db.prepare('DELETE FROM applications WHERE id=?').run(byApplication.applicationId);
    const byConversation=createGraph(4);db.prepare('DELETE FROM ai_conversations WHERE id=?').run(byConversation.conversationId);
    const byTurn=createGraph(5);db.prepare('DELETE FROM ai_conversation_turns WHERE id=?').run(byTurn.turnId);
    for(const graph of [byUser,byApplication,byConversation,byTurn]) {
      assert.equal(db.prepare('SELECT COUNT(*) FROM ai_assistant_confirmations WHERE action_id=?').pluck().get(graph.actionId),0);
    }
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration 0011 preserves material drafts and expands only the supported material types', () => withTempDir(directory => {
  const previousMigrationsDir = path.join(directory, 'migrations-through-0010');
  copyMigrationsThrough(previousMigrationsDir, '0010');

  const db = new Database(path.join(directory, 'material-types-upgrade.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    const previous = applyPendingMigrations(db, { migrationsDir: previousMigrationsDir });
    assert.equal(previous.appliedNow.at(-1).version, '0010');
    db.prepare('INSERT INTO users (id,openid) VALUES (?,?)').run(1, 'migration-material-owner');
    db.prepare('INSERT INTO applications (id,user_id) VALUES (?,?)').run(11, 1);
    db.prepare('INSERT INTO application_materials (id,user_id,ai_draft_id) VALUES (501,1,77)').run();
    db.prepare('INSERT INTO application_materials (id,user_id,ai_draft_id) VALUES (502,1,77)').run();
    db.prepare(`INSERT INTO interview_notebook
      (id,user_id,question_id,title,answer,category,difficulty,status,created_at,updated_at)
      VALUES (88,1,'legacy-q','Legacy question','Legacy answer','behavior','medium','mastered','2026-10-01','2026-10-02')`).run();
    db.prepare(`
      INSERT INTO ai_application_material_drafts
        (id,user_id,application_id,material_type,status,content,ai_model,prompt_version,prompt_snapshot,quota_feature,quota_cost,saved_material_id,created_at,confirmed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(77, 1, 11, 'cover_letter', 'confirmed', 'legacy draft', 'fixture-model', 'fixture-prompt', '', 'application_assistant', 1, 502, '2026-10-09 00:00:00', '2026-10-09 00:01:00');
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('interview_notebook','ai_application_material_drafts')").run();
    db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES ('interview_notebook',900),('ai_application_material_drafts',800)").run();

    const upgrade = applyPendingMigrations(db);
    assert.deepEqual(upgrade.appliedNow.map(migration => migration.version), ['0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.deepEqual(
      db.prepare("SELECT name,seq FROM sqlite_sequence WHERE name IN ('interview_notebook','ai_application_material_drafts') ORDER BY name").all(),
      [{ name:'ai_application_material_drafts', seq:800 }, { name:'interview_notebook', seq:900 }]
    );
    assert.deepEqual(
      db.prepare('SELECT id,material_type AS materialType,status,content,saved_material_id AS savedMaterialId FROM ai_application_material_drafts WHERE id=77').get(),
      { id: 77, materialType: 'cover_letter', status:'confirmed', content: 'legacy draft', savedMaterialId:501 }
    );
    assert.deepEqual(
      db.prepare('SELECT id,ai_draft_id AS aiDraftId FROM application_materials WHERE id IN (501,502) ORDER BY id').all(),
      [{ id:501, aiDraftId:'77' }, { id:502, aiDraftId:null }]
    );
    assert.equal(
      db.prepare('SELECT id FROM application_materials WHERE user_id=1 AND ai_draft_id=77').pluck().get(),
      501
    );
    const insert = db.prepare(`
      INSERT INTO ai_application_material_drafts
        (user_id,application_id,material_type,status,content,ai_model,prompt_version)
      VALUES (1,11,?,'pending','draft','fixture-model','fixture-prompt')
    `);
    assert.doesNotThrow(() => insert.run('why_company'));
    assert.doesNotThrow(() => insert.run('why_role'));
    assert.throws(() => insert.run('unsupported_type'), /CHECK constraint failed/);
    assert.deepEqual(
      db.prepare('PRAGMA index_info(idx_ai_material_drafts_application)').all().map(column => column.name),
      ['user_id', 'application_id', 'status', 'created_at']
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(interview_notebook)').all()
        .filter(column => ['application_id', 'company', 'position'].includes(column.name))
        .map(column => column.name),
      ['application_id', 'company', 'position']
    );
    assert.deepEqual(
      db.prepare('SELECT id,question_id AS questionId,title,status FROM interview_notebook WHERE id=88').get(),
      { id:88, questionId:'legacy-q', title:'Legacy question', status:'mastered' }
    );
    assert.ok(insert.run('cover_letter').lastInsertRowid > 800);
    assert.ok(db.prepare("INSERT INTO interview_notebook(user_id,question_id,title) VALUES (1,'next-q','Next')").run().lastInsertRowid > 900);
    assert.deepEqual(db.prepare('PRAGMA index_info(idx_application_materials_ai_draft_owner)').all().map(column=>column.name), ['user_id','ai_draft_id']);
    assert.ok(db.prepare('PRAGMA foreign_key_list(interview_notebook)').all().some(key=>key.from==='application_id'&&key.table==='applications'&&key.on_delete==='SET NULL'));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally {
    db.close();
  }
}));

test('database migration 0012 preserves existing orders and creates no fake products or home recommendations', () => withTempDir(directory => {
  const previousDir=path.join(directory,'through-0011');copyMigrationsThrough(previousDir,'0011');
  const db=new Database(path.join(directory,'assessment-upgrade.db'));
  try {
    createRequiredBaselineTables(db);applyPendingMigrations(db,{migrationsDir:previousDir});
    db.prepare('INSERT INTO users(id,openid) VALUES (1,?)').run('assessment-migration-owner');
    db.prepare('INSERT INTO orders(id,order_no,user_id,provider) VALUES (1,?,1,?)').run('EXISTING-ORDER','wxpay');
    const before=db.prepare('SELECT * FROM orders WHERE id=1').get();
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(m=>m.version),['0012','0013','0014','0015','0016','0017','0018','0019','0020','0021','0022','0023','0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.deepEqual(db.prepare('SELECT * FROM orders WHERE id=1').get(),before);
    for(const name of ['assessment_products','assessment_product_companies','assessment_home_config','assessment_order_details','assessment_deliveries','assessment_product_audit']) assert.equal(db.prepare(`SELECT COUNT(*) FROM ${name}`).pluck().get(),0);
    assert.equal(applyPendingMigrations(db).appliedNow.length,0);
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
}));

test('database migration 0013 fixes catalogue at nine yuan and closes only legacy assessment pending orders', () => withTempDir(directory => {
  const previousDir=path.join(directory,'through-0012');copyMigrationsThrough(previousDir,'0012');
  const targetDir=path.join(directory,'through-0013');copyMigrationsThrough(targetDir,'0013');
  const db=new Database(path.join(directory,'assessment-fixed-price.db'));
  try {
    createRequiredBaselineTables(db);applyPendingMigrations(db,{migrationsDir:previousDir});
    db.prepare('INSERT INTO users(id,openid) VALUES (1,?)').run('nine-yuan-migration-owner');
    for(const [index,status] of ['active','draft','inactive'].entries()) db.prepare('INSERT INTO assessment_products(id,title,cover_url,summary,price_cents,status) VALUES (?,?,?,?,?,?)').run(index+1,'原有资料 '+index,'https://example.test/cover.png','原简介',index===1?900:1990,status);
    const cases=[['OLD-PENDING','pending',1990],['NINE-PENDING','pending',900],['OLD-PAID','paid',1990],['OLD-REFUNDED','refunded',1990],['MEMBERSHIP-PENDING','pending',1990]];
    for(const [index,[orderNo,status,amount]] of cases.entries()) {
      db.prepare('INSERT INTO orders(id,order_no,user_id,provider,status,amount) VALUES (?,?,1,?,?,?)').run(index+1,orderNo,'wxpay',status,amount);
      if(orderNo!=='MEMBERSHIP-PENDING') db.prepare('INSERT INTO assessment_order_details(order_no,product_id,user_id,snapshot,idempotency_key) VALUES (?,1,1,?,?)').run(orderNo,JSON.stringify({title:'历史标题',priceCents:amount,claimDays:365}),'legacy-'+index);
    }
    db.prepare("INSERT INTO assessment_deliveries(order_no,status,expires_at) VALUES ('OLD-PAID','ready','2027-01-01')").run();
    db.prepare("INSERT INTO commerce_ledger_v4(idempotency_key,event_type,user_id,order_no,amount_delta) VALUES ('legacy-payment','payment_confirmed',1,'OLD-PAID',1990)").run();
    const originals={paid:db.prepare("SELECT * FROM orders WHERE order_no='OLD-PAID'").get(),refunded:db.prepare("SELECT * FROM orders WHERE order_no='OLD-REFUNDED'").get(),details:db.prepare('SELECT * FROM assessment_order_details ORDER BY order_no').all(),deliveries:db.prepare('SELECT * FROM assessment_deliveries').all(),ledger:db.prepare('SELECT * FROM commerce_ledger_v4').all()};
    assert.deepEqual(applyPendingMigrations(db,{migrationsDir:targetDir}).appliedNow.map(m=>m.version),['0013']);
    assert.deepEqual(db.prepare('SELECT price_cents FROM assessment_products ORDER BY id').all().map(r=>r.price_cents),[900,900,900]);
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_no='OLD-PENDING'").pluck().get(),'cancelled');
    for(const orderNo of ['NINE-PENDING','MEMBERSHIP-PENDING']) assert.equal(db.prepare('SELECT status FROM orders WHERE order_no=?').pluck().get(orderNo),'pending');
    assert.equal(Number(db.prepare("SELECT amount FROM orders WHERE order_no='OLD-PENDING'").pluck().get()),1990);
    assert.deepEqual(db.prepare("SELECT * FROM orders WHERE order_no='OLD-PAID'").get(),originals.paid);
    assert.deepEqual(db.prepare("SELECT * FROM orders WHERE order_no='OLD-REFUNDED'").get(),originals.refunded);
    assert.deepEqual(db.prepare('SELECT * FROM assessment_order_details ORDER BY order_no').all(),originals.details);
    assert.deepEqual(db.prepare('SELECT * FROM assessment_deliveries').all(),originals.deliveries);
    assert.deepEqual(db.prepare('SELECT * FROM commerce_ledger_v4').all(),originals.ledger);
    assert.equal(applyPendingMigrations(db,{migrationsDir:targetDir}).appliedNow.length,0);
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
}));

test('database migration 0014 starts shared copy empty, closes only assessment pending and retains paid terms', () => withTempDir(directory=>{
  const previousDir=path.join(directory,'through-0013');copyMigrationsThrough(previousDir,'0013');
  const db=new Database(path.join(directory,'shared-instructions.db'));
  try {
    createRequiredBaselineTables(db);applyPendingMigrations(db,{migrationsDir:previousDir});
    db.prepare('INSERT INTO users(id,openid) VALUES (1,?)').run('shared-migration-owner');
    db.prepare('INSERT INTO assessment_products(id,title,cover_url,summary,price_cents,usage_instructions) VALUES (1,?,?,?,?,?)').run('旧资料','https://example.test/c.png','摘要',900,'旧商品使用说明');
    for(const [index,[number,status]] of [['SHARED-PENDING','pending'],['SHARED-PAID','paid'],['MEMBER-PENDING','pending']].entries()) {
      db.prepare('INSERT INTO orders(id,order_no,user_id,provider,status,amount) VALUES (?,?,1,?,?,900)').run(index+1,number,'mock',status);
      if(index<2) db.prepare('INSERT INTO assessment_order_details(order_no,product_id,user_id,snapshot,idempotency_key) VALUES (?,1,1,?,?)').run(number,JSON.stringify({usageInstructions:'购买时说明',priceCents:900}),'shared-'+index);
    }
    const before=db.prepare("SELECT * FROM assessment_order_details WHERE order_no='SHARED-PAID'").get();
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item=>item.version),['0014','0015','0016','0017','0018','0019','0020','0021','0022','0023','0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    const shared=db.prepare('SELECT * FROM assessment_shared_instructions WHERE id=1').get();
    assert.equal(shared.version,0);
    for(const key of ['usage_instructions','claim_instructions','update_instructions','after_sales_instructions'])assert.equal(shared[key],'');
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_no='SHARED-PENDING'").pluck().get(),'cancelled');
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_no='MEMBER-PENDING'").pluck().get(),'pending');
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_no='SHARED-PAID'").pluck().get(),'paid');
    assert.deepEqual(db.prepare("SELECT * FROM assessment_order_details WHERE order_no='SHARED-PAID'").get(),before);
    assert.equal(db.prepare('SELECT usage_instructions FROM assessment_products WHERE id=1').pluck().get(),'旧商品使用说明');
    assert.equal(applyPendingMigrations(db).appliedNow.length,0);
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
  }finally{db.close();}
}));

test('database migration 0015 creates private unique source ownership without altering existing products', () => withTempDir(directory => {
  const previousDir=path.join(directory,'through-0014');copyMigrationsThrough(previousDir,'0014');
  const db=new Database(path.join(directory,'assessment-source-ownership.db'));
  try {
    createRequiredBaselineTables(db);applyPendingMigrations(db,{migrationsDir:previousDir});
    db.prepare('INSERT INTO assessment_products(id,title,cover_url,summary,price_cents) VALUES (1,?,?,?,900),(2,?,?,?,900)').run('旧商品','https://example.test/old.png','旧摘要','第二商品','https://example.test/two.png','第二摘要');
    const products=db.prepare('SELECT * FROM assessment_products ORDER BY id').all();
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item=>item.version),['0015','0016','0017','0018','0019','0020','0021','0022','0023','0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.equal(db.prepare('SELECT COUNT(*) FROM assessment_import_sources').pluck().get(),0);
    assert.deepEqual(db.prepare('SELECT * FROM assessment_products ORDER BY id').all(),products);
    const insert=db.prepare('INSERT INTO assessment_import_sources(source_namespace,source_record_id,product_id,source_fingerprint,managed_fingerprint,imported_by) VALUES (?,?,?,?,?,?)');
    insert.run('feishu:test','record-one',1,'source-hash','product-hash','test');
    assert.throws(()=>insert.run('feishu:test','record-one',2,'source-hash','product-hash','test'),/UNIQUE constraint/);
    assert.throws(()=>insert.run('feishu:other','record-two',1,'source-hash','product-hash','test'),/UNIQUE constraint/);
    assert.equal(db.prepare('SELECT content_needs_review FROM assessment_import_sources').pluck().get(),1);
    assert.equal(applyPendingMigrations(db).appliedNow.length,0);
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
  } finally {db.close();}
}));

test('database migration 0016 adds private PDF provenance with deny-by-default state and stable checksum', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0015');
  copyMigrationsThrough(previousDir, '0015');
  const db = new Database(path.join(directory, 'private-pdf-assets.db'));
  try {
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    const migration = readMigrations().find(item => item.version === '0016');
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    const through0016 = path.join(directory, 'through-0016');
    copyMigrationsThrough(through0016, '0016');
    assert.deepEqual(applyPendingMigrations(db, { migrationsDir: through0016 }).appliedNow.map(item => item.version), ['0016']);
    assert.equal(getMigrationStatus(db).applied.find(item => item.version === '0016').checksum, migration.checksum);
    db.prepare("INSERT INTO question_asset_batches(label,client_key,created_by) VALUES ('test','test-key','admin')").run();
    db.prepare("INSERT INTO question_pdf_assets(sha256,byte_size,storage_key) VALUES (?,?,?)").run('a'.repeat(64), 25, 'aa/' + 'a'.repeat(64) + '.pdf');
    const asset = db.prepare('SELECT * FROM question_pdf_assets').get();
    assert.deepEqual([asset.validation_status, asset.scan_status, asset.processing_right, asset.display_right, asset.publish_status], ['pending', 'pending', 0, 0, 'blocked']);
    assert.throws(() => db.prepare("UPDATE question_pdf_assets SET publish_status='published' WHERE id=?").run(asset.id), /CHECK constraint/);
    assert.throws(() => db.prepare("INSERT INTO question_pdf_assets(sha256,byte_size,storage_key) VALUES (?,?,?)").run('a'.repeat(64), 25, 'different-key'), /UNIQUE constraint/);
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
}));

test('database migration 0017 adds separate rights and content review ledgers without granting anything', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0016');
  copyMigrationsThrough(previousDir, '0016');
  const db = new Database(path.join(directory, 'governance.db'));
  try {
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    db.prepare("INSERT INTO question_asset_batches(label,client_key,created_by) VALUES ('test','governance','admin')").run();
    const assetId = db.prepare('INSERT INTO question_pdf_assets(sha256,byte_size,storage_key) VALUES (?,?,?)')
      .run('b'.repeat(64), 100, `bb/${'b'.repeat(64)}.pdf`).lastInsertRowid;
    const sourceId = db.prepare("INSERT INTO question_asset_sources(batch_id,client_key,source_type,source_reference,original_filename,asset_id,status,created_by) VALUES (1,'source','internal','purchase-only','paper.pdf',?,'quarantined','admin')")
      .run(assetId).lastInsertRowid;
    const migration = readMigrations().find(item => item.version === '0017');
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.equal(getMigrationStatus(db).applied.find(item => item.version === '0017').checksum, migration.checksum);
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_asset_right_claims').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_asset_content_reviews').pluck().get(), 0);
    assert.ok(db.prepare('PRAGMA table_info(question_asset_content_reviews)').all().some(column => column.name === 'client_key' && column.notnull === 1));
    assert.ok(db.prepare('PRAGMA table_info(question_asset_content_reviews)').all().some(column => column.name === 'expected_latest_review_id'));
    assert.equal(db.prepare('SELECT status FROM question_asset_sources WHERE id=?').pluck().get(sourceId), 'quarantined');
    assert.deepEqual(db.prepare('SELECT processing_right,display_right,publish_status FROM question_pdf_assets WHERE id=?').get(assetId),
      { processing_right: 0, display_right: 0, publish_status: 'blocked' });
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
}));

test('database migration 0018 adds immutable question revisions and ready set ordering', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0017');
  copyMigrationsThrough(previousDir, '0017');
  const db = new Database(path.join(directory, 'question-bank.db'));
  try {
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    const migration = readMigrations().find(item => item.version === '0018');
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    db.prepare("INSERT INTO qb_questions(client_key,created_by) VALUES ('q1','editor')").run();
    db.prepare(`INSERT INTO qb_revisions(question_id,revision_no,client_key,content_json,provenance_json,media_json,created_by)
      VALUES (1,1,'r1','{}','{}','[]','editor')`).run();
    assert.throws(() => db.prepare("UPDATE qb_revisions SET media_json='[]' WHERE id=1").run(), /QUESTION_REVISION_IMMUTABLE/);
    assert.throws(() => db.prepare('DELETE FROM qb_revisions WHERE id=1').run(), /QUESTION_REVISION_IMMUTABLE/);
    db.prepare("INSERT INTO qb_sets(client_key,title,created_by) VALUES ('s1','Test','editor')").run();
    db.prepare('INSERT INTO qb_set_items(set_id,position,revision_id) VALUES (1,1,1)').run();
    assert.throws(() => db.prepare("UPDATE qb_sets SET status='ready' WHERE id=1").run(), /SET_PUBLISH_SERVICE_REQUIRED/);
    db.prepare("INSERT INTO qb_set_publication_checks(set_id,expected_version,territory,commercial) VALUES (1,1,'CN',0)").run();
    db.prepare("UPDATE qb_sets SET status='ready',publish_territory='CN',publish_commercial=0 WHERE id=1").run();
    assert.throws(() => db.prepare('DELETE FROM qb_set_items WHERE set_id=1').run(), /READY_SET_ITEMS_IMMUTABLE/);
    assert.throws(() => db.prepare('UPDATE qb_set_items SET position=2 WHERE set_id=1').run(), /READY_SET_ITEMS_IMMUTABLE/);
    assert.throws(() => db.prepare("UPDATE qb_sets SET status='draft' WHERE id=1").run(), /READY_SET_IMMUTABLE/);
    db.prepare(`INSERT INTO qb_right_claims(revision_id,client_key,evidence_reference,rights_json,territories_json,
      valid_from,valid_until,submitted_by) VALUES (1,'c1','evidence','{"stemDisplay":true}','["CN"]','2020-01-01','2099-12-31','author')`).run();
    assert.throws(() => db.prepare("UPDATE qb_right_claims SET rights_json='{}' WHERE id=1").run(), /QUESTION_CLAIM_IMMUTABLE/);
    db.prepare("UPDATE qb_right_claims SET status='approved',decided_by='reviewer',decision_reason='yes' WHERE id=1").run();
    assert.throws(() => db.prepare("UPDATE qb_right_claims SET status='pending' WHERE id=1").run(), /QUESTION_CLAIM_IMMUTABLE/);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally { db.close(); }
}));

test('database migration 0019 keeps web publication closed and practice snapshots immutable', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0018');
  copyMigrationsThrough(previousDir, '0018');
  const db = new Database(path.join(directory, 'practice.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0019', '0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    db.prepare('INSERT INTO users(id) VALUES (1)').run();
    db.prepare('INSERT INTO users(id) VALUES (2)').run();
    db.prepare("INSERT INTO qb_questions(client_key,created_by) VALUES ('q','editor')").run();
    db.prepare(`INSERT INTO qb_revisions(question_id,revision_no,client_key,content_json,provenance_json,media_json,created_by)
      VALUES (1,1,'r','{}','{}','[]','editor')`).run();
    db.prepare("INSERT INTO qb_sets(client_key,title,created_by) VALUES ('s','Set','editor')").run();
    assert.equal(db.prepare('SELECT COUNT(*) FROM qb_free_web_publications').pluck().get(), 0);
    db.prepare("INSERT INTO qb_practice_sessions(user_id,set_id,client_key,set_title) VALUES (1,1,'start','Set')").run();
    assert.throws(() => db.prepare('INSERT INTO qb_practice_items(session_id,position,revision_id) VALUES (1,1,1)').run(), /PRACTICE_SNAPSHOT_SEALED/);
    db.prepare('INSERT INTO qb_practice_snapshot_permits(session_id) VALUES (1)').run();
    db.prepare('INSERT INTO qb_practice_items(session_id,position,revision_id) VALUES (1,1,1)').run();
    db.prepare('DELETE FROM qb_practice_snapshot_permits WHERE session_id=1').run();
    assert.throws(() => db.prepare('UPDATE qb_practice_items SET position=2 WHERE session_id=1').run(), /PRACTICE_SNAPSHOT_IMMUTABLE/);
    assert.throws(() => db.prepare('DELETE FROM qb_practice_items WHERE session_id=1').run(), /PRACTICE_SNAPSHOT_IMMUTABLE/);
    assert.throws(() => db.prepare('INSERT INTO qb_practice_favorites(user_id,session_id,position) VALUES (2,1,1)').run(), /FOREIGN KEY constraint failed/);
    db.prepare('INSERT INTO qb_practice_favorites(user_id,session_id,position) VALUES (1,1,1)').run();
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
}));

test('database migration 0020 adds only private parse jobs, page checkpoints and audited drafts', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0019');
  copyMigrationsThrough(previousDir, '0019');
  const db = new Database(path.join(directory, 'parse.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    const migration = readMigrations().find(item => item.version === '0020');
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0020', '0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.deepEqual(['qp_jobs','qp_pages','qp_drafts','qp_draft_edits'].map(name =>
      db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?").pluck().get(name)), [1,1,1,1]);
    assert.equal(db.prepare('SELECT COUNT(*) FROM qb_questions').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM qb_free_web_publications').pluck().get(), 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
}));

test('database migration 0021 adds resumable private PDF upload checkpoints without publishing assets', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0020');
  copyMigrationsThrough(previousDir, '0020');
  const db = new Database(path.join(directory, 'uploads.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0021', '0022', '0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    const columns = db.prepare('PRAGMA table_info(question_pdf_upload_sessions)').all().map(row => row.name);
    assert.ok(['id', 'source_id', 'byte_size', 'received_bytes', 'fingerprint', 'state'].every(name => columns.includes(name)));
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_upload_sessions').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_assets').pluck().get(), 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
}));

test('database migration 0022 records private PDF checks without changing existing assets', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0021');
  copyMigrationsThrough(previousDir, '0021');
  const checksDir = path.join(directory, 'through-0022');
  copyMigrationsThrough(checksDir, '0022');
  const db = new Database(path.join(directory, 'checks.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    assert.deepEqual(applyPendingMigrations(db, { migrationsDir: checksDir }).appliedNow.map(item => item.version), ['0022']);
    const columns = db.prepare('PRAGMA table_info(question_pdf_asset_checks)').all().map(row => row.name);
    assert.ok(['asset_id', 'source_id', 'state', 'scan_status', 'validation_status', 'page_count', 'error_code'].every(name => columns.includes(name)));
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_asset_checks').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_assets').pluck().get(), 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
}));

test('database migration 0023 adds feedback versions and cascading handling events', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0022');
  copyMigrationsThrough(previousDir, '0022');
  const db = new Database(path.join(directory, 'feedback-audit.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    db.prepare("INSERT INTO feedbacks(id,type,content,status,admin_note,created_at,updated_at) VALUES(1,'岗位信息纠错','示例反馈','open','','2026-10-01 00:00:00','')").run();
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0023', '0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    assert.equal(db.prepare('SELECT review_version FROM feedbacks WHERE id=1').pluck().get(), 0);
    db.prepare(`INSERT INTO feedback_handling_events
      (feedback_id,version,from_status,to_status,from_note,to_note,actor_id,actor_name,acted_at)
      VALUES (1,1,'open','processing','','正在核查',7,'tester','2026-10-30T00:00:00.000Z')`).run();
    assert.equal(db.prepare('SELECT COUNT(*) FROM feedback_handling_events WHERE feedback_id=1').pluck().get(), 1);
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    db.prepare('DELETE FROM feedbacks WHERE id=1').run();
    assert.equal(db.prepare('SELECT COUNT(*) FROM feedback_handling_events WHERE feedback_id=1').pluck().get(), 0);
  } finally { db.close(); }
}));

test('database migration 0024 adds owned submission events with idempotency and cascade', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0023');
  copyMigrationsThrough(previousDir, '0023');
  const db = new Database(path.join(directory, 'submission-events.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    db.prepare('INSERT INTO users(id) VALUES (1)').run();
    db.prepare("INSERT INTO applications(id,user_id,v4_status) VALUES (1,1,'preparing')").run();
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0024', '0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    const insert = db.prepare(`INSERT INTO application_submission_events
      (application_id,user_id,action,supersedes_id,client_key,channel,created_at)
      VALUES (1,1,?,?,?,?,?)`);
    const confirmed = insert.run('confirmed', null, 'confirm-1', 'web', '2026-10-30T00:00:00.000Z');
    assert.throws(() => insert.run('confirmed', null, 'confirm-1', 'web', '2026-10-30T00:00:01.000Z'), /UNIQUE/);
    assert.throws(() => insert.run('unknown', null, 'bad-action', 'web', '2026-10-30T00:00:01.000Z'), /CHECK/);
    insert.run('revoked', Number(confirmed.lastInsertRowid), 'revoke-1', 'miniprogram', '2026-10-30T00:00:02.000Z');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    db.prepare('DELETE FROM applications WHERE id=1').run();
    assert.equal(db.prepare('SELECT COUNT(*) FROM application_submission_events').pluck().get(), 0);
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally { db.close(); }
}));

test('database migrations 0025-0030 add application readiness, consent, reports, grants, answer drafts, and manual services', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0024');
  copyMigrationsThrough(previousDir, '0024');
  const db = new Database(path.join(directory, 'application-checklist.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    db.prepare('INSERT INTO users(id) VALUES (1),(2)').run();
    db.prepare("INSERT INTO applications(id,user_id,v4_status) VALUES (1,1,'preparing')").run();
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0025','0026','0027','0028','0029','0030','0031','0032','0033']);
    const columns = new Set(db.prepare('PRAGMA table_info(application_answer_drafts)').all().map(item => item.name));
    for (const column of ['user_id','application_id','resume_version_id','question','content','evidence_refs_json','evidence_json','unsupported_claims_json','max_chars','version','status']) {
      assert.ok(columns.has(column), `missing ${column}`);
    }
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_application_answer_drafts_owner_app'").get());
    assert.equal(db.prepare('SELECT resume_selection_version FROM applications WHERE id=1').pluck().get(), 0);
    assert.equal(db.prepare("SELECT delivery_channel FROM job_reminders WHERE 0").columns()[0].name, 'delivery_channel');
    assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('notify_template_authorizations','notify_template_authorization_events')").pluck().get(), 2);
    assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='application_interview_reports'").pluck().get(), 1);
    assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('manual_service_requests_v4','manual_service_request_events_v4','manual_service_deliveries_v4')").pluck().get(), 3);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_manual_service_user'").get());
    assert.throws(() => db.prepare(`INSERT INTO application_interview_reports
      (user_id,application_id,client_key,total_score,summary,convert_client_key)
      VALUES (1,1,'report-one',80,'summary','task-one')`).run() && db.prepare(`INSERT INTO application_interview_reports
      (user_id,application_id,client_key,total_score,summary,convert_client_key)
      VALUES (1,1,'report-two',80,'summary','task-one')`).run(), /UNIQUE/);
    const insert = db.prepare(`INSERT INTO application_material_checklist_items
      (application_id,user_id,label,state,client_key,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`);
    insert.run(1, 1, '成绩单', 'needed', 'item-one', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z');
    assert.throws(() => insert.run(1, 1, '作品集', 'needed', 'item-one', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'), /UNIQUE/);
    assert.throws(() => insert.run(1, 2, '跨账号', 'needed', 'item-two', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'), /FOREIGN KEY/);
    assert.throws(() => insert.run(1, 1, '材料', 'done', 'item-three', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'), /CHECK/);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    db.prepare('DELETE FROM applications WHERE id=1').run();
    assert.equal(db.prepare('SELECT COUNT(*) FROM application_material_checklist_items').pluck().get(), 0);
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally { db.close(); }
}));

test('database migrations 0031-0033 add empty append-only OCR review and promotion ledgers', () => withTempDir(directory => {
  const previousDir = path.join(directory, 'through-0030');
  copyMigrationsThrough(previousDir, '0030');
  const db = new Database(path.join(directory, 'draft-reviews.db'));
  try {
    db.pragma('foreign_keys = ON');
    createRequiredBaselineTables(db);
    applyPendingMigrations(db, { migrationsDir: previousDir });
    const before = db.prepare('SELECT COUNT(*) FROM qp_drafts').pluck().get();
    assert.deepEqual(applyPendingMigrations(db).appliedNow.map(item => item.version), ['0031','0032','0033']);
    assert.equal(db.prepare('SELECT COUNT(*) FROM qp_draft_reviews').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM qp_draft_promotions').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM qp_draft_promotion_batches').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM qp_draft_review_batches').pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM qp_drafts').pluck().get(), before);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='qp_draft_reviews_no_update'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='qp_draft_reviews_no_delete'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='qp_draft_review_batches_no_update'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='qp_draft_review_batches_no_delete'").get());
    assert.equal(applyPendingMigrations(db).appliedNow.length, 0);
  } finally { db.close(); }
}));

test('database migration baseline refuses an incomplete schema', () => withTempDir(directory => {
  const db = new Database(path.join(directory, 'incomplete.db'));
  try {
    assert.throws(() => applyPendingMigrations(db), /baseline requirement missing table: users/);
    assert.equal(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 0);
  } finally {
    db.close();
  }
}));

test('failed migration transaction leaves no partial table or applied record', () => withTempDir(directory => {
  const migrationsDir = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDir);
  fs.writeFileSync(
    path.join(migrationsDir, '0001_fail_atomically.sql'),
    'CREATE TABLE partial_change (id INTEGER PRIMARY KEY);\nINSERT INTO table_that_does_not_exist (id) VALUES (1);\n'
  );
  const db = new Database(path.join(directory, 'failure.db'));
  try {
    assert.throws(() => applyPendingMigrations(db, { migrationsDir }));
    assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='partial_change'").pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 0);
  } finally {
    db.close();
  }
}));

test('migration reader accepts simple SQLite triggers but rejects transaction statements outside them', () => withTempDir(directory => {
  const migrationPath = path.join(directory, '0001_simple_trigger.sql');
  const trigger = `CREATE TABLE item (id INTEGER PRIMARY KEY);\nCREATE TRIGGER item_guard BEFORE DELETE ON item BEGIN\n SELECT RAISE(ABORT,'immutable');\nEND;\n`;
  fs.writeFileSync(migrationPath, trigger);
  assert.equal(readMigrations(directory).length, 1);
  const db = new Database(path.join(directory, 'trigger.db'));
  try {
    applyPendingMigrations(db, { migrationsDir: directory });
    db.prepare('INSERT INTO item(id) VALUES (1)').run();
    assert.throws(() => db.prepare('DELETE FROM item').run(), /immutable/);
  } finally { db.close(); }
  fs.writeFileSync(migrationPath, `${trigger}BEGIN;\nCOMMIT;\n`);
  assert.throws(() => readMigrations(directory), /must not manage transactions directly/);
  fs.writeFileSync(migrationPath, `${trigger.replace('END;', '')}COMMIT;\n`);
  assert.throws(() => readMigrations(directory), /must not manage transactions directly/);
}));

test('applied migration checksum drift is rejected', () => withTempDir(directory => {
  const migrationsDir = path.join(directory, 'migrations');
  fs.mkdirSync(migrationsDir);
  const migrationPath = path.join(migrationsDir, '0001_create_example.sql');
  fs.writeFileSync(migrationPath, 'CREATE TABLE example (id INTEGER PRIMARY KEY);\n');
  const db = new Database(path.join(directory, 'checksum.db'));
  try {
    applyPendingMigrations(db, { migrationsDir });
    fs.writeFileSync(migrationPath, 'CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT);\n');

    assert.throws(() => getMigrationStatus(db, { migrationsDir }), /checksum mismatch/);
  } finally {
    db.close();
  }
}));

test('database backup and restore preserve exact bytes and data', () => withTempDir(async directory => {
  const sourcePath = path.join(directory, 'source.db');
  const backupPath = path.join(directory, 'backup.db');
  const restorePath = path.join(directory, 'restore.db');
  const db = new Database(sourcePath);
  try {
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample VALUES (1, 'before');");
  } finally {
    db.close();
  }

  await backupDatabase(sourcePath, backupPath);
  restoreDatabase(backupPath, restorePath);
  assert.deepEqual(fs.readFileSync(restorePath), fs.readFileSync(backupPath));
  const restored = new Database(restorePath, { readonly: true });
  try {
    assert.equal(restored.prepare('SELECT value FROM sample WHERE id=1').pluck().get(), 'before');
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    restored.close();
  }
}));
