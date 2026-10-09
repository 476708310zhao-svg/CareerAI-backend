const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
let f;
before(async()=>{f=await require('./webApplicationFixture.cjs').start();});
after(async()=>{await f?.close();});
const snapshot=app=>({id:app.id,status:app.status,historyId:app.historyId});
let confirmationSeed=0, saveIpSeed=10;
function completedAction(applicationId,{userId,status='completed',general=false}={}) {
  const owner=userId || f.userId, seed=++confirmationSeed;
  const conversationId=Number(f.db.prepare('INSERT INTO ai_conversations(user_id,application_id,title) VALUES (?,?,?)')
    .run(owner,general ? null : applicationId,`Confirmation ${seed}`).lastInsertRowid);
  const turnId=Number(f.db.prepare('INSERT INTO ai_conversation_turns(conversation_id,request_id,question,answer,status) VALUES (?,?,?,?,?)')
    .run(conversationId,`confirmation-${seed}`,`Question ${seed}`,`Answer ${seed}`,status).lastInsertRowid);
  return {conversationId,turnId,actionId:`ai-save:${conversationId}:${turnId}`};
}
function saveAssistant(body,user=f.userId,ip) {
  const address=ip || `198.51.100.${saveIpSeed++}`;
  return f.apiCall('/api/ai/assistant/save','POST',body,user,{'X-Forwarded-For':address});
}

