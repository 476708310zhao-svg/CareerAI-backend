'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const { app } = require('../server');
const { createQuestionBank } = require('../services/questionBank');
const { createQuestionPractice } = require('../services/questionPractice');
const bank = createQuestionBank(db), practice = createQuestionPractice(db);
runtime.registerCleanup(test);
const key = () => crypto.randomUUID();
const user = () => {
  const openid = `practice-${key()}`;
  return { id:db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)').run(openid,'练习者').lastInsertRowid,openid };
};
const content = (type='single') => type === 'boolean' ?
  { type:'boolean',stem:'此陈述为真？',answer:false,explanation:'判断解析' } :
  { type,stem:'选择正确选项',options:[{id:'A',text:'甲'},{id:'B',text:'乙'},{id:'C',text:'丙'}],
    answer:type==='multiple'?['A','C']:['A'],explanation:'选择解析' };
function approvedQuestion(type='single', options={}) {
  const item = bank.createQuestion({clientKey:key(),content:content(type),
    provenance:{kind:'original',authorName:'作者',ownershipEvidence:'原创记录'},media:[]},'author');
  const claim = bank.submitClaim(item.revision.id,{clientKey:key(),evidenceReference:'全球商业授权记录',
    rights:{stemDisplay:true,answerDisplay:true,imageDisplay:false,commercialUse:true,adaptation:false},
    territories:options.territories || ['*'],validFrom:'2020-01-01',validUntil:options.validUntil || '2099-12-31'},'author');
  bank.decideClaim(claim.id,{decision:'approved',reason:'已核验证据'},'rights');
  bank.reviewContent(item.revision.id,{clientKey:key(),expectedLatestReviewId:null,decision:'approved',reason:'内容正确'},'content');
  return { item,claim };
}
function readySet(types=['single'], options={}) {
  const created = types.map(type => approvedQuestion(type,options));
  const draft = bank.createSet({clientKey:key(),title:'免费模拟题集'},'editor');
  const ordered = bank.replaceSetItems(draft.id,{expectedVersion:draft.version,revisionIds:created.map(row=>row.item.revision.id)});
  const published = bank.publishSet(draft.id,{clientKey:key(),expectedVersion:ordered.set.version,territory:'CN',commercial:true},'publisher');
  return { set:published.set,created };
}
const enable = set => practice.setPublication(set.id,{clientKey:key(),enabled:true,expectedVersion:0},'publisher');
function pdfSource(assetId=null) {
  const batch = db.prepare('INSERT INTO question_asset_batches(label,client_key,created_by) VALUES (?,?,?)')
    .run('Practice PDF',key(),'source-owner').lastInsertRowid;
  if (!assetId) {
    const sha = crypto.createHash('sha256').update(key()).digest('hex');
    assetId = db.prepare(`INSERT INTO question_pdf_assets(sha256,byte_size,storage_key,validation_status,scan_status)
      VALUES (?,?,?,'valid','clean')`).run(sha,128,`${sha.slice(0,2)}/${sha}.pdf`).lastInsertRowid;
  }
  const id = db.prepare(`INSERT INTO question_asset_sources
    (batch_id,client_key,source_type,source_reference,original_filename,asset_id,status,created_by)
    VALUES (?,?,?,?,?,?,'quarantined','source-owner')`).run(batch,key(),'internal','license','source.pdf',assetId).lastInsertRowid;
  db.prepare(`INSERT INTO question_asset_content_reviews(source_id,client_key,decision,reason,reviewer)
    VALUES (?,?,'approved','测试来源审核','source-content')`).run(id,key());
  return {id,assetId};
}
function sourceGrant(sourceId,territories) {
  const rights = {internalStorage:true,machineProcessing:true,thirdPartyProcessing:false,
    stemDisplay:true,imageDisplay:false,answerDisplay:true,commercialUse:true,adaptation:true};
  return db.prepare(`INSERT INTO question_asset_right_claims
    (source_id,client_key,evidence_reference,rights_json,territories_json,valid_from,valid_until,status,submitted_by,decided_by,decision_reason)
    VALUES (?,?,?,?,?,'2020-01-01','2099-12-31','approved','source-owner','source-rights','测试授权')`)
    .run(sourceId,key(),'来源授权',JSON.stringify(rights),JSON.stringify(territories)).lastInsertRowid;
}

