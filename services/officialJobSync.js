'use strict';

const pilot = require('./cnOfficialPilot');

function hasSchema(db) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='official_job_postings'").get();
}

function assertSchema(db) {
  if (!hasSchema(db)) throw new Error('official_job_schema_missing: apply migration 0034 first');
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch (_) { return ''; }
}

function postingRow(board, job, seenAt) {
  const id = String(job.job_id || '');
  const country = String(job.job_country || '').trim().toLowerCase();
  const applyUrl = httpsUrl(job.job_apply_link);
  const sourceUrl = httpsUrl(job.job_source_url);
  const title = String(job.job_title || '').trim();
  if (!id.startsWith(`official_${board.id}_`) || !/^[\w-]+$/.test(id) ||
      !/^[a-z]{2}$/.test(country) || (board.countryCode && country !== board.countryCode) ||
      !title || !applyUrl || !sourceUrl || !String(job.job_source_reference || '').trim()) return null;
  return {
    id, board_id: board.id, provider: board.adapter,
    company: String(job.employer_name || board.name).trim().slice(0, 160), country,
    title: title.slice(0, 240), location: String(job.job_city || '').trim().slice(0, 240),
    description: '',
    job_type: String(job.job_employment_type || '').slice(0, 80),
    apply_url: applyUrl, source_url: sourceUrl,
    source_reference: String(job.job_source_reference).slice(0, 240),
    published_at: String(job.job_posted_at_datetime_utc || ''),
    source_updated_at: String(job.job_updated_at_datetime_utc || ''),
    seen_at: seenAt
  };
}

function insertRun(db, run) {
  const result = db.prepare(`INSERT INTO official_job_sync_runs
    (board_id,provider,status,raw_count,accepted_count,inserted_count,updated_count,
     missing_count,closed_count,error_code,started_at,completed_at)
    VALUES (@board_id,@provider,@status,@raw_count,@accepted_count,@inserted_count,
     @updated_count,@missing_count,@closed_count,@error_code,@started_at,@completed_at)`).run(run);
  return { ...run, id: result.lastInsertRowid };
}

async function syncBoard(db, board, options = {}) {
  assertSchema(db);
  if (!board || !['greenhouse', 'lever', 'ashby', 'smartrecruiters'].includes(board.adapter)) throw new Error('unsupported_official_board');
  const clock = options.clock || (() => new Date().toISOString());
  const startedAt = clock();
  let snapshot;
  try {
    snapshot = await (options.fetchSnapshot || pilot.fetchBoardSnapshot)(board, options.fetchOptions || {});
    if (!snapshot || !Array.isArray(snapshot.jobs) || !Number.isSafeInteger(snapshot.rawCount)
        || snapshot.rawCount < snapshot.jobs.length) throw new Error('invalid_board_snapshot');
  } catch (error) {
    return insertRun(db, {
      board_id: board.id, provider: board.adapter, status: 'error', raw_count: 0,
      accepted_count: 0, inserted_count: 0, updated_count: 0, missing_count: 0,
      closed_count: 0, error_code: String(error.code || error.reason || error.message || 'upstream_error').slice(0, 120),
      started_at: startedAt, completed_at: clock()
    });
  }
  const completedAt = clock();
  const rows = snapshot.jobs.map(job => postingRow(board, job, completedAt));
  const invalidPosting = rows.some(row => !row);
  const unique = new Map(rows.filter(Boolean).map(row => [row.id, row]));
  if (invalidPosting || unique.size !== rows.length) {
    return insertRun(db, {
      board_id: board.id, provider: board.adapter, status: 'error', raw_count: snapshot.rawCount,
      accepted_count: 0, inserted_count: 0, updated_count: 0, missing_count: 0,
      closed_count: 0, error_code: invalidPosting ? 'invalid_official_posting' : 'duplicate_official_posting_id',
      started_at: startedAt, completed_at: completedAt
    });
  }
  return db.transaction(() => {
    const previous = db.prepare('SELECT id,status,missing_successes FROM official_job_postings WHERE board_id=?').all(board.id);
    const oldOpen = previous.filter(row => row.status === 'open');
    const missing = oldOpen.filter(row => !unique.has(row.id));
    const anomalous = missing.length > 0 && (unique.size === 0 ||
      (oldOpen.length >= 5 && missing.length / oldOpen.length > 0.5));
    const upsert = db.prepare(`INSERT INTO official_job_postings
      (id,board_id,provider,company,country,title,location,description,job_type,apply_url,
       source_url,source_reference,published_at,source_updated_at,first_seen_at,last_seen_at)
      VALUES (@id,@board_id,@provider,@company,@country,@title,@location,@description,
       @job_type,@apply_url,@source_url,@source_reference,@published_at,@source_updated_at,@seen_at,@seen_at)
      ON CONFLICT(id) DO UPDATE SET
        company=excluded.company,country=excluded.country,title=excluded.title,
        location=excluded.location,description=excluded.description,job_type=excluded.job_type,
        apply_url=excluded.apply_url,source_url=excluded.source_url,
        source_reference=excluded.source_reference,published_at=excluded.published_at,
        source_updated_at=excluded.source_updated_at,last_seen_at=excluded.last_seen_at,
        missing_successes=0,status='open',closed_at=''`);
    const existing = new Set(previous.map(row => row.id));
    let inserted = 0;
    for (const row of unique.values()) {
      upsert.run(row);
      if (!existing.has(row.id)) inserted++;
    }
    let closed = 0;
    if (!anomalous) {
      const markMissing = db.prepare(`UPDATE official_job_postings SET missing_successes=missing_successes+1,
        status=CASE WHEN missing_successes+1>=2 THEN 'closed' ELSE status END,
        closed_at=CASE WHEN missing_successes+1>=2 THEN ? ELSE closed_at END WHERE id=? AND status='open'`);
      for (const row of missing) {
        markMissing.run(completedAt, row.id);
        if (row.missing_successes + 1 >= 2) closed++;
      }
    }
    return insertRun(db, {
      board_id: board.id, provider: board.adapter,
      status: anomalous ? 'anomalous' : unique.size ? 'ok' : 'empty',
      raw_count: snapshot.rawCount, accepted_count: unique.size,
      inserted_count: inserted, updated_count: unique.size - inserted,
      missing_count: anomalous ? 0 : missing.length, closed_count: closed,
      error_code: anomalous ? 'large_disappearance_requires_review' : '',
      started_at: startedAt, completed_at: completedAt
    });
  })();
}