test('one-time computer login preserves user identity and rejects anonymous issue and replay',async()=>{
  assert.equal((await f.apiCall('/api/web-session/code','POST',{},0)).status,401);
  const issued=await f.apiCall('/api/web-session/code','POST',{});
  assert.equal(issued.status,200);assert.equal(issued.headers.get('cache-control'),'no-store');assert.match(issued.body.data.code,/^[A-F0-9]{32}$/);
  const redeemed=await f.apiCall('/api/web-session/redeem','POST',{code:issued.body.data.code},0);
  assert.equal(redeemed.status,200);assert.equal(redeemed.headers.get('cache-control'),'no-store');
  const jwt=require('jsonwebtoken');assert.equal(jwt.verify(redeemed.body.data.token,process.env.JWT_SECRET).userId,f.userId);
  assert.equal((await f.apiCall('/api/web-session/redeem','POST',{code:issued.body.data.code},0)).status,401);
  const app=await f.create();
  const response=await fetch(f.url+`/api/v4/applications/${app.id}/workspace`,{headers:{Authorization:`Bearer ${redeemed.body.data.token}`}});
  assert.equal((await response.json()).data.application.id,app.id);
  const otherCode=(await f.apiCall('/api/web-session/code','POST',{},f.otherId)).body.data.code;
  const otherLogin=await f.apiCall('/api/web-session/redeem','POST',{code:otherCode},0);
  assert.equal(jwt.verify(otherLogin.body.data.token,process.env.JWT_SECRET).userId,f.otherId);
  const foreign=await fetch(f.url+`/api/v4/applications/${app.id}/workspace`,{headers:{Authorization:`Bearer ${otherLogin.body.data.token}`}});
  assert.equal(foreign.status,404,'a code must not grant access to another user workspace');
});
test('computer login codes expire and generating another code invalidates the previous one',()=>{
  let now=1000;const store=require('../../services/webSessionCodes').createStore(()=>now);
  const first=store.issue(1),second=store.issue(1);
  assert.equal(store.redeem(first.code),null);assert.equal(store.redeem(second.code),1);assert.equal(store.redeem(second.code),null);
  const expired=store.issue(2);now+=300001;assert.equal(store.redeem(expired.code),null);
});
test('the static Web P0 entry is mounted without exposing a directory listing',async()=>{
  const response=await fetch(f.url+'/web/');
  assert.equal(response.status,200);assert.match(response.headers.get('content-type')||'',/^text\/html/);
  assert.match(response.headers.get('content-security-policy')||'',/default-src 'self'/);
  const html=await response.text();assert.match(html,/id="code-login-form"/);assert.match(html,/id="applications-view"/);assert.doesNotMatch(html,/Index of \/web/);
});
test('manual application retry finds the same record and rejects unsafe links and blank fields',async()=>{
  const body={jobId:'manual-stable-1',sourceType:'manual',jobSnapshot:{company:'外部公司',title:'外部岗位',description:'外部 JD',applyUrl:'https://example.com/jobs/1'}};
  assert.equal((await f.call('','POST',{...body,jobSnapshot:{...body.jobSnapshot,applyUrl:'javascript:alert(1)'}})).status,400);
  assert.equal((await f.call('','POST',{...body,jobSnapshot:{title:'只有岗位'}})).status,400);
  const a=await f.call('','POST',body),duplicate=await f.call('','POST',body);
  assert.equal(a.status,200);assert.equal(duplicate.status,409);assert.equal(duplicate.body.data.applicationId,a.body.data.id);
});
test('tasks support editing and completion with ownership isolation and interview dates can be cleared',async()=>{
  const app=await f.create();const task=(await f.call(`/${app.id}/tasks`,'POST',{title:'初始任务',dueAt:'2026-10-01'})).body.data;
  assert.equal((await f.call(`/${app.id}/tasks/${task.id}`,'PATCH',{title:'新的任务',dueAt:'2026-10-02',completed:true},f.otherId)).status,404);
  assert.equal((await f.call(`/${app.id}/tasks/${task.id}`,'PATCH',{title:'新的任务',dueAt:'2026-10-02',completed:true})).status,200);
  await f.call(`/${app.id}`,'PATCH',{interviewTime:'2026-10-02T09:30'});
  const detail=(await f.call(`/${app.id}/workspace`)).body.data;
  assert.equal(detail.tasks[0].title,'新的任务');assert.equal(detail.tasks[0].completed,true);assert.equal(detail.application.interviewTime,'2026-10-02T09:30');
  await f.call(`/${app.id}`,'PATCH',{interviewTime:''});assert.equal((await f.call(`/${app.id}/workspace`)).body.data.application.interviewTime,'');
});
test('AI restoration is scoped to application and cancelled turns cannot be overwritten by late generation',async()=>{
  const app=await f.create(), other=await f.create();
  const a=(await f.apiCall('/api/ai/conversations','POST',{applicationId:app.id,resume:true})).body.data;
  const again=(await f.apiCall('/api/ai/conversations','POST',{applicationId:app.id,resume:true})).body.data;
  assert.equal(a.id,again.id);
  const b=(await f.apiCall('/api/ai/conversations','POST',{applicationId:other.id,resume:true})).body.data;
  assert.notEqual(a.id,b.id);
  assert.deepEqual((await f.apiCall(`/api/ai/conversations?applicationId=${app.id}`)).body.data.list.map(c=>c.id),[a.id]);
  const service=require('../../services/aiConversations');
  const started=service.begin(f.userId,a.id,{requestId:'late-cancel-0001',content:'延迟回答'},()=>true);
  assert.equal((await f.apiCall(`/api/ai/conversations/${a.id}/turns/${started.turnId}/cancel`,'POST',{},f.otherId)).status,404);
  await f.apiCall(`/api/ai/conversations/${a.id}/turns/${started.turnId}/cancel`,'POST',{});
  assert.equal(service.finish(started.turnId,'completed','这是迟到的回答').status,'cancelled');
  assert.equal((await f.apiCall(`/api/ai/conversations/${a.id}`)).body.data.turns[0].answer,'');
  for(let i=0;i<22;i++) f.db.prepare("INSERT INTO ai_conversation_turns(conversation_id,request_id,question,status,answer) VALUES (?,?,?,'completed','测试回答')").run(a.id,`history-${i}`,`问题 ${i}`);
  const recent=(await f.apiCall(`/api/ai/conversations/${a.id}`)).body.data;
  assert.equal(recent.turns.length,20);assert.ok(recent.nextBefore);
  const older=(await f.apiCall(`/api/ai/conversations/${a.id}?before=${recent.nextBefore}`)).body.data;
  assert.equal(older.turns.length,3);assert.equal(older.nextBefore,null);
  assert.equal(new Set([...older.turns,...recent.turns].map(t=>t.id)).size,23);
});

