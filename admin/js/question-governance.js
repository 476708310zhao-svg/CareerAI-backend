/* global initPage, canAccess, getToken, logout */
'use strict';

(() => {
  const base = '/admin/api/v4/question-asset-governance';
  const $ = id => document.getElementById(id);
  const rightLabels = {
    internalStorage: '内部存储', machineProcessing: '机器处理', thirdPartyProcessing: '第三方处理',
    stemDisplay: '题干展示', imageDisplay: '图片展示', answerDisplay: '答案解析展示',
    commercialUse: '商业访问', adaptation: '改编'
  };
  const coverageLabels = {
    freeStemDisplay: '免费题干展示', commercialStemDisplay: '商业题干展示',
    freeImageDisplay: '免费图片展示', commercialImageDisplay: '商业图片展示',
    freeAnswerDisplay: '免费答案解析展示', commercialAnswerDisplay: '商业答案解析展示'
  };
  const statuses = { awaiting_upload: '待上传', failed: '上传失败', quarantined: '隔离保存',
    pending: '待审核', approved: '已通过', rejected: '已驳回', revoked: '已撤销',
    valid: '校验通过', invalid: '校验失败', clean: '扫描通过', infected: '发现风险' };
  const errors = {
    SOURCE_NOT_FOUND: '来源记录不存在，请核对 ID 或刷新列表。',
    CLAIM_NOT_FOUND: '权利声明不存在，请刷新详情。',
    CLAIM_ALREADY_DECIDED: '声明已由其他审核员处理，请刷新详情。',
    CLAIM_NOT_APPROVED: '只有已批准的声明可以撤销，请刷新详情。',
    SELF_REVIEW_DENIED: '不能审核自己上传或提交的来源，请由另一位有审核权限的管理员处理。',
    SOURCE_NOT_QUARANTINED: '仅隔离保存的来源可进入审核，请核对上传状态。',
    CLIENT_KEY_CONFLICT: '提交内容已变化，请重新填写后提交。',
    INVALID_RIGHTS: '请按授权证据核对具体用途。',
    EMPTY_RIGHTS: '请至少勾选一项有证据支持的用途。',
    INVALID_RIGHTS_PERIOD: '请检查授权起止日期。',
    INVALID_RIGHTS_DATE: '授权日期格式无效，请重新选择。',
    INVALID_TERRITORIES: '适用地域格式无效，请重新选择。',
    ASSET_NOT_VALIDATED: 'PDF 尚未通过深度校验和病毒扫描，当前不能记录内容审核通过。'
  };
  const state = { sources: [], total: 0, cursor: null, listRequest: 0, selectedId: null,
    selectionVersion: 0, detail: null, detailRequest: 0, draftSignature: null, draftKey: null,
    claims: [], contentReviews: [], claimTotal: 0, contentTotal: 0, claimCursor: null,
    contentCursor: null, claimHistoryRequest: 0, contentHistoryRequest: 0,
    contentDraftSignature: null, contentDraftKey: null, contentDraftExpected: null };
  const idOf = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const date = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—';
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    if (className) node.className = className;
    return node;
  };
  const message = error => errors[error.message] || error.message || '请求失败，请重试。';
  function show(id, value) { const node = $(id); node.textContent = value || ''; node.hidden = !value; }
  function randomKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(window.ADMIN_API + base + path, {
        method: options.method || 'GET',
        headers: { Authorization: `Bearer ${getToken()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (_) { throw new Error('网络连接异常，请检查连接后重试。'); }
    if (response.status === 401) { logout(); throw new Error('登录已失效'); }
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error(`服务器响应异常（HTTP ${response.status}）`); }
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload && payload.message || `请求失败（HTTP ${response.status}）`);
    return payload.data || {};
  }
  function sourceCard(source) {
    const card = text('button', undefined, `gov-source${source.id === state.selectedId ? ' active' : ''}`);
    card.type = 'button';
    card.setAttribute('aria-pressed', String(source.id === state.selectedId));
    card.append(text('strong', source.originalFilename || `来源 #${source.id}`),
      text('small', `#${source.id} · 批次 #${source.batchId || '—'} · ${statuses[source.status] || source.status || '状态待核查'}`),
      text('small', source.sourceReference || '无来源说明'),
      text('small', `待审权利 ${Number(source.pendingClaims || 0)} 条 · 内容 ${statuses[source.contentReviewStatus] || source.contentReviewStatus || '待审核'}`));
    card.addEventListener('click', () => selectSource(source.id));
    return card;
  }
  function renderSources() {
    const selected = state.detail && state.detail.source;
    const pinned = selected && !state.sources.some(source => source.id === selected.id);
    const cards = pinned ? [sourceCard(selected), ...state.sources.map(sourceCard)] : state.sources.map(sourceCard);
    $('sourceList').replaceChildren(...cards);
    if (!cards.length) $('sourceList').replaceChildren(text('p', '暂无来源记录。', 'gov-empty'));
    $('sourceCount').textContent = `共 ${state.total} 条${pinned ? ' · 当前来源已单独显示' : ''}`;
    $('moreSources').hidden = state.cursor == null;
  }
  async function loadSources(reset = true) {
    const requestId = ++state.listRequest;
    const cursor = reset ? 0 : state.cursor;
    if (cursor == null) return;
    $('refreshSources').disabled = true; $('moreSources').disabled = true;
    if (reset) $('sourceList').replaceChildren(text('p', '正在加载来源…', 'gov-empty'));
    show('listError', '');
    try {
      const data = await request(`/sources?${new URLSearchParams({ cursor, limit: 30 })}`);
      if (requestId !== state.listRequest) return;
      state.sources = reset ? data.sources || [] : [...state.sources, ...(data.sources || []).filter(item => !state.sources.some(old => old.id === item.id))];
      state.total = Number(data.total || 0); state.cursor = data.nextCursor;
      renderSources();
    } catch (error) {
      if (requestId !== state.listRequest) return;
      show('listError', `${message(error)} 可点击“刷新”重试。`);
      if (reset) { state.sources = []; state.total = 0; state.cursor = null; renderSources(); }
    } finally {
      if (requestId === state.listRequest) { $('refreshSources').disabled = false; $('moreSources').disabled = false; }
    }
  }
  function badge(value) { return text('span', statuses[value] || value || '状态待核查', `gov-badge ${value || ''}`); }
  function rightChips(rights, prefix, labels = rightLabels) {
    const row = text('div', undefined, 'gov-right-grid');
    for (const [key, label] of Object.entries(labels)) row.append(text('span', `${label}：${rights && rights[key] === true ? '是' : '否'}`, `gov-chip ${rights && rights[key] === true ? 'yes' : 'no'}`));
    if (prefix) row.setAttribute('aria-label', prefix);
    return row;
  }
  function renderSummary(data) {
    const source = data.source || {};
    const effective = data.effectiveRights || {};
    const summary = $('statusSummary');
    summary.replaceChildren(text('strong', `${source.originalFilename || '未命名 PDF'} · 来源 #${source.id || state.selectedId}`),
      text('p', `来源：${source.sourceReference || '—'} · ${statuses[source.status] || source.status || '状态待核查'}`),
      text('p', `PDF 深度校验：${statuses[source.validationStatus] || source.validationStatus || '待校验'} · 病毒扫描：${statuses[source.scanStatus] || source.scanStatus || '待扫描'} · 内容审核：${statuses[effective.contentReviewStatus] || effective.contentReviewStatus || '待审核'}`),
      text('p', '以下按中国地区和当前时间评估。商业用途必须与相应展示用途出现在同一份有效声明中；授权覆盖不代表已发布。'));
    summary.append(text('strong', '同一声明的免费／商业展示授权覆盖'),
      rightChips(effective.coverage, '同一声明的免费／商业展示授权覆盖', coverageLabels),
      text('strong', '当前实际可用用途（非商业语境）'),
      rightChips(effective.usable, '当前实际可用用途', Object.fromEntries(Object.entries(rightLabels).filter(([key]) => key !== 'commercialUse'))),
      text('strong', '有效声明的单项权利汇总（不可跨声明拼接）'),
      rightChips(effective.rights, '有效声明的单项权利汇总'));
    $('detailHeading').textContent = `来源 #${source.id || state.selectedId}`;
    $('detailMeta').textContent = `批次 #${source.batchId || '—'} · 创建者 ${source.createdBy || '—'} · 原件不在本页展示`;
  }
  function renderNextStep(data) {
    const source = data.source || {}, rights = data.effectiveRights || {};
    const box = $('nextStep');
    const title = text('strong', `来源 #${source.id || state.selectedId} · 下一步`);
    const sourceId = String(source.id || state.selectedId);
    if (source.validationStatus !== 'valid' || source.scanStatus !== 'clean') {
      const link = text('a', '返回 PDF 导入页运行安全校验', 'btn btn-outline btn-sm');
      link.href = `question-assets.html?${new URLSearchParams({ batch: String(source.batchId || '') })}`;
      box.replaceChildren(title, text('p', 'PDF 需要先通过结构校验和病毒扫描。'), link);
      return;
    }
    if (rights.usable?.machineProcessing === true) {
      const paper = String(source.originalFilename || '').replace(/\.pdf$/i, '').trim().slice(0, 120) || `来源 #${sourceId}`;
      if (!canAccess('questionAssets')) {
        box.replaceChildren(title, text('p', '机器处理授权已就绪。请由具有 PDF 识题权限的管理员继续创建识题任务。'));
        return;
      }
      const link = text('a', '开始自动识题', 'btn btn-primary btn-sm');
      link.href = `question-parsing.html?${new URLSearchParams({ source: sourceId, paper })}`;
      box.replaceChildren(title, text('p', '安全校验和机器处理授权已就绪。下一页会自动带入这份 PDF。'), link);
      return;
    }
    const pendingClaims = (data.claims || []).filter(claim => claim.status === 'pending' && claim.rights?.machineProcessing === true);
    const pending = pendingClaims.length > 0;
    if (pending) {
      const machineOnly = pendingClaims.some(claim => Object.entries(claim.rights || {})
        .every(([key, value]) => key === 'machineProcessing' || value !== true));
      const localNote = data.localSingleReviewEnabled && machineOnly && canAccess('questionRightsReview')
        ? '本地单人测试：在下方待审声明填写审核说明，点击“本地确认机器处理”。'
        : '机器处理权利声明已提交，等待有审核权限的管理员核对证据。';
      box.replaceChildren(title, text('p', `${localNote}审核通过后，这里会出现“开始自动识题”。`));
      return;
    }
    const note = text('p', '请根据可追溯证据，在下方提交“机器处理”权利声明；独立审核通过后即可识题。');
    if (!canAccess('questionAssets')) { box.replaceChildren(title, note); return; }
    const button = text('button', '填写机器处理授权', 'btn btn-primary btn-sm');
    button.type = 'button';
    button.addEventListener('click', () => {
      if ($('claimForm').scrollIntoView) $('claimForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if ($('evidenceReference').focus) $('evidenceReference').focus();
    });
    box.replaceChildren(title, note, button);
  }
  function claimCard(claim, selectedId) {
    const version = state.selectionVersion;
    const card = text('article', undefined, 'gov-card');
    const header = text('div', undefined, 'gov-card-header');
    header.append(text('strong', `声明 #${claim.id} · ${claim.evidenceReference || '无证据编号'}`), badge(claim.status));
    card.append(header, text('p', `有效期 ${claim.validFrom || '—'} 至 ${claim.validUntil || '—'} · 地域 ${(claim.territories || []).map(item => item === '*' ? '全球' : item).join('、') || '未指定'}`),
      text('p', `提交人 ${claim.submittedBy || '—'} · 提交 ${date(claim.createdAt)}`), rightChips(claim.rights, '声明用途'));
    if (claim.decisionReason) card.append(text('p', `审核说明：${claim.decisionReason}`));
    if (claim.revocationReason) card.append(text('p', `撤销原因：${claim.revocationReason}`));
    if (canAccess('questionRightsReview') && ['pending', 'approved'].includes(claim.status)) {
      const form = text('form', undefined, 'gov-decision');
      const label = text('label', '审核说明 *');
      const reason = text('textarea'); reason.required = true; reason.maxLength = 500; reason.rows = 2;
      label.append(reason); form.append(label);
      const actions = text('div', undefined, 'gov-decision-actions');
      const machineOnly = claim.rights?.machineProcessing === true &&
        Object.entries(claim.rights || {}).every(([key, value]) => key === 'machineProcessing' || value !== true);
      const localMachine = claim.status === 'pending' && state.detail?.localSingleReviewEnabled && machineOnly;
      const choices = claim.status === 'pending' ? [['approved', localMachine ? '本地确认机器处理' : '批准权利'], ['rejected', '驳回声明']] : [['revoke', '撤销权利']];
      for (const [decision, title] of choices) {
        const control = text('button', title, decision === 'approved' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm');
        control.type = 'button';
        control.addEventListener('click', () => decideClaim(claim.id, decision, reason.value.trim(), selectedId, version, actions));
        actions.append(control);
      }
      form.append(actions); card.append(form);
    }
    return card;
  }
  function renderClaims(selectedId) {
    $('claimList').replaceChildren(...state.claims.map(claim => claimCard(claim, selectedId)));
    if (!state.claims.length) $('claimList').replaceChildren(text('p', '尚无权利声明。所有用途默认不可用。', 'gov-empty'));
    $('moreClaims').hidden = state.claimCursor == null;
  }
  function renderContent() {
    $('contentReviewList').replaceChildren(...state.contentReviews.map(review => {
      const card = text('article', undefined, 'gov-card');
      const header = text('div', undefined, 'gov-card-header');
      header.append(text('strong', `审核 #${review.id} · ${review.reviewer || '—'}`), badge(review.decision));
      card.append(header, text('p', review.reason || '无审核说明'), text('p', date(review.createdAt)));
      return card;
    }));
    if (!state.contentReviews.length) $('contentReviewList').replaceChildren(text('p', '尚无内容审核记录。', 'gov-empty'));
    $('moreContent').hidden = state.contentCursor == null;
  }
  async function loadHistory(kind) {
    const sourceId = state.selectedId, version = state.selectionVersion;
    const claims = kind === 'claims';
    const cursor = claims ? state.claimCursor : state.contentCursor;
    if (!sourceId || cursor == null) return;
    const button = $(claims ? 'moreClaims' : 'moreContent');
    const requestId = claims ? ++state.claimHistoryRequest : ++state.contentHistoryRequest;
    button.disabled = true; show('detailError', '');
    try {
      const data = await request(`/sources/${sourceId}/${kind}?${new URLSearchParams({ cursor, limit: 30 })}`);
      if (sourceId !== state.selectedId || version !== state.selectionVersion ||
          requestId !== (claims ? state.claimHistoryRequest : state.contentHistoryRequest)) return;
      const items = data.items || [];
      if (claims) {
        state.claims = [...state.claims, ...items.filter(item => !state.claims.some(old => old.id === item.id))];
        state.claimCursor = data.nextCursor;
        renderClaims(sourceId);
      } else {
        state.contentReviews = [...state.contentReviews, ...items.filter(item => !state.contentReviews.some(old => old.id === item.id))];
        state.contentCursor = data.nextCursor;
        renderContent();
      }
    } catch (error) {
      if (sourceId === state.selectedId && version === state.selectionVersion &&
          requestId === (claims ? state.claimHistoryRequest : state.contentHistoryRequest)) {
        show('detailError', `${message(error)} 可点击“加载更多”重试。`);
      }
    } finally {
      if (sourceId === state.selectedId && version === state.selectionVersion &&
          requestId === (claims ? state.claimHistoryRequest : state.contentHistoryRequest)) button.disabled = false;
    }
  }
  async function loadDetail(id) {
    const sequence = ++state.detailRequest;
    show('detailError', ''); $('refreshDetail').disabled = true;
    try {
      const data = await request(`/sources/${id}?territory=CN`);
      if (sequence !== state.detailRequest || state.selectedId !== id) return;
      state.detail = data;
      state.claimHistoryRequest++; state.contentHistoryRequest++;
      $('moreClaims').disabled = false; $('moreContent').disabled = false;
      state.claims = data.claims || []; state.contentReviews = data.contentReviews || [];
      state.claimTotal = Number(data.claimsTotal || 0); state.contentTotal = Number(data.contentReviewsTotal || 0);
      state.claimCursor = state.claims.length && state.claims.length < state.claimTotal ? state.claims.at(-1).id : null;
      state.contentCursor = state.contentReviews.length && state.contentReviews.length < state.contentTotal ? state.contentReviews.at(-1).id : null;
      $('detailBody').hidden = false; $('refreshDetail').hidden = false;
      $('claimForm').hidden = !canAccess('questionAssets') || data.source.status !== 'quarantined';
      $('contentForm').hidden = !canAccess('questionContentReview') || data.source.status !== 'quarantined';
      const canApproveContent = data.source.validationStatus === 'valid' && data.source.scanStatus === 'clean';
      $('contentApproveOption').disabled = !canApproveContent;
      if (!canApproveContent && $('contentDecision').value === 'approved') $('contentDecision').value = 'rejected';
      show('contentGate', canApproveContent ? '' : 'PDF 尚未通过深度校验和病毒扫描，当前不能记录内容审核通过；如发现内容问题可记录驳回。');
      renderNextStep(data); renderSummary(data); renderClaims(id); renderContent(); renderSources();
    } catch (error) {
      if (sequence !== state.detailRequest || state.selectedId !== id) return;
      state.detail = null; $('detailBody').hidden = true;
      show('detailError', `${message(error)} 可点击“刷新详情”重试。`);
      $('refreshDetail').hidden = false; renderSources();
    } finally {
      if (sequence === state.detailRequest) $('refreshDetail').disabled = false;
    }
  }
  function selectSource(value) {
    const id = idOf(value);
    if (!id) return show('listError', '请输入有效的来源记录 ID。');
    state.selectedId = id; state.selectionVersion++; state.detail = null; state.detailRequest++;
    state.claimHistoryRequest++; state.contentHistoryRequest++;
    state.draftKey = null; state.draftSignature = null; $('claimForm').reset(); $('contentForm').reset();
    state.contentDraftSignature = null; state.contentDraftKey = null; state.contentDraftExpected = null;
    $('submitClaim').disabled = false; $('submitContent').disabled = false;
    $('detailHeading').textContent = `来源 #${id}`;
    $('detailMeta').textContent = '正在加载权利与审核状态…';
    $('detailBody').hidden = true; $('refreshDetail').hidden = false;
    show('detailError', ''); show('claimError', ''); show('contentError', ''); show('actionNotice', '');
    const url = new URL(window.location.href); url.searchParams.set('source', String(id));
    window.history.replaceState(null, '', url);
    renderSources(); loadDetail(id);
  }
  async function decideClaim(claimId, decision, reason, selectedId, version, controls) {
    if (!reason) return show('detailError', '请先填写审核说明。');
    if (selectedId !== state.selectedId || version !== state.selectionVersion) return;
    const action = decision === 'revoke' ? '撤销此项已批准权利' : decision === 'approved' ? '批准此项权利声明' : '驳回此项权利声明';
    if (!window.confirm(`${action}？此操作将写入审计记录。`)) return;
    const buttons = [...controls.children]; buttons.forEach(button => { button.disabled = true; });
    show('detailError', ''); show('actionNotice', '正在保存审核操作…');
    try {
      const path = decision === 'revoke' ? `/claims/${claimId}/revoke` : `/claims/${claimId}/decision`;
      const body = decision === 'revoke' ? { reason } : { decision, reason };
      await request(path, { method: 'POST', body });
      if (selectedId === state.selectedId && version === state.selectionVersion) {
        await loadDetail(selectedId);
        if (selectedId === state.selectedId && version === state.selectionVersion) {
          show('actionNotice', `${action}已记录。`); loadSources(true);
        }
      }
    } catch (error) {
      if (selectedId === state.selectedId && version === state.selectionVersion) { show('actionNotice', ''); show('detailError', message(error)); }
    } finally { buttons.forEach(button => { button.disabled = false; }); }
  }
  async function submitClaim(event) {
    event.preventDefault();
    const sourceId = state.selectedId;
    const version = state.selectionVersion;
    if (!sourceId) return;
    const rights = Object.fromEntries(Object.keys(rightLabels).map(key => [key, false]));
    for (const input of $('claimForm').querySelectorAll('input[name="right"]')) rights[input.value] = input.checked;
    const evidenceReference = $('evidenceReference').value.trim();
    const validFrom = $('validFrom').value, validUntil = $('validUntil').value;
    if (!evidenceReference || !validFrom || !validUntil) return show('claimError', '请填写证据和授权起止日期。');
    if (validUntil < validFrom) return show('claimError', '截止日期不能早于开始日期。');
    if (!Object.values(rights).some(Boolean)) return show('claimError', '请至少选择一项有证据支持的用途。');
    const payload = { evidenceReference, rights, territories: [$('territory').value], validFrom, validUntil };
    const signature = JSON.stringify([sourceId, payload]);
    if (signature !== state.draftSignature) { state.draftSignature = signature; state.draftKey = randomKey(); }
    $('submitClaim').disabled = true; show('claimError', ''); show('actionNotice', '正在提交权利声明…');
    try {
      await request(`/sources/${sourceId}/claims`, { method: 'POST', body: { clientKey: state.draftKey, ...payload } });
      if (sourceId === state.selectedId && version === state.selectionVersion) {
        state.draftKey = null; state.draftSignature = null; $('claimForm').reset();
        await loadDetail(sourceId);
        if (sourceId === state.selectedId && version === state.selectionVersion) {
          const localOnly = state.detail?.localSingleReviewEnabled && rights.machineProcessing === true &&
            Object.entries(rights).every(([key, value]) => key === 'machineProcessing' || value !== true) && canAccess('questionRightsReview');
          show('actionNotice', localOnly ? '机器处理声明已提交；请在上方待审声明填写审核说明，再点“本地确认机器处理”。' : '权利声明已提交，等待独立审核。');
          loadSources(true);
        }
      }
    } catch (error) { if (sourceId === state.selectedId && version === state.selectionVersion) { show('actionNotice', ''); show('claimError', message(error)); } }
    finally { if (sourceId === state.selectedId && version === state.selectionVersion) $('submitClaim').disabled = false; }
  }
  async function submitContent(event) {
    event.preventDefault();
    const sourceId = state.selectedId;
    const version = state.selectionVersion;
    if (!sourceId) return;
    const decision = $('contentDecision').value, reason = $('contentReason').value.trim();
    if (decision === 'approved' && $('contentApproveOption').disabled) return show('contentError', 'PDF 尚未通过深度校验和病毒扫描，当前不能记录通过。');
    if (!reason) return show('contentError', '请填写审核说明。');
    const signature = JSON.stringify([sourceId, decision, reason]);
    if (signature !== state.contentDraftSignature) {
      state.contentDraftSignature = signature;
      state.contentDraftKey = randomKey();
      state.contentDraftExpected = state.contentReviews.length ? state.contentReviews[0].id : null;
    }
    $('submitContent').disabled = true; show('contentError', ''); show('actionNotice', '正在保存内容审核…');
    try {
      await request(`/sources/${sourceId}/content-reviews`, { method: 'POST', body: {
        decision, reason, clientKey: state.contentDraftKey, expectedLatestReviewId: state.contentDraftExpected
      } });
      if (sourceId === state.selectedId && version === state.selectionVersion) {
        state.contentDraftSignature = null; state.contentDraftKey = null; state.contentDraftExpected = null;
        $('contentForm').reset(); await loadDetail(sourceId);
        if (sourceId === state.selectedId && version === state.selectionVersion) {
          show('actionNotice', '内容审核已记录。'); loadSources(true);
        }
      }
    } catch (error) {
      if (sourceId === state.selectedId && version === state.selectionVersion) {
        show('actionNotice', '');
        if (error.message === 'CONTENT_REVIEW_STALE') {
          state.contentDraftSignature = null; state.contentDraftKey = null; state.contentDraftExpected = null;
          await loadDetail(sourceId);
          if (sourceId === state.selectedId && version === state.selectionVersion) show('contentError', '已有更新的内容审核记录。请核对最新记录后重新提交。');
        } else show('contentError', message(error));
      }
    }
    finally { if (sourceId === state.selectedId && version === state.selectionVersion) $('submitContent').disabled = false; }
  }
  initPage('questionGovernance', '素材权利审核', () => {
    $('claimForm').hidden = !canAccess('questionAssets');
    $('contentForm').hidden = !canAccess('questionContentReview');
    $('lookupForm').addEventListener('submit', event => { event.preventDefault(); selectSource($('lookupId').value); });
    $('refreshSources').addEventListener('click', () => loadSources(true));
    $('moreSources').addEventListener('click', () => loadSources(false));
    $('refreshDetail').addEventListener('click', () => { if (state.selectedId) loadDetail(state.selectedId); });
    $('moreClaims').addEventListener('click', () => loadHistory('claims'));
    $('moreContent').addEventListener('click', () => loadHistory('content-reviews'));
    $('claimForm').addEventListener('submit', submitClaim);
    $('contentForm').addEventListener('submit', submitContent);
    const requested = idOf(new URLSearchParams(window.location.search).get('source'));
    if (requested) selectSource(requested);
    loadSources(true);
  });
})();
