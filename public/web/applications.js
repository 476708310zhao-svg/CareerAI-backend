/* Desktop application management. All mutations go through the V4 state machine. */
'use strict';
window.createApplicationWorkbench = function ({ request, toast, openAI, setDetail }) {
  const model = window.ApplicationModel;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const state = { items: [], statuses: [], selected: new Set(), keyword: '', status: '', sort: 'deadline', view: 'table', page: 1, detail: null, generation: 0, detailGeneration: 0, busy: false, undo: null };
  const label = status => state.statuses.find(item => item.value === status)?.label || status;
  const selected = () => state.items.filter(item => state.selected.has(item.id));
  const filtered = () => model.filterAndSort(state.items, state);
  const visible = () => state.view === 'table' ? filtered().slice((state.page - 1) * 25, state.page * 25) : filtered();

  function shell() {
    $('applications-view').innerHTML = `<div class="card application-workbench">
      <div class="board-toolbar">
        <label>搜索公司或岗位<input id="application-search" value="${esc(state.keyword)}" placeholder="输入公司、岗位或地点"></label>
        <label>申请状态<select id="application-filter"><option value="">全部状态</option>${state.statuses.map(item => `<option value="${esc(item.value)}" ${item.value === state.status ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label>
        <label>排序<select id="application-sort"><option value="deadline">截止日期最近</option><option value="updated">最近更新</option><option value="company">公司名称</option></select></label>
        <div class="view-switch" role="group" aria-label="申请显示方式"><button type="button" data-mode="table">表格</button><button type="button" data-mode="board">看板</button></div>
        <button class="mini-button" type="button" id="refresh-applications">刷新</button><button class="mini-button primary" type="button" data-action="manual-application">手动新增申请</button>
      </div>
      <div id="application-notice" role="status"></div><div id="application-undo"></div>
      <div class="bulk-toolbar"><span id="selection-count"></span><label>批量改为 <select id="bulk-status" aria-label="批量目标状态"></select></label><button class="mini-button primary" id="preview-bulk" type="button">预览变更</button><button class="link-button" id="clear-selection" type="button">清空选择</button></div>
      <div id="application-results"></div>
      <dialog id="bulk-dialog" aria-labelledby="bulk-title"><h3 id="bulk-title">确认批量状态变更</h3><div id="bulk-preview"></div><p id="bulk-error" role="alert"></p><div class="dialog-actions"><button class="mini-button" id="cancel-bulk" type="button">取消</button><button class="primary-button" id="confirm-bulk" type="button">确认更新</button></div></dialog>
    </div>`;
    $('application-sort').value = state.sort;
    $('application-search').addEventListener('input', event => { state.keyword = event.target.value; resetFilter(); });
    $('application-filter').addEventListener('change', event => { state.status = event.target.value; resetFilter(); });
    $('application-sort').addEventListener('change', event => { state.sort = event.target.value; resetFilter(); });
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.mode; state.page = 1; state.selected.clear(); renderRows(); }));
    $('refresh-applications').addEventListener('click', load);
    $('clear-selection').addEventListener('click', () => { state.selected.clear(); renderRows(); });
    $('preview-bulk').addEventListener('click', previewBulk);
    $('cancel-bulk').addEventListener('click', () => { if (!state.busy) $('bulk-dialog').close(); });
    $('bulk-dialog').addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
    $('confirm-bulk').addEventListener('click', submitBulk);
  }
  function resetFilter() {
    state.selected.clear(); state.page = 1; renderRows();
    // Only the result area is replaced, keeping Chinese IME composition and cursor focus intact.
  }
  function updateSelection() {
    const choices = model.commonTargets(selected(), state.statuses);
    const value = $('bulk-status').value;
    $('selection-count').textContent = `已选 ${state.selected.size} 条（最多 50 条）`;
    $('bulk-status').innerHTML = choices.map(item => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('') || `<option value="">${state.selected.size ? '没有共同可变更状态' : '选择申请后可批量更新'}</option>`;
    if (choices.some(item => item.value === value)) $('bulk-status').value = value;
    $('preview-bulk').disabled = !choices.length || state.busy;
    $('bulk-status').disabled = !choices.length || state.busy;
    document.querySelectorAll('[data-select-id]').forEach(input => { input.checked = state.selected.has(Number(input.dataset.selectId)); });
    const all = $('select-page');
    if (all) { const count = visible().filter(item => state.selected.has(item.id)).length; all.checked = count > 0 && count === visible().length; all.indeterminate = count > 0 && count < visible().length; }
  }
  function renderUndo() {
    $('application-undo').innerHTML = state.undo ? '<div class="undo-banner">批量变更已保存，可在 10 分钟内撤销；后续状态已更新的申请不能撤销。<button class="link-button" id="undo-bulk" type="button">撤销本次变更</button></div>' : '';
    if ($('undo-bulk')) $('undo-bulk').addEventListener('click', undoBulk);
  }
  function renderRows() {
    const list = filtered();
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.view)));
    const check = item => `<input type="checkbox" data-select-id="${item.id}" aria-label="选择 ${esc(item.company)} ${esc(item.jobTitle)}">`;
    const title = item => `<button class="link-button row-title" type="button" data-open-id="${item.id}">${esc(item.company || '未填写公司')}</button><span class="application-meta">${esc(item.jobTitle || '未填写岗位')}</span>`;
    if (!list.length) $('application-results').innerHTML = `<div class="empty-state">${state.items.length ? '没有符合条件的申请，请调整筛选。' : '还没有申请记录。小程序中已有的申请会在这里同步显示。'}</div>`;
    else if (state.view === 'table') {
      const pages = Math.max(1, Math.ceil(list.length / 25));
      $('application-results').innerHTML = `<div class="table-scroll"><table class="application-table"><thead><tr><th><input id="select-page" type="checkbox" aria-label="选择本页申请"></th><th>公司 / 岗位</th><th>状态</th><th>截止日期</th><th>下一步行动</th><th>简历版本</th><th>最近更新</th></tr></thead><tbody>${visible().map(item => `<tr><td>${check(item)}</td><td>${title(item)}</td><td><span class="status-badge">${esc(item.statusText)}</span></td><td>${esc(item.deadline || '未设置')}</td><td>${esc(item.nextAction || '未设置')}</td><td>${item.resumeVersionId ? `版本 #${item.resumeVersionId}` : '未关联'}</td><td>${esc(item.updatedAt || '—')}</td></tr>`).join('')}</tbody></table></div><div class="pagination"><span>共 ${list.length} 条 · 第 ${state.page} / ${pages} 页</span><button class="mini-button" id="page-prev" ${state.page === 1 ? 'disabled' : ''}>上一页</button><button class="mini-button" id="page-next" ${state.page === pages ? 'disabled' : ''}>下一页</button></div>`;
      $('select-page').addEventListener('change', event => { visible().forEach(item => event.target.checked ? state.selected.add(item.id) : state.selected.delete(item.id)); updateSelection(); });
      $('page-prev').addEventListener('click', () => { state.page--; state.selected.clear(); renderRows(); });
      $('page-next').addEventListener('click', () => { state.page++; state.selected.clear(); renderRows(); });
    } else {
      $('application-results').innerHTML = `<div class="board">${model.columns.map(([key, name]) => {
        const items = list.filter(item => model.group(item.status) === key);
        return `<section class="board-column"><h4>${name} <span class="muted">${items.length}</span></h4>${items.map(item => `<article class="board-card"><div class="board-card-heading">${check(item)}${title(item)}</div><p class="task-meta">${esc(item.deadline ? `截止 ${item.deadline}` : '未设置截止日期')}</p><span class="status-badge">${esc(item.statusText)}</span></article>`).join('') || '<p class="task-meta">暂无申请</p>'}</section>`;
      }).join('')}</div>`;
    }
    document.querySelectorAll('[data-select-id]').forEach(input => input.addEventListener('change', () => {
      const id = Number(input.dataset.selectId);
      if (input.checked && state.selected.size >= 50) { input.checked = false; toast('一次最多选择 50 条申请'); return; }
      input.checked ? state.selected.add(id) : state.selected.delete(id); updateSelection();
    }));
    document.querySelectorAll('[data-open-id]').forEach(button => button.addEventListener('click', () => open(button.dataset.openId)));
    updateSelection(); renderUndo();
  }
  async function load() {
    const generation = ++state.generation;
    state.items = []; state.selected.clear();
    shell(); $('application-results').innerHTML = '<p class="empty-state" role="status">正在加载申请…</p>';
    $('preview-bulk').disabled = true; $('refresh-applications').disabled = true;
    try {
      const board = await request('/api/v4/applications/board');
      if (generation !== state.generation) return;
      state.items = model.rows(board); state.statuses = board.statuses || []; state.selected.clear(); state.page = 1;
      shell(); renderRows();
    } catch (error) {
      if (generation !== state.generation) return;
      $('application-results').innerHTML = `<p class="empty-state" role="alert">${esc(error.message)}，可以点击刷新重试。</p>`;
      $('refresh-applications').disabled = false;
    }
  }
  function previewBulk() {
    const items = selected(); const status = $('bulk-status').value;
    if (!model.commonTargets(items, state.statuses).some(item => item.value === status)) return;
    state.preview = { items: model.snapshot(items), status };
    $('bulk-error').textContent = '';
    $('bulk-preview').innerHTML = `<p>以下 ${items.length} 条申请将更新为「${esc(label(status))}」。${items.filter(item => item.status !== status).length} 条发生变更。</p><ul>${items.map(item => `<li>${esc(item.company)} · ${esc(item.jobTitle)}：${esc(item.statusText)} → ${esc(label(status))}</li>`).join('')}</ul><p class="muted">如果有申请在其他设备更新，本批次将停止并提示刷新。</p>`;
    $('bulk-dialog').showModal();
  }
  async function submitBulk() {
    if (state.busy || !state.preview) return;
    state.busy = true; $('confirm-bulk').disabled = true; $('cancel-bulk').disabled = true;
    try {
      const result = await request('/api/v4/applications/bulk-status', { method: 'POST', body: JSON.stringify(state.preview) });
      state.undo = result.undo; state.preview = null; $('bulk-dialog').close(); toast(`已更新 ${result.changed} 条申请`);
      await load();
    } catch (error) { if ($('bulk-error')) $('bulk-error').textContent = `${error.message}。未显示成功时请先刷新核对状态。`; }
    finally { state.busy = false; if ($('confirm-bulk')) { $('confirm-bulk').disabled = false; $('cancel-bulk').disabled = false; updateSelection(); } }
  }
  async function undoBulk() {
    if (state.busy || !state.undo) return;
    state.busy = true; $('undo-bulk').disabled = true;
    try {
      await request('/api/v4/applications/bulk-status/undo', { method: 'POST', body: JSON.stringify({ historyIds: state.undo.historyIds }) });
      state.undo = null; toast('已撤销本次批量状态变更'); await load();
    } catch (error) { toast(error.message); if ([404,409].includes(error.status)) state.undo = null; }
    finally { state.busy = false; if ($('application-undo')) renderUndo(); }
  }
  function section(title, content) { return `<section class="workspace-section"><h3>${title}</h3>${content}</section>`; }
  function renderDetail() {
    const data = state.detail; const app = data.application;
    const transitions = data.allowedTransitions || [];
    const version = data.resume?.version;
    const materialLabel = item => item.label || item.type || '申请材料';
    $('detail-content').innerHTML = `<div class="detail-header"><p class="eyebrow">APPLICATION WORKSPACE</p><h2>${esc(app.company)}</h2><p>${esc(app.jobTitle)} · ${esc(app.city || '地点待补充')}</p><div class="detail-actions"><select id="detail-status" aria-label="申请状态"><option value="${esc(app.status)}">${esc(app.statusText)}</option>${transitions.map(item => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('')}</select><button class="mini-button primary" id="workspace-status">保存状态</button><button class="mini-button" id="workspace-ai">问 AI 专家</button></div><p id="workspace-message" role="status"></p></div>
      ${section('岗位与 JD', `<p class="readable-content">${esc(app.jobSnapshot.description || app.jobSnapshot.jd || '尚未保存岗位描述')}</p>`)}
      ${section('申请资料（只读）', `<div class="detail-grid"><div class="detail-block"><h4>关联简历版本</h4><p>${esc(data.resume?.name || '未关联简历')}${version ? ` · 版本 #${esc(version.id)}` : ''}</p></div><div class="detail-block"><h4>岗位匹配</h4><p>${data.match ? `${esc(data.match.score)} 分` : '尚未匹配'}</p><p>${esc((data.match?.gaps || []).join('；'))}</p></div><div class="detail-block"><h4>ATS 检查</h4><p>${esc(data.jdReport?.atsRisk || '暂无当前简历版本的检查记录')}</p><p class="task-meta">${data.jdReport ? `得分 ${esc(data.jdReport.score)}` : '请在小程序中运行或更新检查'}</p></div><div class="detail-block"><h4>申请材料</h4><p>${data.materials.length} 份已保存，${data.drafts.filter(item => item.status === 'pending').length} 份待确认</p><p class="task-meta">编辑、生成和确认请在小程序中完成</p></div></div>
      ${data.materials.map(item => `<article class="material-card"><h4>${esc(materialLabel(item))}</h4><span class="task-meta">${item.association === 'legacy' ? '按岗位关联的历史材料' : '已关联本申请'} · ${esc(item.resumeName || '未记录简历名称')}</span><p class="readable-content">${esc(item.content)}</p></article>`).join('')}`)}
      ${section('下一步与备注', `<form id="workspace-fields" class="stack-form"><label>截止日期<input type="date" name="deadline" value="${esc(app.deadline.slice(0,10))}"></label><label>面试时间（当地时间）<input type="datetime-local" name="interviewTime" value="${esc((app.interviewTime || '').replace(' ','T').slice(0,16))}"></label><label>下一步行动<input name="nextAction" maxlength="300" value="${esc(app.nextAction)}"></label><label>备注<textarea name="notes" maxlength="2000" rows="3">${esc(app.notes)}</textarea></label><button class="mini-button primary" type="submit">保存安排</button></form>`)}
      ${section('任务与联系人', `<form id="workspace-task-new" class="stack-form task-edit"><label>下一步任务<input name="title" required maxlength="200"></label><label>任务日期<input type="date" name="dueAt"></label><button class="mini-button" type="submit">新增任务</button></form>
        ${data.tasks.map(item => `<form class="stack-form task-edit" data-task-edit="${item.id}"><label>任务<input name="title" required maxlength="200" value="${esc(item.title)}"></label><label>日期<input name="dueAt" type="date" value="${esc((item.dueAt||'').slice(0,10))}"></label><label><input name="completed" type="checkbox" ${item.completed?'checked':''}>已完成</label><button class="mini-button" type="submit">保存任务</button></form>`).join('')}
        <form id="workspace-contact-new" class="stack-form task-edit"><label>联系人<input name="name" required maxlength="120"></label><label>角色<input name="role" maxlength="120" placeholder="例如：招聘负责人"></label><label>邮箱<input name="email" type="email" maxlength="160"></label><button class="mini-button" type="submit">添加联系人</button></form>
        ${data.contacts.map(item=>`<p>${esc(item.name)} · ${esc(item.role)} · ${esc(item.email)}</p>`).join('')}`)}
      ${section('面试记录', data.interviews.reports.map(item => `<article class="material-card"><strong>面试复盘 · ${item.overallScore} 分</strong><p class="readable-content">${esc(item.summary)}</p><span class="task-meta">${esc(item.createdAt)}</span></article>`).join('') || `<p class="muted">${data.interviews.spaces.length ? '已建立面试空间，尚无报告' : '尚无关联面试记录'}</p>`)}
      ${section('申请进展', data.history.map(item => `<div class="task"><div><strong>${esc(label(item.toStatus))}</strong><p class="task-meta">${esc(item.createdAt)}</p></div><span>${esc(item.note)}</span></div>`).join('') || '<p class="muted">暂无进展记录</p>')}`;
    const bindWrite = (form, path, method, transform = data => data) => {
      const generation = state.detailGeneration;
      form.addEventListener('submit', async event => {
        event.preventDefault(); const button=form.querySelector('button'); if(button.disabled)return;
        button.disabled=true;
        try { await request(path,{method,body:JSON.stringify(transform(Object.fromEntries(new FormData(form))))}); if(generation===state.detailGeneration){toast('已保存');await open(app.id);} }
        catch(error){if(generation===state.detailGeneration)$('workspace-message').textContent=error.message;}
        finally{button.disabled=false;}
      });
    };
    bindWrite($('workspace-task-new'),`/api/v4/applications/${app.id}/tasks`,'POST');
    bindWrite($('workspace-contact-new'),`/api/v4/applications/${app.id}/contacts`,'POST');
    document.querySelectorAll('[data-task-edit]').forEach(form=>bindWrite(form,`/api/v4/applications/${app.id}/tasks/${form.dataset.taskEdit}`,'PATCH',data=>({...data,completed:form.elements.completed.checked})));
    $('workspace-ai').addEventListener('click', () => openAI(app.id));
    $('workspace-status').addEventListener('click', async () => {
      const button = $('workspace-status'); button.disabled = true;
      try {
        await request(`/api/v4/applications/${app.id}/status`, { method:'PATCH', body:JSON.stringify({ status:$('detail-status').value, expectedState:{ status:app.status, historyId:app.historyId } }) });
        await open(app.id); if (!$('applications-view').classList.contains('hidden')) await load(); toast('申请状态已更新');
      } catch (error) { if ($('workspace-message')) $('workspace-message').textContent = error.message; }
      finally { button.disabled = false; }
    });
    $('workspace-fields').addEventListener('submit', async event => {
      event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
      const before = {...app, deadline:app.deadline.slice(0,10), interviewTime:(app.interviewTime || '').replace(' ','T').slice(0,16)};
      const values = Object.fromEntries([...new FormData(event.target)].filter(([key,value]) => value !== String(before[key] || '')));
      try { await request(`/api/v4/applications/${app.id}`, {method:'PATCH',body:JSON.stringify(values)}); await open(app.id); if (!$('applications-view').classList.contains('hidden')) await load(); toast('安排已保存'); }
      catch (error) { if ($('workspace-message')) $('workspace-message').textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  async function open(id) {
    const generation = ++state.detailGeneration;
    state.detail = null; setDetail(null); $('detail-drawer').classList.remove('hidden'); $('detail-drawer').setAttribute('aria-hidden','false');
    $('detail-content').innerHTML = '<p class="empty-state" role="status">正在读取申请包…</p>';
    try {
      const detail = await request(`/api/v4/applications/${encodeURIComponent(id)}/workspace`);
      if (generation !== state.detailGeneration) return;
      state.detail = detail; setDetail(detail); renderDetail();
    } catch (error) {
      if (generation !== state.detailGeneration) return;
      $('detail-content').innerHTML = `<p class="empty-state" role="alert">${esc(error.message)}</p><button class="mini-button" id="retry-workspace">重试</button>`;
      $('retry-workspace').addEventListener('click', () => open(id));
    }
  }
  function reset() { state.generation++; state.detailGeneration++; state.items=[]; state.statuses=[]; state.selected.clear(); state.detail=null; state.undo=null; state.preview=null; state.keyword=''; state.status=''; state.busy=false; }
  function close() { state.detailGeneration++; }
  return { load, open, reset, close };
};
