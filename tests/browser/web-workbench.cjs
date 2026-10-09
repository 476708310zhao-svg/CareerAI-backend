// Optional local browser acceptance. Uses a disposable database and never calls a live AI provider.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.WEB_PLAYWRIGHT_MODULE || 'playwright');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'careerai-web-browser-'));
fs.writeFileSync(path.join(directory,'test.db'),'');
fs.mkdirSync(path.join(directory,'data'));
fs.mkdirSync(path.join(directory,'uploads'));
Object.assign(process.env,{WEB_TEST_ISOLATED:'1',DB_PATH:path.join(directory,'test.db'),DATA_DIR:path.join(directory,'data'),UPLOAD_DIR:path.join(directory,'uploads'),JWT_SECRET:'web_browser_secret_do_not_use_in_production',V4_AI_LIVE_ENABLED:'false',ANALYTICS_DATA_CLASS:'test'});

(async()=>{
  let fixture,browser;
  try {
    fixture=await require('../helpers/webApplicationFixture.cjs').start();
    const a=await fixture.create('preparing',fixture.userId,{jobSnapshot:{company:'腾讯',title:'数据分析师',description:'分析职责 <img src=x onerror="window.injected=true">'},deadline:'2026-10-01'});
    const b=await fixture.create('preparing',fixture.userId,{jobSnapshot:{company:'字节跳动',title:'产品经理'},deadline:'2026-10-03'});
    const oa=await fixture.create();await fixture.call(`/${oa.id}/status`,'PATCH',{status:'applied'});await fixture.call(`/${oa.id}/status`,'PATCH',{status:'oa'});
    const closed=await fixture.create();await fixture.call(`/${closed.id}/status`,'PATCH',{status:'withdrawn'});
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(token=>localStorage.setItem('careerai_web_token',token),fixture.token);
    await page.goto(fixture.url+'/web/');
    await page.locator('[data-view="applications"]').click();
    await page.locator('.application-table tbody tr').first().waitFor();
    assert.equal(await page.locator('.application-table tbody tr').count(),4);
    // Continuous input must retain focus; the old renderer replaced the input after every keystroke.
    const search=page.locator('#application-search');await search.focus();
    await page.keyboard.insertText('腾');await page.keyboard.insertText('讯');
    assert.equal(await search.inputValue(),'腾讯');assert.equal(await search.evaluate(el=>document.activeElement===el),true);
    assert.equal(await page.locator('.application-table tbody tr').count(),1);
    await search.fill('');
    await page.locator('#application-filter').selectOption('oa');assert.equal(await page.locator('.application-table tbody tr').count(),1);
    await page.locator('[data-mode="board"]').click();assert.equal(await page.locator('.board-card').count(),1);
    await page.locator('#application-filter').selectOption('withdrawn');assert.equal(await page.locator('.board-card').count(),1);
    await page.locator('#application-filter').selectOption('');await page.locator('[data-mode="table"]').click();
    await page.locator(`[data-select-id="${a.id}"]`).check();await page.locator(`[data-select-id="${b.id}"]`).check();
    await page.locator('#bulk-status').selectOption('applied');await page.locator('#preview-bulk').click();
    await page.locator('#cancel-bulk').click();assert.equal((await fixture.call(`/${a.id}/detail`)).body.data.application.status,'preparing');
    await page.locator('#preview-bulk').click();await page.locator('#confirm-bulk').click();await page.locator('#undo-bulk').waitFor();
    assert.equal((await fixture.call(`/${a.id}/detail`)).body.data.application.status,'applied');
    await page.locator('#undo-bulk').click();await page.waitForFunction(()=>!document.querySelector('#undo-bulk'));
    assert.equal((await fixture.call(`/${a.id}/detail`)).body.data.application.status,'preparing');
    await page.locator(`[data-open-id="${a.id}"]`).click();await page.locator('#workspace-fields').waitFor();
    assert.equal(await page.locator('#detail-content img').count(),0);
    await page.locator('[name="nextAction"]').fill('周五确认官网投递');await page.locator('#workspace-fields button').click();
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='安排已保存');
    assert.equal((await fixture.call(`/${a.id}/detail`)).body.data.application.nextAction,'周五确认官网投递');
    // Another device updates after the drawer was loaded; the stale save must not overwrite it.
    await fixture.call(`/${a.id}/status`,'PATCH',{status:'interested'});
    await page.locator('#detail-status').selectOption('applied');await page.locator('#workspace-status').click();
    await page.waitForFunction(()=>document.querySelector('#workspace-message')?.textContent.includes('其他页面'));
    assert.equal((await fixture.call(`/${a.id}/detail`)).body.data.application.status,'interested');
    await page.locator('#close-drawer').click();await page.locator('#refresh-applications').click();
    await page.locator('.application-table tbody tr').first().waitFor();
    const artifacts=path.resolve(__dirname,'../../artifacts/web-workbench');fs.mkdirSync(artifacts,{recursive:true});
    await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false,'page must not overflow horizontally');
    await page.setViewportSize({width:1440,height:960});await page.locator('#logout-button').click();
    assert.equal(await page.locator('#detail-content').textContent(),'');
    assert.equal(await page.evaluate(()=>localStorage.getItem('careerai_web_token')),null);
    assert.deepEqual(errors,[]);
    console.log('Browser acceptance passed: filter/input focus, table/board, closed/OA, bulk preview/cancel/apply/undo, workspace/save/conflict, escaping, responsive layout, logout.');
  } finally {
    await browser?.close();await fixture?.close();
    if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('careerai-web-browser-')) throw new Error('Unexpected browser cleanup path');
    fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