test('anonymous access and another user cannot read or mutate application workspaces',async()=>{
  const app=await f.create();
  assert.equal((await f.call(`/${app.id}/workspace`,'GET',undefined,0)).status,401);
  assert.equal((await f.call(`/${app.id}/workspace`,'GET',undefined,f.otherId)).status,404);
  assert.equal((await f.call('/bulk-status','POST',{items:[snapshot(app)],status:'applied'},f.otherId)).status,404);
  assert.equal((await f.call('/board')).headers.get('cache-control'),'no-store');
  assert.equal((await f.apiCall('/api/v4/career/dashboard')).headers.get('cache-control'),'no-store');
  assert.equal((await f.apiCall('/api/v4/jobs?pageSize=1')).headers.get('cache-control'),'no-store');
});
test('bulk status atomically rejects illegal transitions, conflicts and malformed input',async()=>{
  const a=await f.create(); const b=await f.create('interested');
  const before=f.db.prepare('SELECT COUNT(*) n FROM application_history').get().n;
  assert.equal((await f.call('/bulk-status','POST',{items:[snapshot(a),snapshot(b)],status:'applied'})).status,409);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM application_history').get().n,before);
  assert.equal((await f.call(`/${a.id}/detail`)).body.data.application.status,'preparing');
  for(const body of [{items:[],status:'applied'},{items:[snapshot(a),snapshot(a)],status:'applied'}, {items:[snapshot(a)],status:'toString'},{items:Array(51).fill(snapshot(a)),status:'applied'},{items:[{...snapshot(a),historyId:'1'}],status:'applied'}]) assert.equal((await f.call('/bulk-status','POST',body)).status,400);
  await f.call(`/${a.id}/status`,'PATCH',{status:'interested'});
  await f.call(`/${a.id}/status`,'PATCH',{status:'preparing'});
  assert.equal((await f.call('/bulk-status','POST',{items:[snapshot(a)],status:'applied'})).status,409,'ABA state changes must conflict');
});
test('bulk writes are visible through mini-program APIs and support protected one-time undo',async()=>{
  const a=await f.create();const b=await f.create();
  const result=await f.call('/bulk-status','POST',{items:[snapshot(a),snapshot(b)],status:'applied'});
  assert.equal(result.status,200);assert.equal(result.body.data.changed,2);
  assert.equal((await f.call(`/${a.id}/detail`)).body.data.application.status,'applied');
  const undo={historyIds:result.body.data.undo.historyIds};
  assert.equal((await f.call('/bulk-status/undo','POST',undo,f.otherId)).status,404);
  assert.equal((await f.call('/bulk-status/undo','POST',undo)).body.data.restored,2);
  assert.equal((await f.call(`/${a.id}/detail`)).body.data.application.status,'preparing');
  assert.equal((await f.call('/bulk-status/undo','POST',undo)).status,409);
});
test('a database failure during the second write rolls back the first write and its history',async()=>{
  const a=await f.create();const b=await f.create();
  f.db.exec(`CREATE TEMP TRIGGER reject_bulk_write BEFORE INSERT ON application_history WHEN NEW.application_id=${b.id} AND NEW.actor_type='web_bulk' BEGIN SELECT RAISE(ABORT,'injected database failure'); END`);
  try {
    const before=f.db.prepare('SELECT COUNT(*) n FROM application_history').get().n;
    assert.equal((await f.call('/bulk-status','POST',{items:[snapshot(a),snapshot(b)],status:'applied'})).status,500);
    assert.equal((await f.call(`/${a.id}/detail`)).body.data.application.status,'preparing');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM application_history').get().n,before);
  } finally {f.db.exec('DROP TRIGGER reject_bulk_write');}
});
test('undo cannot overwrite later state changes or restore an expired batch',async()=>{
  const a=await f.create(); const b=await f.create();
  const batch=(await f.call('/bulk-status','POST',{items:[snapshot(a),snapshot(b)],status:'applied'})).body.data;
  await f.call(`/${b.id}/status`,'PATCH',{status:'oa'});
  assert.equal((await f.call('/bulk-status/undo','POST',{historyIds:batch.undo.historyIds})).status,409);
  assert.equal((await f.call(`/${a.id}/detail`)).body.data.application.status,'applied','no partial undo');
  f.db.prepare("UPDATE application_history SET created_at=datetime('now','-11 minutes') WHERE id=?").run(batch.undo.historyIds[0]);
  assert.equal((await f.call('/bulk-status/undo','POST',{historyIds:[batch.undo.historyIds[0]]})).status,409);
});
test('bulk interview transitions create the same interview space and audit events as single updates',async()=>{
  const a=await f.create();await f.call(`/${a.id}/status`,'PATCH',{status:'applied'});
  const current=(await f.call(`/${a.id}/detail`)).body.data.application;
  const result=await f.call('/bulk-status','POST',{items:[snapshot(current)],status:'interview_1'});
  assert.equal(result.status,200);assert.ok(result.body.data.results[0].interviewSpaceId);
  const workspace=(await f.call(`/${a.id}/workspace`)).body.data;
  assert.equal(workspace.interviews.spaces.length,1);
  assert.equal(workspace.history[0].actorType,'web_bulk');
});
test('workspace isolates materials and resume-bound ATS without changing stored records',async()=>{
  const a=await f.create();const b=await f.create();
  const resume=Number(f.db.prepare("INSERT INTO resumes(user_id,name,data) VALUES (?,'测试简历','{}')").run(f.userId).lastInsertRowid);
  const version=Number(f.db.prepare("INSERT INTO resume_versions_v4(resume_id,user_id,version_no,name,content) VALUES (?,?,1,'V1','{}')").run(resume,f.userId).lastInsertRowid);
  f.db.prepare('UPDATE applications SET resume_id=?,resume_version_id=? WHERE id=?').run(resume,String(version),a.id);
  const material=(id,app,job,client)=>f.db.prepare('INSERT INTO application_materials(user_id,client_id,application_id,job_id,content) VALUES (?,?,?,?,?)').run(id,client,app,job,client);
  material(f.userId,a.id,'','explicit');material(f.userId,null,a.jobId,'legacy');
  material(f.userId,b.id,a.jobId,'wrong_explicit');material(f.userId,null,b.jobId,'');material(f.otherId,null,a.jobId,'other_owner');
  f.db.prepare("INSERT INTO jd_match_reports(user_id,client_id,job_id,resume_version_id,ats_risk) VALUES (?,'wrong-version',?,'999999','Wrong ATS')").run(f.userId,a.jobId);
  let result=await f.call(`/${a.id}/workspace`); assert.equal(result.status,200); assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(result.body.data.materials.map(m=>m.content).sort(),['explicit','legacy']);
  assert.equal(result.body.data.resume.version.id,version);assert.equal(result.body.data.jdReport,null);
  f.db.prepare("INSERT INTO jd_match_reports(user_id,client_id,job_id,resume_version_id,ats_risk) VALUES (?,'correct-version',?,?,'正确版本风险')").run(f.userId,a.jobId,String(version));
  const total=f.db.prepare('SELECT total_changes() n').get().n;
  result=await f.call(`/${a.id}/workspace`);
  assert.equal(result.body.data.jdReport.atsRisk,'正确版本风险');
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n,total);
  assert.deepEqual((await f.call(`/${a.id}/detail`)).body.data.materials.map(m=>m.content).sort(),['explicit','legacy']);
  assert.equal(result.body.data.offer,null);
});
test('AI answer writeback requires confirmation and keeps notes and tasks on the owned application',async()=>{
  const app=await f.create(),otherApp=await f.create();
  const source=completedAction(app.id);
  const payload={actionId:source.actionId,applicationId:app.id,target:'note',content:'准备一段项目介绍'};
  assert.equal((await saveAssistant(payload)).status,400);
  for(const actionId of ['',`ai-save:0:${source.turnId}`,`ai-save:01:${source.turnId}`,'assistant-note-action-1']) {
    assert.equal((await saveAssistant({...payload,actionId,confirm:true})).status,400);
  }
  for(const applicationId of [true,{},[],0,1.5,Number.MAX_SAFE_INTEGER+1]) {
    assert.equal((await saveAssistant({...payload,applicationId,confirm:true})).status,400);
  }
  for(const content of [{},[],true,123]) assert.equal((await saveAssistant({...payload,content,confirm:true})).status,400);
  assert.equal((await saveAssistant({...payload,confirm:true},f.otherId)).status,404);
  const pending=completedAction(app.id,{status:'pending'});
  assert.equal((await saveAssistant({...payload,actionId:pending.actionId,confirm:true})).status,409);
  const mismatch=completedAction(app.id);
  assert.equal((await saveAssistant({...payload,actionId:mismatch.actionId,applicationId:otherApp.id,confirm:true})).status,409);
  const first=await saveAssistant({...payload,confirm:true});
  const replay=await saveAssistant({...payload,confirm:true});
  assert.equal(first.status,201);assert.equal(first.body.data.created,true);assert.equal(first.body.data.replay,false);
  assert.equal(replay.status,200);assert.equal(replay.body.data.created,false);assert.equal(replay.body.data.replay,true);
  assert.equal(replay.body.data.actionId,first.body.data.actionId);assert.equal(replay.body.data.turnId,first.body.data.turnId);
  assert.equal((await saveAssistant({...payload,content:'同一动作改成其他内容',confirm:true})).status,409);
  assert.equal((await saveAssistant({...payload,actionId:completedAction(app.id).actionId,target:'unknown',confirm:true})).status,400);
  for(const dueAt of ['tomorrow','2026-02-29','2026-04-31']) {
    assert.equal((await saveAssistant({...payload,actionId:completedAction(app.id).actionId,target:'task',dueAt,confirm:true})).status,400);
  }
  await Promise.all(['并发备注 A','并发备注 B'].map(content=>saveAssistant({...payload,actionId:completedAction(app.id).actionId,content,confirm:true})));
  const taskSource=completedAction(app.id),taskPayload={...payload,actionId:taskSource.actionId,target:'task',dueAt:'2028-02-29',confirm:true};
  const taskResults=await Promise.all([saveAssistant(taskPayload,f.userId,'203.0.113.7'),saveAssistant(taskPayload,f.userId,'203.0.113.7')]);
  assert.deepEqual(taskResults.map(result=>result.status).sort(),[200,201]);
  assert.equal(taskResults[0].body.data.taskId,taskResults[1].body.data.taskId);
  const general=completedAction(null,{general:true});
  const generalResult=await saveAssistant({...payload,actionId:general.actionId,applicationId:String(app.id).padStart(4,'0'),content:'通用建议写入指定申请',confirm:true});
  assert.equal(generalResult.status,201);assert.equal(generalResult.body.data.sourceScope,'general');
  const foreignApp=await f.create('preparing',f.otherId),foreignAction=completedAction(foreignApp.id,{userId:f.otherId});
  assert.equal((await saveAssistant({...payload,actionId:foreignAction.actionId,confirm:true})).status,404);
  const workspace=(await f.call(`/${app.id}/workspace`)).body.data;
  assert.equal(workspace.application.notes.split('准备一段项目介绍').length-1,1);
  assert.ok(workspace.application.notes.includes('并发备注 A'));assert.ok(workspace.application.notes.includes('并发备注 B'));
  assert.ok(workspace.application.notes.includes('通用建议写入指定申请'));
  assert.equal(workspace.tasks.filter(item=>item.title==='准备一段项目介绍').length,1);
  assert.equal(f.db.prepare("SELECT due_at FROM application_tasks WHERE title='准备一段项目介绍' AND application_id=?").pluck().get(app.id),'2028-02-29');
  assert.equal(f.db.prepare('SELECT COUNT(*) FROM ai_assistant_confirmations WHERE user_id=?').pluck().get(f.userId),5);
  assert.deepEqual(
    f.db.prepare('SELECT conversation_id AS conversationId,turn_id AS turnId,source_scope AS sourceScope FROM ai_assistant_confirmations WHERE action_id=?').get(source.actionId),
    {conversationId:source.conversationId,turnId:source.turnId,sourceScope:'application'}
  );
});

