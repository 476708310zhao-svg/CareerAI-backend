const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const model = require('../public/web/application-model');
const aiSaveModel = require('../public/web/ai-save-model');

function createLayout(prefix='careerai-web-config-') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  const dbPath=path.join(root,'test.db'),dataDir=path.join(root,'data'),uploadDir=path.join(root,'uploads');
  fs.writeFileSync(dbPath,'');fs.mkdirSync(dataDir);fs.mkdirSync(uploadDir);
  return {root,dbPath,dataDir,uploadDir};
}

test('Web fixture fails before loading application routes when isolation configuration is unsafe',()=>{
  const fixture=path.join(__dirname,'helpers/webApplicationFixture.cjs');
  const good=createLayout();
  const foreign=createLayout('careerai-web-foreign-');
  const hardlinked=createLayout('careerai-web-hardlink-');
  const nonEmpty=createLayout('careerai-web-nonempty-');
  fs.linkSync(hardlinked.dbPath,path.join(hardlinked.root,'second-link.db'));
  fs.writeFileSync(nonEmpty.dbPath,'not an empty sqlite file');
  const base=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('NODE_TEST_')&&!['WEB_TEST_ISOLATED','DB_PATH','DATA_DIR','UPLOAD_DIR'].includes(key)));
  const valid={WEB_TEST_ISOLATED:'1',DB_PATH:good.dbPath,DATA_DIR:good.dataDir,UPLOAD_DIR:good.uploadDir};
  const cases=[
    {...valid,WEB_TEST_ISOLATED:'0'},
    {...valid,DB_PATH:''},
    {...valid,DB_PATH:'relative.db'},
    {...valid,DATA_DIR:foreign.dataDir},
    {...valid,UPLOAD_DIR:path.join(good.root,'missing')},
    {WEB_TEST_ISOLATED:'1',DB_PATH:hardlinked.dbPath,DATA_DIR:hardlinked.dataDir,UPLOAD_DIR:hardlinked.uploadDir},
    {WEB_TEST_ISOLATED:'1',DB_PATH:nonEmpty.dbPath,DATA_DIR:nonEmpty.dataDir,UPLOAD_DIR:nonEmpty.uploadDir}
  ];
  try {
    for(const unsafe of cases){
      const result=spawnSync(process.execPath,['-e',`require(${JSON.stringify(fixture)})`],{encoding:'utf8',env:{...base,...unsafe}});
      assert.notEqual(result.status,0,'unsafe fixture configuration must fail closed');
      assert.match((result.stderr||'')+(result.stdout||''),/Web tests require|Web test paths must/);
    }
  } finally {
    for(const layout of [good,foreign,hardlinked,nonEmpty]) fs.rmSync(layout.root,{recursive:true,force:true});
  }
});

test('Web authentication exposes only the verified mini-program one-time-code flow',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/web/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/web/app.js'),'utf8');
  assert.match(html,/id="code-login-form"/);
  assert.doesNotMatch(html,/id="login-form"|id="register-form"|type="password"|邮箱或手机号/);
  assert.doesNotMatch(app,/\/api\/users\/web-login|\/api\/users\/web-register|login-password|register-form/);
});

test('Web P0 keeps resume and material controls read-only until the later backend checkpoint',()=>{
  const source=['index.html','app.js','applications.js','p0-workspace.js'].map(file=>fs.readFileSync(path.join(__dirname,'../public/web',file),'utf8')).join('\n');
  assert.doesNotMatch(source,/\/api\/v4\/resumes|\/api\/v4\/materials|\/api\/upload\/resume-pdf|\/api\/career-assets/);
  assert.doesNotMatch(source,/workspace-save-resume|workspace-generate|data-confirm-draft|data-save-material|resume-editor/);
  assert.match(source,/申请资料（只读）|只读展示/);
});

test('Web AI history requests an explicit general or application scope',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/web/ai-expert.js'),'utf8');
  assert.match(source,/scope=general/);assert.match(source,/scope=application&applicationId=/);
  assert.match(source,/scope:'general'/);assert.match(source,/scope:'application'/);
});

