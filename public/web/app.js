(() => {
  'use strict';
  const API = window.CAREERAI_API_BASE || '';
  const TOKEN_KEY = 'careerai_web_token';
  const state = { token: localStorage.getItem(TOKEN_KEY), user: null, board: null, activeApplication: null, aiContext: null, aiConversation: null, aiMessages: [], aiRetry: null, aiOpenVersion: 0, aiSaveOpenVersion: 0, aiSaveActionId: null, aiSaveApplicationId: null, aiSaveApplication: null, aiSaveApplications: [], aiSaveTriggerButton: null };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const statusText = {preparing:'准备中',applied:'已投递',oa:'笔试中',interview:'面试中',offer:'Offer',closed:'已结束',saved:'已收藏',interested:'已收藏'};
  async function request(path, options = {}) {
    const token = state.token;
    const headers = {...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(options.headers || {})};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(API + path, {...options, headers});
    const payload = await response.json().catch(() => ({}));
    if (token !== state.token) throw new Error('登录状态已变化，请重新打开页面');
    if (response.status === 401 && token) logout();
    if (!response.ok || payload.code === -1) {
      throw Object.assign(new Error(payload.message || '请求失败，请稍后重试'), {status:response.status, data:payload.data});
    }
    return payload.data ?? payload;
  }
  function setAuthView() { $('auth-view').classList.remove('hidden'); $('app-view').classList.add('hidden'); }
  function showApp() {
    $('auth-view').classList.add('hidden'); $('app-view').classList.remove('hidden');
    document.querySelectorAll('.page-view').forEach(view => view.classList.toggle('hidden', view.id !== 'dashboard-view'));
    document.querySelectorAll('.nav-item[data-view]').forEach(view => view.classList.toggle('active', view.dataset.view === 'dashboard'));
    $('page-title').textContent = '今天，先处理最重要的一项';
  }
  function showMessage(id, message) { $(id).textContent = message || ''; }
  function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2400); }
  function saveSession(data) { state.token = data.token; state.user = data.user || {}; localStorage.setItem(TOKEN_KEY, state.token); $('user-name').textContent = state.user.nickname || state.user.email || '求职者'; }
  function renderDashboard(data) {
    const stats = data?.today || {}; const tasks = stats.tasks || []; const groups = state.board?.groups || {};
    $('dashboard-view').innerHTML = `<div class="hero-grid"><div class="card hero-card"><p class="eyebrow">TODAY WORKBENCH</p><h3>把下一步做完，申请就会继续向前。</h3><p class="muted">工作台聚合申请、截止日期、面试和今日任务。</p><button class="primary-button" data-action="open-applications">查看申请管线</button></div><div class="card"><p class="eyebrow">AI EXPERT</p><h3>遇到卡点，直接问职引导师</h3><p class="muted">AI 会结合你的求职上下文给出可执行建议。</p><button class="mini-button primary" data-action="open-ai">开始问询</button></div></div><div class="section-head"><h3>申请概览</h3><button class="link-button" data-action="open-applications">查看全部</button></div><div class="stat-grid"><div class="stat"><strong>${groups.preparing?.length || 0}</strong><span>准备中</span></div><div class="stat"><strong>${groups.applied?.length || 0}</strong><span>已投递</span></div><div class="stat"><strong>${groups.interview?.length || 0}</strong><span>面试中</span></div><div class="stat"><strong>${groups.offer?.length || 0}</strong><span>Offer</span></div></div><div class="section-head"><h3>今日任务</h3><span class="muted">${tasks.length} 项</span></div><div class="card task-list">${tasks.length ? tasks.slice(0,6).map(task => `<div class="task"><div><div class="task-title">${escapeHtml(task.title || '待处理任务')}</div><div class="task-meta">${escapeHtml(task.dueAt || task.taskDate || '今天')}</div></div><button class="mini-button" data-task-id="${escapeHtml(task.id)}">完成</button></div>`).join('') : '<p class="muted">今天还没有待办，去申请管线看看下一步。</p>'}</div>`;
  }
  async function loadDashboard() { try { const [dashboard, board] = await Promise.all([request('/api/v4/career/dashboard'), request('/api/v4/applications/board')]); state.board = board; renderDashboard(dashboard); } catch (error) { toast(error.message); if (/登录|Token/.test(error.message)) logout(); } }
  const workbench = window.createApplicationWorkbench({ request, toast, openAI, setDetail: detail => { state.activeApplication = detail; } });
  function loadApplications() { return workbench.load(); }
  function openApplication(id) { return workbench.open(id); }
  const expert = window.createAIExpert({request,offerSave:offerAISave});
  const p0 = window.createP0Workspace({request,toast,openApplication,showView});
  function openAI(applicationId) { return expert.open(applicationId); }
  function nextAISaveOpenVersion() {
    state.aiSaveOpenVersion = window.AISaveModel.nextOpenVersion(state.aiSaveOpenVersion);
    return state.aiSaveOpenVersion;
  }
  function currentAISaveOpen(openVersion) { return window.AISaveModel.isCurrentOpen(openVersion, state.aiSaveOpenVersion); }
  function closeAISaveDialog() {
    nextAISaveOpenVersion();
    if (state.aiSaveTriggerButton) state.aiSaveTriggerButton.disabled = false;
    state.aiSaveTriggerButton = null;
    if ($('ai-save-dialog').open) $('ai-save-dialog').close();
  }
  function renderAISaveConfirmation() {
    const target = $('ai-save-target').value;
    const content = $('ai-save-content').value.trim();
    const dueAt = $('ai-save-date').value;
    const preview = window.AISaveModel.confirmation(target, content, dueAt);
    $('ai-save-action-name').textContent = preview.actionName;
    $('ai-save-before').textContent = preview.before;
    $('ai-save-after').textContent = preview.after;
    $('ai-save-impact').textContent = preview.impact;
    $('ai-save-date').disabled = !preview.dateEnabled;
    $('ai-save-content').maxLength = preview.maxLength;
    $('ai-save-submit').textContent = preview.submitLabel;
    $('ai-save-submit').disabled = !state.aiSaveApplicationId;
  }
  function selectAISaveApplication(value) {
    const selection = window.AISaveModel.applicationSelection(state.aiSaveApplications, value);
    state.aiSaveApplicationId = selection.selectedId;
    state.aiSaveApplication = selection.selected;
    $('ai-save-application').value = selection.selectedId ? String(selection.selectedId) : '';
    $('ai-save-company').textContent = selection.selected?.company || '请先选择申请';
    $('ai-save-job').textContent = selection.selected?.jobTitle || '选择后确认写入范围';
    renderAISaveConfirmation();
  }
  function renderAISaveApplications(applications, preferredId) {
    const selection = window.AISaveModel.applicationSelection(applications, preferredId);
    state.aiSaveApplications = selection.applications;
    const select = $('ai-save-application');
    select.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '请选择本人的申请'; select.appendChild(placeholder);
    for (const application of selection.applications) {
      const option = document.createElement('option'); option.value = String(application.id);
      option.textContent = `${application.company || '未填写公司'} · ${application.jobTitle || '未填写岗位'}`;
      select.appendChild(option);
    }
    selectAISaveApplication(selection.selectedId);
  }
  function offerAISave(content, application, actionId) {
    const actions = document.createElement('div'); actions.className = 'ai-save-actions';
    const button = document.createElement('button'); button.className = 'link-button'; button.type = 'button'; button.textContent = '保存为备注或任务';
    button.addEventListener('click', async () => {
      const openVersion = nextAISaveOpenVersion();
      state.aiSaveTriggerButton = button;
      state.aiSaveActionId = actionId;
      state.aiSaveApplicationId = null;
      state.aiSaveApplication = null;
      state.aiSaveApplications = [];
      $('ai-save-application').innerHTML = '<option value="">正在读取本人的申请…</option>';
      $('ai-save-company').textContent = '请先选择申请';
      $('ai-save-job').textContent = '选择后确认写入范围';
      $('ai-save-target').value = 'note';
      $('ai-save-date').value = '';
      $('ai-save-content').value = content.slice(0,2000);
      $('ai-save-message').textContent = '';
      $('ai-save-form').classList.remove('hidden');
      $('ai-save-success').classList.add('hidden');
      renderAISaveConfirmation();
      $('ai-save-dialog').showModal();
      button.disabled = true;
      try {
        const board = await request('/api/v4/applications/board');
        if (!currentAISaveOpen(openVersion)) return;
        state.board = board;
        renderAISaveApplications(window.ApplicationModel.rows(board), application?.id);
        if (!state.aiSaveApplications.length) $('ai-save-message').textContent = '请先创建一条申请，再确认写入。';
      } catch (error) {
        if (!currentAISaveOpen(openVersion)) return;
        $('ai-save-application').innerHTML = '<option value="">请稍后重试</option>';
        $('ai-save-message').textContent = error.message;
      } finally {
        if (currentAISaveOpen(openVersion)) {
          button.disabled = false;
          if (state.aiSaveTriggerButton === button) state.aiSaveTriggerButton = null;
        }
      }
    });
    actions.appendChild(button); $('ai-messages').appendChild(actions);
  }
  function showView(view) { document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden')); $(`${view}-view`).classList.remove('hidden'); document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view)); const titles = {dashboard:'今天，先处理最重要的一项',applications:'申请管线',jobs:'职位',resources:'资源中心'}; $('page-title').textContent = titles[view] || '求职工作台'; if (view === 'applications') loadApplications(); if (view === 'dashboard') loadDashboard(); if (view === 'jobs') renderJobs(); if (view === 'resources') p0.resources(); }
  async function renderJobs() {
    const view = $('jobs-view');
    view.innerHTML = '<div class="card"><p class="eyebrow">JOBS</p><h3>找一个值得推进的岗位</h3><form id="web-job-search" class="job-search"><input name="keyword" placeholder="搜索公司或岗位"><button class="mini-button primary" type="submit">搜索</button></form><div id="web-job-results"><p class="muted">正在读取岗位…</p></div></div>';
    const load = async keyword => {
      const target = $('web-job-results'); target.innerHTML = '<p class="muted">正在搜索…</p>';
      try {
        const data = await request(`/api/v4/jobs?keyword=${encodeURIComponent(keyword || '')}&pageSize=20`);
        const list = data.list || [];
        target.innerHTML = list.length ? list.map(job => `<article class="web-job-row"><div><strong>${escapeHtml(job.company || '目标公司')} · ${escapeHtml(job.title || '目标岗位')}</strong><p class="task-meta">${escapeHtml(job.location || '地点待补充')} · 匹配 ${escapeHtml(job.match?.score ?? '—')} 分</p></div><button class="mini-button" data-add-job="${escapeHtml(job.id)}">加入申请</button></article>`).join('') : '<p class="muted">没有找到匹配岗位。</p>';
        target.querySelectorAll('[data-add-job]').forEach(button => button.addEventListener('click', async () => {
          const job = list.find(item => String(item.id) === String(button.dataset.addJob)); if (!job) return;
          button.disabled = true;
          try { const created = await request('/api/v4/applications', { method:'POST', body:JSON.stringify({ jobId:String(job.id), status:'interested', jobSnapshot:job }) }); toast('已加入申请管线'); openApplication(created.id); }
          catch (error) { toast(error.message); button.disabled = false; }
        }));
      } catch (error) { target.innerHTML = `<p class="muted">${escapeHtml(error.message)}，请重试。</p>`; }
    };
    $('web-job-search').addEventListener('submit', event => { event.preventDefault(); load(new FormData(event.target).get('keyword') || ''); });
    load('');
  }
  function logout() {
    expert.reset(); p0.reset();
    state.token = null; state.user = null; state.board = null; state.activeApplication = null; state.aiContext = null; state.aiConversation = null; state.aiMessages = []; state.aiRetry = null; state.aiOpenVersion += 1;
    closeAISaveDialog(); state.aiSaveActionId = null; state.aiSaveApplicationId = null; state.aiSaveApplication = null; state.aiSaveApplications = []; $('ai-save-form').reset(); $('ai-save-message').textContent=''; $('user-name').textContent='求职者';
    workbench.reset(); localStorage.removeItem(TOKEN_KEY);
    document.querySelectorAll('.page-view').forEach(view => { view.innerHTML = ''; });
    document.querySelectorAll('.drawer').forEach(view => { view.classList.add('hidden'); view.setAttribute('aria-hidden','true'); });
    $('detail-content').innerHTML = ''; $('ai-messages').innerHTML = ''; $('ai-input').value = '';
    setAuthView();
  }
  document.addEventListener('click', async (event) => { const nav = event.target.closest('[data-view]'); if (nav) return showView(nav.dataset.view); const card = event.target.closest('[data-application-id]'); if (card && !event.target.closest('[data-action]')) return openApplication(card.dataset.applicationId); const task = event.target.closest('[data-task-id]'); if (task) { try { await request(`/api/v4/today/tasks/${encodeURIComponent(task.dataset.taskId)}`, {method:'PATCH', body:JSON.stringify({completed:true})}); toast('任务已完成'); loadDashboard(); } catch (error) { toast(error.message); } return; } const action = event.target.closest('[data-action]'); if (!action) return; const type = action.dataset.action; if (type === 'manual-application') p0.manual(); if (type === 'open-applications') showView('applications'); if (type === 'refresh-applications') loadApplications(); if (type === 'open-ai') openAI(action.dataset.applicationId); if (type === 'save-status') { const status = $('detail-status').value; try { await request(`/api/v4/applications/${encodeURIComponent(action.dataset.applicationId)}/status`, {method:'PATCH', body:JSON.stringify({status})}); toast('申请状态已更新'); await openApplication(action.dataset.applicationId); await loadApplications(); } catch (error) { toast(error.message); } } if (type === 'open-resumes' || type === 'open-materials' || type === 'open-match') toast('该工作区将在申请包阶段接入'); if (type === 'add-task') toast('下一步任务编辑将在申请包阶段接入'); });
  $('logout-button').addEventListener('click', logout); $('global-ai').addEventListener('click', () => openAI()); $('close-drawer').addEventListener('click', () => { workbench.close(); $('detail-drawer').classList.add('hidden'); $('detail-drawer').setAttribute('aria-hidden','true'); }); $('close-ai').addEventListener('click', () => { expert.reset(); $('ai-drawer').classList.add('hidden'); $('ai-drawer').setAttribute('aria-hidden','true'); });
  $('ai-save-cancel').addEventListener('click', closeAISaveDialog);
  $('ai-save-dialog').addEventListener('cancel', event => { event.preventDefault(); closeAISaveDialog(); });
  $('ai-save-application').addEventListener('change', event => { $('ai-save-message').textContent = ''; selectAISaveApplication(event.target.value); });
  $('ai-save-target').addEventListener('change', renderAISaveConfirmation);
  $('ai-save-content').addEventListener('input', renderAISaveConfirmation);
  $('ai-save-date').addEventListener('input', renderAISaveConfirmation);
  $('ai-save-view-application').addEventListener('click', async () => {
    const applicationId = state.aiSaveApplicationId;
    closeAISaveDialog();
    expert.reset(); $('ai-drawer').classList.add('hidden'); $('ai-drawer').setAttribute('aria-hidden','true');
    if (applicationId) await openApplication(applicationId);
  });
  $('ai-save-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.aiSaveApplicationId) { $('ai-save-message').textContent = '请先选择要写入的本人申请。'; $('ai-save-application').focus(); return; }
    const openVersion = state.aiSaveOpenVersion;
    const applicationSnapshot = state.aiSaveApplication ? { ...state.aiSaveApplication } : { id: state.aiSaveApplicationId };
    const payload = Object.freeze({
      actionId: state.aiSaveActionId,
      applicationId: applicationSnapshot.id,
      target: $('ai-save-target').value,
      content: $('ai-save-content').value,
      dueAt: $('ai-save-date').value,
      confirm: true,
    });
    const button = event.target.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const saved = await request('/api/ai/assistant/save', { method:'POST', body:JSON.stringify(payload) });
      if (!currentAISaveOpen(openVersion)) return;
      state.aiSaveApplicationId = applicationSnapshot.id;
      state.aiSaveApplication = applicationSnapshot;
      $('ai-save-form').classList.add('hidden'); $('ai-save-success').classList.remove('hidden');
      $('ai-save-success-message').textContent = saved.target === 'task' ? '已新增下一步任务。' : '已追加到申请备注。';
      toast('AI 建议已保存');
    } catch (error) {
      if (!currentAISaveOpen(openVersion)) return;
      $('ai-save-message').textContent = error.message;
    } finally {
      if (currentAISaveOpen(openVersion)) button.disabled = !state.aiSaveApplicationId;
    }
  });
  $('code-login-form').onsubmit = async event => {
    event.preventDefault(); const button=event.target.querySelector('button'); if(button.disabled)return;
    button.disabled=true; showMessage('auth-message','');
    try { const data=await request('/api/web-session/redeem',{method:'POST',body:JSON.stringify({code:$('web-login-code').value.trim()})}); saveSession(data); $('web-login-code').value=''; showApp(); await loadDashboard(); }
    catch(error){showMessage('auth-message',error.message);}
    finally{button.disabled=false;}
  };
  if (state.token) { showApp(); loadDashboard(); } else setAuthView();
})();
