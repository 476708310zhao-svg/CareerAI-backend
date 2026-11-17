'use strict';

const { randomBytes } = require('node:crypto');

function compactJob(job) {
  if (!job || typeof job !== 'object' || typeof job.id !== 'string' || job.id.length > 256) return null;
  const limited = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : value;
  return {
    ...job,
    title: limited(job.title, 300), company: limited(job.company, 200),
    companyLogo: typeof job.companyLogo === 'string' && job.companyLogo.length > 2048 ? '' : job.companyLogo,
    location: limited(job.location, 200), region: limited(job.region, 80),
    salary: limited(job.salary, 120), jobType: limited(job.jobType, 80),
    industry: limited(job.industry, 80), description: limited(job.description, 2000),
    requirements: Array.isArray(job.requirements)
      ? job.requirements.slice(0, 8).map(value => limited(value, 300)) : [],
    tags: Array.isArray(job.tags) ? job.tags.slice(0, 12).map(value => limited(value, 100)) : [],
    applyUrl: typeof job.applyUrl === 'string' && job.applyUrl.length > 2048 ? '' : job.applyUrl
  };
}

function createJobListSnapshotStore(options = {}) {
  const now = options.now || Date.now;
  const ttlMs = options.ttlMs || 5 * 60_000;
  const maxSnapshots = options.maxSnapshots || 64;
  const maxItems = options.maxItems || 200;
  const maxSnapshotBytes = options.maxSnapshotBytes || 2 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes || 16 * 1024 * 1024;
  const snapshots = new Map();
  const cursors = new Map();
  let totalBytes = 0;

  function remove(snapshot) {
    snapshots.delete(snapshot.id);
    totalBytes -= snapshot.bytes;
    for (const cursor of snapshot.cursors.values()) cursors.delete(cursor);
  }

  function prune() {
    for (const snapshot of snapshots.values()) {
      if (snapshot.expiresAt <= now()) remove(snapshot);
    }
  }

  function nextCursor(snapshot, offset) {
    if (offset >= snapshot.items.length) return null;
    if (snapshot.cursors.has(offset)) return snapshot.cursors.get(offset);
    const cursor = randomBytes(24).toString('base64url');
    snapshot.cursors.set(offset, cursor);
    cursors.set(cursor, { snapshot, offset });
    return cursor;
  }

  function page(snapshot, offset) {
    const list = snapshot.items.slice(offset, offset + snapshot.pageSize);
    const nextOffset = offset + list.length;
    return {
      list,
      total: snapshot.items.length,
      totalScope: 'retrieved_snapshot',
      page: Math.floor(offset / snapshot.pageSize) + 1,
      pageSize: snapshot.pageSize,
      totalPages: Math.ceil(snapshot.items.length / snapshot.pageSize) || 1,
      hasMore: nextOffset < snapshot.items.length,
      nextCursor: nextCursor(snapshot, nextOffset),
      snapshotTruncated: snapshot.snapshotTruncated,
      source: snapshot.source,
      sources: snapshot.sources,
      dataMeta: snapshot.dataMeta,
      coverage: snapshot.coverage
    };
  }

  function create(value) {
    prune();
    if (!Array.isArray(value.items)) return null;
    const { dataMetaForItems, ...baseValue } = value;
    const items = [];
    const byteLimit = Math.min(maxSnapshotBytes, maxTotalBytes);
    let bytes = 2;
    let snapshotTruncated = false;
    for (const original of value.items) {
      if (items.length >= maxItems) { snapshotTruncated = true; break; }
      const job = compactJob(original);
      if (!job) { snapshotTruncated = true; continue; }
      const jobBytes = Buffer.byteLength(JSON.stringify(job), 'utf8') + (items.length ? 1 : 0);
      if (bytes + jobBytes > byteLimit) { snapshotTruncated = true; continue; }
      items.push(job);
      bytes += jobBytes;
    }
    const resolved = {
      ...baseValue, items, snapshotTruncated,
      sources: [...new Set(items.map(job => job.source).filter(Boolean))],
      dataMeta: typeof dataMetaForItems === 'function' ? dataMetaForItems(items) : value.dataMeta
    };
    if (items.length <= value.pageSize) {
      return page({ ...resolved, cursors: new Map() }, 0);
    }
    while (snapshots.size >= maxSnapshots || totalBytes + bytes > maxTotalBytes) {
      const oldest = snapshots.values().next().value;
      if (!oldest) break;
      remove(oldest);
    }
    const snapshot = {
      ...resolved,
      id: randomBytes(24).toString('base64url'),
      bytes,
      expiresAt: now() + ttlMs,
      cursors: new Map()
    };
    snapshots.set(snapshot.id, snapshot);
    totalBytes += bytes;
    return page(snapshot, 0);
  }

  function read(cursor, fingerprint, isCurrent) {
    prune();
    const entry = cursors.get(cursor);
    if (!entry) return { status: 'expired' };
    if (entry.snapshot.fingerprint !== fingerprint) return { status: 'mismatch' };
    if (typeof isCurrent === 'function' && !isCurrent(entry.snapshot.items)) {
      remove(entry.snapshot);
      return { status: 'expired' };
    }
    return { status: 'ok', page: page(entry.snapshot, entry.offset) };
  }

  return { create, read };
}

module.exports = { createJobListSnapshotStore };
