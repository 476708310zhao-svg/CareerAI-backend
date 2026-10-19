/* global initPage, canAccess, getToken, GET, POST, PUT, api, toast, confirm */
'use strict';

(() => {
  const base = '/admin/api/v4';
  const pageSize = 15;
  const byId = id => document.getElementById(id);
  const state = { tab: 'products', productPage: 1, orderPage: 1, editId: null, dirty: false,
    products: [], companies: new Map(), selected: new Map(), companyPage: 1, companyTotal: 0, editorRequest: 0,
    companyKeyword: '', companyRequest: 0, homeItems: [], homeLoaded: false, refundOrder: null,
    instructionsLoaded:false, instructionsDirty:false, instructionsVersion:0,
    instructionsRequest:0, instructionsEditVersion:0, instructionsSaving:false };
  const instructionFields=['usageInstructions','claimInstructions','updateInstructions','afterSalesInstructions'];
  const statusNames = { draft: '草稿', active: '在售', inactive: '下架', paid: '已支付',
    pending: '待支付', created: '待支付', refunded: '已退款', cancelled: '已关闭', closed: '已关闭',
    payment_review: '已收到付款，待人工核对', review: '待人工核对',
    ready: '可领取', fulfilled: '已交付', delivered: '已交付', failed: '交付失败',
    revoked: '已撤销', expired: '已到期', none: '未交付', not_ready: '待交付' };
  const textFields = ['title', 'coverUrl', 'summary', 'description', 'catalogText', 'seasonLabel',
    'sourceDescription', 'driveName', 'driveUrl', 'extractionCode', 'virtualProductId'];
  let productRequest = 0;
  let orderRequest = 0;

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function button(text, action, className = 'btn btn-outline btn-sm') {
    const control = node('button', text, className);
    control.type = 'button';
    control.addEventListener('click', action);
    return control;
  }
  function option(value, label) {
    const item = node('option', label);
    item.value = String(value);
    return item;
  }
  function safeUrl(value) {
    if (/^\/uploads\//.test(value) && !value.includes('..') && !/[\\\s]/.test(value)) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
    catch (_) { return false; }
  }
  function money(value) { return `¥${(Number(value || 0) / 100).toFixed(2)}`; }
  function date(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '—'; }
  function notice(message) { byId('pageNotice').textContent = message; byId('pageNotice').hidden = !message; }
  function errorAt(id, message) { byId(id).textContent = message; byId(id).hidden = !message; }
  function dataOf(response) {
    if (!response || response.code !== 0) throw new Error(response && response.message || '请求未完成，请重试');
    return response.data || {};
  }
  function placeholder(id, columns, message, retry) {
    const cell = node('td', message);
    cell.colSpan = columns;
    if (retry) cell.append(document.createTextNode(' '), button('重新加载', retry));
    const row = node('tr', undefined, 'empty-row');
    row.append(cell); byId(id).replaceChildren(row);
  }
  function badge(value) {
    return node('span', statusNames[value] || value || '—', `badge ${value === 'active' || value === 'paid' || value === 'ready' ? 'badge-green' : value === 'failed' ? 'badge-red' : 'badge-gray'}`);
  }
  function companyName(company) { return company.name || company.displayName || company.nameZh || company.nameEn || `公司 ${company.id}`; }
  function rememberCompany(company) {
    const record = { ...company, id: Number(company.id), name: companyName(company) };
    if (record.id > 0) state.companies.set(record.id, record);
    return record;
  }
  function productId(product) { return String(product.id || product.productId); }
  function pagination(id, current, total, load) {
    const count = Math.max(1, Math.ceil(Number(total || 0) / pageSize));
    const previous = button('上一页', () => load(current - 1), 'pagi-btn');
    const next = button('下一页', () => load(current + 1), 'pagi-btn');
    previous.disabled = current <= 1; next.disabled = current >= count;
    byId(id).replaceChildren(previous, node('span', `第 ${current} / ${count} 页`), next, node('span', `共 ${Number(total || 0)} 条`, 'pagi-info'));
  }

  async function loadProducts(page = 1) {
    const request = ++productRequest;
    state.productPage = page;
    placeholder('productRows', 6, '正在加载商品…');
    const params = new URLSearchParams({ page, pageSize, keyword: byId('productKeyword').value.trim(), status: byId('productStatus').value });
    try {
      const data = dataOf(await GET(`${base}/assessment-products?${params}`));
      if (request !== productRequest) return;
      const rows = data.items || [];
      byId('productRows').replaceChildren(...rows.map(product => {
        const row = node('tr'); const first = node('td'); const content = node('div', undefined, 'assessment-product-cell');
        if (safeUrl(product.coverUrl)) {
          const image = node('img', undefined, 'assessment-product-cover'); image.src = product.coverUrl;
          image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => { image.hidden = true; }); content.append(image);
        }
        const copy = node('div', undefined, 'assessment-product-copy');
        copy.append(node('strong', product.title), node('small', product.seasonLabel || `ID: ${productId(product)}`));
        content.append(copy); first.append(content);
        const companies = node('td', (product.companies || []).map(companyName).join('、') || '通用资料');
        const status = node('td'); status.append(badge(product.status), node('div', `排序 ${product.sortOrder || 0}`, 'assessment-help'));
        const actions = node('div', undefined, 'td-actions');
        actions.append(button('编辑', () => editProduct(productId(product))), button(product.status === 'active' ? '下架' : '上架', () => changeStatus(product, product.status === 'active' ? 'inactive' : 'active')));
        const actionCell = node('td'); actionCell.append(actions);
        row.append(first, companies, node('td', money(product.priceCents)), status, node('td', date(product.updatedAt || product.createdAt)), actionCell);
        return row;
      }));
      if (!rows.length) placeholder('productRows', 6, '暂无匹配商品。可调整搜索条件或新增商品。');
      pagination('productPagination', page, data.total, loadProducts);
    } catch (error) {
      if (request === productRequest) placeholder('productRows', 6, error.message, () => loadProducts(page));
    }
  }
  function changeStatus(product, status) {
    const label = status === 'active' ? '上架' : '下架';
    confirm(`确认${label}「${product.title}」？${status === 'inactive' ? '已有有效购买记录仍可领取。' : '请确认商品介绍、价格和网盘链接已核对。'}`, async () => {
      try {
        dataOf(await api(`${base}/assessment-products/${encodeURIComponent(productId(product))}`, { method: 'PATCH', body: { status } }));
        toast(`商品已${label}`); state.homeLoaded = false; loadProducts(state.productPage);
      } catch (error) { toast(error.message, 'error'); }
    });
  }

  function requestCloseEditor() {
    if (state.dirty) { confirm('商品尚未保存，确认放弃本次修改？', closeEditor); return; }
    closeEditor();
  }
  function closeEditor() {
    state.editorRequest += 1;
    state.dirty = false;
    byId('productEditor').hidden = true;
    byId('panel-products').hidden = state.tab !== 'products';
    byId('addProduct').hidden = state.tab !== 'products';
  }
  async function editProduct(id = null) {
    const request = ++state.editorRequest;
    notice('');
    let product = {};
    if (id) {
      try { product = dataOf(await GET(`${base}/assessment-products/${encodeURIComponent(id)}`)).product; }
      catch (error) { if (request === state.editorRequest) notice(`无法加载商品：${error.message}`); return; }
      if (request !== state.editorRequest) return;
      if (!product) { notice('商品不存在，请刷新列表'); return; }
    }
    state.editId = id; state.selected.clear();
    byId('productForm').reset();
    textFields.forEach(key => { byId(`f_${key}`).value = product[key] || ''; });
    byId('f_priceCents').value = 900;
    byId('f_claimDays').value = id ? (product.claimDays == null ? '' : product.claimDays) : 365;
    byId('f_sortOrder').value = product.sortOrder || 0;
    byId('f_status').value = product.status || 'draft';
    byId('f_sampleImages').value = (product.sampleImages || []).join('\n');
    (product.companies || []).forEach(company => { const record = rememberCompany(company); state.selected.set(record.id, record); });
    (product.companyIds || []).forEach(companyId => {
      if (!state.selected.has(Number(companyId))) state.selected.set(Number(companyId), state.companies.get(Number(companyId)) || { id: Number(companyId), name: `公司 ${companyId}` });
    });
    state.dirty = false; errorAt('editorError', '');
    byId('editorTitle').textContent = id ? '编辑商品' : '新增商品';
    byId('panel-products').hidden = true; byId('addProduct').hidden = true;
    byId('productEditor').hidden = false;
    renderSelectedCompanies(); updatePrice(); updateRequiredFields();
    byId('f_title').focus();
    await searchCompanies(true);
  }
  function updatePrice() {
    byId('pricePreview').textContent = '统一售价 ¥9.00，服务端固定为 900 分';
  }
  function updateRequiredFields() {
    const required = byId('f_status').value === 'active';
    ['description', 'catalogText', 'sourceDescription', 'driveName', 'driveUrl'].forEach(key => { byId(`f_${key}`).required = required; });
  }
  function lockEditor(locked) {
    byId('productForm').querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = locked; });
    ['closeEditor', 'cancelEditor'].forEach(id => { byId(id).disabled = locked; });
    document.querySelectorAll('[data-tab]').forEach(control => { control.disabled = locked; });
  }
  function renderSelectedCompanies() {
    byId('selectedCompanies').replaceChildren(...Array.from(state.selected.values()).map(company => button(`${company.name} · 移除`, () => {
      state.selected.delete(company.id); state.dirty = true; renderSelectedCompanies();
      byId('companyResults').querySelectorAll('input').forEach(input => { if (Number(input.value) === company.id) input.checked = false; });
    })));
  }
  async function searchCompanies(reset) {
    const keyword = byId('companyKeyword').value.trim();
    if (reset) { state.companyPage = 1; state.companyKeyword = keyword; }
    const request = ++state.companyRequest; const page = state.companyPage;
    byId('searchCompanies').disabled = true; byId('moreCompanies').disabled = true;
    try {
      // This is the public company catalogue: never attach the admin token.
      const params = new URLSearchParams({ page, pageSize: 30, keyword: state.companyKeyword });
      const response = await fetch(`${window.ADMIN_API}/api/companies?${params}`, { credentials: 'omit' });
      if (!response.ok) throw new Error('公司列表加载失败，请重试');
      const data = dataOf(await response.json());
      if (request !== state.companyRequest) return;
      if (reset) byId('companyResults').replaceChildren();
      const rows = data.list || data.items || [];
      rows.forEach(company => {
        const record = rememberCompany(company); const label = node('label', undefined, 'assessment-company-choice');
        const input = node('input'); input.type = 'checkbox'; input.value = record.id; input.checked = state.selected.has(record.id);
        input.addEventListener('change', () => {
          if (input.checked) state.selected.set(record.id, record); else state.selected.delete(record.id);
          state.dirty = true; renderSelectedCompanies();
        });
        label.append(input, node('span', record.name)); byId('companyResults').append(label);
      });
      if (!rows.length && reset) byId('companyResults').append(node('p', '未找到公司，请换个关键词搜索。', 'assessment-help'));
      state.companyTotal = Number(data.total || 0);
      byId('moreCompanies').hidden = page * 30 >= state.companyTotal;
    } catch (error) { toast(error.message, 'error'); }
    finally { if (request === state.companyRequest) { byId('searchCompanies').disabled = false; byId('moreCompanies').disabled = false; } }
  }
  function getPayload() {
    const body = {};
    textFields.forEach(key => { body[key] = byId(`f_${key}`).value.trim(); });
    body.priceCents = 900;
    body.claimDays = byId('f_claimDays').value === '' ? null : Number(byId('f_claimDays').value);
    body.sortOrder = Number(byId('f_sortOrder').value);
    body.status = byId('f_status').value;
    body.sampleImages = byId('f_sampleImages').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    body.companyIds = Array.from(state.selected.keys());
    body.deliveryMethod = '网盘链接交付';
    if (body.claimDays !== null && (!Number.isSafeInteger(body.claimDays) || body.claimDays < 1 || body.claimDays > 36500)) throw new Error('领取天数请填写 1 至 36500 之间的整数，或留空');
    if (!Number.isSafeInteger(body.sortOrder)) throw new Error('排序请填写整数');
    if (!safeUrl(body.coverUrl) || body.sampleImages.some(url => !safeUrl(url))) throw new Error('图片请使用 HTTPS 地址或 /uploads/ 路径');
    if (body.sampleImages.length > 12) throw new Error('示例图最多 12 张');
    if (body.driveUrl && (!safeUrl(body.driveUrl) || !body.driveUrl.startsWith('https://'))) throw new Error('网盘链接必须使用 HTTPS 地址');
    if (body.driveUrl && [body.title, body.summary, body.description, body.catalogText, body.sourceDescription].some(value => value.includes(body.driveUrl))) throw new Error('公开介绍或说明中包含私有网盘链接，请移至网盘交付配置');
    return body;
  }
  async function saveProduct(event) {
    event.preventDefault(); if (byId('saveProduct').disabled) return;
    errorAt('editorError', ''); let body;
    try { body = getPayload(); } catch (error) { errorAt('editorError', error.message); return; }
    byId('saveProduct').disabled = true; byId('saveProduct').textContent = '正在保存…';
    lockEditor(true);
    try {
      dataOf(await (state.editId ? api(`${base}/assessment-products/${encodeURIComponent(state.editId)}`, { method: 'PATCH', body }) : POST(`${base}/assessment-products`, body)));
      state.dirty = false; state.homeLoaded = false; closeEditor(); toast('商品已保存'); await loadProducts(state.productPage);
    } catch (error) { errorAt('editorError', error.message); }
    finally { lockEditor(false); byId('saveProduct').disabled = false; byId('saveProduct').textContent = '保存商品'; }
  }

  async function loadHome() {
    notice(''); byId('saveHome').disabled = true; byId('addHomeItem').disabled = true;
    try {
      // Fetch every published page so recommendation choices never silently stop at page one.
      const products = []; let page = 1; let total = Infinity;
      while (products.length < total) {
        const data = dataOf(await GET(`${base}/assessment-products?${new URLSearchParams({ status: 'active', page, pageSize: 100 })}`));
        const items = data.items || []; products.push(...items); total = Number(data.total || products.length);
        if (!items.length) break; page += 1;
      }
      const home = dataOf(await GET(`${base}/assessment-home`));
      state.products = products;
      products.forEach(product => (product.companies || []).forEach(rememberCompany));
      state.homeItems = (home.items || []).map(item => ({ companyId: Number(item.companyId), productId: String(item.productId), sortOrder: Number(item.sortOrder || 0) }));
      byId('homeEnabled').checked = !!home.enabled; state.homeLoaded = true; renderHome();
    } catch (error) { notice(`首页推荐加载失败：${error.message}。切换页签可重新加载。`); }
    finally { byId('saveHome').disabled = !state.homeLoaded; byId('addHomeItem').disabled = !state.homeLoaded || state.homeItems.length >= 3; }
  }
  function productHasCompany(product, companyId) {
    return (product.companyIds || []).map(Number).includes(Number(companyId)) || (product.companies || []).some(company => Number(company.id) === Number(companyId));
  }
  function renderHome() {
    const selectableCompanies = new Map();
    state.products.forEach(product => (product.companies || []).forEach(company => { const record = rememberCompany(company); selectableCompanies.set(record.id, record); }));
    const rows = state.homeItems.map((item, index) => {
      const row = node('div', undefined, 'assessment-recommendation');
      const group = (labelText, control) => { const wrapper = node('div', undefined, 'form-group'); const label = node('label', labelText); label.htmlFor = control.id; wrapper.append(label, control); return wrapper; };
      const company = node('select'); company.id = `home-company-${index}`; company.required = true;
      company.append(option('', '选择公司'));
      Array.from(selectableCompanies.values()).forEach(record => company.append(option(record.id, record.name)));
      if (item.companyId && !selectableCompanies.has(item.companyId)) company.append(option(item.companyId, `${state.companies.get(item.companyId)?.name || `公司 ${item.companyId}`}（无在售资料）`));
      company.value = item.companyId || '';
      const product = node('select'); product.id = `home-product-${index}`; product.required = true;
      product.append(option('', '选择主推商品'));
      const candidates = state.products.filter(record => productHasCompany(record, item.companyId));
      candidates.forEach(record => product.append(option(productId(record), `${record.title} · ${money(record.priceCents)}`)));
      if (item.productId && !candidates.some(record => productId(record) === item.productId)) product.append(option(item.productId, `商品 ${item.productId}（已下架或关联失效，请替换）`));
      product.value = item.productId || ''; product.disabled = !item.companyId;
      const sort = node('input'); sort.id = `home-sort-${index}`; sort.type = 'number'; sort.step = '1'; sort.value = item.sortOrder;
      company.addEventListener('change', () => { item.companyId = Number(company.value); item.productId = ''; renderHome(); });
      product.addEventListener('change', () => { item.productId = product.value; });
      sort.addEventListener('input', () => { item.sortOrder = Number(sort.value); });
      row.append(group('公司', company), group('主推商品', product), group('排序', sort), button('移除', () => { state.homeItems.splice(index, 1); renderHome(); }));
      return row;
    });
    byId('homeRecommendations').replaceChildren(...rows);
    if (!rows.length) byId('homeRecommendations').append(node('p', '尚未配置首页推荐。添加公司并选择对应的在售资料。', 'assessment-help'));
    byId('addHomeItem').disabled = state.homeItems.length >= 3;
  }
  async function saveHome(event) {
    event.preventDefault(); if (byId('saveHome').disabled) return;
    const items = state.homeItems;
    if (items.length > 3 || new Set(items.map(item => item.companyId)).size !== items.length || new Set(items.map(item => item.productId)).size !== items.length) { notice('最多推荐 3 家公司，公司和商品均不能重复。'); return; }
    if (items.some(item => !item.companyId || !item.productId || !Number.isSafeInteger(item.sortOrder) || !state.products.some(product => productId(product) === item.productId && productHasCompany(product, item.companyId)))) { notice('请为每行选择真实公司、该公司关联的在售商品与整数排序。'); return; }
    if (byId('homeEnabled').checked && !items.length) { notice('启用首页模块前，请至少添加一条推荐。'); return; }
    byId('saveHome').disabled = true;
    try { dataOf(await PUT(`${base}/assessment-home`, { enabled: byId('homeEnabled').checked, items })); notice(''); toast('首页推荐已保存'); }
    catch (error) { notice(error.message); }
    finally { byId('saveHome').disabled = false; }
  }

  async function loadOrders(page = 1) {
    const request = ++orderRequest; state.orderPage = page; placeholder('orderRows', 6, '正在加载订单…');
    const params = new URLSearchParams({ page, pageSize, keyword: byId('orderKeyword').value.trim(), userId: byId('orderUserId').value, status: byId('orderStatus').value });
    try {
      const data = dataOf(await GET(`${base}/assessment-orders?${params}`));
      if (request !== orderRequest) return;
      byId('orderRows').replaceChildren(...(data.items || []).map(order => {
        const row = node('tr'); const identifier = node('td'); identifier.append(node('strong', order.orderNo), node('div', `用户 ${order.userId || '—'}`, 'assessment-help'));
        const deliveryLabel = order.deliveryStatus === 'pending' ? '待交付' : statusNames[order.deliveryStatus] || order.deliveryStatus || '未交付';
        const statuses = node('td'); statuses.append(badge(order.status), node('div', deliveryLabel, 'assessment-help'));
        if (order.status === 'payment_review') statuses.append(node('div', '闭单后收到付款，资料未交付。请核对支付流水并处理退款。', 'assessment-help'));
        const dates = node('td'); dates.append(node('div', date(order.paidAt || order.createdAt)), node('div', order.expiresAt ? `领取截至 ${date(order.expiresAt)}` : '无领取到期日', 'assessment-help'));
        const actions = node('td');
        if (order.status === 'paid' && ['failed', 'pending', 'none', 'not_ready'].includes(order.deliveryStatus || 'none')) actions.append(button('重试交付', event => retryDelivery(order, event.currentTarget)));
        if (['paid', 'payment_review'].includes(order.status)) actions.append(button('记录人工退款', () => openRefund(order)));
        if (!actions.childNodes.length) actions.append(node('span', '—'));
        row.append(identifier, node('td', order.title || order.productTitle || '—'), node('td', money(order.amount == null ? order.priceCents : order.amount)), statuses, dates, actions); return row;
      }));
      if (!(data.items || []).length) placeholder('orderRows', 6, '暂无匹配订单。');
      pagination('orderPagination', page, data.total, loadOrders);
    } catch (error) { if (request === orderRequest) placeholder('orderRows', 6, error.message, () => loadOrders(page)); }
  }
  async function retryDelivery(order, control) {
    if (control.disabled) return; control.disabled = true;
    try { dataOf(await POST(`${base}/assessment-orders/${encodeURIComponent(order.orderNo)}/retry-delivery`, {})); toast('交付已重新处理'); await loadOrders(state.orderPage); }
    catch (error) { toast(error.message, 'error'); }
    finally { control.disabled = false; }
  }
  function openRefund(order) {
    state.refundOrder = order; byId('refundForm').reset(); errorAt('refundError', '');
    byId('refundOrder').textContent = `${order.orderNo} · ${money(order.amount == null ? order.priceCents : order.amount)}`;
    byId('refundDialog').showModal(); byId('refundReference').focus();
  }
  async function saveRefund(event) {
    event.preventDefault(); if (byId('saveRefund').disabled || !state.refundOrder) return;
    const externalReference = byId('refundReference').value.trim(); const reason = byId('refundReason').value.trim();
    if (!externalReference || !reason) { errorAt('refundError', '请填写真实退款凭证和退款原因'); return; }
    byId('saveRefund').disabled = true;
    try {
      dataOf(await POST(`${base}/assessment-orders/${encodeURIComponent(state.refundOrder.orderNo)}/refund-completed`, { confirmExternalRefund: true, externalReference, note: reason }));
      byId('refundDialog').close(); state.refundOrder = null; toast('退款完成记录已保存，领取权限已撤销'); await loadOrders(state.orderPage);
    } catch (error) { errorAt('refundError', error.message); }
    finally { byId('saveRefund').disabled = false; }
  }
  async function loadInstructions() {
    if(state.instructionsSaving || state.tab!=='instructions')return;
    const request=++state.instructionsRequest,editVersion=state.instructionsEditVersion;
    const live=()=>request===state.instructionsRequest&&state.tab==='instructions';
    byId('saveInstructions').disabled=true;byId('reloadInstructions').disabled=true;
    byId('instructionsFields').disabled=true;
    try {
      const data=dataOf(await GET(`${base}/assessment-instructions`));
      if(!live() || editVersion!==state.instructionsEditVersion)return;
      instructionFields.forEach(key=>{byId(`shared_${key}`).value=data[key]||'';});
      state.instructionsVersion=data.version;state.instructionsLoaded=true;state.instructionsDirty=false;
      errorAt('instructionsError','');
      byId('instructionsStatus').textContent=data.configured?`当前第 ${data.version} 版，所有商品共用。`:'尚未配置完整，商品可保存草稿，暂不可上架或购买。';
    } catch(error) { if(live())errorAt('instructionsError',`统一说明加载失败：${error.message}。请重新加载。`); }
    finally {if(live()){byId('instructionsFields').disabled=false;byId('saveInstructions').disabled=!state.instructionsLoaded;byId('reloadInstructions').disabled=false;}}
  }
  async function saveInstructions(event) {
    event.preventDefault();if(byId('saveInstructions').disabled||!state.instructionsLoaded)return;
    const body={expectedVersion:state.instructionsVersion};
    instructionFields.forEach(key=>{body[key]=byId(`shared_${key}`).value.trim();});
    if(instructionFields.some(key=>!body[key])){errorAt('instructionsError','请填写四项统一说明后保存');return;}
    const request=++state.instructionsRequest,editVersion=state.instructionsEditVersion;
    state.instructionsSaving=true;
    document.querySelectorAll('[data-tab]').forEach(control=>{control.disabled=true;});
    byId('saveInstructions').disabled=true;byId('reloadInstructions').disabled=true;
    byId('instructionsFields').disabled=true;
    try {
      const data=dataOf(await PUT(`${base}/assessment-instructions`,body));
      if(request!==state.instructionsRequest)return;
      state.instructionsVersion=data.version;
      if(editVersion===state.instructionsEditVersion)state.instructionsDirty=false;
      byId('instructionsStatus').textContent=`当前第 ${data.version} 版，所有商品共用。`;
      errorAt('instructionsError','');toast('统一说明已保存，待付款订单已关闭，已支付订单不受影响');
    } catch(error) {if(request===state.instructionsRequest)errorAt('instructionsError',`${error.message}；未保存内容已保留，确认后可重新加载。`);}
    finally {state.instructionsSaving=false;document.querySelectorAll('[data-tab]').forEach(control=>{control.disabled=false;});if(request===state.instructionsRequest){byId('instructionsFields').disabled=false;byId('saveInstructions').disabled=false;byId('reloadInstructions').disabled=false;}}
  }
  function switchTab(tab) {
    if(state.instructionsSaving)return;
    const perform = () => {
      if(tab!=='instructions')state.instructionsRequest+=1;
      closeEditor(); state.tab = tab; notice('');
      document.querySelectorAll('[data-tab]').forEach(control => { const active = control.dataset.tab === tab; control.classList.toggle('active', active); control.setAttribute('aria-selected', String(active)); });
      ['products', 'home', 'orders', 'instructions'].forEach(name => { byId(`panel-${name}`).hidden = name !== tab; });
      byId('addProduct').hidden = tab !== 'products';
      if (tab === 'home' && !state.homeLoaded) loadHome();
      if (tab === 'orders') loadOrders(1);
      if (tab === 'instructions' && !state.instructionsLoaded) loadInstructions();
    };
    if (!byId('productEditor').hidden && state.dirty) { confirm('商品尚未保存，确认放弃并切换？', perform); return; }
    if(state.instructionsDirty&&tab!=='instructions'){confirm('统一说明尚未保存，确认放弃并切换？',()=>{state.instructionsDirty=false;state.instructionsLoaded=false;perform();});return;}
    perform();
  }

  initPage('assessmentProducts', '测评资料管理', () => {
    if (!getToken() || !canAccess('memberships')) return;
    document.querySelectorAll('[data-tab]').forEach(control => control.addEventListener('click', () => switchTab(control.dataset.tab)));
    byId('addProduct').addEventListener('click', () => editProduct());
    byId('productSearch').addEventListener('submit', event => { event.preventDefault(); loadProducts(1); });
    byId('productStatus').addEventListener('change', () => loadProducts(1));
    byId('orderSearch').addEventListener('submit', event => { event.preventDefault(); loadOrders(1); });
    byId('productForm').addEventListener('submit', saveProduct);
    byId('instructionsForm').addEventListener('submit',saveInstructions);
    byId('instructionsForm').addEventListener('input',()=>{state.instructionsDirty=true;state.instructionsEditVersion+=1;});
    byId('reloadInstructions').addEventListener('click',()=>{if(byId('reloadInstructions').disabled||state.instructionsSaving)return;if(state.instructionsDirty)confirm('重新加载将放弃未保存的统一说明，确认继续？',loadInstructions);else loadInstructions();});
    byId('productForm').addEventListener('input', () => { state.dirty = true; });
    byId('productForm').addEventListener('change', () => { state.dirty = true; });
    byId('f_priceCents').addEventListener('input', updatePrice);
    byId('f_status').addEventListener('change', updateRequiredFields);
    byId('searchCompanies').addEventListener('click', () => searchCompanies(true));
    byId('companyKeyword').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchCompanies(true); } });
    byId('moreCompanies').addEventListener('click', () => { state.companyPage += 1; searchCompanies(false); });
    byId('closeEditor').addEventListener('click', requestCloseEditor); byId('cancelEditor').addEventListener('click', requestCloseEditor);
    byId('homeForm').addEventListener('submit', saveHome);
    byId('addHomeItem').addEventListener('click', () => { if (state.homeItems.length < 3) { state.homeItems.push({ companyId: 0, productId: '', sortOrder: state.homeItems.length }); renderHome(); } });
    byId('refundForm').addEventListener('submit', saveRefund);
    byId('cancelRefund').addEventListener('click', () => { byId('refundDialog').close(); state.refundOrder = null; });
    window.addEventListener('beforeunload', event => { if (state.instructionsDirty || state.dirty && !byId('productEditor').hidden) { event.preventDefault(); event.returnValue = ''; } });
    loadProducts(1);
  });
})();
