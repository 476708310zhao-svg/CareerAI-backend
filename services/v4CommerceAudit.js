'use strict';

const db = require('../db/database');

function queryOptions(input = {}) {
  if (input.dataClass && !['test', 'productionCandidate'].includes(input.dataClass)) {
    const error = new Error('数据类别无效'); error.status = 400; throw error;
  }
  const dataClass = input.dataClass === 'test' ? 'test' : 'productionCandidate';
  const limit = Number(input.limit || 20);
  const beforeId = Number(input.beforeId || 0);
  const since = String(input.since || '');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(beforeId) || beforeId < 0 ||
    (since && !/^\d{4}-\d{2}-\d{2}$/.test(since))) {
    const error = new Error('筛选条件无效'); error.status = 400; throw error;
  }
  return { dataClass, limit, beforeId, since };
}

function listOrders(input) {
  const o = queryOptions(input);
  const conditions = [o.dataClass === 'test' ? "provider='mock'" : "provider!='mock'"];
  const args = [];
  if (o.beforeId) { conditions.push('id<?'); args.push(o.beforeId); }
  if (o.since) { conditions.push('created_at>=?'); args.push(`${o.since} 00:00:00`); }
  const rows = db.prepare(`SELECT id,order_no AS orderNo,plan_name AS planName,amount,status,provider,
    created_at AS createdAt,paid_at AS paidAt FROM orders WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT ?`)
    .all(...args, o.limit + 1);
  const page = rows.slice(0, o.limit);
  const grant = db.prepare('SELECT status,COUNT(*) AS count FROM entitlement_grants_v4 WHERE order_no=? GROUP BY status');
  return { dataClass: o.dataClass, classification: 'provider_based_unverified', items: page.map(row => ({
    ...row, grantStates: Object.fromEntries(grant.all(row.orderNo).map(item => [item.status, item.count]))
  })), nextCursor: rows.length > o.limit ? page[page.length - 1].id : null };
}

function listRefunds(input) {
  const o = queryOptions(input);
  const conditions = [o.dataClass === 'test' ? "o.provider='mock'" : "o.provider!='mock'"];
  const args = [];
  if (o.beforeId) { conditions.push('r.id<?'); args.push(o.beforeId); }
  if (o.since) { conditions.push('r.created_at>=?'); args.push(`${o.since} 00:00:00`); }
  const rows = db.prepare(`SELECT r.id,r.refund_no AS refundNo,r.order_no AS orderNo,r.amount,r.status,
    r.created_at AS createdAt,r.updated_at AS updatedAt,o.provider,
    (SELECT COUNT(*) FROM entitlement_grants_v4 g WHERE g.order_no=r.order_no AND g.status='active') AS activeGrants,
    (SELECT COUNT(*) FROM entitlement_grants_v4 g WHERE g.order_no=r.order_no AND g.status='revoked') AS revokedGrants,
    (SELECT COUNT(*) FROM commerce_ledger_v4 l WHERE l.refund_no=r.refund_no AND l.event_type='refund_completed') AS completionLedgerEvents
    FROM payment_refunds_v4 r JOIN orders o ON o.order_no=r.order_no AND o.user_id=r.user_id
    WHERE ${conditions.join(' AND ')} ORDER BY r.id DESC LIMIT ?`).all(...args, o.limit + 1);
  const page = rows.slice(0, o.limit);
  return { dataClass: o.dataClass, classification: 'provider_based_unverified', items: page,
    nextCursor: rows.length > o.limit ? page[page.length - 1].id : null };
}

module.exports = { listOrders, listRefunds };
