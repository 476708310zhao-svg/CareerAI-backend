/* global initPage, canAccess, getToken, logout */
'use strict';

(() => {
  const base = '/admin/api/v4/question-parsing';
  const $ = id => document.getElementById(id);
  const statusLabels = {
    QUEUED: '排队待处理', RUNNING: '解析中', DONE: '解析完成', COMPLETED: '解析完成', FAILED: '处理失败',
    WAIT_RIGHTS: '等待机器处理授权', WAIT_ASSET_CHECK: '等待资产校验与扫描', WAIT_BUDGET: '等待处理预算',
    WAIT_OCR: '扫描页待 OCR 或人工录入', WAIT_STORAGE: '等待私有存储恢复', WAIT_REVIEW: '解析完成，等待人工审题',
    NEEDS_MANUAL: '解析完成，部分题需人工处理', pending_review: '待审草稿', needs_repair: '需要人工修订'
  };
  const flagLabels = {
    MISSING_ANSWER: '未找到可靠答案', ANSWER_MISSING: '未找到可靠答案', ANSWER_CONFLICT: '答案证据冲突',
    DUPLICATE_NUMBER: '章节内题号重复', DUPLICATE_QUESTION_NUMBER: '章节内题号重复',
    MULTI_COLUMN: '可能存在双栏错序', TWO_COLUMN: '可能存在双栏错序', POSSIBLE_TWO_COLUMNS: '可能存在双栏错序',
    COMPLEX_GRAPHIC: '包含复杂图形', SCANNED_PAGE: '扫描页待 OCR', OCR_REQUIRED: '扫描页待 OCR',
    CONFLICTING_ANSWER: '答案证据冲突', AMBIGUOUS_ANSWER_SOURCE: '存在多处同题号答案，需核对归属',
    AUTO_MATCHED_ANSWER: '已按 PDF 答案页自动填入，OCR 结果仍需核对', ANSWER_NOT_IN_OPTIONS: '答案不在已识别选项中',
    ANSWER_EXPLANATION_CONFLICT: '答案与解析结论不一致', ANSWER_EXPLANATION_AGREES: '答案与解析结论一致（OCR 仍需核对）',
    GRAPHIC_CONTENT_UNVERIFIED: '图形内容未核实，请人工查看原页',
    OCR_UNVERIFIED: 'OCR 文字待逐题核对原页', OCR_LOW_CONFIDENCE: 'OCR 识别置信度较低', OCR_EMPTY: 'OCR 未识别到文字',
    OCR_QUESTION_NUMBER_INFERRED: '题号由相邻题号推断，请对照原页', OCR_PROFILE_FALLBACK: '本页 OCR 已回退到低分辨率，请对照原页',
    PARSER_TEXT_TRUNCATED: 'OCR 疑似把多题拼接，已截断候选文字；请对照原页完整修订',
    OPTIONS_NEED_REVIEW: '选项需核对', MANUAL_EDIT_REQUIRES_REVIEW: '人工修订待复核', MANUAL_ANSWER_EDIT: '人工改动答案待复核',
    UNVERIFIED: '答案未核实', ANSWER_UNCERTAIN: '答案不确定'
  };
  const errorLabels = {
    SOURCE_USE_DENIED: '该来源尚无当前处理用途的有效授权。请先完成权利审核。',
    MACHINE_PROCESSING_RIGHT_REQUIRED: '来源缺少当前地域和用途的机器处理权，请先完成权利审核。',
    ASSET_VALIDATION_OR_SCAN_PENDING: '私有 PDF 尚未通过深度校验与安全扫描，暂不能解析。',
    SOURCE_ASSET_CHANGED: '来源绑定的 PDF 资产已变化，请重新核对来源记录。',
    SOURCE_ASSET_REQUIRED: '来源尚未上传私有 PDF，请先在素材导入页完成登记。',
    WAIT_RIGHTS: '该来源等待机器处理授权。', WAIT_ASSET_CHECK: '来源文件仍在隔离区，等待深度校验和安全扫描。',
    WAIT_BUDGET: '当前未配置处理预算，任务会保留在等待状态。', WAIT_OCR: '扫描页无可用数字文本，需另行 OCR 或人工录入。',
    WAIT_STORAGE: '私有原件当前不可读取，请核查存储状态后重试。', NEEDS_MANUAL: '部分题目需要人工核对与修订。',
    PAGE_LIMIT_EXCEEDED: 'PDF 页数超过本批处理上限，请拆分或调整预算后重试。',
    TIME_LIMIT_EXCEEDED: '本次解析达到时长上限，已保留检查点，可在预算允许后继续。',
    PAGE_LAYOUT_BUDGET_EXCEEDED: '单页文字块过多，需人工检查版式后再处理。',
    SCANNED_PAGES_NEED_OCR: '仍有扫描页未识别出文字，请检查原页，必要时人工录入。',
    PARSER_VERSION_MISMATCH: '解析模式已更新，请新建解析任务，旧任务不会混用已有检查点。',
    COMPLEX_LAYOUT_NEEDS_REVIEW: '复杂版式无法可靠切题，请人工核对原页。',
    NO_QUESTIONS_FOUND: '未从数字文本中可靠识别题目，请人工检查原件。',
    PRIVATE_PDF_IMPORT_DISABLED: '当前环境未开放私有 PDF 存储读取。',
    PRIVATE_STORAGE_UNSAFE_PATH: '私有存储路径校验失败，请联系管理员核查。',
    PRIVATE_STORAGE_EXPOSED: '私有存储位置不安全，请联系管理员核查。',
    ASSET_STORAGE_MISMATCH: '私有原件与资产记录不一致，请联系管理员核查。',
    PDF_PARSE_FAILED: 'PDF 解析失败，请核对原件格式或联系管理员。',
    PDF_NO_PAGES: 'PDF 没有可读取页面，请核对原件。',
    PDF_PAGE_EXTRACTION_FAILED: '页面文本提取失败，请人工核对该页。',
    PDF_CHECKPOINT_INCOMPLETE: '页级检查点不完整，请重试任务。',
    PARSER_DRAFT_BUDGET_EXCEEDED: 'OCR 疑似将多题拼接；更新解析器后可按已有页级进度重试。',
    SUPERSEDED_BY_OCR_V2: '此任务使用旧版切题结果；请打开最新的 OCR v2 任务校对。',
    OCR_NOT_ENABLED: '本地 OCR 未启用；启用后可重试这项任务。',
    OCR_MODELS_UNAVAILABLE: '本地中文和英文 OCR 模型缺失，请配置模型目录后重试。',
    OCR_RENDER_UNAVAILABLE: '本地 PDF 页面渲染器不可用，请配置后重试。',
    OCR_RENDER_FAILED: '页面无法渲染用于 OCR，请核对原件。',
    OCR_RENDER_TIMEOUT: '页面渲染超时，任务已保留进度。',
    OCR_TIMEOUT: '本页 OCR 超时，任务已保留进度。',
    OCR_PROCESS_FAILED: '本页 OCR 失败，任务已保留进度。',
    PREVIEW_UNAVAILABLE: '当前环境没有安全的原页渲染能力，可核对页级文本与坐标证据。',
    PREVIEW_TOO_LARGE: '原页预览超过大小限制，请核对页级文本或联系管理员。',
    DRAFT_VERSION_CONFLICT: '草稿已被其他管理员修订，已重新读取最新内容。请核对后再保存。',
    JOB_NOT_FOUND: '解析任务不存在，请刷新列表。', DRAFT_NOT_FOUND: '待审草稿不存在，请刷新任务。',
    PERMISSION_DENIED: '当前账号没有该操作权限。'
  };
  const state = {
    jobs: [], jobCursor: null, jobTotal: 0, jobListRequest: 0,
    jobId: null, job: null, jobSelection: 0, jobDetailRequest: 0,
    drafts: [], draftCursor: null, draftTotal: 0, draftListRequest: 0,
    draftId: null, draft: null, draftSelection: 0, draftDetailRequest: 0, selectedPage: null, pageSelection: 0,
    createSignature: null, createKey: null, previewUrl: null
  };
  const idOf = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const initialParams = new URLSearchParams(window.location.search);
  const reviewSourceId = initialParams.get('review') === '1' ? idOf(initialParams.get('source')) : null;
  const date = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—';
  const label = value => statusLabels[value] || String(value || '待核查');
  const node = (tag, value, className) => {
    const item = document.createElement(tag);
    if (value !== undefined) item.textContent = String(value);
    if (className) item.className = className;
    return item;
  };
  function show(id, value, focus = false) {
    const target = $(id); target.textContent = value || ''; target.hidden = !value;
    if (value && focus && target.focus) target.focus();
  }
  function problem(error) { return errorLabels[error.message] || error.message || '请求失败，请稍后重试。'; }
  function accessDenied(error) { return error.status === 401 || error.status === 403; }
  function empty(id, value) { $(id).replaceChildren(node('p', value, 'qp-empty')); }
  function key() { return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(window.ADMIN_API + base + path, {
        method: options.method || 'GET', cache: 'no-store',
        headers: { Authorization: `Bearer ${getToken()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (_) { throw new Error('网络连接异常，请检查服务器后重试。'); }
    if (response.status === 401) { logout(); const error = new Error('登录已失效'); error.status = 401; throw error; }
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error(`服务器响应异常（HTTP ${response.status}）`); }
    if (!response.ok || !payload || payload.code !== 0) {
      const error = new Error(payload && (payload.code || payload.message) || `请求失败（HTTP ${response.status}）`);
      error.status = response.status; throw error;
    }
    return payload.data || {};
  }
  function button(value, callback, selected = false) {
    const item = node('button', undefined, 'qp-list-button'); item.type = 'button';
    item.setAttribute('aria-pressed', String(selected)); item.addEventListener('click', callback);
    return item;
  }
  function badge(value) {
    const kind = value === 'FAILED' ? 'failed' : ['DONE', 'COMPLETED', 'WAIT_REVIEW'].includes(value) ? 'done' : 'waiting';
    return node('span', label(value), `qp-badge ${kind}`);
  }

  function renderJobs() {
    const cards = state.jobs.map(job => {
      const item = button(`任务 #${job.id}`, () => selectJob(job.id), job.id === state.jobId);
      item.append(badge(job.status), node('strong', `${job.paperVersion || '未命名试卷'} · 来源 #${job.sourceId}`),
        node('small', `页进度 ${job.checkpointPage || 0}/${job.pageCount || '待识别'} · ${date(job.updatedAt || job.createdAt)}`));
      return item;
    });
    $('jobList').replaceChildren(...(cards.length ? cards : [node('p', '暂无解析任务。', 'qp-empty')]));
    $('jobCount').textContent = `共 ${state.jobTotal} 个任务`;
    $('moreJobs').hidden = state.jobCursor == null;
  }
  async function loadJobs(reset = true) {
    const sequence = ++state.jobListRequest, cursor = reset ? 0 : state.jobCursor;
    if (cursor == null) return;
    $('refreshJobs').disabled = true; $('moreJobs').disabled = true; show('jobsError', '');
    if (reset) empty('jobList', '正在读取任务…');
    try {
      const data = await request(`/jobs?${new URLSearchParams({ cursor, limit: 30 })}`);
      if (sequence !== state.jobListRequest) return;
      state.jobs = reset ? data.jobs || [] : [...state.jobs, ...(data.jobs || []).filter(item => !state.jobs.some(old => old.id === item.id))];
      state.jobCursor = data.nextCursor; state.jobTotal = Number(data.total || 0); renderJobs();
      if (reset && reviewSourceId && !state.jobId) {
        const latest = state.jobs.filter(item => item.sourceId === reviewSourceId)
          .sort((left, right) => right.id - left.id)[0];
        if (latest) selectJob(latest.id);
      }
    } catch (error) {
      if (sequence === state.jobListRequest) {
        if (accessDenied(error)) denyCurrentDraft(error);
        if (reset) empty('jobList', '任务暂时无法加载。'); show('jobsError', problem(error), true);
      }
    } finally { if (sequence === state.jobListRequest) { $('refreshJobs').disabled = false; $('moreJobs').disabled = false; } }
  }
  async function createJob(event) {
    event.preventDefault();
    const sourceId = idOf($('sourceId').value), paperVersion = $('paperVersion').value.trim(), territory = $('territory').value;
    if (!sourceId || !paperVersion) return show('createError', '请填写有效的来源 ID 与试卷版本。', true);
    const payload = { sourceId, paperVersion, territory, commercial: $('commercial').checked };
    const signature = JSON.stringify(payload);
    if (signature !== state.createSignature) { state.createSignature = signature; state.createKey = key(); }
    $('createJob').disabled = true; show('createError', '');
    try {
      const data = await request('/jobs', { method: 'POST', body: { ...payload, clientKey: state.createKey } });
      const jobId = idOf(data.job && data.job.id); if (!jobId) throw new Error('创建结果异常，请刷新任务列表核对。');
      if (['WAIT_RIGHTS', 'WAIT_ASSET_CHECK'].includes(data.job.status)) {
        // A prior attempt may now be eligible. Recheck the existing job after this explicit start action.
        await request(`/jobs/${jobId}/retry`, { method: 'POST' });
      }
      state.createSignature = null; state.createKey = null; $('createJobForm').reset();
      await loadJobs(true); await selectJob(jobId);
      if ($('jobDetailPanel').scrollIntoView) $('jobDetailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      show('actionNotice', '识题任务已创建。处理进度会自动更新，完成后在下方核对草稿。');
    } catch (error) { if (accessDenied(error)) denyCurrentDraft(error); show('createError', problem(error), true); }
    finally { $('createJob').disabled = false; }
  }

  function clearPreview() {
    const image = $('sourcePageImage'); image.hidden = true; image.removeAttribute('src');
    if (state.previewUrl && window.URL && window.URL.revokeObjectURL) window.URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    $('sourcePageFallback').hidden = false;
  }
  function clearDraftView() {
    state.selectedPage = null; state.pageSelection++; clearPreview();
    $('draftStem').value = ''; $('draftExplanation').value = ''; $('reviewNote').value = '';
    $('draftOptions').replaceChildren(); $('draftWarnings').replaceChildren(); $('evidenceList').replaceChildren();
    $('editHistory').replaceChildren(); $('draftMeta').textContent = ''; $('sourcePageMeta').textContent = '';
    $('sourcePageSelect').replaceChildren(); $('sourcePagePicker').hidden = true;
    $('draftForm').hidden = true; $('sourcePageFallback').textContent = '正在核对原页访问条件…';
    $('draftToBank').hidden = true; $('draftToBank').href = '#';
  }
  function denyCurrentDraft(error) {
    state.jobListRequest++; state.jobDetailRequest++; state.draftSelection++; state.draftDetailRequest++; state.draftListRequest++;
    state.jobs = []; state.job = null; state.jobCursor = null; state.jobTotal = 0;
    state.draftId = null; state.draft = null; state.drafts = []; state.draftCursor = null; state.draftTotal = 0;
    clearDraftView();
    empty('jobList', '受保护的解析内容暂不可读取。'); $('jobCount').textContent = '访问已停止';
    $('jobHeading').textContent = '访问已停止'; $('jobMeta').textContent = '';
    $('jobSummary').replaceChildren(node('p', '访问已停止，请核对账号权限及来源授权。', 'qp-empty'));
    $('moreJobs').hidden = true; $('retryJob').hidden = true; $('refreshJobs').disabled = false;
    $('draftHeading').textContent = '访问已停止'; $('draftDetailPanel').hidden = false;
    empty('draftList', '当前来源的待审内容不可读取，请核对授权。');
    $('draftCount').textContent = '访问已停止'; $('moreDrafts').hidden = true;
    $('refreshDrafts').disabled = false; $('moreDrafts').disabled = false; $('refreshDraft').disabled = false;
    show('draftDetailError', problem(error), true);
  }
  function clearDraftSelection() {
    state.draftId = null; state.draft = null; state.draftSelection++; state.draftDetailRequest++;
    $('draftDetailPanel').hidden = true; clearDraftView();
  }
  function selectJob(id) {
    const jobId = idOf(id); if (!jobId) return;
    state.jobId = jobId; state.job = null; state.jobSelection++; state.drafts = []; state.draftCursor = null;
    state.draftListRequest++; clearDraftSelection(); renderJobs();
    $('jobDetailPanel').hidden = false; $('jobHeading').textContent = `任务 #${jobId}`;
    empty('jobSummary', '正在读取任务状态…'); empty('draftList', '正在读取待审草稿…');
    show('jobDetailError', ''); show('draftsError', ''); show('jobActionNote', '');
    const current = state.jobSelection;
    loadJobDetail(jobId, current); loadDrafts(true, jobId, current);
  }
  function renderJob() {
    const job = state.job; if (!job) return;
    $('jobHeading').textContent = `${job.paperVersion || '试卷'} · 任务 #${job.id}`;
    $('jobMeta').textContent = `来源 #${job.sourceId} · 解析器 ${job.parserVersion || '待确定'} · SHA-256 ${job.assetSha256 || '待核验'}`;
    const summary = [badge(job.status), node('p', `页进度：${job.checkpointPage || 0} / ${job.pageCount || '待识别'}；地域：${job.territory || '待核查'}；商业用途：${job.commercial ? '是' : '否'}`)];
    if (job.reasonCode) summary.push(node('p', `停留原因：${errorLabels[job.reasonCode] || `处理暂停（代码 ${job.reasonCode}），请联系管理员核查。`}`));
    if (['QUEUED', 'RUNNING'].includes(job.status)) summary.push(node('small', '正在处理；本页每 5 秒自动更新状态。'));
    if (job.status === 'WAIT_RIGHTS') {
      const link = node('a', '去核对机器处理授权', 'btn btn-primary btn-sm');
      link.href = `question-governance.html?${new URLSearchParams({ source: String(job.sourceId) })}`;
      summary.push(link);
    }
    summary.push(node('small', `创建 ${date(job.createdAt)} · 更新 ${date(job.updatedAt)}`));
    $('jobSummary').replaceChildren(...summary);
    const retryable = ['FAILED', 'WAIT_RIGHTS', 'WAIT_ASSET_CHECK', 'WAIT_BUDGET', 'WAIT_STORAGE', 'WAIT_OCR'].includes(job.status);
    $('retryJob').hidden = !retryable || !canAccess('questionAssets');
  }
  async function loadJobDetail(id = state.jobId, selection = state.jobSelection) {
    if (!id) return;
    const sequence = ++state.jobDetailRequest; show('jobDetailError', ''); $('refreshJob').disabled = true;
    try {
      const data = await request(`/jobs/${id}`);
      if (selection !== state.jobSelection || sequence !== state.jobDetailRequest) return;
      const wasReview = state.job?.status === 'WAIT_REVIEW';
      state.job = data.job; renderJob();
      if (!wasReview && state.job.status === 'WAIT_REVIEW') loadDrafts(true, id, selection);
    } catch (error) {
      if (selection === state.jobSelection && sequence === state.jobDetailRequest) {
        if (accessDenied(error)) denyCurrentDraft(error);
        show('jobDetailError', problem(error), true);
      }
    }
    finally { if (selection === state.jobSelection && sequence === state.jobDetailRequest) $('refreshJob').disabled = false; }
  }
  async function retryJob() {
    if (!state.jobId) return;
    const id = state.jobId, selection = state.jobSelection; $('retryJob').disabled = true; show('jobDetailError', '');
    try {
      const data = await request(`/jobs/${id}/retry`, { method: 'POST' });
      if (selection !== state.jobSelection) return;
      state.job = data.job; renderJob(); await loadJobs(true); await loadDrafts(true, id, selection);
      show('jobActionNote', '已重新检查处理条件和任务状态。');
    } catch (error) { if (selection === state.jobSelection) { if (accessDenied(error)) denyCurrentDraft(error); show('jobDetailError', problem(error), true); } }
    finally { if (selection === state.jobSelection) $('retryJob').disabled = false; }
  }

  function renderDrafts() {
    const cards = state.drafts.map(draft => {
      const item = button(undefined, () => selectDraft(draft.id), draft.id === state.draftId);
      item.append(node('strong', `${draft.section || '未标章节'} · 第 ${draft.questionNumber || '？'} 题`),
        node('small', `草稿 #${draft.id} · 原页 ${draft.pageNumber || '待核'} · ${label(draft.status)} · ${label(draft.answerStatus)}`));
      if (Array.isArray(draft.flags) && draft.flags.length) item.append(node('small', draft.flags.map(flag => flagLabels[flag] || flag).join('、')));
      return item;
    });
    $('draftList').replaceChildren(...(cards.length ? cards : [node('p', '该任务暂无待审草稿。等待解析完成或刷新状态。', 'qp-empty')]));
    $('draftCount').textContent = `共 ${state.draftTotal} 条`;
    $('moreDrafts').hidden = state.draftCursor == null;
  }
  async function loadDrafts(reset = true, id = state.jobId, selection = state.jobSelection) {
    if (!id) return;
    const sequence = ++state.draftListRequest, cursor = reset ? 0 : state.draftCursor;
    if (cursor == null) return;
    $('refreshDrafts').disabled = true; $('moreDrafts').disabled = true; show('draftsError', '');
    if (reset) empty('draftList', '正在读取待审草稿…');
    try {
      const data = await request(`/jobs/${id}/drafts?${new URLSearchParams({ cursor, limit: 30 })}`);
      if (selection !== state.jobSelection || sequence !== state.draftListRequest) return;
      state.drafts = reset ? data.drafts || [] : [...state.drafts, ...(data.drafts || []).filter(item => !state.drafts.some(old => old.id === item.id))];
      state.draftCursor = data.nextCursor; state.draftTotal = Number(data.total || 0); renderDrafts();
    } catch (error) {
      if (selection === state.jobSelection && sequence === state.draftListRequest) {
        if (accessDenied(error)) { denyCurrentDraft(error); show('draftsError', problem(error), true); }
        else { if (reset) empty('draftList', '草稿暂时无法加载。'); show('draftsError', problem(error), true); }
      }
    }
    finally { if (selection === state.jobSelection && sequence === state.draftListRequest) { $('refreshDrafts').disabled = false; $('moreDrafts').disabled = false; } }
  }
  function selectDraft(id) {
    const draftId = idOf(id); if (!draftId) return;
    state.draftId = draftId; state.draft = null; state.draftSelection++; clearDraftView(); renderDrafts();
    $('saveDraft').disabled = false; $('saveAndNextDraft').disabled = false;
    $('draftDetailPanel').hidden = false; $('draftHeading').textContent = `草稿 #${draftId}`;
    show('draftDetailError', ''); show('saveError', ''); show('saveNote', '');
    loadDraftDetail(draftId, state.draftSelection);
  }
  function renderEvidence(draft, pageNumber) {
    const items = [];
    const answer = draft.answerEvidence;
    if (answer && typeof answer === 'object') items.push(node('p', `答案证据：第 ${answer.pageNumber || '？'} 页 · ${answer.kind || '原文'} · ${answer.text || '无文字摘录'}`, 'qp-evidence-item'));
    else items.push(node('p', '没有可靠答案证据；请核对原件并保留待审状态。', 'qp-evidence-item'));
    const candidates = Array.isArray(draft.answerEvidenceCandidates) ? draft.answerEvidenceCandidates : [];
    if (candidates.length) {
      items.push(node('p', `候选答案证据 ${candidates.length} 条；${draft.flags?.includes('AUTO_MATCHED_ANSWER') ? '唯一匹配的答案已自动勾选，但 OCR 未核实。' : '只供人工核对，不代表标准答案。'}`, 'qp-evidence-item'));
      for (const candidate of candidates) {
        const choices = Array.isArray(candidate.choices) ? candidate.choices.join('、') : '待核查';
        items.push(node('p', `第 ${candidate.pageNumber || '？'} 页 · ${candidate.kind || '原文'} · 候选 ${choices} · ${candidate.text || '无文字摘录'}`, 'qp-evidence-item'));
      }
    }
    if (Array.isArray(draft.sourceBlocks) && draft.sourceBlocks.length) {
      for (const block of draft.sourceBlocks.filter(item => item.pageNumber === pageNumber).slice(0, 20)) {
        const location = `页 ${block.pageNumber || draft.pageNumber || '？'} · 坐标 ${block.x == null ? '？' : block.x}, ${block.y == null ? '？' : block.y}`;
        items.push(node('p', `${location} · ${block.text || ''}`, 'qp-evidence-item'));
      }
    }
    $('evidenceList').replaceChildren(...items);
  }
  function optionRow(option, selected = false) {
    const row = node('div', undefined, 'qp-option');
    const labelNode = node('label', option.id); labelNode.setAttribute('for', `option-${option.id}`);
    const answer = node('input'); answer.type = 'checkbox'; answer.checked = selected; answer.value = option.id; answer.setAttribute('aria-label', `${option.id} 为正确答案`);
    const text = node('input'); text.type = 'text'; text.id = `option-${option.id}`; text.value = option.text || ''; text.maxLength = 2000;
    row.append(labelNode, answer, text); row.optionId = option.id; return row;
  }
  function addDraftOption() {
    const used = new Set([...$('draftOptions').children].map(row => row.optionId));
    const id = 'ABCDEFGH'.split('').find(letter => !used.has(letter));
    if (id) $('draftOptions').append(optionRow({ id, text: '' }));
    $('addDraftOption').disabled = $('draftOptions').children.length >= 8;
    $('removeDraftOption').disabled = $('draftOptions').children.length <= 2;
  }
  function removeDraftOption() {
    const rows = $('draftOptions').children;
    if (rows.length > 2) rows[rows.length - 1].remove();
    $('addDraftOption').disabled = $('draftOptions').children.length >= 8;
    $('removeDraftOption').disabled = $('draftOptions').children.length <= 2;
  }
  function reviewPages(draft) {
    return [...new Set([...(Array.isArray(draft.sourcePages) ? draft.sourcePages : []), draft.pageNumber,
      draft.answerEvidence && draft.answerEvidence.pageNumber,
      ...(Array.isArray(draft.answerEvidenceCandidates) ? draft.answerEvidenceCandidates.map(item => item.pageNumber) : [])]
      .map(idOf).filter(Boolean))].sort((a, b) => a - b);
  }
  function renderDraft() {
    const draft = state.draft; if (!draft) return;
    $('draftHeading').textContent = `${draft.section || '未标章节'} · 第 ${draft.questionNumber || '？'} 题`;
    $('draftMeta').textContent = `草稿 #${draft.id} · 版本 ${draft.version} · 来源页 ${Array.isArray(draft.sourcePages) && draft.sourcePages.length ? draft.sourcePages.join('、') : draft.pageNumber || '待核'} · ${label(draft.status)}`;
    const flags = new Set([...(Array.isArray(draft.flags) ? draft.flags : []), ...(!['VERIFIED'].includes(draft.answerStatus) ? [draft.answerStatus || 'UNVERIFIED'] : [])]);
    $('draftWarnings').replaceChildren(...[...flags].map(flag => node('span', flagLabels[flag] || flag)));
    $('draftStem').value = draft.stem || ''; $('draftExplanation').value = draft.explanation || ''; $('reviewNote').value = '';
    const answers = new Set(Array.isArray(draft.answerOptionIds) ? draft.answerOptionIds : []);
    $('draftOptions').replaceChildren(...(Array.isArray(draft.options) ? draft.options : []).map(option => optionRow(option, answers.has(option.id))));
    $('addDraftOption').disabled = $('draftOptions').children.length >= 8;
    $('removeDraftOption').disabled = $('draftOptions').children.length <= 2;
    const pages = reviewPages(draft);
    $('sourcePageSelect').replaceChildren(...pages.map(number => {
      const answerPage = idOf(draft.answerEvidence && draft.answerEvidence.pageNumber) === number;
      const candidatePage = Array.isArray(draft.answerEvidenceCandidates) && draft.answerEvidenceCandidates.some(item => idOf(item.pageNumber) === number);
      const option = node('option', `第 ${number} 页${answerPage ? ' · 答案证据页' : candidatePage ? ' · 候选答案页' : ''}`);
      option.value = String(number); return option;
    }));
    $('sourcePagePicker').hidden = pages.length < 2;
    state.selectedPage = pages.includes(idOf(draft.pageNumber)) ? idOf(draft.pageNumber) : pages[0] || null;
    $('sourcePageSelect').value = state.selectedPage == null ? '' : String(state.selectedPage);
    const edits = Array.isArray(draft.edits) ? draft.edits : [];
    $('editHistory').replaceChildren(...(edits.length ? edits.map(edit => node('p', `版本 ${edit.version || '？'} · ${date(edit.createdAt)} · ${edit.reviewNote || edit.note || '人工修订'}`, 'qp-evidence-item')) : [node('p', '尚无人工修订记录。', 'qp-empty')]));
    const editable = canAccess('questionAssets') && canAccess('questionBankEdit');
    $('draftForm').hidden = false; $('saveDraft').hidden = !editable; $('reviewNoteGroup').hidden = !editable;
    $('draftStem').disabled = !editable; $('draftExplanation').disabled = !editable;
    $('addDraftOption').hidden = !editable; $('removeDraftOption').hidden = !editable;
    for (const row of $('draftOptions').children) { row.children[1].disabled = !editable; row.children[2].disabled = !editable; }
    $('saveAndNextDraft').hidden = !editable;
    $('draftToBank').hidden = !editable;
    $('draftToBank').href = `question-bank.html?${new URLSearchParams({ draft: String(draft.id) })}`;
  }
  async function loadDraftDetail(id = state.draftId, selection = state.draftSelection) {
    if (!id) return;
    const sequence = ++state.draftDetailRequest; $('refreshDraft').disabled = true;
    try {
      const data = await request(`/drafts/${id}`);
      if (selection !== state.draftSelection || sequence !== state.draftDetailRequest) return;
      state.draft = { ...(data.draft || {}), edits: data.edits || (data.draft && data.draft.edits) || [] };
      renderDraft(); show('draftDetailError', ''); loadSelectedPage(state.draft, selection);
    } catch (error) {
      if (selection === state.draftSelection && sequence === state.draftDetailRequest) {
        if (accessDenied(error)) denyCurrentDraft(error);
        else { state.draft = null; clearDraftView(); show('draftDetailError', problem(error), true); }
      }
    }
    finally { if (selection === state.draftSelection && sequence === state.draftDetailRequest) $('refreshDraft').disabled = false; }
  }
  function currentPage(draft, selection, pageSequence, pageNumber) {
    return selection === state.draftSelection && pageSequence === state.pageSelection &&
      draft.id === state.draftId && pageNumber === state.selectedPage;
  }
  function loadSelectedPage(draft, selection) {
    const pageNumber = idOf(state.selectedPage), pageSequence = ++state.pageSelection;
    clearPreview(); renderEvidence(draft, pageNumber);
    $('sourcePageMeta').textContent = `来源 #${state.job && state.job.sourceId || '？'} · 第 ${pageNumber || '？'} 页；预览仅供当前管理员核对。`;
    $('sourcePageFallback').textContent = pageNumber ? `正在读取第 ${pageNumber} 页…` : '缺少可核对的来源页。';
    if (!pageNumber) return;
    loadPageEvidence(draft, selection, pageSequence, pageNumber);
    loadPagePreview(draft, selection, pageSequence, pageNumber);
  }
  function selectSourcePage() {
    if (!state.draft) return;
    const next = idOf($('sourcePageSelect').value);
    const pages = reviewPages(state.draft);
    if (!next || !pages.includes(next)) return;
    state.selectedPage = next; loadSelectedPage(state.draft, state.draftSelection);
  }
  async function loadPageEvidence(draft, selection, pageSequence, pageNumber) {
    const jobId = idOf(draft.jobId);
    if (!jobId || !pageNumber) return;
    try {
      const data = await request(`/jobs/${jobId}/pages/${pageNumber}`);
      if (!currentPage(draft, selection, pageSequence, pageNumber)) return;
      const page = data.page || data;
      if (Array.isArray(page.flags) && page.flags.includes('OCR_UNVERIFIED'))
        $('evidenceList').append(node('p', `第 ${pageNumber} 页由本地 OCR 识别${Number.isFinite(page.ocrConfidence) ? `（平均置信度 ${Math.round(page.ocrConfidence)}%）` : ''}；文字和答案必须对照原页复核。`, 'qp-evidence-item'));
      if (page.text) $('evidenceList').append(node('p', `第 ${pageNumber} 页提取文本：\n${page.text}`, 'qp-evidence-item'));
    } catch (error) {
      if (!currentPage(draft, selection, pageSequence, pageNumber)) return;
      if (accessDenied(error)) denyCurrentDraft(error);
      else $('evidenceList').append(node('p', `页级文本暂不可读取：${problem(error)}`, 'qp-evidence-item'));
    }
  }
  async function loadPagePreview(draft, selection, pageSequence, pageNumber) {
    const sourceId = idOf(state.job && state.job.sourceId), jobId = idOf(state.job && state.job.id);
    if (!sourceId || !jobId || !pageNumber) { $('sourcePageFallback').textContent = '缺少来源、任务或页码，无法预览。'; return; }
    try {
      const response = await fetch(window.ADMIN_API + base + `/sources/${sourceId}/pages/${pageNumber}/preview?jobId=${jobId}`, {
        method: 'GET', headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store'
      });
      if (response.status === 401) { logout(); const error = new Error('登录已失效'); error.status = 401; throw error; }
      if (!response.ok) {
        let code = `HTTP ${response.status}`;
        try { const payload = await response.json(); code = payload.code || payload.message || code; } catch (_) { /* keep HTTP status */ }
        const error = new Error(code); error.status = response.status; throw error;
      }
      const type = response.headers && response.headers.get && response.headers.get('content-type') || '';
      if (!/^image\/png(?:;|$)/i.test(type)) throw new Error('原页返回格式异常');
      const blob = await response.blob();
      if (blob.size < 1 || blob.size > 10 * 1024 * 1024) throw new Error('原页大小异常');
      if (!currentPage(draft, selection, pageSequence, pageNumber)) return;
      if (!window.URL || !window.URL.createObjectURL) throw new Error('当前浏览器不支持私有预览');
      const url = window.URL.createObjectURL(blob); state.previewUrl = url;
      $('sourcePageImage').alt = `授权 PDF 第 ${pageNumber} 页原页预览`;
      $('sourcePageImage').src = url; $('sourcePageImage').hidden = false;
      $('sourcePageFallback').hidden = true;
    } catch (error) {
      if (!currentPage(draft, selection, pageSequence, pageNumber)) return;
      if (accessDenied(error)) denyCurrentDraft(error);
      else { $('sourcePageFallback').textContent = problem(error); $('sourcePageFallback').hidden = false; }
    }
  }
  function draftInput() {
    const options = [...$('draftOptions').children].map(row => ({ id: row.optionId, text: row.children[2].value.trim() }));
    const answerOptionIds = [...$('draftOptions').children].filter(row => row.children[1].checked).map(row => row.optionId);
    return { expectedVersion: state.draft.version, stem: $('draftStem').value.trim(), options,
      answerOptionIds, explanation: $('draftExplanation').value.trim(), reviewNote: $('reviewNote').value.trim() };
  }
  async function saveDraft(event, advance = false) {
    event.preventDefault(); if (!state.draft || !canAccess('questionAssets') || !canAccess('questionBankEdit')) return;
    const payload = draftInput();
    if (!payload.stem || !payload.reviewNote || payload.options.length < 2 || payload.options.some(option => !option.text)) return show('saveError', '请填写题干、至少两个完整选项和人工修订说明。', true);
    const id = state.draftId, selection = state.draftSelection;
    $('saveDraft').disabled = true; $('saveAndNextDraft').disabled = true; show('saveError', ''); show('saveNote', '');
    try {
      await request(`/drafts/${id}`, { method: 'PATCH', body: payload });
      if (selection !== state.draftSelection) return;
      await loadDraftDetail(id, selection); await loadDrafts(true, state.jobId, state.jobSelection);
      if (selection !== state.draftSelection || state.draftId !== id) return;
      if (advance) {
        let next = state.drafts.find(item => item.id > id);
        if (!next && state.draftCursor != null) {
          await loadDrafts(false, state.jobId, state.jobSelection);
          next = state.drafts.find(item => item.id > id);
        }
        if (selection !== state.draftSelection || state.draftId !== id) return;
        if (next) {
          selectDraft(next.id);
          show('actionNotice', `草稿 #${id} 已保存，正在核对下一题；题目仍未发布。`);
          if ($('draftDetailPanel').scrollIntoView) $('draftDetailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
      show('saveNote', advance ? '草稿已保存，当前已是最后一题；题目仍需后续审核。' : '待审草稿已保存，修订已记录；仍需后续内容与权利审核。');
    } catch (error) {
      if (selection !== state.draftSelection) return;
      if (error.status === 409) {
        await loadDraftDetail(id, selection);
        if (selection === state.draftSelection) show('saveError', errorLabels.DRAFT_VERSION_CONFLICT, true);
      } else {
        if (accessDenied(error)) denyCurrentDraft(error);
        else show('saveError', problem(error), true);
      }
    } finally { if (selection === state.draftSelection) { $('saveDraft').disabled = false; $('saveAndNextDraft').disabled = false; } }
  }
  initPage('questionParsing', 'PDF 辅助识题', () => {
    $('createPanel').hidden = !canAccess('questionAssets');
    $('createJobForm').addEventListener('submit', createJob);
    $('refreshJobs').addEventListener('click', () => loadJobs(true)); $('moreJobs').addEventListener('click', () => loadJobs(false));
    $('refreshJob').addEventListener('click', () => loadJobDetail()); $('retryJob').addEventListener('click', retryJob);
    $('refreshDrafts').addEventListener('click', () => loadDrafts(true)); $('moreDrafts').addEventListener('click', () => loadDrafts(false));
    $('refreshDraft').addEventListener('click', () => { if (window.confirm && !window.confirm('放弃当前未保存的字段并刷新草稿？')) return; loadDraftDetail(); });
    $('sourcePageSelect').addEventListener('change', selectSourcePage);
    $('addDraftOption').addEventListener('click', addDraftOption); $('removeDraftOption').addEventListener('click', removeDraftOption);
    $('draftForm').addEventListener('submit', saveDraft);
    $('saveAndNextDraft').addEventListener('click', event => saveDraft(event, true));
    $('sourcePageImage').addEventListener('error', () => { clearPreview(); $('sourcePageFallback').textContent = '原页图片加载失败，请核对页级文本与坐标证据。'; });
    const params = new URLSearchParams(window.location.search);
    const sourceId = idOf(params.get('source'));
    if (sourceId) $('sourceId').value = String(sourceId);
    const paper = String(params.get('paper') || '').trim().slice(0, 120);
    if (paper) $('paperVersion').value = paper;
    loadJobs(true);
    if (idOf(params.get('job'))) selectJob(params.get('job'));
    if (typeof window.setInterval === 'function') window.setInterval(() => {
      if (document.hidden || !state.jobId || !['QUEUED', 'RUNNING'].includes(state.job?.status)) return;
      loadJobDetail();
    }, 5000);
  });
})();