test('free web catalog requires explicit opt-in and one global commercial grant', () => {
  const owner = user();
  const global = readySet();
  assert.deepEqual(practice.listSets({},owner.id).sets,[]);
  assert.equal(practice.publication(global.set.id).enabled,false);
  const first = enable(global.set);
  assert.equal(first.publication.effectiveAvailable,true);
  assert.equal(practice.listSets({},owner.id).sets.some(row=>row.id===global.set.id),true);
  assert.throws(() => practice.setPublication(global.set.id,{clientKey:key(),enabled:false,expectedVersion:0},'publisher'),/PUBLICATION_VERSION_CONFLICT/);
  const cn = readySet(['single'],{territories:['CN']});
  assert.throws(() => enable(cn.set),/QUESTION_UNAVAILABLE/);
  assert.deepEqual(db.prepare('SELECT enabled FROM qb_free_web_publications WHERE set_id=?').all(cn.set.id),[]);
  const disabled = practice.setPublication(global.set.id,{clientKey:key(),enabled:false,expectedVersion:1},'publisher');
  assert.equal(disabled.publication.enabled,false);
  assert.equal(practice.listSets({},owner.id).sets.some(row=>row.id===global.set.id),false);
});

test('PDF global rights never transfer across same-hash sources; images never enter public catalog', () => {
  const owner = user(), sourceA = pdfSource(), sourceB = pdfSource(sourceA.assetId);
  sourceGrant(sourceA.id,['*']);
  sourceGrant(sourceB.id,['CN']);
  const item = bank.createQuestion({clientKey:key(),content:content('single'),
    provenance:{kind:'pdf',sourceId:sourceB.id,evidenceReference:'第 1 页题干'},media:[]},'author');
  const claim = bank.submitClaim(item.revision.id,{clientKey:key(),evidenceReference:'改编授权',
    rights:{stemDisplay:true,answerDisplay:true,imageDisplay:false,commercialUse:true,adaptation:true},
    territories:['*'],validFrom:'2020-01-01',validUntil:'2099-12-31'},'author');
  bank.decideClaim(claim.id,{decision:'approved',reason:'题目许可'},'question-rights');
  bank.reviewContent(item.revision.id,{clientKey:key(),expectedLatestReviewId:null,decision:'approved',reason:'题目准确'},'question-content');
  const draft = bank.createSet({clientKey:key(),title:'PDF 授权边界'},'editor');
  const ordered = bank.replaceSetItems(draft.id,{expectedVersion:draft.version,revisionIds:[item.revision.id]});
  const published = bank.publishSet(draft.id,{clientKey:key(),expectedVersion:ordered.set.version,territory:'CN',commercial:true},'publisher');
  assert.throws(()=>enable(published.set),/QUESTION_UNAVAILABLE/);
  assert.deepEqual(practice.listSets({},owner.id).sets,[]);
  sourceGrant(sourceB.id,['*']);
  assert.equal(enable(published.set).publication.effectiveAvailable,true);
  const media = bank.createQuestion({clientKey:key(),content:content('single'),
    provenance:{kind:'original',authorName:'作者',ownershipEvidence:'原创记录'},
    media:[{kind:'image',sourceId:sourceB.id,pageNumber:1,locator:'p1'}]},'author');
  const mediaClaim = bank.submitClaim(media.revision.id,{clientKey:key(),evidenceReference:'图片许可',
    rights:{stemDisplay:true,answerDisplay:true,imageDisplay:true,commercialUse:true,adaptation:false},
    territories:['*'],validFrom:'2020-01-01',validUntil:'2099-12-31'},'author');
  bank.decideClaim(mediaClaim.id,{decision:'approved',reason:'图片许可'},'question-rights');
  bank.reviewContent(media.revision.id,{clientKey:key(),expectedLatestReviewId:null,decision:'approved',reason:'图片准确'},'question-content');
  const mediaDraft = bank.createSet({clientKey:key(),title:'带图题集'},'editor');
  const mediaOrdered = bank.replaceSetItems(mediaDraft.id,{expectedVersion:mediaDraft.version,revisionIds:[media.revision.id]});
  assert.throws(()=>bank.publishSet(mediaDraft.id,{clientKey:key(),expectedVersion:mediaOrdered.set.version,territory:'CN',commercial:true},'publisher'),/MEDIA_DELIVERY_UNAVAILABLE/);
});

