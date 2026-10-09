// P0 acceptance uses a disposable database and a stub model; no production accounts or AI calls.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WEB_PLAYWRIGHT_MODULE||'playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'careerai-web-p0-'));
fs.writeFileSync(path.join(directory,'test.db'),'');fs.mkdirSync(path.join(directory,'data'));fs.mkdirSync(path.join(directory,'uploads'));
Object.assign(process.env,{WEB_TEST_ISOLATED:'1',DB_PATH:path.join(directory,'test.db'),DATA_DIR:path.join(directory,'data'),UPLOAD_DIR:path.join(directory,'uploads'),JWT_SECRET:'web_p0_secret_do_not_use_in_production',V4_AI_LIVE_ENABLED:'false',ANALYTICS_DATA_CLASS:'test'});
(async()=>{
  let f,browser,release;
  try{
    f=await require('../helpers/webApplicationFixture.cjs').start();
    f.db.prepare('UPDATE users SET vip_level=1 WHERE id=?').run(f.userId);
    const runtime=require('../../services/v4AiRuntime');
    runtime.generate=async()=>({source:'live',degraded:false,error:null,value:'先准备一个真实的项目案例。'});
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(10000);
    const artifact=path.resolve('artifacts/web-p0');fs.mkdirSync(artifact,{recursive:true});
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    const issued=(await f.apiCall('/api/web-session/code','POST',{})).body.data;
    await page.goto(f.url+'/web/');await page.locator('#web-login-code').fill(issued.code);await page.locator('#code-login-form button').click();
    await page.locator('#app-view:not(.hidden)').waitFor();
    await page.locator('.side-nav [data-view="applications"]').click();
    await page.locator('#refresh-applications:not([disabled])').waitFor();
    await page.locator('[data-action="manual-application"]').click();
    await page.locator('#manual-form [name="company"]').fill('P0 测试公司');await page.locator('#manual-form [name="title"]').fill('分析师');
    await page.locator('#manual-form [name="jd"]').fill('使用 SQL 完成真实业务分析');
    await page.locator('#manual-form [name="url"]').fill('https://example.com/jobs/1');
    // Keep the same job id and form on an uncertain failure.
    let ids=[];
    await page.route('**/api/v4/applications',async route=>{ids.push(route.request().postDataJSON().jobId);if(ids.length===1)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:-1,message:'测试网络故障'})});else await route.continue();});
    await page.locator('#manual-form [type="submit"]').click();await page.getByText('测试网络故障',{exact:true}).waitFor();
    assert.equal(await page.locator('#manual-form [name="company"]').inputValue(),'P0 测试公司');
    await page.locator('#manual-form [type="submit"]').click();await page.locator('#workspace-fields').waitFor();assert.equal(ids[0],ids[1]);
    const app=f.db.prepare("SELECT id FROM applications WHERE company='P0 测试公司'").get();
    await page.locator('#workspace-task-new [name="title"]').fill('准备案例');await page.locator('#workspace-task-new button').click();
    await page.locator('[data-task-edit]').waitFor();
    await page.locator('[data-task-edit] [name="title"]').fill('准备两个案例');await page.locator('[data-task-edit] [name="completed"]').check();await page.locator('[data-task-edit] button').click();
    await page.waitForFunction(()=>document.querySelector('[data-task-edit] [name="title"]')?.value==='准备两个案例'&&!document.querySelector('[data-task-edit] button')?.disabled);
    await page.locator('#workspace-fields [name="interviewTime"]').fill('2026-10-08T10:30');await page.locator('#workspace-fields button').click();
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='安排已保存');
    let workspace=(await f.call(`/${app.id}/workspace`)).body.data;assert.equal(workspace.tasks[0].completed,true);assert.equal(workspace.application.interviewTime,'2026-10-08T10:30');
    await page.locator('#close-drawer').click();
    await page.locator(`[data-open-id="${app.id}"]`).click();await page.locator('#workspace-ai').click();
    await page.locator('#ai-form button:not([disabled])').waitFor();await page.locator('#ai-input').fill('如何准备面试');await page.locator('#ai-form button').click();
    await page.locator('#ai-messages').getByText('先准备一个真实的项目案例。',{exact:true}).waitFor();
    const confirmationRequests=[];let loseFirstConfirmationResponse=true;
    let delayedConfirmationContent='',releaseDelayedConfirmation,delayedConfirmationReached;
    await page.route('**/api/ai/assistant/save',async route=>{
      const body=route.request().postDataJSON();confirmationRequests.push(body);
      if(body.content===delayedConfirmationContent){
        const response=await route.fetch();delayedConfirmationReached?.();
        await new Promise(resolve=>{releaseDelayedConfirmation=resolve;});
        await route.fulfill({response});return;
      }
      if(loseFirstConfirmationResponse){loseFirstConfirmationResponse=false;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:-1,message:'模拟确认响应丢失'})});}
      else await route.continue();
    });
    await page.getByRole('button',{name:'保存为备注或任务',exact:true}).click();
    await page.waitForFunction(id=>document.querySelector('#ai-save-application')?.value===id,String(app.id));
    assert.equal(await page.locator('#ai-save-company').textContent(),'P0 测试公司');assert.equal(await page.locator('#ai-save-job').textContent(),'分析师');
    assert.equal(await page.locator('#ai-save-action-name').textContent(),'新增申请备注');
    assert.match(await page.locator('#ai-save-before').textContent(),/保留现有申请备注/);assert.match(await page.locator('#ai-save-after').textContent(),/真实的项目案例/);
    assert.match(await page.locator('.ai-change-list').textContent(),/不会投递职位、发送消息或联系雇主/);
    await page.locator('#ai-save-target').selectOption('task');assert.equal(await page.locator('#ai-save-action-name').textContent(),'新增下一步任务');assert.equal(await page.locator('#ai-save-submit').textContent(),'确认新增任务');assert.match(await page.locator('#ai-save-impact').textContent(),/不会自动同步到 Today 或申请时间线/);
    await page.locator('#ai-save-target').selectOption('note');assert.equal(await page.locator('#ai-save-submit').textContent(),'确认新增备注');
    await page.getByRole('button',{name:'确认新增备注',exact:true}).click();await page.getByText('模拟确认响应丢失',{exact:true}).waitFor();
    await page.getByRole('button',{name:'确认新增备注',exact:true}).click();await page.getByRole('button',{name:'查看申请工作台',exact:true}).waitFor();
    assert.equal(confirmationRequests.length,2);assert.equal(confirmationRequests[0].actionId,confirmationRequests[1].actionId);
    assert.equal(f.db.prepare("SELECT notes FROM applications WHERE id=?").pluck().get(app.id).split('先准备一个真实的项目案例。').length-1,1);
    await page.getByRole('button',{name:'查看申请工作台',exact:true}).click();await page.locator('#workspace-fields').waitFor();
    // General AI answers still expose the write entry, but cannot be confirmed
    // until the user explicitly chooses one of their owned applications.
    await page.setExtraHTTPHeaders({'X-Forwarded-For':'198.51.100.10'});
    await page.locator('#close-drawer').click();await page.locator('#global-ai').click();await page.locator('#ai-form button:not([disabled])').waitFor();
    await page.locator('#ai-input').fill('通用求职建议');await page.locator('#ai-form button').click();
    await page.locator('#ai-messages').getByText('先准备一个真实的项目案例。',{exact:true}).waitFor();
    const generalTurn=f.db.prepare(`SELECT t.id turnId,t.conversation_id conversationId FROM ai_conversation_turns t
      JOIN ai_conversations c ON c.id=t.conversation_id WHERE c.user_id=? AND c.application_id IS NULL ORDER BY t.id DESC LIMIT 1`).get(f.userId);
    const beforeGeneralConfirm=confirmationRequests.length;
    await page.getByRole('button',{name:'保存为备注或任务',exact:true}).click();
    await page.locator('#ai-save-application option').nth(1).waitFor({state:'attached'});
    assert.equal(await page.locator('#ai-save-application').inputValue(),'');
    assert.equal(await page.locator('#ai-save-submit').isDisabled(),true);
    assert.equal(confirmationRequests.length,beforeGeneralConfirm,'unselected general answer cannot be confirmed');
    await page.locator('#ai-save-application').selectOption(String(app.id));
    assert.equal(await page.locator('#ai-save-company').textContent(),'P0 测试公司');assert.equal(await page.locator('#ai-save-job').textContent(),'分析师');
    assert.equal(await page.locator('#ai-save-impact').textContent(),'仅追加这条申请的备注；不会投递职位、发送消息或联系雇主。');
    assert.equal(await page.locator('#ai-save-submit').isEnabled(),true);
    await page.getByRole('button',{name:'确认新增备注',exact:true}).click();await page.getByRole('button',{name:'查看申请工作台',exact:true}).waitFor();
    const generalRequest=confirmationRequests.at(-1);
    assert.equal(generalRequest.actionId,`ai-save:${generalTurn.conversationId}:${generalTurn.turnId}`);
    assert.equal(generalRequest.applicationId,app.id);
    await page.getByRole('button',{name:'查看申请工作台',exact:true}).click();await page.locator('#workspace-fields').waitFor();
    // A late application-list response from a closed confirmation must never
    // overwrite a newer general-answer confirmation.
    runtime.generate=async()=>({source:'live',degraded:false,error:null,value:'B 回答：先做一次岗位筛选。'});
    await page.locator('#close-drawer').click();await page.locator('#global-ai').click();await page.locator('#ai-form button:not([disabled])').waitFor();
    await page.locator('#ai-input').fill('第二个通用问题');await page.locator('#ai-form button').click();
    await page.locator('#ai-messages').getByText('B 回答：先做一次岗位筛选。',{exact:true}).waitFor();
    const bTurn=f.db.prepare(`SELECT t.id turnId,t.conversation_id conversationId FROM ai_conversation_turns t
      JOIN ai_conversations c ON c.id=t.conversation_id WHERE c.user_id=? AND c.application_id IS NULL ORDER BY t.id DESC LIMIT 1`).get(f.userId);
    let boardRaceCount=0,releaseBoardA;
    const boardRace='**/api/v4/applications/board';
    const boardRaceHandler=async route=>{
      boardRaceCount++;
      if(boardRaceCount===1) await new Promise(resolve=>{releaseBoardA=resolve;});
      const response=await route.fetch();await route.fulfill({response});
    };
    await page.route(boardRace,boardRaceHandler);
    const generalSaveButtons=page.locator('#ai-messages .ai-save-actions button');assert.equal(await generalSaveButtons.count(),2);
    await generalSaveButtons.nth(0).click();await page.locator('#ai-save-dialog[open]').waitFor();await page.locator('#ai-save-cancel').click();
    await generalSaveButtons.nth(1).click();await page.locator('#ai-save-application option').nth(1).waitFor({state:'attached'});
    await page.locator('#ai-save-application').selectOption(String(app.id));await page.locator('#ai-save-target').selectOption('task');
    await page.locator('#ai-save-content').fill('B 编辑后的任务');
    releaseBoardA();await page.waitForTimeout(150);
    assert.equal(await page.locator('#ai-save-dialog').getAttribute('open'),'');
    assert.equal(await page.locator('#ai-save-application').inputValue(),String(app.id));
    assert.equal(await page.locator('#ai-save-target').inputValue(),'task');
    assert.equal(await page.locator('#ai-save-content').inputValue(),'B 编辑后的任务');
    assert.equal(await page.locator('#ai-save-impact').textContent(),'仅新增这条申请的任务；不会自动同步到 Today 或申请时间线，也不会投递职位、发送消息或联系雇主。');
    await page.getByRole('button',{name:'确认新增任务',exact:true}).click();await page.getByRole('button',{name:'查看申请工作台',exact:true}).waitFor();
    const bRequest=confirmationRequests.at(-1);assert.equal(bRequest.actionId,`ai-save:${bTurn.conversationId}:${bTurn.turnId}`);assert.equal(bRequest.applicationId,app.id);assert.equal(bRequest.content,'B 编辑后的任务');
    await page.unroute(boardRace,boardRaceHandler);
    await page.getByRole('button',{name:'查看申请工作台',exact:true}).click();await page.locator('#workspace-fields').waitFor();
    // A submit may complete on the server after its dialog closes. Its late UI
    // success must not hide or mutate a newer B confirmation.
    runtime.generate=async()=>({source:'live',degraded:false,error:null,value:'A 迟到提交的建议。'});
    await page.locator('#close-drawer').click();await page.locator('#global-ai').click();await page.locator('#ai-form button:not([disabled])').waitFor();
    await page.locator('#ai-input').fill('生成第三个通用建议');await page.locator('#ai-form button').click();
    await page.locator('#ai-messages').getByText('A 迟到提交的建议。',{exact:true}).waitFor();
    const submitRaceButtons=page.locator('#ai-messages .ai-save-actions button');assert.equal(await submitRaceButtons.count(),3);
    await submitRaceButtons.nth(2).click();await page.locator('#ai-save-application option').nth(1).waitFor({state:'attached'});
    await page.locator('#ai-save-application').selectOption(String(app.id));await page.locator('#ai-save-content').fill('A 服务端已写入，响应延迟');
    delayedConfirmationContent='A 服务端已写入，响应延迟';
    const delayedServerWrite=new Promise(resolve=>{delayedConfirmationReached=resolve;});
    await page.getByRole('button',{name:'确认新增备注',exact:true}).click();await delayedServerWrite;
    await page.locator('#ai-save-cancel').click();await submitRaceButtons.nth(0).click();
    await page.locator('#ai-save-application option').nth(1).waitFor({state:'attached'});await page.locator('#ai-save-application').selectOption(String(app.id));
    await page.locator('#ai-save-target').selectOption('task');await page.locator('#ai-save-content').fill('B 弹窗必须保持');
    releaseDelayedConfirmation();await page.waitForTimeout(150);
    assert.equal(f.db.prepare('SELECT notes FROM applications WHERE id=?').pluck().get(app.id).includes('A 服务端已写入，响应延迟'),true);
    assert.equal(await page.locator('#ai-save-dialog').getAttribute('open'),'');assert.equal(await page.locator('#ai-save-form').isVisible(),true);assert.equal(await page.locator('#ai-save-success').isHidden(),true);
    assert.equal(await page.locator('#ai-save-application').inputValue(),String(app.id));assert.equal(await page.locator('#ai-save-target').inputValue(),'task');assert.equal(await page.locator('#ai-save-content').inputValue(),'B 弹窗必须保持');
    assert.equal(await page.locator('#ai-save-message').textContent(),'');assert.equal(await page.locator('#ai-save-submit').isEnabled(),true);
    await page.locator('#ai-save-cancel').click();await page.locator('#close-ai').click();
    await page.setExtraHTTPHeaders({'X-Forwarded-For':'127.0.0.1'});
    const count=()=>f.db.prepare('SELECT COUNT(*) n FROM ai_conversations WHERE application_id=?').get(app.id).n;
    const original=count();
    await page.reload();await page.locator('.side-nav [data-view="applications"]').click();await page.locator(`[data-open-id="${app.id}"]`).click();await page.locator('#workspace-ai').click();
    await page.locator('#ai-messages').getByText('先准备一个真实的项目案例。',{exact:true}).waitFor();assert.equal(count(),original,'reload restores rather than creates');
    await page.screenshot({path:path.join(artifact,'ai-history.png'),fullPage:true});
    await page.locator('#close-ai').click();await page.locator('#workspace-ai').click();await page.locator('#ai-messages').getByText('先准备一个真实的项目案例。',{exact:true}).waitFor();
    // Model resolves after cancellation; its output must stay cancelled in the database and UI.
    runtime.generate=()=>new Promise(resolve=>{release=()=>resolve({source:'live',degraded:false,error:null,value:'迟到的回答不能显示'});});
    await page.locator('#ai-input').fill('这是需要停止的请求');await page.locator('#ai-form button').click();
    await page.getByRole('button',{name:'停止回答',exact:true}).click();await page.getByText('这次回答已停止。',{exact:true}).waitFor();
    await page.locator('#ai-form button:not([disabled])').waitFor();
    release();release=null;
    await page.locator('#ai-form button:not([disabled])').waitFor();assert.equal(await page.getByText('迟到的回答不能显示',{exact:true}).count(),0);
    await page.locator('#ai-input').fill('切换上下文的问题');await page.locator('#ai-form button').click();
    await page.getByRole('button',{name:'停止回答',exact:true}).waitFor();
    await page.locator('#close-ai').click();await page.locator('#close-drawer').click();
    await page.locator('#global-ai').click();await page.locator('#ai-form button:not([disabled])').waitFor();
    release();release=null;await page.waitForTimeout(150);
    assert.equal(await page.getByText('迟到的回答不能显示',{exact:true}).count(),0,'previous application answer must not appear in general context');
    await page.locator('#close-ai').click();
    await page.locator('.side-nav [data-view="resources"]').click();
    await page.screenshot({path:path.join(artifact,'resources.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:path.join(artifact,'resources-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:960});
    // A delayed answer after logout must not restore another user's UI or save actions.
    await page.setExtraHTTPHeaders({'X-Forwarded-For':'198.51.100.11'});
    await page.locator('#global-ai').click();await page.locator('#ai-form button:not([disabled])').waitFor();await page.locator('#ai-input').fill('退出期间的问题');await page.locator('#ai-form button').click();
    await page.getByRole('button',{name:'停止回答',exact:true}).waitFor();await page.locator('#close-ai').click();await page.locator('#logout-button').click();release();release=null;
    await page.waitForTimeout(150);assert.equal(await page.locator('#ai-messages').textContent(),'');assert.equal(await page.locator('#applications-view').textContent(),'');
    await page.screenshot({path:path.join(artifact,'login.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.deepEqual(errors,[]);
    console.log('P0 browser PASS: same-account login, manual retry, task/date edits, scoped AI restore/cancel/logout, read-only resources.');
  } finally{
    release?.();await browser?.close();await f?.close();
    if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('careerai-web-p0-'))throw new Error('Unsafe cleanup path');
    fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