test('AI conversations keep application context private and persist failed turns',async()=>{
  const app=await f.create();
  const created=await f.apiCall('/api/ai/conversations','POST',{applicationId:app.id});
  assert.equal(created.status,201); const conversation=created.body.data;
  assert.equal((await f.apiCall(`/api/ai/conversations/${conversation.id}`)).status,200);
  assert.equal((await f.apiCall(`/api/ai/conversations/${conversation.id}`, 'GET', undefined, f.otherId)).status,404);
  const turn=await f.apiCall(`/api/ai/conversations/${conversation.id}/turns`,'POST',{requestId:'failed-turn-1',content:'面试前我应该准备什么？'});
  assert.equal(turn.status,503);
  assert.equal(f.db.prepare('SELECT status,error_code FROM ai_conversation_turns WHERE conversation_id=?').get(conversation.id).status,'failed');
  const detail=await f.apiCall(`/api/ai/conversations/${conversation.id}`);
  assert.equal(detail.body.data.context.applicationId,app.id);
  assert.equal(detail.body.data.context.company,'示例公司');assert.match(detail.body.data.context.jobTitle,/岗位/);
  assert.equal(detail.body.data.turns[0].answer,'');
  const pending=Number(f.db.prepare("INSERT INTO ai_conversation_turns(conversation_id,request_id,question,status,source) VALUES (?,'cancel-me-1','稍后再问','pending','web')").run(conversation.id).lastInsertRowid);
  assert.equal((await f.apiCall(`/api/ai/conversations/${conversation.id}/turns/${pending}/cancel`,'POST',{})).body.data.status,'cancelled');
});

