(() => {
  'use strict';
  const metrics = globalThis.ZhiyinCompatibilityMetrics;
  const allowedHosts = new Set(metrics?.hosts || []);
  const apiBaseInput = document.getElementById('apiBase');
  const tokenInput = document.getElementById('token');
  const status = document.getElementById('status');
  const preview = document.getElementById('preview');
  const fieldsBox = document.getElementById('fields');
  const loadButton = document.getElementById('loadValues');
  const compatibility = document.getElementById('compatibility');
  const compatibilityLog = document.getElementById('compatibilityLog');
  const compatibilityAlert = document.getElementById('compatibilityAlert');
  const returnSection = document.getElementById('returnSection');
  let tabId = null;
  let boardHost = '';
  let applicationId = null;
  let apiBaseInMemory = '';
  let detected = [];
  let values = new Map();

  chrome.storage.local.get(['apiBase'], result => { apiBaseInput.value = result.apiBase || ''; });
  chrome.storage.local.get(['compatibilityLog'], result => renderCompatibilityLog(result.compatibilityLog));
  function message(text, isError = true) { status.textContent = text; status.style.color = isError ? '#b91c1c' : '#047857'; }
  function renderCompatibilityLog(items) {
    compatibilityLog.replaceChildren();
    const summaries = metrics ? metrics.summarize(items) : [];
    summaries.forEach(item => {
      const li = document.createElement('li');
      const rate = Math.round(item.failureRate * 100);
      const reasons = Object.entries(item.reasons).map(([reason, count]) => `${reason}:${count}`).join('、') || '无失败码';
      li.textContent = `${item.siteId} · 近7天样本 ${item.samples} · 失败率 ${rate}% · ${reasons}`;
      compatibilityLog.append(li);
    });
    const alertSites = summaries.filter(item => item.alert);
    compatibilityAlert.hidden = alertSites.length === 0;
    compatibilityAlert.textContent = alertSites.length
      ? `兼容性提示：${alertSites.map(item => `${item.siteId}（${item.samples} 次样本，失败率 ${Math.round(item.failureRate * 100)}%）`).join('；')}`
      : '';
  }
  function recordCompatibility(host, state, reason) {
    if (!metrics || !allowedHosts.has(host)) return;
    chrome.storage.local.get(['compatibilityLog'], result => {
      const next = metrics.update(result.compatibilityLog, host, state, reason);
      chrome.storage.local.set({ compatibilityLog: next }, () => renderCompatibilityLog(next));
    });
  }
  function parseApiBase(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error('请输入有效的职引 API 地址。'); }
    if (url.username || url.password || url.search || url.hash) throw new Error('API 地址不能含账号、查询参数或片段。');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('API 地址必须使用 HTTPS；本地开发仅允许 localhost。');
    }
    if (url.protocol === 'https:' && url.hostname !== 'tatawangshen.com' && !url.hostname.endsWith('.tatawangshen.com')) {
      throw new Error('在线 API 地址必须属于 tatawangshen.com。');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url;
  }

  document.getElementById('saveApi').addEventListener('click', async () => {
    try {
      const url = parseApiBase(apiBaseInput.value.trim());
      const originPattern = `${url.origin}/*`;
      const granted = await chrome.permissions.request({ origins: [originPattern] });
      if (!granted) throw new Error('需要你允许扩展连接此 API 来源。');
      await chrome.storage.local.set({ apiBase: `${url.origin}${url.pathname}` });
      message('API 地址已保存，扩展仅获得此来源的可选连接权限。', false);
    } catch (error) { message(error.message || '无法保存 API 地址。'); }
  });

  document.getElementById('inspect').addEventListener('click', async () => {
    preview.hidden = true; returnSection.hidden = true; compatibility.hidden = true;
    applicationId = null; detected = []; values.clear(); loadButton.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) throw new Error('无法读取当前标签页。');
      const url = new URL(tab.url);
      if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) throw new Error('当前页面不是支持的 Greenhouse、Lever 或 Ashby 招聘表单。');
      tabId = tab.id; boardHost = url.hostname;
      const result = await chrome.tabs.sendMessage(tabId, { type: 'zhiyin:inspect' });
      if (!result?.ok || result.host !== boardHost) throw new Error('无法安全识别表单，请刷新受支持的招聘页面后重试。');
      detected = result.fields;
      compatibility.hidden = false;
      compatibility.textContent = detected.length
        ? `表单识别状态：已识别 ${detected.length} 个候选字段（${result.adapter === 'lever' ? 'Lever' : 'Greenhouse'} 适配）。页面内容仅在本机检查。`
        : `兼容状态：未识别到可填写字段（${result.compatibility || 'no_compatible_fields'}）。不会读取或上传页面内容。`;
      recordCompatibility(boardHost, detected.length ? 'supported' : 'unsupported', result.compatibility || 'no_compatible_fields');
      if (!detected.length) throw new Error('没有识别到支持的字段；不会读取或上传页面内容。');
      loadButton.disabled = false;
      message(`识别到 ${detected.length} 个候选字段。下一步才会消费一次性授权。`, false);
    } catch (error) { message(error.message || '表单识别失败。'); }
  });

  loadButton.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    tokenInput.value = '';
    if (!token || !detected.length || !tabId) { message('请先识别表单并输入授权码。'); return; }
    loadButton.disabled = true;
    try {
      const stored = await chrome.storage.local.get(['apiBase']);
      const apiBase = parseApiBase(apiBaseInput.value.trim() || stored.apiBase || '').toString().replace(/\/$/, '');
      const allowed = await chrome.permissions.contains({ origins: [`${new URL(apiBase).origin}/*`] });
      if (!allowed) throw new Error('请先保存 API 地址并批准此来源。');
      const response = await fetch(`${apiBase}/api/v4/browser-extension/consume`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ boardHost })
      });
      const envelope = await response.json().catch(() => ({}));
      if (!response.ok || envelope.code !== 0) throw new Error(envelope.message || '授权消费失败，可能已过期或使用。');
      const allowedValues = new Map((envelope.data?.fields || []).map(item => [item.key, item.value]));
      applicationId = Number(envelope.data?.applicationId);
      if (!Number.isSafeInteger(applicationId) || applicationId <= 0) throw new Error('授权未绑定有效申请，请返回官网重新创建。');
      apiBaseInMemory = apiBase;
      values = allowedValues;
      renderFields();
      preview.hidden = false;
      const matchCount = detected.filter(item => values.has(item.key) && values.get(item.key)).length;
      compatibility.hidden = false;
      compatibility.textContent = matchCount === values.size
        ? `兼容状态：已匹配本次授权的 ${matchCount} 项。`
        : matchCount
          ? `兼容状态：部分匹配（${matchCount}/${values.size} 项）。原因代码：partial_field_coverage。`
          : '兼容状态：当前页面没有授权字段可填。原因代码：no_authorized_field_match。';
      recordCompatibility(boardHost, matchCount === values.size ? 'supported' : matchCount ? 'partial' : 'unsupported',
        matchCount === values.size ? 'candidate_fields_found' : matchCount ? 'partial_field_coverage' : 'no_authorized_field_match');
      message('授权已一次性消费。请逐项勾选需要填入的字段。', false);
    } catch (error) { message(error.message || '无法读取授权字段。'); }
    finally { loadButton.disabled = false; }
  });

  function renderFields() {
    fieldsBox.replaceChildren();
    const populated = detected.filter(item => values.has(item.key) && values.get(item.key));
    if (!populated.length) { message('授权字段与当前页面没有可用匹配项。'); return; }
    populated.forEach(item => {
      const label = document.createElement('label'); label.className = 'field';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.candidateId = item.id;
      const text = document.createElement('span'); text.textContent = item.label;
      const value = document.createElement('output'); value.textContent = values.get(item.key);
      label.append(checkbox, text, value); fieldsBox.append(label);
    });
  }

  document.getElementById('fill').addEventListener('click', async () => {
    const selected = [...fieldsBox.querySelectorAll('input[type=checkbox]:checked')];
    if (!selected.length || !tabId) { message('请先逐项勾选要填入的字段。'); return; }
    const items = selected.map(input => {
      const candidate = detected.find(item => item.id === input.dataset.candidateId);
      return candidate ? { id: candidate.id, key: candidate.key, value: values.get(candidate.key) } : null;
    }).filter(Boolean);
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'zhiyin:fill', host: boardHost, items });
      const expectedIds = items.map(item => item.id).sort();
      const actualIds = Array.isArray(result?.filledIds) ? [...result.filledIds].sort() : [];
      if (!result?.ok || result.host !== boardHost || result.filled !== items.length
        || expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) {
        compatibility.hidden = false;
        compatibility.textContent = '兼容状态：页面字段已变化或部分未填入。原因代码：page_changed_or_partial_fill。请重新识别并核对。';
        recordCompatibility(boardHost, 'partial', 'page_changed_or_partial_fill');
        throw new Error('部分字段没有填入，请检查表单是否已变化。');
      }
      message(`已填入 ${result.filled} 项。请检查页面内容，再由你自行提交。`, false);
      values.clear();
      returnSection.hidden = false;
    } catch (error) { message(error.message || '填入失败，请重新识别表单。'); }
  });

  document.getElementById('returnToApplication').addEventListener('click', async () => {
    if (!Number.isSafeInteger(applicationId) || applicationId <= 0 || !apiBaseInMemory) return;
    const apiUrl = new URL(apiBaseInMemory);
    const webOrigin = ['localhost', '127.0.0.1'].includes(apiUrl.hostname) ? apiUrl.origin : 'https://tatawangshen.com';
    const appUrl = new URL('/applications', webOrigin);
    appUrl.searchParams.set('open', String(applicationId));
    await chrome.tabs.create({ url: appUrl.toString() });
  });
})();