test('single, multiple, boolean false and formal unanswered are graded only on server', () => {
  const owner = user(), published = readySet(['single','multiple','boolean','single']);
  enable(published.set);
  const first = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  assert.equal(first.total,4);
  assert.equal(practice.start(published.set.id,{clientKey:key()},owner.id).session.id,first.id);
  assert.throws(() => practice.question(first.id,2,owner.id),/QUESTION_NOT_YET_AVAILABLE/);
  assert.throws(() => practice.submit(first.id,2,{requestId:key(),answer:['A','C']},owner.id),/QUESTION_NOT_YET_AVAILABLE/);
  const publicQuestion = practice.question(first.id,1,owner.id).question;
  assert.deepEqual(Object.keys(publicQuestion).sort(),['options','position','revisionId','stem','type']);
  assert.equal(JSON.stringify(publicQuestion).includes('explanation'),false);
  assert.equal(JSON.stringify(publicQuestion).includes('answer'),false);
  assert.equal(practice.submit(first.id,1,{requestId:key(),answer:['A']},owner.id).submission.isCorrect,true);
  assert.equal(practice.submit(first.id,2,{requestId:key(),answer:['C','A']},owner.id).submission.isCorrect,true);
  assert.equal(practice.submit(first.id,3,{requestId:key(),answer:false},owner.id).submission.isCorrect,true);
  const unanswered = practice.submit(first.id,4,{requestId:key(),answer:null},owner.id).submission;
  assert.equal(unanswered.isCorrect,false);
  assert.equal(unanswered.selectedAnswer,null);
  assert.equal(practice.sessionDetail(first.id,owner.id).session.correctCount,3);
  assert.equal(practice.mistakes({},owner.id).mistakes[0].submission.selectedAnswer,null);
});

test('all question types accept explicit null as formal unanswered and reject malformed choices', () => {
  const owner = user(), published = readySet(['single','multiple','boolean']); enable(published.set);
  const session = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  for (const position of [1,2,3]) {
    const row = practice.submit(session.id,position,{requestId:key(),answer:null},owner.id).submission;
    assert.equal(row.selectedAnswer,null);
    assert.equal(row.isCorrect,false);
  }
  assert.equal(practice.sessionDetail(session.id,owner.id).session.answered,3);
  const fresh = readySet(['multiple']); enable(fresh.set);
  const second = practice.start(fresh.set.id,{clientKey:key()},owner.id).session;
  assert.throws(() => practice.submit(second.id,1,{requestId:key(),answer:[]},owner.id),/INVALID_ANSWER/);
  assert.throws(() => practice.submit(second.id,1,{requestId:key(),answer:['A','A']},owner.id),/INVALID_ANSWER/);
  assert.throws(() => practice.submit(second.id,1,{requestId:key(),answer:['D']},owner.id),/INVALID_ANSWER/);
});