test('AI conversation turns are idempotent and never write AI output without confirmation',async()=>{
  const runtime=require('../../services/v4AiRuntime'); const original=runtime.generate;
  runtime.generate=async()=>({source:'live',degraded:false,error:null,value:'建议先核对岗位 JD 和截止日期。'});
  try {
    const app=await f.create();
    const conversation=(await f.apiCall('/api/ai/conversations','POST',{applicationId:app.id})).body.data;
    const first=await f.apiCall(`/api/ai/conversations/${conversation.id}/turns`,'POST',{requestId:'stable-request-1',content:'请给我一个投递前检查清单'});
    assert.equal(first.status,201); assert.equal(first.body.data.status,'completed');
    const replay=await f.apiCall(`/api/ai/conversations/${conversation.id}/turns`,'POST',{requestId:'stable-request-1',content:'请给我一个投递前检查清单'});
    assert.equal(replay.status,200); assert.equal(replay.body.data.id,first.body.data.id);
    assert.equal(f.db.prepare('SELECT notes FROM applications WHERE id=?').get(app.id).notes,'');
    assert.equal((await f.apiCall(`/api/ai/conversations/${conversation.id}/turns`,'POST',{requestId:'changed-request-1',content:'另一条问题'})).status,201);
  } finally { runtime.generate=original; }
});