test('Web AI confirmation cards expose the exact safe write and reuse one stable action id',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/web/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/web/app.js'),'utf8');
  const expert=fs.readFileSync(path.join(__dirname,'../public/web/ai-expert.js'),'utf8');
  const saveModelSource=fs.readFileSync(path.join(__dirname,'../public/web/ai-save-model.js'),'utf8');
  for(const text of ['申请对象','动作','变更前','变更后','影响范围','确认新增备注','查看申请工作台']) assert.match(html,new RegExp(text));
  assert.match(html,/不会投递职位、发送消息或联系雇主/);
  assert.match(html,/id="ai-save-company"/);assert.match(html,/id="ai-save-job"/);
  assert.match(html,/id="ai-save-application" required/);
  assert.match(saveModelSource,/确认新增任务/);assert.match(app,/actionId: state\.aiSaveActionId/);
  assert.match(app,/state\.aiSaveActionId = actionId/);assert.match(app,/ai-save-view-application/);
  assert.doesNotMatch(app,/if \(!application\?\.id\) return/);
  assert.match(app,/if \(!state\.aiSaveApplicationId\)/);
  assert.match(app,/const openVersion = nextAISaveOpenVersion\(\)/);
  assert.match(app,/finally \{\s*if \(currentAISaveOpen\(openVersion\)\)/);
  assert.match(app,/const applicationSnapshot = state\.aiSaveApplication/);
  assert.match(app,/const payload = Object\.freeze/);
  assert.ok((app.match(/if \(!currentAISaveOpen\(openVersion\)\) return/g)||[]).length >= 4);
  assert.match(expert,/AISaveModel\.actionId\(conversation\.id, turn\.id\)/);
});

test('Web AI confirmation behavior keeps action identity stable and previews note or task changes',()=>{
  assert.equal(aiSaveModel.actionId(12,34),'ai-save:12:34');
  assert.equal(aiSaveModel.actionId(12,34),aiSaveModel.actionId('12','34'));
  assert.notEqual(aiSaveModel.actionId(12,34),aiSaveModel.actionId(12,35));
  for(const invalid of [0,'0','01',-1,Number.MAX_SAFE_INTEGER+1,'9007199254740992','bad',true]) assert.throws(()=>aiSaveModel.actionId(invalid,35));
  const applications=[{id:7,company:'甲',jobTitle:'分析师'},{id:8,company:'乙',jobTitle:'工程师'}];
  assert.deepEqual(aiSaveModel.applicationSelection(applications,null),{applications,selected:null,selectedId:null,canConfirm:false});
  assert.deepEqual(aiSaveModel.applicationSelection(applications,'7'),{applications,selected:applications[0],selectedId:7,canConfirm:true});
  assert.equal(aiSaveModel.applicationSelection(applications,99).canConfirm,false);
  assert.equal(aiSaveModel.nextOpenVersion(0),1);
  assert.equal(aiSaveModel.nextOpenVersion(7),8);
  assert.equal(aiSaveModel.isCurrentOpen(8,8),true);
  assert.equal(aiSaveModel.isCurrentOpen(7,8),false);
  for(const invalid of [-1,1.5,Number.MAX_SAFE_INTEGER,'bad']) assert.throws(()=>aiSaveModel.nextOpenVersion(invalid));
  assert.throws(()=>aiSaveModel.confirmation('unknown','内容',''));
  assert.deepEqual(aiSaveModel.confirmation('note','补充项目案例',''),{
    actionName:'新增申请备注',before:'保留现有申请备注',after:'在备注末尾新增：补充项目案例',impact:'仅追加这条申请的备注；不会投递职位、发送消息或联系雇主。',submitLabel:'确认新增备注',maxLength:2000,dateEnabled:false
  });
  assert.deepEqual(aiSaveModel.confirmation('task','准备两个案例','2028-02-29'),{
    actionName:'新增下一步任务',before:'保留现有任务列表',after:'新增 1 项任务：准备两个案例（日期：2028-02-29）',impact:'仅新增这条申请的任务；不会自动同步到 Today 或申请时间线，也不会投递职位、发送消息或联系雇主。',submitLabel:'确认新增任务',maxLength:200,dateEnabled:true
  });
});

test('mini-program settings exposes the guarded one-time computer login code action',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../miniprogram/package-user/pages/settings/settings.js'),'utf8');
  const template=fs.readFileSync(path.join(__dirname,'../miniprogram/package-user/pages/settings/settings.wxml'),'utf8');
  assert.match(template,/bindtap="loginOnComputer"/);assert.match(template,/登录电脑工作台/);
  assert.match(script,/ensureAuthenticated\('登录后生成电脑登录码'/);
  assert.match(script,/path:'\/api\/web-session\/code'/);
  assert.match(script,/token !== wx\.getStorageSync\('token'\)/);
  assert.match(script,/wx\.setClipboardData\(\{data:data\.code\}\)/);
});

