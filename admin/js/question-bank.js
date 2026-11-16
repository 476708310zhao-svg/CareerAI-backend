/* global initPage, canAccess, getToken, logout */
'use strict';

(() => {
  const base = '/admin/api/v4/question-bank';
  const parsingBase = '/admin/api/v4/question-parsing';
  const publicationBase = '/admin/api/v4/question-practice';
  const $ = id => document.getElementById(id);
  const labels = { single: '单选', multiple: '多选', boolean: '判断', original: '原创', pdf: 'PDF 来源', pending: '待审', approved: '已通过', rejected: '已驳回', revoked: '已撤销', draft: '草稿', ready: '内部 ready' };
  const rightsLabels = { stemDisplay: '题干展示', answerDisplay: '答案解析展示', imageDisplay: '图片展示', commercialUse: '商业使用', adaptation: '改编' };
  const errorLabels = {
    REVISION_VERSION_CONFLICT: '题目已有更新修订，请核对刷新后的详情，再保存新的修订。',
    CONTENT_REVIEW_VERSION_CONFLICT: '已有更新的内容审核，请核对刷新后的记录再提交。',
    SET_VERSION_CONFLICT: '题集版本已变化，请核对刷新后的固定顺序再修改。',
    CLIENT_KEY_CONFLICT: '同一提交编号对应的内容已变化，请核对表单后重新提交。',
    SELF_REVIEW_DENIED: '不能审核自己提交的内容，请由另一位有审核权限的管理员处理。',
    CONTENT_NOT_APPROVED: '题集中有修订尚未通过内容审核。',
    QUESTION_RIGHTS_DENIED: '题集中有修订缺少覆盖本次用途的有效权利声明。',
    SOURCE_USE_DENIED: 'PDF 来源尚未满足本次展示、处理或商业使用的授权要求。',
    MEDIA_DELIVERY_UNAVAILABLE: '图片目前无法安全交付，含图片修订不能发布。',
    SOURCE_NOT_VALIDATED: 'PDF 来源尚未通过深度校验和病毒扫描。',
    EMPTY_SET: '请先为题集添加修订。',
    DUPLICATE_LOGICAL_QUESTION: '同一逻辑题不能在一个题集中重复出现。',
    SET_ALREADY_READY: '该题集已经进入内部 ready，不能再修改。',
    CLAIM_ALREADY_DECIDED: '权利声明已由其他审核员处理，请刷新详情。',
    QUESTION_UNAVAILABLE: '题集尚未满足免费网页公开条件：请核对内部 ready、完整全球商业授权及当前有效期。',
    PUBLICATION_VERSION_CONFLICT: '公开状态已被其他管理员修改，已刷新最新状态。请核对后重新操作。'
  };
  const state = {
    questions: [], questionTotal: 0, questionCursor: null, questionListRequest: 0,
    questionId: null, questionSelection: 0, questionDetailRequest: 0, questionDetail: null, revisionId: null,
    sets: [], setTotal: 0, setCursor: null, setListRequest: 0,
    setId: null, setSelection: 0, setDetailRequest: 0, setDetail: null, setDraftItems: [], setDirty: false,
    publication: null, publicationRequest: 0, publicationSaving: false, publicationLoadError: false,
    drafts: new Map(), editorMediaBlocked: false, editorConflict: false
  };
  const idOf = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const text = (tag, value, className) => { const node = document.createElement(tag); if (value !== undefined) node.textContent = String(value); if (className) node.className = className; return node; };
  const append = (parent, ...nodes) => { parent.append(...nodes); return parent; };
  const date = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—';
  function show(id, value, focus = false) { const node = $(id); node.textContent = value || ''; node.hidden = !value; if (value && focus && node.focus) node.focus(); }
  function randomKey() { return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function draft(name, signature) {
    const old = state.drafts.get(name);
    if (old && old.signature === signature) return old.key;
    const key = randomKey(); state.drafts.set(name, { signature, key }); return key;
  }
  function clearDraft(name) { state.drafts.delete(name); }
  function errorMessage(error) { return errorLabels[error.message] || error.message || '请求失败，请重试。'; }
  function isConflict(error) { return error.status === 409; }
  async function request(path, options = {}) {
    let response;
    try { response = await fetch(window.ADMIN_API + (options.base || base) + path, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${getToken()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    }); } catch (_) { throw new Error('网络连接异常，请检查连接后重试。'); }
    if (response.status === 401) { logout(); throw new Error('登录已失效'); }
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error(`服务器响应异常（HTTP ${response.status}）`); }
    if (!response.ok || !payload || payload.code !== 0) { const error = new Error(payload && payload.message || `请求失败（HTTP ${response.status}）`); error.status = response.status; throw error; }
    return payload.data || {};
  }
  function button(label, callback, className = 'btn btn-outline btn-sm') { const node = text('button', label, className); node.type = 'button'; node.addEventListener('click', callback); return node; }
  function badge(value) { return text('span', labels[value] || value || '待核查', `qb-badge ${value || ''}`); }
  function empty(target, label) { $(target).replaceChildren(text('p', label, 'qb-empty')); }
  function setTab(tab) {
    const sets = tab === 'sets'; $('questionsTab').setAttribute('aria-selected', String(!sets)); $('setsTab').setAttribute('aria-selected', String(sets));
    $('questionsArea').hidden = sets; $('setsArea').hidden = !sets;
  }
  function questionCard(question) {
    const card = text('button', undefined, 'qb-list-button'); card.type = 'button'; card.setAttribute('aria-pressed', String(question.id === state.questionId));
    const revision = question.latestRevision || question.revision || {};
    append(card, text('strong', revision.content && revision.content.stem || `题目 #${question.id}`), text('small', `#${question.id} · 最新修订 #${question.latestRevisionId || '—'} · ${question.revisionCount || 0} 版`));
    card.addEventListener('click', () => selectQuestion(question.id)); return card;
  }
  function renderQuestions() {
    const cards = state.questions.map(questionCard); if (state.questionDetail && !state.questions.some(item => item.id === state.questionId)) cards.unshift(questionCard(state.questionDetail.question));
    $('questionList').replaceChildren(...(cards.length ? cards : [text('p', '暂无人工录入题目。', 'qb-empty')])); $('moreQuestions').hidden = state.questionCursor == null;
  }
  async function loadQuestions(reset = true) {
    const token = ++state.questionListRequest, cursor = reset ? 0 : state.questionCursor; if (cursor == null) return;
    $('refreshQuestions').disabled = true; $('moreQuestions').disabled = true; show('questionListError', ''); if (reset) empty('questionList', '正在加载题目…');
    try { const data = await request(`/questions?${new URLSearchParams({ cursor, limit: 30 })}`); if (token !== state.questionListRequest) return;
      state.questions = reset ? data.questions || [] : [...state.questions, ...(data.questions || []).filter(item => !state.questions.some(old => old.id === item.id))];
      state.questionTotal = Number(data.total || 0); state.questionCursor = data.nextCursor; renderQuestions();
    } catch (error) { if (token === state.questionListRequest) show('questionListError', errorMessage(error)); }
    finally { if (token === state.questionListRequest) { $('refreshQuestions').disabled = false; $('moreQuestions').disabled = false; } }
  }
  function renderOptions(count) {
    const type = $('questionType').value, old = [...$('optionsList').children].map(row => ({ text: row.querySelector('input[type="text"]').value, checked: row.querySelector('input[type="radio"],input[type="checkbox"]').checked }));
    $('optionsField').hidden = type === 'boolean'; $('booleanField').hidden = type !== 'boolean';
    if (type === 'boolean') return;
    const size = Math.max(2, Math.min(8, count || old.length || 4));
    const rows = 'ABCDEFGH'.slice(0, size).split('').map((id, index) => {
      const row = text('div', undefined, 'qb-option'); const label = text('label', id); label.setAttribute('for', `option${id}`);
      const input = document.createElement('input'); input.type = 'text'; input.id = `option${id}`; input.maxLength = 2000; input.value = old[index] && old[index].text || '';
      const answer = document.createElement('input'); answer.type = type === 'single' ? 'radio' : 'checkbox'; answer.name = 'answer'; answer.value = id; answer.checked = Boolean(old[index] && old[index].checked);
      answer.setAttribute('aria-label', `${id} 为正确答案`); append(row, label, input, answer); return row;
    }); $('optionsList').replaceChildren(...rows); $('addOption').disabled = size >= 8; $('removeOption').disabled = size <= 2;
  }
  function setSourceFields() { const pdf = $('sourceKind').value === 'pdf'; $('pdfFields').hidden = !pdf; $('originalFields').hidden = pdf; }
  function setMediaFields() { $('mediaFields').hidden = !$('hasMedia').checked; }
  function resetEditor() {
    state.questionId = null; state.questionDetail = null; state.revisionId = null; ++state.questionSelection; ++state.questionDetailRequest;
    state.editorMediaBlocked = false; state.editorConflict = false; $('saveQuestion').disabled = false; $('questionForm').reset(); $('questionType').value = 'single'; $('sourceKind').value = 'original'; $('optionsList').replaceChildren(); renderOptions(); setSourceFields(); setMediaFields();
    $('editorHeading').textContent = '录入新题'; $('editorHelp').textContent = '保存后生成不可变修订；再编辑会生成新的修订。'; $('saveQuestion').textContent = '保存新题';
    $('questionDetailPanel').hidden = true; show('questionError', ''); show('questionDetailError', ''); show('draftImportNote', ''); renderQuestions();
  }
  function fillEditor(revision) {
    show('draftImportNote', '');
    const content = revision.content || {}, provenance = revision.provenance || {}, media = Array.isArray(revision.media) ? revision.media : [];
    $('questionType').value = content.type || 'single'; $('optionsList').replaceChildren(); renderOptions(content.options && content.options.length);
    $('stem').value = content.stem || ''; $('explanation').value = content.explanation || '';
    if (content.type === 'boolean') $('booleanAnswer').value = String(content.answer === true || content.answer && content.answer[0] === true);
    else for (const [index, row] of [...$('optionsList').children].entries()) { row.querySelector('input[type="text"]').value = content.options && content.options[index] && content.options[index].text || ''; row.querySelector('input[type="radio"],input[type="checkbox"]').checked = Array.isArray(content.answer) && content.answer.includes('ABCDEFGH'[index]); }
    $('sourceKind').value = provenance.kind || 'original'; setSourceFields(); $('authorName').value = provenance.authorName || ''; $('ownershipEvidence').value = provenance.ownershipEvidence || '';
    $('sourceId').value = provenance.sourceId || ''; $('sourceEvidence').value = provenance.evidenceReference || '';
    $('hasMedia').checked = media.length > 0; setMediaFields(); $('mediaSourceId').value = media[0] && media[0].sourceId || ''; $('mediaPage').value = media[0] && media[0].pageNumber || ''; $('mediaLocator').value = media[0] && media[0].locator || '';
    state.editorConflict = false; state.editorMediaBlocked = media.length > 1; $('saveQuestion').disabled = state.editorMediaBlocked;
    show('questionError', state.editorMediaBlocked ? '此修订有多条图片定位。本页暂不支持完整编辑，已禁用保存以免丢失其他定位。' : '');
    $('editorHeading').textContent = `编辑题目 #${revision.questionId}`; $('editorHelp').textContent = `基于修订 #${revision.id} 保存新修订；已有审核不会自动继承。`;
    $('saveQuestion').textContent = '保存为新修订';
  }
  async function importSavedDraft(draftId) {
    if (!canAccess('questionAssets') || !canAccess('questionBankEdit')) return;
    resetEditor();
    const selection = state.questionSelection;
    show('draftImportNote', `正在读取已保存草稿 #${draftId}…`);
    try {
      const data = await request(`/drafts/${draftId}`, { base: parsingBase });
      const item = data.draft;
      if (!item || item.id !== draftId || !idOf(item.jobId)) throw new Error('草稿数据不完整，请返回识题页核对。');
      if (!['single', 'multiple'].includes(item.type)) throw new Error('此题型暂不能自动填入，请在题库手动录入。');
      if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 8 ||
          !Array.isArray(item.answerOptionIds)) throw new Error('草稿选项或答案不完整，请返回识题页修订。');
      const jobData = await request(`/jobs/${item.jobId}`, { base: parsingBase });
      const sourceId = idOf(jobData.job && jobData.job.sourceId);
      if (!sourceId) throw new Error('无法核对 PDF 来源，请返回识题页。');
      if (selection !== state.questionSelection) return;
      $('questionType').value = item.type;
      $('optionsList').replaceChildren(); renderOptions(item.options.length);
      $('stem').value = item.stem || ''; $('explanation').value = item.explanation || '';
      const answers = new Set(item.answerOptionIds);
      for (const [index, row] of [...$('optionsList').children].entries()) {
        const sourceOption = item.options[index];
        row.querySelector('input[type="text"]').value = sourceOption && sourceOption.text || '';
        row.querySelector('input[type="radio"],input[type="checkbox"]').checked = Boolean(sourceOption && answers.has(sourceOption.id));
      }
      $('sourceKind').value = 'pdf'; setSourceFields(); $('sourceId').value = String(sourceId);
      $('sourceEvidence').value = `OCR 草稿 #${draftId}，PDF 第 ${item.pageNumber || '？'} 页`;
      $('editorHeading').textContent = `核对草稿 #${draftId} 并录入题库`;
      $('editorHelp').textContent = '请核对题干、选项、答案、解析和来源定位，再保存为题库草稿。';
      show('draftImportNote', `已带入已保存的 PDF 草稿 #${draftId}。${item.answerStatus === 'VERIFIED' ? '' : 'OCR 答案尚未核实，请对照原页确认。'}保存后仍需独立内容与权利审核，不能直接发布。`);
      if ($('questionEditorPanel').scrollIntoView) $('questionEditorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (selection === state.questionSelection) show('draftImportNote', errorMessage(error));
    }
  }
  function latestRevision() { return state.questionDetail && state.questionDetail.revisions && state.questionDetail.revisions[0]; }
  function activeRevision() { return state.questionDetail && (state.questionDetail.revisions || []).find(item => item.id === state.revisionId); }
  function renderQuestionDetail() {
    const data = state.questionDetail; if (!data) return; const revisions = data.revisions || [], selected = activeRevision();
    $('questionDetailPanel').hidden = false; $('detailHeading').textContent = `题目 #${data.question.id}`; $('detailMeta').textContent = `${revisions.length} 条修订 · 最新修订 #${data.question.latestRevisionId || '—'}`;
    const summary = [text('strong', '修订不会覆盖旧版本'), text('p', '题集固定修订 ID。选中修订可查看完整题干、答案及独立审核记录；答案仅在本管理员页显示。')]; $('questionSummary').replaceChildren(...summary);
    const cards = revisions.map(revision => { const card = text('div', undefined, `qb-card${revision.id === state.revisionId ? ' selected' : ''}`);
      const head = append(text('div', undefined, 'qb-card-head'), text('strong', `修订 #${revision.id} · 第 ${revision.revisionNo} 版`), badge(revision.contentReviewStatus)); append(card, head,
        text('p', `${labels[revision.content && revision.content.type] || '题型待核查'} · ${labels[revision.provenance && revision.provenance.kind] || '来源待核查'} · ${date(revision.createdAt)}`),
        text('p', revision.content && revision.content.stem || '题干为空'), text('small', `权利：${labels[revision.rightsStatus] || revision.rightsStatus || '待核查'}${Array.isArray(revision.media) && revision.media.length ? ' · 含图片，不可发布' : ''}`),
        button('查看此修订与审核', () => { state.revisionId = revision.id; renderQuestionDetail(); })); return card; });
    $('revisionList').replaceChildren(...(cards.length ? cards : [text('p', '暂无修订。', 'qb-empty')]));
    $('reviewArea').hidden = !selected; if (selected) renderRevision(selected);
  }
  function renderRevision(revision) {
    $('saveContentReview').disabled = false; $('saveClaim').disabled = false;
    const content = revision.content || {}, optionText = (content.options || []).map(option => `${option.id}. ${option.text}`);
    const answer = content.type === 'boolean' ? (content.answer === true || content.answer && content.answer[0] === true ? '正确' : '错误') : (content.answer || []).join('、');
    const facts = [text('strong', `当前查看修订 #${revision.id}`), text('p', `题干：${content.stem || '—'}`), ...optionText.map(value => text('p', value)), text('p', `正确答案：${answer || '—'}`), text('p', `解析：${content.explanation || '—'}`), text('p', `来源：${labels[revision.provenance && revision.provenance.kind] || '—'} · ${revision.provenance && (revision.provenance.ownershipEvidence || revision.provenance.evidenceReference) || '—'}`)];
    if (Array.isArray(revision.media) && revision.media.length) {
      facts.push(text('p', '图片仅记录内部定位元数据；当前不能发布，也不展示图片或 PDF 预览。'));
      for (const item of revision.media) facts.push(text('p', `图片定位：来源 #${item.sourceId || '—'} · 第 ${item.pageNumber || '—'} 页 · ${item.locator || '—'}`));
    }
    $('questionSummary').replaceChildren(...facts);
    const reviews = revision.contentReviews || []; $('contentReviewHistory').replaceChildren(...(reviews.length ? reviews.map(review => append(text('div', undefined, 'qb-card'), append(text('div', undefined, 'qb-card-head'), text('strong', `审核 #${review.id} · ${review.reviewer || '—'}`), badge(review.decision)), text('p', `${review.reason || '—'} · ${date(review.createdAt)}`))) : [text('p', '暂无内容审核记录。', 'qb-empty')]));
    $('contentReviewForm').hidden = !canAccess('questionContentReview');
    const claims = revision.rightsClaims || []; $('rightsClaimList').replaceChildren(...(claims.length ? claims.map(renderClaim) : [text('p', '暂无修订权利声明。', 'qb-empty')]));
    $('claimForm').hidden = !canAccess('questionBankEdit');
  }
  function renderClaim(claim) {
    const card = text('div', undefined, 'qb-card'); const chosen = Object.entries(rightsLabels).filter(([key]) => claim.rights && claim.rights[key]).map(([, label]) => label);
    append(card, append(text('div', undefined, 'qb-card-head'), text('strong', `声明 #${claim.id} · ${claim.submittedBy || '—'}`), badge(claim.status)), text('p', `证据：${claim.evidenceReference || '—'}`), text('p', `用途：${chosen.join('、') || '无'} · 地域：${(claim.territories || []).join('、') || '—'}`), text('p', `有效期：${claim.validFrom || '—'} 至 ${claim.validUntil || '—'}`));
    if (claim.decisionReason) card.append(text('p', `审核说明：${claim.decisionReason}`));
    if (canAccess('questionRightsReview') && (claim.status === 'pending' || claim.status === 'approved')) {
      const form = text('div', undefined, 'qb-form'); const label = text('label', '审核/撤销说明 *'); const reason = document.createElement('textarea'); reason.rows = 2; reason.maxLength = 500; label.append(reason);
      const actions = text('div', undefined, 'qb-inline-actions');
      if (claim.status === 'pending') { actions.append(button('批准', () => decideClaim(claim, 'approved', reason.value.trim(), actions), 'btn btn-primary btn-sm'), button('驳回', () => decideClaim(claim, 'rejected', reason.value.trim(), actions))); }
      else actions.append(button('撤销权利', () => decideClaim(claim, 'revoke', reason.value.trim(), actions)));
      append(form, label, actions); card.append(form);
    }
    return card;
  }
  async function selectQuestion(id) {
    id = idOf(id); if (!id) return; state.questionId = id; const selection = ++state.questionSelection; show('actionNotice', ''); $('saveQuestion').disabled = false; $('saveContentReview').disabled = false; $('saveClaim').disabled = false;
    renderQuestions(); $('questionDetailPanel').hidden = false; empty('revisionList', '正在加载题目详情…'); show('questionDetailError', '');
    await loadQuestionDetail(id, selection, true);
  }
  async function loadQuestionDetail(id = state.questionId, selection = state.questionSelection, fill = false) {
    if (!id) return; const requestId = ++state.questionDetailRequest; $('refreshQuestionDetail').disabled = true;
    try { const data = await request(`/questions/${id}`); if (selection !== state.questionSelection || requestId !== state.questionDetailRequest || id !== state.questionId) return;
      state.questionDetail = data; state.revisionId = fill || !data.revisions.some(item => item.id === state.revisionId) ? data.question.latestRevisionId : state.revisionId;
      renderQuestionDetail(); if (fill && latestRevision() && canAccess('questionBankEdit')) fillEditor(latestRevision()); renderQuestions();
    } catch (error) { if (selection === state.questionSelection && requestId === state.questionDetailRequest) show('questionDetailError', errorMessage(error)); }
    finally { if (selection === state.questionSelection && requestId === state.questionDetailRequest) $('refreshQuestionDetail').disabled = false; }
  }
  function questionPayload() {
    const type = $('questionType').value, stem = $('stem').value.trim(), explanation = $('explanation').value.trim();
    if (!stem || !explanation) throw new Error('请填写题干和解析。');
    let content;
    if (type === 'boolean') content = { type, stem, answer: $('booleanAnswer').value === 'true', explanation };
    else { const rows = [...$('optionsList').children], options = rows.map((row, index) => ({ id: 'ABCDEFGH'[index], text: row.querySelector('input[type="text"]').value.trim() }));
      const answer = rows.filter(row => row.querySelector('input[type="radio"],input[type="checkbox"]').checked).map(row => row.querySelector('input[type="radio"],input[type="checkbox"]').value);
      if (options.some(item => !item.text)) throw new Error('请填写全部选项。'); if ((type === 'single' && answer.length !== 1) || (type === 'multiple' && answer.length < 2)) throw new Error(type === 'single' ? '单选题必须选择一个正确答案。' : '多选题至少选择两个正确答案。');
      content = { type, stem, options, answer, explanation };
    }
    const provenance = $('sourceKind').value === 'pdf' ? { kind: 'pdf', sourceId: idOf($('sourceId').value), evidenceReference: $('sourceEvidence').value.trim() } : { kind: 'original', authorName: $('authorName').value.trim(), ownershipEvidence: $('ownershipEvidence').value.trim() };
    if (provenance.kind === 'pdf' && (!provenance.sourceId || !provenance.evidenceReference)) throw new Error('请填写 PDF 来源记录 ID 与题目定位/改编证据。');
    if (provenance.kind === 'original' && (!provenance.authorName || !provenance.ownershipEvidence)) throw new Error('请填写原创作者与归属证据。');
    const media = []; if ($('hasMedia').checked) { const sourceId = idOf($('mediaSourceId').value), pageNumber = idOf($('mediaPage').value), locator = $('mediaLocator').value.trim(); if (!sourceId || !pageNumber || !locator) throw new Error('请填写图片来源、页码与页内定位。'); media.push({ kind: 'image', sourceId, pageNumber, locator }); }
    return { content, provenance, media };
  }
  async function saveQuestion(event) {
    event.preventDefault(); if (!canAccess('questionBankEdit')) return; if (state.editorMediaBlocked) return show('questionError', '此修订有多条图片定位，请勿用单条定位表单覆盖。', true);
    if (state.editorConflict) return show('questionError', '已有更新修订。请重新选择题目，载入最新版本后再编辑。', true);
    let payload; try { payload = questionPayload(); } catch (error) { return show('questionError', error.message, true); }
    const id = state.questionId, selection = state.questionSelection, expectedRevisionId = id && state.questionDetail && state.questionDetail.question.latestRevisionId;
    if (id && !expectedRevisionId) return show('questionError', '请刷新题目详情后再保存修订。', true);
    const key = draft('question', JSON.stringify([id, expectedRevisionId, payload])); $('saveQuestion').disabled = true; show('questionError', ''); $('questionSaving').textContent = '正在保存…';
    try { const data = await request(id ? `/questions/${id}/revisions` : '/questions', { method: 'POST', body: { clientKey: key, ...(id ? { expectedRevisionId } : {}), ...payload } });
      if (selection !== state.questionSelection) return; clearDraft('question'); $('questionSaving').textContent = '已保存为不可变修订。';
      await loadQuestions(true); if (selection === state.questionSelection) selectQuestion(data.question.id);
    } catch (error) { if (selection !== state.questionSelection) return; $('questionSaving').textContent = ''; if (isConflict(error)) { clearDraft('question'); if (id) await loadQuestionDetail(id, selection, false); if (selection === state.questionSelection) { state.editorConflict = error.message === 'REVISION_VERSION_CONFLICT'; show('questionError', state.editorConflict ? '题目已有更新修订，详情已刷新。请重新选择题目以载入最新修订，再编辑保存。' : errorMessage(error), true); } } else show('questionError', errorMessage(error), true); }
    finally { if (selection === state.questionSelection) $('saveQuestion').disabled = state.editorMediaBlocked || state.editorConflict; }
  }
  async function submitContentReview(event) {
    event.preventDefault(); const revision = activeRevision(), questionId = state.questionId, selection = state.questionSelection; if (!revision) return;
    const reason = $('contentReason').value.trim(), decision = $('contentDecision').value; if (!reason) return show('contentReviewError', '请填写审核说明。', true);
    const latest = revision.contentReviews && revision.contentReviews[0]; const expectedLatestReviewId = latest ? latest.id : null;
    const payload = { decision, reason, expectedLatestReviewId }; const key = draft(`review-${revision.id}`, JSON.stringify(payload)); $('saveContentReview').disabled = true; show('contentReviewError', '');
    try { await request(`/revisions/${revision.id}/content-reviews`, { method: 'POST', body: { clientKey: key, ...payload } }); if (selection !== state.questionSelection || questionId !== state.questionId || state.revisionId !== revision.id) return;
      clearDraft(`review-${revision.id}`); $('contentReviewForm').reset(); await loadQuestionDetail(questionId, selection); if (selection === state.questionSelection && state.revisionId === revision.id) show('actionNotice', '内容审核已记录。');
    } catch (error) { if (selection !== state.questionSelection || state.revisionId !== revision.id) return; if (isConflict(error)) { clearDraft(`review-${revision.id}`); await loadQuestionDetail(questionId, selection); if (selection === state.questionSelection && state.revisionId === revision.id) show('contentReviewError', '已有更新的审核记录。请核对后重新提交。', true); } else show('contentReviewError', errorMessage(error), true); }
    finally { if (selection === state.questionSelection) $('saveContentReview').disabled = false; }
  }
  async function submitClaim(event) {
    event.preventDefault(); const revision = activeRevision(), questionId = state.questionId, selection = state.questionSelection; if (!revision) return;
    const rights = Object.fromEntries(Object.keys(rightsLabels).map(key => [key, false])); for (const input of $('claimForm').querySelectorAll('input[name="right"]')) rights[input.value] = input.checked;
    const payload = { evidenceReference: $('claimEvidence').value.trim(), rights, territories: [$('claimTerritory').value], validFrom: $('claimFrom').value, validUntil: $('claimUntil').value };
    if (!payload.evidenceReference || !payload.validFrom || !payload.validUntil) return show('claimError', '请填写授权证据及起止日期。', true);
    if (payload.validUntil < payload.validFrom) return show('claimError', '截止日期不能早于开始日期。', true);
    if (!Object.values(rights).some(Boolean)) return show('claimError', '请至少选择一项有证据支持的用途。', true);
    const key = draft(`claim-${revision.id}`, JSON.stringify(payload)); $('saveClaim').disabled = true; show('claimError', '');
    try { await request(`/revisions/${revision.id}/rights-claims`, { method: 'POST', body: { clientKey: key, ...payload } }); if (selection !== state.questionSelection || questionId !== state.questionId || state.revisionId !== revision.id) return;
      clearDraft(`claim-${revision.id}`); $('claimForm').reset(); await loadQuestionDetail(questionId, selection); if (selection === state.questionSelection && state.revisionId === revision.id) show('actionNotice', '权利声明已提交，等待独立审核。');
    } catch (error) { if (selection === state.questionSelection && state.revisionId === revision.id) { if (isConflict(error)) clearDraft(`claim-${revision.id}`); show('claimError', errorMessage(error), true); } }
    finally { if (selection === state.questionSelection) $('saveClaim').disabled = false; }
  }
  async function decideClaim(claim, decision, reason, controls) {
    if (!reason) return show('questionDetailError', '请填写审核或撤销说明。', true);
    if (!window.confirm(decision === 'revoke' ? '撤销此项已批准权利？' : decision === 'approved' ? '批准此项权利声明？' : '驳回此项权利声明？')) return;
    const questionId = state.questionId, selection = state.questionSelection, revisionId = state.revisionId; for (const item of controls.children) item.disabled = true;
    try { await request(`/rights-claims/${claim.id}/${decision === 'revoke' ? 'revoke' : 'decision'}`, { method: 'POST', body: decision === 'revoke' ? { reason } : { decision, reason } });
      if (selection !== state.questionSelection || revisionId !== state.revisionId) return; await loadQuestionDetail(questionId, selection); if (selection === state.questionSelection && revisionId === state.revisionId) show('actionNotice', '权利审核已记录。');
    } catch (error) { if (selection === state.questionSelection && revisionId === state.revisionId) { if (isConflict(error)) await loadQuestionDetail(questionId, selection); if (selection === state.questionSelection && revisionId === state.revisionId) show('questionDetailError', errorMessage(error), true); } }
    finally { for (const item of controls.children) item.disabled = false; }
  }
  function setCard(item) { const card = text('button', undefined, 'qb-list-button'); card.type = 'button'; card.setAttribute('aria-pressed', String(item.id === state.setId)); append(card, text('strong', item.title || `题集 #${item.id}`), text('small', `#${item.id} · ${labels[item.status] || item.status || '草稿'} · 版本 ${item.version || 1}`)); card.addEventListener('click', () => selectSet(item.id)); return card; }
  function renderSets() { const cards = state.sets.map(setCard); if (state.setDetail && !state.sets.some(item => item.id === state.setId)) cards.unshift(setCard(state.setDetail.set)); $('setList').replaceChildren(...(cards.length ? cards : [text('p', '暂无题集。', 'qb-empty')])); $('moreSets').hidden = state.setCursor == null; }
  async function loadSets(reset = true) {
    const token = ++state.setListRequest, cursor = reset ? 0 : state.setCursor; if (cursor == null) return; $('refreshSets').disabled = true; $('moreSets').disabled = true; show('setListError', ''); if (reset) empty('setList', '正在加载题集…');
    try { const data = await request(`/sets?${new URLSearchParams({ cursor, limit: 30 })}`); if (token !== state.setListRequest) return; state.sets = reset ? data.sets || [] : [...state.sets, ...(data.sets || []).filter(item => !state.sets.some(old => old.id === item.id))]; state.setTotal = Number(data.total || 0); state.setCursor = data.nextCursor; renderSets(); }
    catch (error) { if (token === state.setListRequest) show('setListError', errorMessage(error)); }
    finally { if (token === state.setListRequest) { $('refreshSets').disabled = false; $('moreSets').disabled = false; } }
  }
  async function selectSet(id) { id = idOf(id); if (!id) return; state.setId = id; const selection = ++state.setSelection; state.setDirty = false; state.publication = null; state.publicationSaving = false; state.publicationLoadError = false; ++state.publicationRequest; $('freeWebSection').hidden = true; show('freeWebError', ''); show('actionNotice', ''); renderSets(); $('setDetailPanel').hidden = false; empty('setItems', '正在加载题集…'); show('setDetailError', ''); await loadSetDetail(id, selection); }
  async function loadSetDetail(id = state.setId, selection = state.setSelection) {
    if (!id) return; const token = ++state.setDetailRequest; $('refreshSetDetail').disabled = true;
    try { const data = await request(`/sets/${id}`); if (selection !== state.setSelection || token !== state.setDetailRequest || id !== state.setId) return;
      state.setDetail = data; state.setDraftItems = (data.items || []).map(item => item.revisionId); state.setDirty = false; state.publication = null; state.publicationLoadError = false; renderSetDetail(); renderSets(); await loadPublication(id, selection);
    } catch (error) { if (selection === state.setSelection && token === state.setDetailRequest) show('setDetailError', errorMessage(error)); }
    finally { if (selection === state.setSelection && token === state.setDetailRequest) $('refreshSetDetail').disabled = false; }
  }
  function renderSetDetail() {
    const data = state.setDetail; if (!data) return; const set = data.set;
    $('setDetailPanel').hidden = false; $('setHeading').textContent = set.title || `题集 #${set.id}`; $('setMeta').textContent = `#${set.id} · ${labels[set.status] || set.status} · 版本 ${set.version}`;
    $('setSummary').replaceChildren(text('strong', `当前状态：${labels[set.status] || set.status}`), text('p', `固定修订 ${state.setDraftItems.length} 条 · 服务端版本 ${set.version}`), text('p', set.status === 'ready' ? '已标记为内部 ready。后续权利撤销或到期仍需由服务端实时拦截使用。' : '尚未内部发布。'));
    $('setEditSection').hidden = !canAccess('questionBankEdit') || set.status !== 'draft'; $('setPublishSection').hidden = !canAccess('questionBankPublish') || set.status !== 'draft'; $('publishSet').disabled = false;
    $('freeWebSection').hidden = !canAccess('questionBankPublish') || set.status !== 'ready'; renderPublication();
    const cards = state.setDraftItems.map((revisionId, index) => { const item = (data.items || []).find(row => row.revisionId === revisionId), card = text('div', undefined, 'qb-card');
      append(card, text('strong', `${index + 1}. 修订 #${revisionId}${item ? ` · 题目 #${item.questionId}` : ' · 尚未保存'}`), text('p', item && item.stem || '保存后由服务端校验修订与题目状态。'));
      if (set.status === 'draft' && canAccess('questionBankEdit')) { const actions = text('div', undefined, 'qb-inline-actions');
        append(actions, button('上移', () => moveItem(index, -1)), button('下移', () => moveItem(index, 1)), button('移除', () => { state.setDraftItems.splice(index, 1); state.setDirty = true; renderSetDetail(); }));
        actions.children[0].disabled = index === 0; actions.children[1].disabled = index === state.setDraftItems.length - 1; card.append(actions); }
      return card; }); $('setItems').replaceChildren(...(cards.length ? cards : [text('p', '题集尚无条目。', 'qb-empty')])); $('saveSetItems').disabled = !state.setDirty;
  }
  function renderPublication() {
    const publication = state.publication, ready = state.setDetail?.set?.status === 'ready';
    if (!ready || !canAccess('questionBankPublish')) return;
    const commercialReady = state.setDetail.set.publishCommercial === true;
    $('freeWebStatus').textContent = publication ? publication.enabled ? publication.effectiveAvailable ? '已开放免费网页（当前授权有效）' : '已设置开放，但当前授权不可用，网页已隐藏' : '未开放免费网页' : state.publicationLoadError ? '公开状态读取失败' : '正在读取公开状态…';
    const availability = !commercialReady ? ' · 该内部题集未按商业使用发布，不能开放免费网页；请另建符合商业授权的题集' : publication?.enabled && !publication.effectiveAvailable ? ' · 请核对授权撤销、到期或来源状态' : '';
    $('freeWebAudit').textContent = publication ? `版本 ${publication.version} · ${publication.changedBy ? `最近操作：${publication.changedBy} · ${date(publication.changedAt)}` : '尚无公开记录'}${availability}` : '';
    $('toggleFreeWeb').textContent = publication ? publication.enabled ? '撤下免费网页' : '开放免费网页' : '读取中…';
    $('toggleFreeWeb').disabled = !publication || state.publicationSaving || (!commercialReady && !publication.enabled);
  }
  async function loadPublication(id = state.setId, selection = state.setSelection) {
    if (!id || !canAccess('questionBankPublish') || state.setDetail?.set?.status !== 'ready') return;
    const token = ++state.publicationRequest; state.publication = null; state.publicationLoadError = false; renderPublication(); show('freeWebError', '');
    try {
      const data = await request(`/sets/${id}/publication`, { base: publicationBase });
      if (selection !== state.setSelection || id !== state.setId || token !== state.publicationRequest) return;
      if (!data.publication || data.publication.setId !== id || typeof data.publication.enabled !== 'boolean' || !Number.isSafeInteger(data.publication.version)) throw new Error('服务器未返回有效的公开状态');
      state.publication = data.publication; state.publicationLoadError = false; renderPublication();
    } catch (error) {
      if (selection !== state.setSelection || id !== state.setId || token !== state.publicationRequest) return;
      state.publicationLoadError = true; renderPublication(); show('freeWebError', `${errorMessage(error)} 请刷新题集详情后重试。`, true);
    }
  }
  async function toggleFreeWeb() {
    const publication = state.publication, set = state.setDetail?.set;
    if (!publication || !set || set.status !== 'ready' || !canAccess('questionBankPublish') || state.publicationSaving || (set.publishCommercial !== true && !publication.enabled)) return;
    const id = state.setId, selection = state.setSelection, enabled = !publication.enabled, expectedVersion = publication.version;
    const question = enabled ? `确认将“${set.title || `题集 #${id}`}”开放到免费网页？公开前必须具备完整全球商业授权。` : `确认从免费网页撤下“${set.title || `题集 #${id}`}”？撤下后学生无法继续读取题目内容。`;
    if (!window.confirm(question)) return;
    const payload = { enabled, expectedVersion }, key = draft(`publication-${id}`, JSON.stringify(payload));
    state.publicationSaving = true; $('toggleFreeWeb').disabled = true; show('freeWebError', '');
    try {
      await request(`/sets/${id}/publication`, { base: publicationBase, method: 'PUT', body: { clientKey: key, ...payload } });
      if (selection !== state.setSelection || id !== state.setId) return;
      clearDraft(`publication-${id}`); await loadPublication(id, selection);
      if (selection !== state.setSelection || id !== state.setId) return;
      if (!state.publication) show('freeWebError', '操作已提交，但无法读取最新公开状态。请刷新题集详情核对。', true);
      else if (state.publication.enabled === enabled) show('actionNotice', enabled ? state.publication.effectiveAvailable ? '题集已开放免费网页，访问时仍会实时核验授权。' : '公开开关已保存，但当前授权不可用，网页会隐藏该题集。' : '题集已从免费网页撤下。');
      else show('freeWebError', '公开状态已变化，请核对当前状态后重新操作。', true);
    } catch (error) {
      if (selection !== state.setSelection || id !== state.setId) return;
      if (isConflict(error)) { clearDraft(`publication-${id}`); await loadPublication(id, selection); }
      if (selection === state.setSelection && id === state.setId) show('freeWebError', errorMessage(error), true);
    } finally { if (selection === state.setSelection && id === state.setId) { state.publicationSaving = false; renderPublication(); } }
  }
  function moveItem(index, delta) { const next = index + delta; if (next < 0 || next >= state.setDraftItems.length) return; [state.setDraftItems[index], state.setDraftItems[next]] = [state.setDraftItems[next], state.setDraftItems[index]]; state.setDirty = true; renderSetDetail(); }
  async function createSet(event) {
    event.preventDefault(); const title = $('setTitle').value.trim(); if (!title) return show('createSetError', '请填写题集名称。', true);
    const key = draft('set-create', title); $('createSet').disabled = true; show('createSetError', '');
    try { const data = await request('/sets', { method: 'POST', body: { clientKey: key, title } }); clearDraft('set-create'); $('createSetForm').reset(); await loadSets(true); selectSet(data.set.id); show('actionNotice', '题集草稿已创建。'); }
    catch (error) { if (isConflict(error)) clearDraft('set-create'); show('createSetError', errorMessage(error), true); }
    finally { $('createSet').disabled = false; }
  }
  function addSetItem(event) {
    event.preventDefault();
    const tokens = $('addRevisionId').value.trim().split(/[\s,，、;；]+/).filter(Boolean);
    if (!tokens.length || tokens.length + state.setDraftItems.length > 500 ||
        tokens.some(token => !/^#?[1-9]\d*$/.test(token) || !idOf(token.replace(/^#/, ''))))
      return show('setItemsError', '请输入 1–500 个有效修订 ID，用空格、逗号或顿号分隔。', true);
    const ids = tokens.map(token => idOf(token.replace(/^#/, '')));
    if (new Set([...state.setDraftItems, ...ids]).size !== state.setDraftItems.length + ids.length)
      return show('setItemsError', '输入中有重复 ID，或修订已在题集中。', true);
    state.setDraftItems.push(...ids); state.setDirty = true; $('addRevisionId').value = '';
    show('setItemsError', ''); renderSetDetail();
  }
  async function saveSetItems() {
    if (!state.setDetail || !state.setDirty) return; const id = state.setId, selection = state.setSelection, expectedVersion = state.setDetail.set.version; const revisionIds = [...state.setDraftItems]; $('saveSetItems').disabled = true; show('setItemsError', '');
    try { await request(`/sets/${id}/items`, { method: 'PUT', body: { expectedVersion, revisionIds } }); if (selection !== state.setSelection || id !== state.setId) return; await loadSetDetail(id, selection); if (selection === state.setSelection && id === state.setId) { loadSets(true); show('actionNotice', '固定修订顺序已保存。'); } }
    catch (error) { if (selection !== state.setSelection || id !== state.setId) return; if (isConflict(error)) { await loadSetDetail(id, selection); if (selection === state.setSelection && id === state.setId) show('setItemsError', '题集版本已变化，已刷新服务端顺序。请核对后重新调整。', true); } else show('setItemsError', errorMessage(error), true); }
    finally { if (selection === state.setSelection) $('saveSetItems').disabled = !state.setDirty; }
  }
  async function publishSet(event) {
    event.preventDefault(); if (!state.setDetail) return; const id = state.setId, selection = state.setSelection; if (state.setDirty) return show('publishError', '请先保存题集顺序。', true);
    const payload = { expectedVersion: state.setDetail.set.version, territory: $('publishTerritory').value, commercial: $('publishCommercial').checked };
    if (!window.confirm($('publishCommercial').checked ? '检查并标记题集为内部 ready？该状态不会开放学生访问，免费网页还需另行开放并检查全球授权。' : '检查并标记题集为内部 ready？未勾选商业使用的题集以后无法开放免费网页，内部 ready 也不能修改；该状态不会开放学生访问。')) return;
    const key = draft(`publish-${id}`, JSON.stringify(payload)); $('publishSet').disabled = true; show('publishError', '');
    try { await request(`/sets/${id}/publish`, { method: 'POST', body: { clientKey: key, ...payload } }); if (selection !== state.setSelection || id !== state.setId) return; clearDraft(`publish-${id}`); await loadSetDetail(id, selection); if (selection === state.setSelection && id === state.setId) { loadSets(true); show('actionNotice', '题集已标记为内部 ready。'); } }
    catch (error) { if (selection !== state.setSelection || id !== state.setId) return; if (isConflict(error)) { clearDraft(`publish-${id}`); await loadSetDetail(id, selection); if (selection === state.setSelection && id === state.setId) show('publishError', '题集版本已变化，已刷新详情。请核对后重新发布。', true); } else show('publishError', errorMessage(error), true); }
    finally { if (selection === state.setSelection) $('publishSet').disabled = false; }
  }
  initPage('questionBank', '人工题库与题集', () => {
    $('questionsTab').addEventListener('click', () => setTab('questions')); $('setsTab').addEventListener('click', () => setTab('sets'));
    $('questionType').addEventListener('change', () => renderOptions()); $('addOption').addEventListener('click', () => renderOptions($('optionsList').children.length + 1)); $('removeOption').addEventListener('click', () => renderOptions($('optionsList').children.length - 1)); $('sourceKind').addEventListener('change', setSourceFields); $('hasMedia').addEventListener('change', setMediaFields);
    $('newQuestion').addEventListener('click', resetEditor); $('questionForm').addEventListener('submit', saveQuestion);
    $('refreshQuestions').addEventListener('click', () => loadQuestions(true)); $('moreQuestions').addEventListener('click', () => loadQuestions(false)); $('refreshQuestionDetail').addEventListener('click', () => loadQuestionDetail());
    $('contentReviewForm').addEventListener('submit', submitContentReview); $('claimForm').addEventListener('submit', submitClaim);
    $('refreshSets').addEventListener('click', () => loadSets(true)); $('moreSets').addEventListener('click', () => loadSets(false)); $('refreshSetDetail').addEventListener('click', () => { if (state.setDirty && !window.confirm('放弃未保存的题集顺序并刷新？')) return; loadSetDetail(); });
    $('createSetForm').addEventListener('submit', createSet); $('addSetItemForm').addEventListener('submit', addSetItem); $('saveSetItems').addEventListener('click', saveSetItems); $('publishForm').addEventListener('submit', publishSet); $('toggleFreeWeb').addEventListener('click', toggleFreeWeb);
    $('questionEditorPanel').hidden = !canAccess('questionBankEdit'); $('setCreatePanel').hidden = !canAccess('questionBankEdit'); $('newQuestion').hidden = !canAccess('questionBankEdit');
    renderOptions(); setSourceFields(); setMediaFields(); loadQuestions(true); loadSets(true);
    const params = new URLSearchParams(window.location.search); if (idOf(params.get('question'))) selectQuestion(params.get('question')); if (idOf(params.get('set'))) { setTab('sets'); selectSet(params.get('set')); }
    if (idOf(params.get('draft'))) importSavedDraft(idOf(params.get('draft')));
  });
})();