async function syncAll(db, options = {}) {
  assertSchema(db);
  const boards = options.boards || pilot.LIVE_BOARDS;
  const runs = [];
  for (const board of boards) runs.push(await syncBoard(db, board, options));
  return runs;
}

function readyToServe(db, boards = pilot.REALTIME_CN_BOARDS) {
  if (!hasSchema(db)) return false;
  const rows = db.prepare(`SELECT board_id,
    MAX(CASE WHEN status='ok' AND accepted_count>0 THEN 1 ELSE 0 END) AS has_success
    FROM official_job_sync_runs GROUP BY board_id`).all();
  const attempted = new Map(rows.map(row => [row.board_id, row.has_success]));
  return boards.every(board => attempted.has(board.id)) &&
    boards.some(board => attempted.get(board.id) === 1);
}

function activeRows(db) {
  if (!hasSchema(db)) return [];
  return db.prepare(`SELECT p.*,r.status AS sync_status FROM official_job_postings p
    LEFT JOIN official_job_sync_runs r ON r.id=(SELECT MAX(id) FROM official_job_sync_runs WHERE board_id=p.board_id)
    WHERE p.status='open' ORDER BY p.last_seen_at DESC`).all();
}

function overviewText(row) {
  const plain = value => String(value || '').replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const company = plain(row.company);
  const title = plain(row.title);
  const location = plain(row.location);
  const type = plain(row.job_type);
  return `本站整理的岗位概览：${company}招聘「${title}」${location ? `，工作地点为${location}` : ''}。${type ? `官网标注的岗位类型为${type}。` : ''}具体工作内容、申请条件和岗位状态请以企业官网为准。`;
}

function toRawJob(row) {
  return {
    job_id: row.id, job_title: row.title, employer_name: row.company,
    job_city: row.location, job_country: row.country.toUpperCase(),
    job_description: overviewText(row), job_employment_type: row.job_type,
    job_posted_at_datetime_utc: row.published_at,
    job_updated_at_datetime_utc: row.source_updated_at,
    updatedAt: row.source_updated_at, fetchedAt: row.last_seen_at,
    job_apply_link: row.apply_url, job_source_url: row.source_url,
    job_source_reference: row.source_reference, _requestedCountry: row.country,
    _source: row.country === 'cn' ? 'cn_official' : 'official_board',
    _sourceSyncStatus: row.sync_status
  };
}

function listActiveRaw(db, query = '', country = 'cn') {
  return activeRows(db).filter(row => country === 'global' || row.country === country)
    .map(toRawJob).filter(job => pilot.matchesQuery(job, query));
}

function findActiveRaw(db, id) {
  if (!hasSchema(db)) return null;
  const row = db.prepare(`SELECT p.*,r.status AS sync_status FROM official_job_postings p
    LEFT JOIN official_job_sync_runs r ON r.id=(SELECT MAX(id) FROM official_job_sync_runs WHERE board_id=p.board_id)
    WHERE p.id=? AND p.status='open'`).get(String(id));
  return row ? toRawJob(row) : null;
}

function latestBoardStatus(db, boardId) {
  if (!hasSchema(db)) return null;
  return db.prepare('SELECT status,error_code,completed_at FROM official_job_sync_runs WHERE board_id=? ORDER BY id DESC LIMIT 1').get(boardId) || null;
}

function toV4Job(row) {
  const region = { cn: '中国', gb: '英国', us: '美国' }[row.country] || row.country.toUpperCase();
  return {
    id: row.id, title: row.title, company: row.company,
    location: row.location, region, country: row.country.toUpperCase(),
    description: overviewText(row), requirements: [], jobType: row.job_type,
    applyUrl: row.apply_url, sourceUrl: row.source_url,
    source: row.country === 'cn' ? 'cn_official' : 'official_board',
    postedAt: row.published_at, updatedAt: row.source_updated_at,
    fetchedAt: row.last_seen_at, salary: '', _sourceSyncStatus: row.sync_status || 'unknown'
  };
}

function listActiveV4(db) { return activeRows(db).map(toV4Job); }

function findActiveV4(db, id) {
  if (!hasSchema(db)) return null;
  const row = db.prepare(`SELECT p.*,r.status AS sync_status FROM official_job_postings p
    LEFT JOIN official_job_sync_runs r ON r.id=(SELECT MAX(id) FROM official_job_sync_runs WHERE board_id=p.board_id)
    WHERE p.id=? AND p.status='open'`).get(String(id));
  return row ? toV4Job(row) : null;
}

module.exports = {
  hasSchema, syncBoard, syncAll, readyToServe, listActiveRaw, findActiveRaw,
  listActiveV4, findActiveV4, latestBoardStatus
};