test('real server composition mounts Web login and every P0 backend route',()=>{
  const layout=createLayout('careerai-web-server-');
  try {
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('NODE_TEST_')&&!['WEB_TEST_ISOLATED','DB_PATH','DATA_DIR','UPLOAD_DIR'].includes(key)));
    const result=spawnSync(process.execPath,[path.join(__dirname,'helpers/webServerCompositionCase.cjs')],{encoding:'utf8',timeout:60000,env:{...env,NODE_ENV:'test',WEB_TEST_ISOLATED:'1',DB_PATH:layout.dbPath,DATA_DIR:layout.dataDir,UPLOAD_DIR:layout.uploadDir,JWT_SECRET:'web_server_composition_secret_not_for_production',V4_AI_LIVE_ENABLED:'false',ANALYTICS_DATA_CLASS:'test',ALLOWED_ORIGIN:'http://localhost:4400'}});
    assert.equal(result.status,0,(result.stdout||'')+(result.stderr||'')+(result.error||''));
    assert.match(result.stdout,/Real server composition PASS/);
  } finally {fs.rmSync(layout.root,{recursive:true,force:true});}
});

test('Web exact status filters keep OA and closed applications visible', () => {
  const rows=model.rows({groups:{applied:[{id:1,status:'oa',company:'甲',jobTitle:'数据'}],closed:[{id:2,status:'withdrawn',company:'乙',jobTitle:'运营'}]}});
  assert.equal(rows.length,2);assert.equal(model.group('oa'),'oa');assert.equal(model.group('withdrawn'),'closed');
  assert.deepEqual(model.filterAndSort(rows,{status:'oa'}).map(item=>item.id),[1]);
  assert.deepEqual(model.filterAndSort(rows,{keyword:'乙'}).map(item=>item.id),[2]);
  assert.equal(rows.length,2);
});
test('Web sorting puts missing deadlines last and understands SQLite timestamps',()=>{
  const rows=[{id:1,deadline:'',updatedAt:'2026-09-14 08:00:00'},{id:2,deadline:'2026-09-15',updatedAt:'2026-09-14T09:00:00Z'},{id:3,deadline:'2026-09-14'}];
  assert.deepEqual(model.filterAndSort(rows).map(item=>item.id),[3,2,1]);
  assert.deepEqual(model.filterAndSort(rows,{sort:'updated'}).map(item=>item.id),[2,1,3]);
});
test('Web bulk choices use server transitions and preserve concurrency revisions',()=>{
  const rows=[{id:1,status:'preparing',historyId:10,allowedTransitions:[{value:'applied'}]},{id:2,status:'applied',historyId:11,allowedTransitions:[{value:'oa'}]}];
  assert.deepEqual(model.commonTargets(rows,[{value:'applied'},{value:'oa'}]),[{value:'applied'}]);
  assert.deepEqual(model.snapshot(rows),[{id:1,status:'preparing',historyId:10},{id:2,status:'applied',historyId:11}]);
});
test('Web APIs pass isolated ownership, transaction, undo and aggregation cases',()=>{
  const layout=createLayout('careerai-web-case-'),dir=layout.root;
  try {
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('NODE_TEST_')));
    const result=spawnSync(process.execPath,['--test','--test-reporter=spec',path.join(__dirname,'helpers/webApplicationCases.cjs')],{encoding:'utf8',timeout:60000,env:{...env,WEB_TEST_ISOLATED:'1',DB_PATH:layout.dbPath,DATA_DIR:layout.dataDir,UPLOAD_DIR:layout.uploadDir,JWT_SECRET:'web_fixture_secret_please_do_not_use_in_production',V4_AI_LIVE_ENABLED:'false',ANALYTICS_DATA_CLASS:'test'}});
    assert.equal(result.status,0,(result.stdout || '')+(result.stderr || '')+(result.error || ''));
    assert.match(result.stdout,/tests 16/);
  } finally {
    if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('careerai-web-case-')) throw new Error('Unexpected test cleanup path');
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
