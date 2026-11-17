'use strict';
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const rights = require('./questionAssetRights');
const store = require('./questionAssetStore');
const layout = require('./questionPdfLayout');
const { parseDigitalPages, hasAnswerAppendixHeading } = require('./questionPdfParser');

const LEASE_MS = 60_000;
const OCR_LEASE_MS = 120_000;
const MAX_PAGES = 100;
const MAX_JOB_MS = 120_000;
const MAX_OCR_JOB_MS = 600_000;
const MAX_PAGE_TEXT_BYTES = 512 * 1024;
const MAX_PAGE_LAYOUT_BYTES = 2 * 1024 * 1024;
const MAX_JOB_LAYOUT_BYTES = 20 * 1024 * 1024;
const problem = rights.problem;
const idOf = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw problem('INVALID_ID');
  return id;
};
const required = (value, max, code) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw problem(code);
  return text;
};
const paging = (options = {}) => {
  const cursor = options.cursor === undefined ? 0 : Number(options.cursor);
  const limit = options.limit === undefined ? 30 : Number(options.limit);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw problem('INVALID_PAGINATION');
  return { cursor, limit };
};
const jobView = row => ({ id: row.id, sourceId: row.source_id, assetSha256: row.asset_sha256,
  paperVersion: row.paper_version, parserVersion: row.parser_version, territory: row.territory,
  commercial: Boolean(row.commercial), status: row.status, reasonCode: row.reason_code,
  pageCount: row.page_count, checkpointPage: row.checkpoint_page, attempts: row.attempts,
  layoutBytes: row.layout_bytes,
  createdAt: row.created_at, updatedAt: row.updated_at });
const draftView = row => ({ id: row.id, jobId: row.job_id, pageNumber: row.page_number,
  sourcePages: JSON.parse(row.source_pages_json), sourceBlocks: JSON.parse(row.source_blocks_json),
  section: row.section_label, questionNumber: row.question_number, type: row.question_type,
  stem: row.stem, options: JSON.parse(row.options_json), answerOptionIds: JSON.parse(row.answer_json),
  answerStatus: row.answer_status, answerEvidence: JSON.parse(row.evidence_json),
  answerEvidenceCandidates: JSON.parse(row.answer_evidence_candidates_json),
  explanation: row.explanation, flags: JSON.parse(row.flags_json), status: row.status,
  version: row.version, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at });

