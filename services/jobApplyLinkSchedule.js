const crypto = require('node:crypto');
const { runLinkCheckBatch } = require('./jobApplyLinkHealth');

const LEASE_MS = 5 * 60 * 1000;
const LINK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function shanghaiHourSlot(nowMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(nowMs));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}`;
}

async function runScheduledLinkCheck(options = {}) {
  const store = options.store || require('../utils/adminJobsStore');
  const runBatch = options.runBatch || runLinkCheckBatch;
  const now = options.now || Date.now;
  const startedAt = now();
  const slot = shanghaiHourSlot(startedAt);
  const owner = crypto.randomUUID();
  const claim = store.claimScheduledLinkCheck({ slot, owner, nowMs: startedAt, leaseMs: LEASE_MS });
  if (!claim.claimed) return { status: 'skipped', reason: claim.reason, slot };

  let summary;
  try {
    summary = await runBatch({ limit: options.limit || 10, store, minAgeMs: LINK_COOLDOWN_MS, nowMs: startedAt });
  } catch (error) {
    try { store.finishScheduledLinkCheck({ slot, owner, nowMs: now(), succeeded: false }); }
    catch (_) { return { status: 'failed', reason: 'batch_and_release_failed', slot }; }
    return { status: 'failed', reason: 'batch_failed', slot };
  }
  const finished = store.finishScheduledLinkCheck({ slot, owner, nowMs: now(), succeeded: true, summary });
  if (!finished) return { status: 'failed', reason: 'lease_lost', slot };
  return { status: 'ran', slot, summary };
}

module.exports = { runScheduledLinkCheck, shanghaiHourSlot, LEASE_MS, LINK_COOLDOWN_MS };
