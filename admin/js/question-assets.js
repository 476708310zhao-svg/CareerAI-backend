/* global initPage, getToken, logout */
'use strict';

(() => {
  const base = '/admin/api/v4/question-assets';
  const MAX_PDF_BYTES = 256 * 1024 * 1024;
  const DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  const state = { batches: [], batchCursor: null, batchTotal: 0, batchRequest: 0,
    selectedId: null, selectedBatch: null, selectionVersion: 0, sources: [], sourceCursor: null, sourceTotal: 0, sourceRequest: 0,
    batchDraftKey: null, batchDraftLabel: null, sourceDraftKey: null, sourceDraftSignature: null };
  const errors = {
    PRIVATE_PDF_IMPORT_DISABLED: '此环境未启用私有 PDF 导入。生产环境需要先接入私有对象存储、扫描和授权审核，当前不能上传。',
    PDF_UPLOAD_TOO_LARGE: 'PDF 超过直传限制，请刷新页面后用分片上传。',
    PDF_UPLOAD_REJECTED: '上传格式不符合要求，请只选择一个 PDF 文件。',
    INVALID_PDF_SIGNATURE: '文件未通过 PDF 基础格式检查，请核对原件。',
    INVALID_PDF_SIZE: '文件大小不符合要求，请选择 256 MiB 以内的 PDF。',
    INVALID_UPLOAD_FINGERPRINT: '文件标识计算失败，请重新选择原件。',
    UPLOAD_FINGERPRINT_MISMATCH: '上传文件内容与开始时不一致，请重新选择原件重试。',
    UPLOAD_CHUNK_CONFLICT: '所选文件与已上传分片不一致，请核对原件。',
    UPLOAD_OFFSET_CONFLICT: '上传进度发生变化，请重新选择同一文件继续。',
    UPLOAD_INCOMPLETE: '文件尚未完整上传，请重新选择同一文件继续。',
    UPLOAD_FINALIZING: '服务器正在校验完整文件，请稍后刷新来源记录。',
    UPLOAD_SESSION_NOT_FOUND: '续传记录已过期，请重新选择文件上传。',
    ASSET_CHECK_RUNNING: '这份 PDF 正在校验或扫描，请稍后刷新。',
    ASSET_CHECK_CAPACITY: '同时校验的 PDF 已达到上限，请稍后重试。',
    SCANNER_UNAVAILABLE: '当前没有可用的病毒扫描器，资产保持待扫描，不能进入识题。',
    SCANNER_SIGNATURE_STALE: 'Windows Defender 病毒库已过期。请先更新病毒库，再运行安全校验；当前不能进入识题。',
    SCANNER_STATUS_UNVERIFIED: '病毒扫描器状态无法核实，资产保持待扫描，不能进入识题。',
    PRIVATE_TEMP_QUOTA_EXCEEDED: '私有临时空间已满，请稍后重试或联系管理员清理过期文件。',
    INVALID_PDF_TYPE: '文件类型或文件名与登记记录不一致，请重新选择同名 PDF。',
    CLIENT_BATCH_KEY_CONFLICT: '批次名称已变化，请重新提交。',
    CLIENT_KEY_CONFLICT: '这条来源登记内容已变化，请重新提交。',
    ASSET_STORAGE_MISMATCH: '已有资产与私有存储不一致，请联系管理员核查，暂勿重复上传。',
    BATCH_NOT_FOUND: '批次不存在，请刷新列表。',
    SOURCE_NOT_FOUND: '来源记录不存在，请刷新列表。',
    SOURCE_STATE_CONFLICT: '来源状态已变化，请刷新列表后重试。',
    PDF_PRECHECK_TIMEOUT: 'PDF 预检超时，请稍后重试。',
    PDF_PRECHECK_FAILED: 'PDF 预检失败，请稍后重试。'
  };
  const statusText = { awaiting_upload: '待上传', failed: '上传失败', quarantined: '隔离保存' };
  const sourceTypeText = { internal: '内部持有', licensed: '授权来源，待核验', other: '其他，待核验' };
  const validationText = { pending: '待深度校验', valid: '校验通过', invalid: '校验失败' };
  const scanText = { pending: '待扫描', clean: '扫描通过', infected: '发现风险', failed: '扫描失败' };

  function el(tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = String(content);
    if (className) node.className = className;
    return node;
  }
  function show(id, message) { const node = $(id); node.textContent = message || ''; node.hidden = !message; }
  function message(error) { return errors[error.message] || error.message || '请求失败，请重试。'; }
  function randomKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function validId(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
  function date(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '—'; }
  function disabledNotice(error) {
    if (error.message === 'PRIVATE_PDF_IMPORT_DISABLED') show('environmentNotice', message(error));
  }
  async function request(path, options = {}) {
    let response;
    try {
      const form = options.body instanceof FormData;
      const binary = typeof Blob !== 'undefined' && options.body instanceof Blob;
      response = await fetch(window.ADMIN_API + base + path, {
        method: options.method || 'GET',
        headers: { Authorization: `Bearer ${getToken()}`, ...(form ? {} : binary ? { 'Content-Type': 'application/octet-stream' } : options.body ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body ? form || binary ? options.body : JSON.stringify(options.body) : undefined
      });
    } catch (_) { throw new Error('网络连接异常，请检查服务器后重试。'); }
    if (response.status === 401) { logout(); throw new Error('登录已失效'); }
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error(`服务器响应异常（HTTP ${response.status}）`); }
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload && payload.message || `请求失败（HTTP ${response.status}）`);
    return payload.data || {};
  }
  function placeholder(container, text) { $(container).replaceChildren(el('p', text, 'qa-empty')); }

  function renderBatches() {
    const list = $('batchList');
    const batchButton = batch => {
      const item = el('button', undefined, `qa-batch${batch.id === state.selectedId ? ' active' : ''}`);
      item.type = 'button';
      item.setAttribute('aria-pressed', String(batch.id === state.selectedId));
      item.append(el('strong', batch.label), el('small', `#${batch.id} · ${date(batch.created_at)}`));
      item.addEventListener('click', () => selectBatch(batch.id));
      return item;
    };
    list.replaceChildren(...state.batches.map(batchButton));
    if (!state.batches.length) placeholder('batchList', '暂无导入批次。');
    const selected = state.selectedBatch;
    const pin = selected && !state.batches.some(batch => batch.id === selected.id);
    $('currentBatch').hidden = !pin;
    $('currentBatch').replaceChildren(...(pin ? [el('span', '当前批次'), batchButton(selected)] : []));
    $('batchCount').textContent = `共 ${state.batchTotal} 个批次`;
    $('moreBatches').hidden = state.batchCursor == null;
  }
  async function loadBatches(reset = true) {
    const sequence = ++state.batchRequest;
    $('reloadBatches').disabled = true;
    $('moreBatches').disabled = true;
    show('batchListError', '');
    if (reset) {
      state.batches = []; state.batchCursor = null; state.batchTotal = 0;
      $('batchCount').textContent = ''; $('moreBatches').hidden = true;
      placeholder('batchList', '正在加载批次…');
    }
    try {
      const cursor = reset ? 0 : state.batchCursor;
      if (cursor == null) return;
      const data = await request(`/batches?${new URLSearchParams({ cursor, limit: 30 })}`);
      if (sequence !== state.batchRequest) return;
      state.batches = reset ? data.batches || [] : [...state.batches, ...(data.batches || []).filter(batch => !state.batches.some(item => item.id === batch.id))];
      state.batchCursor = data.nextCursor;
      state.batchTotal = Number(data.total || 0);
      renderBatches();
      if (reset && !state.selectedId && state.batches.length) selectBatch(state.batches[0].id);
    } catch (error) {
      if (sequence === state.batchRequest) {
        if (reset) placeholder('batchList', '批次暂时无法加载。');
        show('batchListError', `${message(error)} 请点击“刷新”或“加载更多批次”重试。`);
      }
    } finally {
      if (sequence === state.batchRequest) { $('reloadBatches').disabled = false; $('moreBatches').disabled = false; }
    }
  }
  async function createBatch(event) {
    event.preventDefault();
    const label = $('batchLabel').value.trim();
    if (!label) return show('batchError', '请输入批次名称。');
    if (state.batchDraftLabel !== label) { state.batchDraftKey = randomKey(); state.batchDraftLabel = label; }
    $('createBatch').disabled = true; show('batchError', '');
    try {
      const data = await request('/batches', { method: 'POST', body: { label, clientBatchKey: state.batchDraftKey } });
      const id = validId(data.batch && data.batch.id);
      if (!id) throw new Error('批次创建结果异常，请刷新列表核对。');
      state.batchDraftKey = null; state.batchDraftLabel = null; $('batchForm').reset();
      state.selectedBatch = data.batch;
      await selectBatch(id);
      await loadBatches(true);
    } catch (error) { disabledNotice(error); show('batchError', message(error)); }
    finally { $('createBatch').disabled = false; }
  }
  async function selectBatch(id) {
    const batchId = validId(id);
    if (!batchId) return;
    state.selectedId = batchId;
    state.selectionVersion += 1;
    state.selectedBatch = state.batches.find(batch => batch.id === batchId)
      || (state.selectedBatch && state.selectedBatch.id === batchId ? state.selectedBatch : { id: batchId, label: `批次 #${batchId}` });
    state.sources = []; state.sourceCursor = null; state.sourceTotal = 0;
    state.sourceDraftKey = null; state.sourceDraftSignature = null;
    $('sourceForm').reset(); show('sourceError', '');
    const url = new URL(window.location.href);
    url.searchParams.set('batch', String(batchId));
    window.history.replaceState(null, '', url);
    renderBatches();
    $('detailBody').hidden = false;
    $('detailHeading').textContent = state.selectedBatch.label;
    $('detailMeta').textContent = `批次 #${batchId} · 来源记录仅在后台可见`;
    $('reloadSources').hidden = false;
    await loadSources(true);
  }
  function renderSources() {
    $('sourceList').replaceChildren(...state.sources.map(source => {
      const item = el('article', undefined, 'qa-source');
      const main = el('div', undefined, 'qa-source-main');
      const status = source.status === 'quarantined' ? 'quarantined' : source.status === 'failed' ? 'failed' : 'pending';
      main.append(el('strong', source.originalFilename), el('span', statusText[source.status] || source.status, `qa-badge ${status}`));
      const meta = el('div', undefined, 'qa-source-meta');
      meta.append(el('span', `来源：${source.sourceReference} · ${sourceTypeText[source.sourceType] || source.sourceType}`), el('span', `记录 #${source.id} · 尝试 ${source.attempts || 0} 次 · 更新 ${date(source.updatedAt)}`));
      if (source.status === 'quarantined') meta.append(el('span', `PDF：${validationText[source.validationStatus] || '状态待核查'} · 病毒扫描：${scanText[source.scanStatus] || '状态待核查'} · 当前不可发布`));
      if (source.status === 'failed') meta.append(el('span', `失败原因：${errors[source.errorCode] || source.errorCode || '待核查'}`));
      item.append(main, meta);
      if (source.status === 'quarantined') {
        const actions = el('div', undefined, 'qa-source-actions');
        const button = el('button', '运行安全校验', 'btn btn-outline btn-sm');
        button.type = 'button';
        button.addEventListener('click', async () => {
          const version = state.selectionVersion;
          const stillSelected = () => state.selectedId === source.batchId && state.selectionVersion === version;
          button.disabled = true;
          if (stillSelected()) show('sourceError', '正在运行安全扫描与 PDF 结构校验，请等待结果…');
          try {
            const result = await request(`/sources/${source.id}/check`, { method: 'POST' });
            if (stillSelected()) {
              const check = result.check || {};
              const structure = check.validationStatus === 'valid' && Number.isSafeInteger(check.pageCount)
                ? `PDF 结构校验通过，共 ${check.pageCount} 页。` : '';
              show('sourceError', check.state === 'completed' ? `${structure}扫描已通过；下一步请核对来源授权。` :
                `${structure}${errors[check.errorCode] || `校验未通过（${check.errorCode || '待核查'}），资产仍不可用于识题。`}`);
              await loadSources(true);
            }
          } catch (error) { if (stillSelected()) show('sourceError', message(error)); }
          finally { button.disabled = false; }
        });
        actions.append(button);
        const next = el('a', '继续：核对授权', 'btn btn-primary btn-sm');
        next.href = `question-governance.html?${new URLSearchParams({ source: String(source.id) })}`;
        actions.append(next);
        if (validId(source.id)) {
          const review = el('a', '进入 OCR 识题 / 草稿核对', 'btn btn-outline btn-sm');
          review.href = `question-parsing.html?${new URLSearchParams({ source: String(source.id), review: '1' })}`;
          actions.append(review);
        }
        item.append(actions);
      }
      if (source.status === 'failed' || source.status === 'awaiting_upload') {
        const actions = el('div', undefined, 'qa-source-actions');
        const input = el('input'); input.type = 'file'; input.accept = '.pdf,application/pdf'; input.hidden = true;
        input.setAttribute('aria-label', `为 ${source.originalFilename} 选择同名 PDF`);
        const button = el('button', source.status === 'failed' ? '选择同名文件重试' : '选择文件上传', 'btn btn-outline btn-sm');
        button.type = 'button'; button.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
          const version = state.selectionVersion;
          const stillSelected = () => state.selectedId === source.batchId && state.selectionVersion === version;
          const file = input.files && input.files[0]; input.value = '';
          if (!file) return;
          if (file.name !== source.originalFilename) { if (stillSelected()) show('sourceError', '请选择与来源记录完全同名的 PDF。'); return; }
          button.disabled = true; if (stillSelected()) show('sourceError', '');
          try { await upload(source.batchId, source.id, source.status === 'failed' ? 'retry' : 'complete', file, stillSelected); if (stillSelected()) await loadSources(true); }
          catch (error) { if (stillSelected()) { show('uploadProgress', ''); disabledNotice(error); show('sourceError', message(error)); await loadSources(true); } }
          finally { button.disabled = false; }
        });
        actions.append(button, input); item.append(actions);
      }
      return item;
    }));
    if (!state.sources.length) placeholder('sourceList', '暂无来源记录，可在上方登记并上传。');
    $('sourceCount').textContent = `共 ${state.sourceTotal} 条`;
    $('moreSources').hidden = state.sourceCursor == null;
  }
  async function loadSources(reset = true) {
    const id = state.selectedId;
    if (!id) return;
    const sequence = ++state.sourceRequest;
    $('reloadSources').disabled = true; $('moreSources').disabled = true;
    show('sourceListError', '');
    if (reset) {
      state.sources = []; state.sourceCursor = null; state.sourceTotal = 0;
      $('sourceCount').textContent = ''; $('moreSources').hidden = true;
      placeholder('sourceList', '正在加载来源…');
    }
    try {
      const cursor = reset ? 0 : state.sourceCursor;
      if (cursor == null) return;
      const data = await request(`/batches/${id}?${new URLSearchParams({ cursor, limit: 30 })}`);
      if (sequence !== state.sourceRequest || id !== state.selectedId) return;
      $('detailHeading').textContent = data.batch && data.batch.label || `批次 #${id}`;
      if (data.batch) { state.selectedBatch = data.batch; renderBatches(); }
      state.sources = reset ? data.sources || [] : [...state.sources, ...(data.sources || []).filter(source => !state.sources.some(item => item.id === source.id))];
      state.sourceCursor = data.nextCursor;
      state.sourceTotal = Number(data.total || 0);
      renderSources();
    } catch (error) {
      if (sequence === state.sourceRequest && id === state.selectedId) {
        if (reset) placeholder('sourceList', '来源记录暂时无法加载。');
        show('sourceListError', `${message(error)} 请点击“刷新来源”或“加载更多来源”重试。`);
      }
    } finally {
      if (sequence === state.sourceRequest) { $('reloadSources').disabled = false; $('moreSources').disabled = false; }
    }
  }
  function checkedFile(file) {
    if (!file || !/\.pdf$/i.test(file.name)) throw new Error('请选择 PDF 文件。');
    if (file.size < 16) throw new Error('PDF 文件至少需要 16 字节。');
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`所选 PDF 为 ${(file.size / 1048576).toFixed(2)} MiB，超过单文件 256 MiB 上限。`);
    }
    return file;
  }
  async function upload(batchId, sourceId, action, file, canShow = () => true) {
    const selected = checkedFile(file);
    if (selected.size > DIRECT_UPLOAD_BYTES) return uploadLarge(batchId, sourceId, selected, canShow);
    const form = new FormData();
    form.append('file', selected.type === 'application/pdf' ? selected : new File([selected], selected.name, { type: 'application/pdf' }));
    const data = await request(`/batches/${batchId}/sources/${sourceId}/${action}`, { method: 'POST', body: form });
    if (!data.source || data.source.status !== 'quarantined') throw new Error('上传结果未确认，请刷新来源状态。');
  }
  async function fingerprint(file) {
    if (!window.crypto || !window.crypto.subtle) throw new Error('当前浏览器不支持大文件续传，请使用新版浏览器。');
    const sample = 64 * 1024;
    const first = new Uint8Array(await file.slice(0, sample).arrayBuffer());
    const last = new Uint8Array(await file.slice(Math.max(0, file.size - sample)).arrayBuffer());
    const bytes = new Uint8Array(first.length + last.length);
    bytes.set(first); bytes.set(last, first.length);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function uploadLarge(batchId, sourceId, file, canShow) {
    const path = `/batches/${batchId}/sources/${sourceId}`;
    const session = await request(`${path}/uploads`, { method: 'POST', body: {
      originalFilename: file.name, byteSize: file.size, fingerprint: await fingerprint(file)
    } });
    let offset = session.receivedBytes;
    while (offset < file.size) {
      const end = Math.min(file.size, offset + session.chunkSize);
      const result = await request(`${path}/uploads/${session.uploadId}/chunk?offset=${offset}`, {
        method: 'PUT', body: file.slice(offset, end)
      });
      if (!Number.isSafeInteger(result.receivedBytes) || result.receivedBytes !== end) throw new Error('上传进度异常，请重新选择同一文件继续。');
      offset = result.receivedBytes;
      if (canShow()) show('uploadProgress', `正在上传 ${file.name}：${Math.floor(offset * 100 / file.size)}%（${(offset / 1048576).toFixed(1)} / ${(file.size / 1048576).toFixed(1)} MiB）`);
    }
    if (canShow()) show('uploadProgress', '上传完成，正在校验完整 PDF…');
    const data = await request(`${path}/uploads/${session.uploadId}/complete`, { method: 'POST' });
    if (canShow()) show('uploadProgress', '');
    if (!data.source || data.source.status !== 'quarantined') throw new Error('上传结果未确认，请刷新来源状态。');
  }
  async function createSource(event) {
    event.preventDefault();
    const batchId = state.selectedId;
    const version = state.selectionVersion;
    const stillSelected = () => state.selectedId === batchId && state.selectionVersion === version;
    const file = $('sourceFile').files && $('sourceFile').files[0];
    const sourceType = $('sourceType').value;
    const sourceReference = $('sourceReference').value.trim();
    if (!batchId) return show('sourceError', '请先选择批次。');
    if (!sourceReference) return show('sourceError', '请填写来源说明或编号。');
    try { checkedFile(file); } catch (error) { return show('sourceError', error.message); }
    const signature = JSON.stringify([batchId, sourceType, sourceReference, file.name]);
    if (state.sourceDraftSignature !== signature) { state.sourceDraftSignature = signature; state.sourceDraftKey = randomKey(); }
    $('createSource').disabled = true; show('sourceError', '');
    try {
      const data = await request(`/batches/${batchId}/sources`, { method: 'POST', body: {
        clientKey: state.sourceDraftKey, sourceType, sourceReference, originalFilename: file.name
      } });
      const source = data.source;
      const sourceId = validId(source && source.id);
      if (!sourceId) throw new Error('来源登记结果异常，请刷新来源记录核对。');
      if (source.status !== 'quarantined') await upload(batchId, sourceId, source.status === 'failed' ? 'retry' : 'complete', file, stillSelected);
      if (stillSelected()) {
        state.sourceDraftKey = null; state.sourceDraftSignature = null;
        $('sourceForm').reset(); show('sourceError', '');
        await loadSources(true);
      }
    } catch (error) {
      if (stillSelected()) { show('uploadProgress', ''); disabledNotice(error); show('sourceError', message(error)); await loadSources(true); }
    } finally { $('createSource').disabled = false; }
  }

  initPage('questionAssets', 'PDF 制作刷题题集', () => {
    $('batchForm').addEventListener('submit', createBatch);
    $('sourceForm').addEventListener('submit', createSource);
    $('reloadBatches').addEventListener('click', () => loadBatches(true));
    $('moreBatches').addEventListener('click', () => loadBatches(false));
    $('reloadSources').addEventListener('click', () => loadSources(true));
    $('moreSources').addEventListener('click', () => loadSources(false));
    const requested = validId(new URLSearchParams(window.location.search).get('batch'));
    if (requested) selectBatch(requested);
    loadBatches(true);
  });
})();
