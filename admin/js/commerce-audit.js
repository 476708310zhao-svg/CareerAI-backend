'use strict';
if (requireAuth() && !canAccess('memberships')) location.replace('dashboard.html');
const byId = id => document.getElementById(id);
let cursor = null;
let requestNo = 0;
function show(message) { byId('notice').textContent = message; }
function cells(row, kind) {
  return kind === 'refunds'
    ? [row.refundNo, row.orderNo, row.amount, row.status, row.activeGrants, row.revokedGrants, row.completionLedgerEvents, row.createdAt]
    : [row.orderNo, row.planName, row.amount, row.status, row.provider, JSON.stringify(row.grantStates || {}), row.createdAt];
}
function heading(kind) { return kind === 'refunds' ? ['退款号','订单号','金额（分）','状态','活跃权益','已撤销权益','完成账本事件','申请时间'] : ['订单号','产品','金额（分）','状态','渠道','权益状态数','创建时间']; }
async function load(append = false) {
  if (!canAccess('memberships')) return;
  const seq = ++requestNo;
  const kind = byId('kind').value;
  const q = new URLSearchParams({ kind, dataClass: byId('dataClass').value, limit: '20' });
  if (byId('since').value) q.set('since', byId('since').value);
  if (append && cursor) q.set('beforeId', String(cursor));
  show('读取中…');
  const result = await api('/admin/api/v4/commerce/audit?' + q.toString());
  if (seq !== requestNo) return;
  if (!result || result.code !== 0) { show('读取失败，请重试。'); return; }
  const data = result.data || {};
  const head = byId('head'), body = byId('rows');
  if (!append) { head.replaceChildren(); body.replaceChildren(); const tr = document.createElement('tr'); for (const label of heading(kind)) { const th = document.createElement('th'); th.textContent = label; tr.appendChild(th); } head.appendChild(tr); }
  for (const row of data.items || []) { const tr = document.createElement('tr'); for (const value of cells(row, kind)) { const td = document.createElement('td'); td.textContent = value == null ? '—' : String(value); tr.appendChild(td); } body.appendChild(tr); }
  cursor = data.nextCursor || null; byId('more').hidden = !cursor;
  show((data.items || []).length ? '仅展示必要审计字段；非 Mock 记录需核对支付后台。' : '暂无符合条件的记录。');
}
byId('search').addEventListener('click', () => { cursor = null; load(false); });
byId('more').addEventListener('click', () => load(true));
load(false);