test('analysis report uses stored submissions, stays owner scoped, and contains no answer content', async () => {
  const owner = user(), other = user(), published = readySet(['single','multiple','boolean','single']);
  enable(published.set);
  const session = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  assert.deepEqual(practice.report(session.id,owner.id).report.byType.map(row => row.answered),[0,0,0]);
  practice.submit(session.id,1,{requestId:key(),answer:['A']},owner.id);
  practice.submit(session.id,2,{requestId:key(),answer:['B']},owner.id);
  practice.submit(session.id,3,{requestId:key(),answer:null},owner.id);
  const report = practice.report(session.id,owner.id).report;
  assert.deepEqual([report.total,report.answered,report.correct,report.incorrect,report.skipped,report.unanswered,report.accuracyPercent],[4,3,1,2,1,1,33]);
  assert.equal(report.byType.find(row => row.type === 'multiple').incorrect,1);
  assert.equal(report.byType.find(row => row.type === 'boolean').skipped,1);
  assert.equal(JSON.stringify(report).includes('选择解析'),false);
  assert.equal(JSON.stringify(report).includes('correctAnswer'),false);
  assert.throws(() => practice.report(session.id,other.id),/SESSION_NOT_FOUND/);
  const server = runtime.trackServer(app.listen(0,'127.0.0.1'));
  await new Promise(resolve=>server.once('listening',resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v4/question-practice/sessions/${session.id}/report`;
  assert.equal((await fetch(url)).status,401);
  const ownToken = jwt.sign({userId:owner.id,openid:owner.openid},process.env.JWT_SECRET);
  const ownResponse = await fetch(url,{headers:{Authorization:`Bearer ${ownToken}`}});
  assert.equal(ownResponse.status,200);
  assert.equal(ownResponse.headers.get('cache-control'),'no-store');
  const foreignToken = jwt.sign({userId:other.id,openid:other.openid},process.env.JWT_SECRET);
  assert.equal((await fetch(url,{headers:{Authorization:`Bearer ${foreignToken}`}})).status,404);
  bank.revokeClaim(published.created[0].claim.id,{reason:'许可已撤销'},'rights');
  assert.equal(practice.report(session.id,owner.id).report.correct,1);
});

test('formal submission retries exactly, conflicts reject, and finished sessions cannot accept new answers', () => {
  const owner = user(), published = readySet(['single','boolean']); enable(published.set);
  const session = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  const requestId = key(), input = {requestId,answer:['B']};
  const first = practice.submit(session.id,1,input,owner.id).submission;
  assert.deepEqual(practice.submit(session.id,1,input,owner.id).submission,first);
  assert.throws(() => practice.submit(session.id,1,{requestId,answer:['A']},owner.id),/REQUEST_ID_CONFLICT/);
  assert.throws(() => practice.submit(session.id,1,{requestId:key(),answer:['A']},owner.id),/QUESTION_ALREADY_SUBMITTED/);
  assert.equal(practice.finish(session.id,owner.id).session.status,'finished');
  assert.deepEqual(practice.submit(session.id,1,input,owner.id).submission,first);
  assert.throws(() => practice.question(session.id,2,owner.id),/SESSION_FINISHED/);
  assert.throws(() => practice.setFavorite(session.id,2,owner.id,true),/SESSION_FINISHED/);
  assert.throws(() => practice.submit(session.id,2,{requestId:key(),answer:true},owner.id),/SESSION_FINISHED/);
});

test('history, mistakes and favorites remain owner scoped and redact content after withdrawal', () => {
  const owner = user(), outsider = user(), published = readySet(); enable(published.set);
  const session = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  practice.setFavorite(session.id,1,owner.id,true);
  const requestId = key();
  const first = practice.submit(session.id,1,{requestId,answer:['B']},owner.id).submission;
  assert.equal(practice.result(session.id,1,owner.id).submission.correctAnswer[0],'A');
  assert.throws(() => practice.sessionDetail(session.id,outsider.id),/SESSION_NOT_FOUND/);
  assert.throws(() => practice.result(session.id,1,outsider.id),/SESSION_NOT_FOUND/);
  const claimId = published.created[0].claim.id;
  bank.revokeClaim(claimId,{reason:'许可已撤销'},'rights');
  assert.throws(() => practice.question(session.id,1,owner.id),/QUESTION_UNAVAILABLE/);
  assert.throws(() => practice.result(session.id,1,owner.id),/QUESTION_UNAVAILABLE/);
  assert.throws(() => practice.submit(session.id,1,{requestId,answer:['B']},owner.id),/QUESTION_UNAVAILABLE/);
  const mistakes = practice.mistakes({},owner.id).mistakes, favorites = practice.favorites({},owner.id).favorites;
  assert.equal(mistakes[0].available,false);
  assert.equal(favorites[0].available,false);
  assert.equal(JSON.stringify(mistakes[0]).includes('选择解析'),false);
  assert.equal(JSON.stringify(favorites[0]).includes('选择正确选项'),false);
  assert.deepEqual(practice.setFavorite(session.id,1,owner.id,false),{favorite:false,available:false});
  assert.equal(practice.sessionDetail(session.id,owner.id).session.answered,1);
  assert.equal(first.isCorrect,false);
});

test('disabling free web publication or expiring rights blocks active content without erasing score', () => {
  const owner = user(), published = readySet(['single'],{validUntil:'2099-12-30'}); enable(published.set);
  const session = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  practice.submit(session.id,1,{requestId:key(),answer:['A']},owner.id);
  practice.setPublication(published.set.id,{clientKey:key(),enabled:false,expectedVersion:1},'publisher');
  assert.throws(() => practice.question(session.id,1,owner.id),/QUESTION_UNAVAILABLE/);
  assert.throws(() => practice.result(session.id,1,owner.id),/QUESTION_UNAVAILABLE/);
  assert.equal(practice.sessionDetail(session.id,owner.id).session.correctCount,1);
  practice.setPublication(published.set.id,{clientKey:key(),enabled:true,expectedVersion:2},'publisher');
  const later = createQuestionPractice(db,{clock:()=>new Date('2099-12-30T16:00:00.000Z')});
  assert.equal(later.publication(published.set.id).effectiveAvailable,false);
  assert.throws(() => later.question(session.id,1,owner.id),/QUESTION_UNAVAILABLE/);
  assert.equal(later.favorites({},owner.id).total >= 0,true);
});

test('two concurrent HTTP submissions keep exactly one formal answer', async () => {
  const owner = user(), published = readySet(); enable(published.set);
  const session = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  const server = runtime.trackServer(app.listen(0,'127.0.0.1'));
  await new Promise(resolve=>server.once('listening',resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v4/question-practice/sessions/${session.id}/items/1/submit`;
  const token = jwt.sign({userId:owner.id,openid:owner.openid},process.env.JWT_SECRET);
  const headers = {Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const responses = await Promise.all([
    fetch(url,{method:'POST',headers,body:JSON.stringify({requestId:key(),answer:['A']})}),
    fetch(url,{method:'POST',headers,body:JSON.stringify({requestId:key(),answer:['B']})})
  ]);
  assert.deepEqual(responses.map(row=>row.status).sort(),[200,409]);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qb_practice_answers WHERE session_id=?').pluck().get(session.id),1);
});

test('publication administration requires current publish permission and records CAS audit', async () => {
  const published = readySet();
  const server = runtime.trackServer(app.listen(0,'127.0.0.1'));
  await new Promise(resolve=>server.once('listening',resolve));
  const url = `http://127.0.0.1:${server.address().port}/admin/api/v4/question-practice/sets/${published.set.id}/publication`;
  const id = 83001, username = `practice-publisher-${id}`;
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (?,?,'test-only','operator',?,1)`).run(id,username,JSON.stringify(['questionBankPublish']));
  const token = jwt.sign({role:'admin',id,sub:username,permissions:['questionBankPublish']},process.env.JWT_SECRET);
  const headers = {Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(url)).status,401);
  const before = await fetch(url,{headers});
  assert.equal(before.headers.get('cache-control'),'no-store');
  assert.equal((await before.json()).data.publication.enabled,false);
  const put = await fetch(url,{method:'PUT',headers,body:JSON.stringify({clientKey:key(),enabled:true,expectedVersion:0})});
  assert.equal(put.status,200);
  assert.equal((await put.json()).data.publication.effectiveAvailable,true);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qb_free_web_publication_events WHERE set_id=?').pluck().get(published.set.id),1);
  db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=?').run('[]',id);
  assert.equal((await fetch(url,{headers})).status,403);
});

test('new revisions do not replace frozen session question order and public API never leaks future answers', async () => {
  const owner = user(), other = user(), published = readySet(['single','boolean']); enable(published.set);
  const session = practice.start(published.set.id,{clientKey:key()},owner.id).session;
  const oldRevision = published.created[0].item.revision.id;
  bank.createRevision(published.created[0].item.question.id,{clientKey:key(),expectedRevisionId:oldRevision,
    content:{...content('single'),answer:['B']},provenance:{kind:'original',authorName:'作者',ownershipEvidence:'原创记录'},media:[]},'author');
  assert.equal(practice.sessionDetail(session.id,owner.id).items[0].revisionId,oldRevision);
  const server = runtime.trackServer(app.listen(0,'127.0.0.1'));
  await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v4/question-practice`;
  const token = jwt.sign({userId:owner.id,openid:owner.openid},process.env.JWT_SECRET);
  const headers = {Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(`${base}/sets`)).status,401);
  const response = await fetch(`${base}/sessions/${session.id}/items/1`,{headers});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const raw = JSON.stringify(await response.json());
  assert.equal(raw.includes('选择解析'),false);
  assert.equal(raw.includes('correctAnswer'),false);
  assert.equal(raw.includes('storage_key'),false);
  assert.equal((await fetch(`${base}/sessions/${session.id}/items/1/result`,{headers})).status,409);
  const otherToken = jwt.sign({userId:other.id,openid:other.openid},process.env.JWT_SECRET);
  assert.equal((await fetch(`${base}/sessions/${session.id}`,{headers:{Authorization:`Bearer ${otherToken}`}})).status,404);
  const staleToken = jwt.sign({userId:owner.id,openid:'unbound'},process.env.JWT_SECRET);
  assert.equal((await fetch(`${base}/sets`,{headers:{Authorization:`Bearer ${staleToken}`}})).status,401);
});