function createQuestionParseJobs(db, adapter = layout, options = {}) {
  const budgetNow = typeof options.budgetNow === 'function' ? options.budgetNow : Date.now;
  const leaseMs = () => process.env.QUESTION_PDF_OCR_ENABLED === '1' ? OCR_LEASE_MS : LEASE_MS;
  const parserVersion = () => process.env.QUESTION_PDF_OCR_ENABLED === '1' && adapter === layout
    ? 'hybrid-pdf-ocr-v5' : adapter.PARSER_VERSION;
  const job = id => {
    const record = db.prepare('SELECT * FROM qp_jobs WHERE id=?').get(idOf(id));
    if (!record) throw problem('JOB_NOT_FOUND', 404);
    return record;
  };
  const sourceAsset = sourceId => {
    const row = db.prepare(`SELECT source.id AS source_id,source.status AS source_status,source.asset_id,
      asset.sha256,asset.byte_size,asset.storage_key,asset.validation_status,asset.scan_status
      FROM question_asset_sources source LEFT JOIN question_pdf_assets asset ON asset.id=source.asset_id
      WHERE source.id=?`).get(idOf(sourceId));
    if (!row) throw problem('SOURCE_NOT_FOUND', 404);
    return row;
  };
  const gate = (record, asset) => {
    const context = { territory: record.territory, commercial: Boolean(record.commercial) };
    if (asset.source_status !== 'quarantined' || !asset.asset_id || asset.sha256 !== record.asset_sha256) return ['WAIT_ASSET_CHECK', 'SOURCE_ASSET_CHANGED'];
    if (!rights.hasSourceRight(db, record.source_id, 'machineProcessing', context)) return ['WAIT_RIGHTS', 'MACHINE_PROCESSING_RIGHT_REQUIRED'];
    if (asset.validation_status !== 'valid' || asset.scan_status !== 'clean') return ['WAIT_ASSET_CHECK', 'ASSET_VALIDATION_OR_SCAN_PENDING'];
    return [null, null];
  };
  const setStatus = (id, status, reasonCode = null, workerId = null) => {
    const result = workerId ? db.prepare(`UPDATE qp_jobs SET status=?,reason_code=?,lease_owner=NULL,lease_until_ms=NULL,
      updated_at=datetime('now') WHERE id=? AND status='RUNNING' AND lease_owner=?`).run(status, reasonCode, id, workerId) :
      db.prepare(`UPDATE qp_jobs SET status=?,reason_code=?,lease_owner=NULL,lease_until_ms=NULL,updated_at=datetime('now') WHERE id=?`)
        .run(status, reasonCode, id);
    if (!result.changes) throw problem('JOB_LEASE_LOST', 409);
    return jobView(job(id));
  };
  const assertReadable = record => {
    const asset = sourceAsset(record.source_id);
    if (asset.sha256 !== record.asset_sha256 || !rights.canUseSource(db, record.source_id, 'machineProcessing',
      { territory: record.territory, commercial: Boolean(record.commercial) })) throw problem('SOURCE_USE_DENIED', 403);
    return asset;
  };
  const draft = id => {
    const row = db.prepare('SELECT * FROM qp_drafts WHERE id=?').get(idOf(id));
    if (!row) throw problem('DRAFT_NOT_FOUND', 404);
    return row;
  };
  const claim = (workerId, requestedId) => db.transaction(() => {
    const now = Date.now();
    const row = requestedId ? job(requestedId) : db.prepare(`SELECT * FROM qp_jobs WHERE status='QUEUED'
      OR (status='RUNNING' AND lease_until_ms<?) ORDER BY id LIMIT 1`).get(now);
    if (!row || !['QUEUED', 'RUNNING'].includes(row.status) || row.status === 'RUNNING' && row.lease_until_ms >= now) return null;
    const changed = db.prepare(`UPDATE qp_jobs SET status='RUNNING',lease_owner=?,lease_until_ms=?,attempts=attempts+1,
      reason_code=NULL,updated_at=datetime('now') WHERE id=? AND
      (status='QUEUED' OR (status='RUNNING' AND lease_until_ms<?))`).run(workerId, now + leaseMs(), row.id, now);
    return changed.changes ? job(row.id) : null;
  }).immediate();
  const renew = (record, workerId) => {
    const result = db.prepare(`UPDATE qp_jobs SET lease_until_ms=?,updated_at=datetime('now')
      WHERE id=? AND status='RUNNING' AND lease_owner=?`).run(Date.now() + leaseMs(), record.id, workerId);
    if (!result.changes) throw problem('JOB_LEASE_LOST', 409);
  };

  return {
    createJob(input, actor) {
      input = input || {};
      const sourceId = idOf(input.sourceId);
      const paperVersion = required(input.paperVersion, 120, 'PAPER_VERSION_REQUIRED');
      const clientKey = required(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      const territory = input.territory || 'CN';
      if (!/^[A-Z]{2}$/.test(territory) || typeof input.commercial !== 'boolean') throw problem('INVALID_RIGHTS_CONTEXT');
      const asset = sourceAsset(sourceId);
      if (!asset.asset_id || !asset.sha256) throw problem('SOURCE_ASSET_REQUIRED', 409);
      return db.transaction(() => {
        const existing = db.prepare('SELECT * FROM qp_jobs WHERE source_id=? AND created_by=? AND client_key=?').get(sourceId, actor, clientKey);
        if (existing) {
          if (existing.paper_version !== paperVersion || existing.parser_version !== parserVersion() || existing.asset_sha256 !== asset.sha256 ||
            existing.territory !== territory || Boolean(existing.commercial) !== input.commercial) throw problem('CLIENT_KEY_CONFLICT', 409);
          return jobView(existing);
        }
        const same = db.prepare('SELECT * FROM qp_jobs WHERE source_id=? AND asset_sha256=? AND paper_version=? AND parser_version=?')
          .get(sourceId, asset.sha256, paperVersion, parserVersion());
        if (same) {
          if (same.territory !== territory || Boolean(same.commercial) !== input.commercial) throw problem('JOB_CONTEXT_CONFLICT', 409);
          return jobView(same);
        }
        const context = { source_id: sourceId, asset_sha256: asset.sha256, territory, commercial: Number(input.commercial) };
        const [blocked, reason] = gate(context, asset);
        const result = db.prepare(`INSERT INTO qp_jobs(source_id,asset_sha256,paper_version,parser_version,territory,commercial,
          client_key,status,reason_code,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(sourceId, asset.sha256, paperVersion, parserVersion(), territory, Number(input.commercial), clientKey,
            blocked || 'QUEUED', reason, actor);
        return jobView(job(result.lastInsertRowid));
      }).immediate();
    },
    listJobs(options = {}) {
      const { cursor, limit } = paging(options);
      const rows = db.prepare('SELECT * FROM qp_jobs WHERE id>? ORDER BY id LIMIT ?').all(cursor, limit + 1);
      const jobs = rows.slice(0, limit).map(jobView);
      return { jobs, total: db.prepare('SELECT COUNT(*) FROM qp_jobs').pluck().get(), nextCursor: rows.length > limit ? jobs.at(-1).id : null };
    },
    jobDetail(jobId) { return { job: jobView(job(jobId)) }; },
    retryJob(jobId) {
      return db.transaction(() => {
        const record = job(jobId), asset = sourceAsset(record.source_id);
        if (record.status === 'RUNNING') throw problem('JOB_ALREADY_RUNNING', 409);
        if (record.status === 'WAIT_REVIEW') return jobView(record);
        if (record.parser_version !== parserVersion()) throw problem('PARSER_VERSION_MISMATCH', 409);
        const [blocked, reason] = gate(record, asset);
        return setStatus(record.id, blocked || 'QUEUED', reason);
      }).immediate();
    },
    listDrafts(jobId, options = {}) {
      const record = job(jobId);
      assertReadable(record);
      const { cursor, limit } = paging(options);
      const rows = db.prepare('SELECT * FROM qp_drafts WHERE job_id=? AND id>? ORDER BY id LIMIT ?').all(record.id, cursor, limit + 1);
      const drafts = rows.slice(0, limit).map(draftView);
      return { drafts, total: db.prepare('SELECT COUNT(*) FROM qp_drafts WHERE job_id=?').pluck().get(record.id),
        nextCursor: rows.length > limit ? drafts.at(-1).id : null };
    },
    draftDetail(draftId) {
      const row = draft(draftId);
      assertReadable(job(row.job_id));
      const edits = db.prepare('SELECT id,from_version,to_version,review_note,actor,created_at FROM qp_draft_edits WHERE draft_id=? ORDER BY id DESC LIMIT 100')
        .all(row.id).map(item => ({ id: item.id, fromVersion: item.from_version, toVersion: item.to_version,
          reviewNote: item.review_note, actor: item.actor, createdAt: item.created_at }));
      return { draft: draftView(row), edits };
    },
    editDraft(draftId, input, actor) {
      input = input || {};
      const row = draft(draftId);
      const expectedVersion = Number(input.expectedVersion);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw problem('INVALID_EXPECTED_VERSION');
      const stem = required(input.stem, 5000, 'INVALID_STEM');
      const explanation = typeof input.explanation === 'string' && input.explanation.length <= 5000 ? input.explanation.trim() :
        (() => { throw problem('INVALID_EXPLANATION'); })();
      const reviewNote = required(input.reviewNote, 1000, 'REVIEW_NOTE_REQUIRED');
      if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 8 || input.options.some(option =>
        !option || !/^[A-H]$/.test(option.id) || typeof option.text !== 'string' || !option.text.trim() || option.text.length > 2000)) throw problem('INVALID_OPTIONS');
      const options = input.options.map(option => ({ id: option.id, text: option.text.trim() }));
      if (new Set(options.map(option => option.id)).size !== options.length) throw problem('INVALID_OPTIONS');
      if (!Array.isArray(input.answerOptionIds) || input.answerOptionIds.length > 8 ||
        new Set(input.answerOptionIds).size !== input.answerOptionIds.length ||
        input.answerOptionIds.some(value => !options.some(option => option.id === value))) throw problem('INVALID_ANSWER');
      if ((row.question_type === 'single' || row.question_type === 'boolean') && input.answerOptionIds.length > 1 ||
          row.question_type === 'multiple' && input.answerOptionIds.length === 1) throw problem('INVALID_ANSWER');
      return db.transaction(() => {
        const current = draft(draftId);
        // BEGIN IMMEDIATE holds the write reservation while the current grant
        // and asset state are checked, closing the cross-connection edit race.
        assertReadable(job(current.job_id));
        if (current.version !== expectedVersion) throw problem('DRAFT_VERSION_CONFLICT', 409);
        const before = draftView(current);
        const flags = [...new Set([...before.flags, 'MANUAL_EDIT_REQUIRES_REVIEW'])];
        const changedAnswer = JSON.stringify(before.answerOptionIds) !== JSON.stringify(input.answerOptionIds);
        if (changedAnswer) flags.push('MANUAL_ANSWER_EDIT');
        const changedContent = stem !== before.stem || JSON.stringify(options) !== JSON.stringify(before.options) ||
          changedAnswer || explanation !== before.explanation;
        if (changedContent) flags.push('MANUAL_CONTENT_EDIT');
        const nextStatus = changedContent ? 'UNVERIFIED' : current.answer_status;
        const result = db.prepare(`UPDATE qp_drafts SET stem=?,options_json=?,answer_json=?,answer_status=?,
          evidence_json=?,flags_json=?,explanation=?,status='needs_repair',version=version+1,updated_by=?,updated_at=datetime('now')
          WHERE id=? AND version=?`).run(stem, JSON.stringify(options), JSON.stringify(input.answerOptionIds), nextStatus,
            changedContent ? 'null' : current.evidence_json, JSON.stringify(flags), explanation, actor, current.id, expectedVersion);
        if (!result.changes) throw problem('DRAFT_VERSION_CONFLICT', 409);
        const after = draftView(draft(current.id));
        db.prepare(`INSERT INTO qp_draft_edits(draft_id,from_version,to_version,before_json,after_json,review_note,actor)
          VALUES (?,?,?,?,?,?,?)`).run(current.id, current.version, after.version, JSON.stringify(before), JSON.stringify(after), reviewNote, actor);
        return after;
      }).immediate();
    },
    pageEvidence(jobId, pageNumber) {
      const record = job(jobId);
      assertReadable(record);
      const page = db.prepare('SELECT * FROM qp_pages WHERE job_id=? AND page_number=?').get(record.id, idOf(pageNumber));
      if (!page) throw problem('PAGE_NOT_FOUND', 404);
      if (Buffer.byteLength(page.text_content, 'utf8') > MAX_PAGE_TEXT_BYTES ||
        Buffer.byteLength(page.layout_json, 'utf8') > MAX_PAGE_LAYOUT_BYTES) throw problem('PAGE_EVIDENCE_TOO_LARGE', 413);
      const pageLayout = JSON.parse(page.layout_json);
      return { page: { pageNumber: page.page_number, text: page.text_content,
        blocks: pageLayout.blocks, flags: pageLayout.flags || [], status: page.status,
        ocrConfidence: pageLayout.ocrConfidence ?? null } };
    },
    previewAsset(sourceId, pageNumber, jobId) {
      const record = job(jobId);
      if (record.source_id !== idOf(sourceId)) throw problem('SOURCE_NOT_FOUND', 404);
      const asset = sourceAsset(sourceId);
      assertReadable(record);
      const number = idOf(pageNumber);
      if (number > MAX_PAGES || record.page_count && number > record.page_count) throw problem('PAGE_BUDGET_EXCEEDED', 429);
      const file = (() => { store.verify(asset.storage_key, asset.sha256, asset.byte_size); return require('node:path').join(store.privateRoot, asset.storage_key); })();
      return new Promise((resolve, reject) => {
        const binary = process.env.QUESTION_PDFTOPPM_PATH || 'pdftoppm';
        // With no output prefix, pdftoppm writes PNG bytes to stdout. A literal
        // '-' prefix creates a private-page file in the process cwd instead.
        const child = spawn(binary, ['-f', String(number), '-l', String(number), '-singlefile', '-scale-to', '1300', '-png', file],
          { shell: false, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
        const chunks = []; let size = 0, stderr = '', finished = false;
        const fail = error => { if (finished) return; finished = true; child.kill(); reject(error); };
        const timer = setTimeout(() => fail(problem('PREVIEW_UNAVAILABLE')), 12_000);
        child.stdout.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) return fail(problem('PREVIEW_TOO_LARGE', 413)); chunks.push(chunk); });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(0, 1000); });
        child.on('error', () => { clearTimeout(timer); fail(problem('PREVIEW_UNAVAILABLE')); });
        child.on('close', code => { clearTimeout(timer); if (finished) return; finished = true;
          if (code !== 0 || !size || !Buffer.concat(chunks).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
            return reject(problem(stderr.includes('Wrong page range') ? 'PAGE_NOT_FOUND' : 'PREVIEW_UNAVAILABLE', stderr.includes('Wrong page range') ? 404 : 503));
          try { assertReadable(record); } catch (error) { return reject(error); }
          resolve(Buffer.concat(chunks));
        });
      });
    },
    async processNext(workerId = crypto.randomUUID()) {
      const record = claim(workerId);
      if (!record) return null;
      return this.processClaimed(record, workerId);
    },
    async processJob(jobId, workerId = crypto.randomUUID()) {
      const record = claim(workerId, jobId);
      if (!record) throw problem('JOB_NOT_QUEUEABLE', 409);
      return this.processClaimed(record, workerId);
    },
    async processClaimed(record, workerId) {
      const started = budgetNow();
      const jobBudgetMs = process.env.QUESTION_PDF_OCR_ENABLED === '1' ? MAX_OCR_JOB_MS : MAX_JOB_MS;
      let opened;
      try {
        if (record.parser_version !== parserVersion()) return setStatus(record.id, 'WAIT_OCR', 'PARSER_VERSION_MISMATCH', workerId);
        let asset = sourceAsset(record.source_id);
        let [blocked, reason] = gate(record, asset);
        if (blocked) return setStatus(record.id, blocked, reason, workerId);
        try { opened = await adapter.openVerifiedPdf(asset, Math.min(15_000, Math.max(1, jobBudgetMs - (budgetNow() - started)))); }
        catch (error) {
          if (error.message === 'PRIVATE_PDF_IMPORT_DISABLED' || /PRIVATE_STORAGE/.test(error.message)) return setStatus(record.id, 'WAIT_STORAGE', error.message, workerId);
          throw error;
        }
        if (opened.pageCount > MAX_PAGES) return setStatus(record.id, 'WAIT_BUDGET', 'PAGE_LIMIT_EXCEEDED', workerId);
        db.prepare("UPDATE qp_jobs SET page_count=? WHERE id=? AND status='RUNNING' AND lease_owner=?").run(opened.pageCount, record.id, workerId);
        let answerAppendix = db.prepare('SELECT text_content FROM qp_pages WHERE job_id=? ORDER BY page_number')
          .all(record.id).some(row => hasAnswerAppendixHeading(row.text_content));
        for (let number = record.checkpoint_page + 1; number <= opened.pageCount; number++) {
          if (budgetNow() - started >= jobBudgetMs) return setStatus(record.id, 'WAIT_BUDGET', 'TIME_LIMIT_EXCEEDED', workerId);
          asset = sourceAsset(record.source_id);
          [blocked, reason] = gate(record, asset);
          if (blocked) return setStatus(record.id, blocked, reason, workerId);
          renew(record, workerId);
          const page = await adapter.extractPage(opened.document, number,
            Math.min(process.env.QUESTION_PDF_OCR_ENABLED === '1' ? 90_000 : 10_000,
              Math.max(1, jobBudgetMs - (budgetNow() - started))), { answerAppendix });
          if (!page || page.page !== number || !['digital','scanned','complex_layout'].includes(page.status)) throw problem('PDF_PAGE_EXTRACTION_FAILED');
          if (typeof page.text !== 'string' || !Array.isArray(page.blocks)) throw problem('PDF_PAGE_EXTRACTION_FAILED');
          const layoutJson = JSON.stringify({ blocks: page.blocks, width: page.width, height: page.height,
            flags: page.flags || [], ocrConfidence: page.ocrConfidence ?? null });
          const pageBytes = Buffer.byteLength(page.text, 'utf8') + Buffer.byteLength(layoutJson, 'utf8');
          if (Buffer.byteLength(page.text, 'utf8') > MAX_PAGE_TEXT_BYTES ||
              Buffer.byteLength(layoutJson, 'utf8') > MAX_PAGE_LAYOUT_BYTES) throw problem('PAGE_LAYOUT_BUDGET_EXCEEDED', 413);
          db.transaction(() => {
            const latest = job(record.id);
            if (latest.status !== 'RUNNING' || latest.lease_owner !== workerId || latest.checkpoint_page !== number - 1) throw problem('JOB_LEASE_LOST', 409);
            if (latest.layout_bytes + pageBytes > MAX_JOB_LAYOUT_BYTES) throw problem('JOB_LAYOUT_BUDGET_EXCEEDED', 413);
            db.prepare(`INSERT INTO qp_pages(job_id,page_number,text_content,layout_json,status) VALUES (?,?,?,?,?)
              ON CONFLICT(job_id,page_number) DO NOTHING`).run(record.id, number, page.text, layoutJson, page.status);
            db.prepare("UPDATE qp_jobs SET checkpoint_page=?,layout_bytes=layout_bytes+?,lease_until_ms=?,updated_at=datetime('now') WHERE id=?")
              .run(number, pageBytes, Date.now() + leaseMs(), record.id);
          }).immediate();
          if (hasAnswerAppendixHeading(page.text)) answerAppendix = true;
          if (budgetNow() - started >= jobBudgetMs) return setStatus(record.id, 'WAIT_BUDGET', 'TIME_LIMIT_EXCEEDED', workerId);
        }
        asset = sourceAsset(record.source_id);
        [blocked, reason] = gate(record, asset);
        if (blocked) return setStatus(record.id, blocked, reason, workerId);
        const pages = db.prepare('SELECT * FROM qp_pages WHERE job_id=? ORDER BY page_number').all(record.id).map(row => ({
          page: row.page_number, text: row.text_content, status: row.status,
          blocks: JSON.parse(row.layout_json).blocks, flags: JSON.parse(row.layout_json).flags || [] }));
        if (pages.length !== opened.pageCount) throw problem('PDF_CHECKPOINT_INCOMPLETE');
        if (budgetNow() - started >= jobBudgetMs) return setStatus(record.id, 'WAIT_BUDGET', 'TIME_LIMIT_EXCEEDED', workerId);
        const parsed = parseDigitalPages(pages, record.paper_version);
        if (budgetNow() - started >= jobBudgetMs) return setStatus(record.id, 'WAIT_BUDGET', 'TIME_LIMIT_EXCEEDED', workerId);
        return db.transaction(() => {
          const latest = job(record.id);
          if (latest.status !== 'RUNNING' || latest.lease_owner !== workerId || latest.checkpoint_page !== opened.pageCount) throw problem('JOB_LEASE_LOST', 409);
          // Parsing is synchronous: recheck before starting the draft writes.
          if (budgetNow() - started >= jobBudgetMs) return setStatus(record.id, 'WAIT_BUDGET', 'TIME_LIMIT_EXCEEDED', workerId);
          const assetNow = sourceAsset(record.source_id);
          const [stop, code] = gate(record, assetNow);
          if (stop) return setStatus(record.id, stop, code, workerId);
          parsed.drafts.forEach((item, index) => db.prepare(`INSERT INTO qp_drafts
            (job_id,draft_index,page_number,section_key,section_label,question_number,question_type,stem,options_json,
             answer_json,answer_status,evidence_json,answer_evidence_candidates_json,source_pages_json,source_blocks_json,flags_json,explanation,status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id,draft_index) DO NOTHING`).run(record.id,index+1,
            item.pageNumber,item.sectionKey,item.section,item.questionNumber,item.type,item.stem,JSON.stringify(item.options),
            JSON.stringify(item.answerOptionIds),item.answerStatus,JSON.stringify(item.answerEvidence),JSON.stringify(item.answerEvidenceCandidates || []),JSON.stringify(item.sourcePages),
            JSON.stringify(item.sourceBlocks),JSON.stringify(item.flags),item.explanation,item.status));
          const reason = parsed.scannedPages.length ? 'SCANNED_PAGES_NEED_OCR' :
            !parsed.drafts.length && parsed.complexPages.length ? 'COMPLEX_LAYOUT_NEEDS_REVIEW' :
              !parsed.drafts.length ? 'NO_QUESTIONS_FOUND' : null;
          return setStatus(record.id, parsed.drafts.length ? 'WAIT_REVIEW' : parsed.scannedPages.length ? 'WAIT_OCR' : 'NEEDS_MANUAL',
            reason, workerId);
        }).immediate();
      } catch (error) {
        if (error.code === 'JOB_LEASE_LOST') throw error;
        if (String(error.code || '').startsWith('OCR_')) return setStatus(record.id, 'WAIT_OCR', error.code, workerId);
        if (['PAGE_LAYOUT_BUDGET_EXCEEDED','JOB_LAYOUT_BUDGET_EXCEEDED','PDF_PAGE_OUTPUT_LIMIT',
          'PARSER_DRAFT_BUDGET_EXCEEDED','PARSER_EVIDENCE_BUDGET_EXCEEDED'].includes(error.code))
          return setStatus(record.id, 'NEEDS_MANUAL', error.code, workerId);
        return setStatus(record.id, 'FAILED', String(error.code || 'PDF_PARSE_FAILED').slice(0, 100), workerId);
      } finally { if (opened) await opened.close(); }
    }
  };
}

module.exports = { createQuestionParseJobs, MAX_PAGES, LEASE_MS, problem };
