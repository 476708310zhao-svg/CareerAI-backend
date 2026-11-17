const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const { consumeDailyLimit, getQuotaStatus } = require('../../utils/aiQuota');
const center = require('../../services/v4ResumeCenter');
const analytics = require('../../services/v4Analytics');
const aiRuntime = require('../../services/v4AiRuntime');
const applicationAnswers = require('../../services/v4ApplicationAnswers');
const { applicationRefs, mergeCoreRefs, withCoreRefs } = require('../../utils/coreEntityRefs');

const router = express.Router();
router.use((req, res, next) => { if (req.method === 'GET') res.set('Cache-Control', 'no-store'); next(); });
router.use(authMiddleware);

function assertMaterialDraftSchema() {
  const applied = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    && db.prepare("SELECT 1 FROM schema_migrations WHERE version='0011'").get();
  if (!applied) throw new Error('Database migration 0011 is required for application material types');
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_application_material_drafts'").pluck().get();
  if (!schema || !String(schema).includes("'why_company'") || !String(schema).includes("'why_role'")) {
    throw new Error('Database migration 0011 is required for application material types');
  }
  const notebookColumns = new Set(db.prepare('PRAGMA table_info(interview_notebook)').all().map(column => column.name));
  if (['application_id', 'company', 'position'].some(column => !notebookColumns.has(column))) {
    throw new Error('Database migration 0011 is required for interview application context');
  }
  const notebookApplicationFk = db.prepare("PRAGMA foreign_key_list(interview_notebook)").all()
    .some(key => key.from === 'application_id' && key.table === 'applications' && key.on_delete === 'SET NULL');
  const uniqueDraftIndex = db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_application_materials_ai_draft_owner'").get();
  if (!notebookApplicationFk || !uniqueDraftIndex) throw new Error('Database migration 0011 safety indexes are required');
  return true;
}

assertMaterialDraftSchema();

// 整份简历属于简历中心。申请文案接口只生成可阅读、可复制的文本。
const MATERIAL_TYPES = ['cover_letter', 'why_company', 'why_role', 'recruiter_message', 'follow_up_email'];
const MATERIAL_PROMPT_VERSION = process.env.MATERIAL_PROMPT_VERSION || 'application-material-v4.0-2';
const LABELS = {
  tailored_resume: '按 JD 定制简历',
  cover_letter: 'Cover Letter',
  why_company: 'Why this company?',
  why_role: 'Why this role?',
  recruiter_message: 'Recruiter 消息',
  follow_up_email: 'Follow-up 邮件'
};

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function answerDraftsAvailable() {
  return Boolean(db.prepare("SELECT 1 FROM schema_migrations WHERE version='0029'").get()
    && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='application_answer_drafts'").get());
}

function answerDraftView(row) {
  return {
    id: row.id, applicationId: row.application_id, resumeVersionId: row.resume_version_id,
    question: row.question, draft: row.content,
    evidenceRefs: center.parseJson(row.evidence_refs_json, []),
    evidence: center.parseJson(row.evidence_json, []),
    unsupportedClaims: center.parseJson(row.unsupported_claims_json, []),
    charCount: applicationAnswers.codepoints(row.content), maxChars: row.max_chars,
    characterCountUnit: 'Unicode code points', version: row.version, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function sendError(res, error, fallback) {
  const status = error.status || 500;
  return res.status(status).json({
    code: error.code || -1,
    message: status >= 500 ? fallback : (error.message || '请求失败')
  });
}

function applicationView(row) {
  const snapshot = center.parseJson(row.job_snapshot, {});
  const refs = applicationRefs(row);
  return {
    id: refs.applicationId,
    jobId: refs.jobId,
    company: row.company || snapshot.company || '目标公司',
    jobTitle: row.job_title || snapshot.title || snapshot.jobTitle || '目标岗位',
    jdText: snapshot.description || snapshot.jd || row.notes || '',
    refs
  };
}

function hasUsefulResumeContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  return resumeFacts(content).length > 0;
}

function draftView(row) {
  const application = row.application_id
    ? db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(row.application_id, row.user_id)
    : null;
  const refs = mergeCoreRefs(applicationRefs(application || {}), {
    userId: row.user_id,
    applicationId: row.application_id,
    resumeId: row.resume_id,
    resumeVersionId: row.resume_version_id
  });
  return {
    id: row.id, applicationId: row.application_id, resumeId: row.resume_id,
    resumeVersionId: row.resume_version_id, materialType: row.material_type,
    materialLabel: LABELS[row.material_type] || row.material_type, status: row.status,
    content: row.material_type === 'tailored_resume' ? center.parseJson(row.content, {}) : row.content,
    aiModel: row.ai_model, promptVersion: row.prompt_version,
    quotaCost: row.quota_cost, savedMaterialId: row.saved_material_id,
    createdAt: row.created_at, confirmedAt: row.confirmed_at,
    refs
  };
}

function resumeFacts(content) {
  const texts = [];
  (function walk(value) {
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim();
      const isMetadata = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text)
        || /\.(?:pdf|docx?)$/i.test(text)
        || /(?:联系电话|手机号码?|手机号|电话|邮箱|email|e-mail)\s*[:：]?/i.test(text)
        || /\b1[3-9]\d{9}\b/.test(text)
        || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
      if (!isMetadata && text.length >= 2) texts.push(text);
    }
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  })([
    content.summary,
    content.workExp,
    content.experience,
    content.projects,
    content.skills,
    content.education,
    content.awards
  ]);
  return Array.from(new Set(texts)).slice(0, 16);
}

function generateContent(type, application, version) {
  const content = version ? center.parseJson(version.content, {}) : {};
  const facts = resumeFacts(content);
  const primary = facts[0] || '我的真实经历与技能';
  const secondary = facts[1] || '持续学习和团队协作能力';
  if (type === 'tailored_resume') {
    return Object.assign({}, content, {
      targetJob: { applicationId: application.id, jobId: application.jobId, company: application.company, jobTitle: application.jobTitle },
      tailoringNote: `此版本面向 ${application.company} · ${application.jobTitle}，仅重排和强调原有真实经历，未新增事实。`
    });
  }
  if (type === 'cover_letter') {
    return `尊敬的招聘团队：\n\n我希望申请 ${application.company} 的 ${application.jobTitle} 职位。我的经历中，${primary}；同时，${secondary}。这些真实积累让我能够更快理解岗位目标、与团队协作并推动任务落地。\n\n我期待有机会进一步介绍与岗位相关的经历。感谢您的时间与考虑。`;
  }
  if (type === 'why_company') {
    return `我希望加入 ${application.company}，是因为 ${application.jobTitle} 与我希望持续发展的方向高度相关。基于 ${primary}，以及 ${secondary}，我能够将已有的真实积累用于理解业务问题、协作推进并交付结果。我也期待进一步了解团队当前最重要的目标，并在真实场景中持续成长。`;
  }
  if (type === 'why_role') {
    return `${application.jobTitle} 吸引我，是因为岗位重点与我的真实经历有直接联系：${primary}；同时，${secondary}。这些积累让我具备理解任务、拆解问题和与团队协作的基础。我希望在这个岗位上继续深化相关能力，并对清晰的业务目标负责。`;
  }
  if (type === 'recruiter_message') {
    return `您好，我正在申请 ${application.company} 的 ${application.jobTitle}。我的相关经历包括：${primary}。如果方便，希望能与您交流岗位重点和团队需求，感谢！`;
  }
  return `主题：关于 ${application.jobTitle} 申请的跟进\n\n您好，我想礼貌跟进此前提交的 ${application.company} ${application.jobTitle} 职位申请。我对该机会仍然非常感兴趣；我的相关经历包括：${primary}。如需补充材料，我会及时提供。感谢您的时间。`;
}

function numberTokens(value) {
  return (JSON.stringify(value || '').match(/\b\d+(?:\.\d+)?%?\b/g) || []);
}

function containsUnsupportedNumbers(value, evidence) {
  const source = JSON.stringify(evidence || '');
  return numberTokens(value).some(token => !source.includes(token));
}

async function generateAiContent(type, application, version, jdText) {
  const content = version ? center.parseJson(version.content, {}) : {};
  const facts = resumeFacts(content);
  const evidence = { content, company: application.company, jobTitle: application.jobTitle };
  const fallback = () => generateContent(type, application, version);
  const commonPrompt = JSON.stringify({
    materialType: type,
    company: application.company,
    jobTitle: application.jobTitle,
    jd: center.cleanText(jdText || application.jdText, 6000),
    verifiedResumeFacts: facts
  });

  if (type === 'tailored_resume') {
    const result = await aiRuntime.generate({
      systemPrompt: '你是 AI 申请助手。只能根据已核验简历内容做岗位定制，不得新增经历、技能、学历、任职时间或量化数字。输出 JSON：{"professionalSummary":"摘要","emphasis":["应重点展示的原文事实"],"keywordAlignment":["可安全强调的岗位关键词"]}。',
      userPrompt: commonPrompt,
      temperature: 0.2,
      maxTokens: 1800,
      format: 'json',
      fallback: () => ({ professionalSummary: '', emphasis: facts.slice(0, 3), keywordAlignment: [] }),
      validate: value => !!(value && typeof value === 'object' && !Array.isArray(value) && !containsUnsupportedNumbers(value, evidence))
    });
    const base = fallback();
    result.value = Object.assign({}, base, {
      aiTailoring: result.value,
      tailoringNote: '此版本仅重排和强调原有真实经历；保存前必须由用户确认。'
    });
    return result;
  }

  return aiRuntime.generate({
    systemPrompt: '你是 AI 申请助手。根据已核验简历事实生成' + LABELS[type] + '。不得编造经历、技能、任职时间或量化结果，不得声称用户拥有未提供的资质。只输出材料正文，不要解释。',
    userPrompt: commonPrompt,
    temperature: 0.35,
    maxTokens: type === 'recruiter_message' ? 600 : 1400,
    format: 'text',
    fallback,
    validate: value => typeof value === 'string' && value.trim().length >= 20 && !containsUnsupportedNumbers(value, evidence)
  });
}

router.get('/quota', (req, res) => {
  const status = getQuotaStatus(req.user.userId);
  res.json({ code: 0, data: {
    resumeOptimize: status.features.find(item => item.feature === 'resume_optimize'),
    applicationAssistant: status.features.find(item => item.feature === 'application_assistant'),
    isVip: status.isVip,
    vipLevel: status.vipLevel,
    date: status.date
  } });
});

router.get('/drafts', (req, res) => {
  const params = [req.user.userId];
  let where = 'user_id=?';
  if (req.query.applicationId) {
    const applicationId = Number(req.query.applicationId);
    if (!Number.isSafeInteger(applicationId) || applicationId <= 0) return res.status(400).json({ code: -1, message: '申请记录 ID 无效' });
    const application = db.prepare('SELECT id FROM applications WHERE id=? AND user_id=?').get(applicationId, req.user.userId);
    if (!application) return res.status(404).json({ code: -1, message: '申请记录不存在' });
    where += ' AND application_id=?'; params.push(applicationId);
  }
  if (req.query.status) { where += ' AND status=?'; params.push(center.cleanText(req.query.status, 30)); }
  const rows = db.prepare(`SELECT * FROM ai_application_material_drafts WHERE ${where} ORDER BY created_at DESC, id DESC`).all(...params);
  res.json({ code: 0, data: rows.map(draftView) });
});

// 网申问答草稿仅使用申请明确绑定的简历版本和用户确认保存的材料；不自动挑选简历。
router.get('/answers/drafts', (req, res) => {
  if (!answerDraftsAvailable()) return res.status(503).json({ code: 'MIGRATION_PENDING', message: '问答草稿功能尚未迁移' });
  const applicationId = positiveId(req.query.applicationId);
  if (!applicationId) return res.status(400).json({ code: -1, message: '申请记录 ID 无效' });
  const application = db.prepare('SELECT id FROM applications WHERE id=? AND user_id=?').get(applicationId, req.user.userId);
  if (!application) return res.status(404).json({ code: -1, message: '申请记录不存在' });
  const rows = db.prepare(`SELECT * FROM application_answer_drafts WHERE user_id=? AND application_id=?
    AND status='pending' ORDER BY updated_at DESC,id DESC LIMIT 50`).all(req.user.userId, applicationId);
  res.json({ code: 0, data: rows.map(answerDraftView) });
});

router.post('/answers/draft', async (req, res) => { try {
  if (!answerDraftsAvailable()) return res.status(503).json({ code: 'MIGRATION_PENDING', message: '问答草稿功能尚未迁移' });
  const body = req.body || {};
  const applicationId = positiveId(body.applicationId);
  if (!applicationId) return res.status(400).json({ code: -1, message: '申请记录 ID 无效' });
  const application = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(applicationId, req.user.userId);
  if (!application) return res.status(404).json({ code: -1, message: '申请记录不存在' });
  const resumeVersionId = positiveId(application.resume_version_id);
  const resumeId = positiveId(application.resume_id);
  if (!resumeId || !resumeVersionId) return res.status(409).json({ code: 'BOUND_RESUME_REQUIRED', message: '请先在申请详情绑定一份已确认的简历版本' });
  const version = db.prepare(`SELECT rv.* FROM resume_versions_v4 rv JOIN resumes r ON r.id=rv.resume_id
    WHERE rv.id=? AND rv.resume_id=? AND rv.user_id=? AND r.user_id=? AND COALESCE(r.archived_at,'')=''`)
    .get(resumeVersionId, resumeId, req.user.userId, req.user.userId);
  if (!version) return res.status(409).json({ code: 'BOUND_RESUME_UNAVAILABLE', message: '申请绑定的简历版本不可用，请先检查申请详情' });
  const resumeContent = applicationAnswers.parseObject(version.content);
  const resumeEvidence = applicationAnswers.collectResumeEvidence(resumeContent);
  const savedRows = db.prepare(`SELECT id,question_type,question_label,content FROM application_materials
    WHERE user_id=? AND application_id=? AND COALESCE(status,'saved')='saved' ORDER BY updated_at DESC,id DESC LIMIT 8`)
    .all(req.user.userId, applicationId);
  const savedEvidence = applicationAnswers.collectSavedMaterialEvidence(savedRows, resumeEvidence.length);
  const evidence = [...resumeEvidence, ...savedEvidence].slice(0, 18);
  if (!evidence.length) return res.status(422).json({ code: 'CONFIRMED_EVIDENCE_REQUIRED', message: '绑定的简历和已确认材料中没有可用事实，请先补充真实经历' });
  if (!consumeDailyLimit(req, res, 'application_assistant')) return;
  const snapshot = center.parseJson(application.job_snapshot, {});
  const result = await applicationAnswers.generate({
    question: body.question, maxChars: body.maxChars, evidence,
    job: { company: application.company || snapshot.company, jobTitle: application.job_title || snapshot.title },
    runtime: aiRuntime
  });
  const stored = db.prepare(`INSERT INTO application_answer_drafts
    (user_id,application_id,resume_version_id,question,content,evidence_refs_json,evidence_json,unsupported_claims_json,max_chars)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(req.user.userId, applicationId, resumeVersionId,
    applicationAnswers.bounded(body.question, applicationAnswers.QUESTION_MAX_CODEPOINTS), result.draft,
    JSON.stringify(result.evidenceRefs), JSON.stringify(evidence.filter(item => result.evidenceRefs.includes(item.id))),
    JSON.stringify(result.unsupportedClaims), result.maxChars);
  analytics.track(req.user.userId, 'application_answer_draft_generated', withCoreRefs({
    applicationId, evidenceCount: evidence.length, charCount: result.charCount, maxChars: result.maxChars,
    generation: result.generation
  }, applicationRefs(application), { resumeId, resumeVersionId }));
  res.status(200).json({ code: 0, data: {
    id: stored.lastInsertRowid, version: 1, applicationId, draft: result.draft, evidenceRefs: result.evidenceRefs,
    evidence: evidence.filter(item => result.evidenceRefs.includes(item.id)).map(({ id, source, label, text }) => ({ id, source, label, text })),
    unsupportedClaims: result.unsupportedClaims, charCount: result.charCount,
    maxChars: result.maxChars, characterCountUnit: 'Unicode code points', generation: result.generation
  }, message: '草稿已生成，可编辑；保存或提交前请逐条核对事实' });
} catch (error) {
  sendError(res, error, '网申问答草稿生成失败');
}
});

router.patch('/answers/drafts/:id', (req, res) => {
  if (!answerDraftsAvailable()) return res.status(503).json({ code: 'MIGRATION_PENDING', message: '问答草稿功能尚未迁移' });
  const id = positiveId(req.params.id);
  const expectedVersion = Number(req.body && req.body.expectedVersion);
  const content = typeof (req.body && req.body.content) === 'string' ? req.body.content.trim() : '';
  if (!id || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return res.status(400).json({ code: -1, message: '草稿或版本参数无效' });
  const draft = db.prepare(`SELECT d.*,a.resume_version_id AS bound_resume_version_id,a.archived_at
    FROM application_answer_drafts d JOIN applications a ON a.id=d.application_id AND a.user_id=d.user_id
    WHERE d.id=? AND d.user_id=? AND a.user_id=?`).get(id, req.user.userId, req.user.userId);
  if (!draft) return res.status(404).json({ code: -1, message: '草稿不存在' });
  if (draft.status !== 'pending' || draft.archived_at || Number(draft.bound_resume_version_id) !== Number(draft.resume_version_id)) {
    return res.status(409).json({ code: 'ANSWER_DRAFT_STALE', message: '申请或简历版本已变化，请刷新后核对原草稿' });
  }
  if (!content) return res.status(400).json({ code: -1, message: '草稿内容不能为空' });
  if (applicationAnswers.codepoints(content) > draft.max_chars) return res.status(422).json({ code: 'ANSWER_TOO_LONG', message: `答案超过 ${draft.max_chars} 个 Unicode 字符` });
  const updated = db.prepare(`UPDATE application_answer_drafts SET content=?,version=version+1,updated_at=datetime('now')
    WHERE id=? AND user_id=? AND status='pending' AND version=?`).run(content, id, req.user.userId, expectedVersion);
  if (!updated.changes) return res.status(409).json({ code: 'ANSWER_DRAFT_CONFLICT', message: '草稿已在另一端修改，请刷新后核对' });
  const row = db.prepare('SELECT * FROM application_answer_drafts WHERE id=? AND user_id=?').get(id, req.user.userId);
  res.json({ code: 0, data: answerDraftView(row), message: '已保存到问答草稿区；此内容仍不是已确认经历或正式申请材料' });
});

router.post('/drafts', async (req, res) => { try {
  const body = req.body || {};
  const type = center.cleanText(body.materialType, 40);
  if (!MATERIAL_TYPES.includes(type)) return res.status(400).json({ code: -1, message: '材料类型无效' });
  const applicationId = positiveId(body.applicationId);
  if (!applicationId) return res.status(400).json({ code: -1, message: '申请记录 ID 无效' });
  const applicationRow = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(applicationId, req.user.userId);
  if (!applicationRow) return res.status(404).json({ code: -1, message: '申请记录不存在' });
  if (body.resumeId !== undefined && body.resumeId !== null && body.resumeId !== '' && !positiveId(body.resumeId)) return res.status(400).json({ code:-1, message:'简历 ID 无效' });
  const resumeId = positiveId(body.resumeId || applicationRow.resume_id);
  if (!resumeId) return res.status(400).json({ code: 'RESUME_REQUIRED', message: '生成申请文案前，请先选择一份已完善的简历' });
  const resume = db.prepare("SELECT * FROM resumes WHERE id=? AND user_id=? AND COALESCE(archived_at,'')='' ").get(resumeId, req.user.userId);
  if (!resume) return res.status(404).json({ code: -1, message: '简历不存在' });
  if (body.resumeVersionId !== undefined && body.resumeVersionId !== null && body.resumeVersionId !== '' && !positiveId(body.resumeVersionId)) return res.status(400).json({ code:-1, message:'简历版本 ID 无效' });
  const requestedVersionId = positiveId(body.resumeVersionId || (resumeId === Number(applicationRow.resume_id) ? applicationRow.resume_version_id : null));
  if (!requestedVersionId) return res.status(409).json({ code:'RESUME_VERSION_REQUIRED', message:'该简历尚未初始化版本，请先到简历中心确认创建首个版本' });
  const selectedVersion = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=? AND resume_id=? AND user_id=?')
    .get(requestedVersionId, resume.id, req.user.userId);
  if (!selectedVersion) return res.status(404).json({ code:-1, message:'简历版本不存在或无权使用' });
  const owned = { resume, version: selectedVersion };
  const resumeContent = center.parseJson(owned.version.content, {});
  if (!hasUsefulResumeContent(resumeContent)) {
    return res.status(422).json({ code: 'RESUME_INCOMPLETE', message: '所选简历缺少可用经历或技能，请先到简历中心补充真实内容' });
  }
  if (!consumeDailyLimit(req, res, 'application_assistant')) return;
  const application = applicationView(applicationRow);
  const generated = await generateAiContent(type, application, owned && owned.version, body.jdText || application.jdText);
  const promptSnapshot = aiRuntime.redactSensitive(
    [LABELS[type], application.company, application.jobTitle, center.cleanText(body.jdText || application.jdText, 6000)].join('\n')
  );
  const result = db.prepare(`
    INSERT INTO ai_application_material_drafts
      (user_id, application_id, resume_id, resume_version_id, material_type, content, ai_model, prompt_version, prompt_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.userId, application.id, owned && owned.resume.id, owned && owned.version.id, type,
    typeof generated.value === 'string' ? generated.value : JSON.stringify(generated.value), generated.model, MATERIAL_PROMPT_VERSION, promptSnapshot);
  const data = draftView(db.prepare('SELECT * FROM ai_application_material_drafts WHERE id=?').get(result.lastInsertRowid));
  analytics.track(req.user.userId, 'application_material_generated', withCoreRefs(
    { applicationId: application.id, materialType: type, generation: aiRuntime.safeMetadata(generated) },
    application.refs,
    { resumeId: owned.resume.id, resumeVersionId: owned.version.id }
  ), '/api/v4/materials/drafts');
  res.status(201).json({ code: 0, data: Object.assign(data, { quota: getQuotaStatus(req.user.userId), generation: aiRuntime.safeMetadata(generated) }), message: '草稿已生成，确认前不会保存到申请材料' });
} catch (error) {
  sendError(res, error, '申请材料生成失败');
}
});

router.post('/drafts/:id/reject', (req, res) => {
  const draftId = positiveId(req.params.id);
  if (!draftId) return res.status(400).json({ code:-1, message:'草稿 ID 无效' });
  const result = db.prepare("UPDATE ai_application_material_drafts SET status='rejected', confirmed_at=datetime('now') WHERE id=? AND user_id=? AND status='pending'")
    .run(draftId, req.user.userId);
  if (!result.changes) return res.status(409).json({ code: -1, message: '草稿不存在或已处理' });
  res.json({ code: 0, message: '草稿已拒绝，未保存任何材料' });
});

router.post('/drafts/:id/confirm', (req, res) => {
  const draftId = positiveId(req.params.id);
  if (!draftId) return res.status(400).json({ code:-1, message:'草稿 ID 无效' });
  try {
    const saved = db.transaction(() => {
      const draft = db.prepare('SELECT * FROM ai_application_material_drafts WHERE id=? AND user_id=?').get(draftId, req.user.userId);
      if (!draft) throw Object.assign(new Error('草稿不存在'), { status:404 });
      if (draft.status === 'confirmed' && draft.saved_material_id) {
        const existing = db.prepare('SELECT id FROM application_materials WHERE id=? AND user_id=? AND ai_draft_id=?').get(draft.saved_material_id, req.user.userId, draft.id);
        if (existing) return { materialId: existing.id, draftId: draft.id, idempotent: true };
      }
      if (draft.status !== 'pending') throw Object.assign(new Error('草稿已处理，不能重复保存'), { status:409 });
      if (draft.material_type === 'tailored_resume') throw Object.assign(new Error('整份简历定制已移至简历中心'), { status:409, code:'TAILORED_RESUME_MOVED' });
      const applicationRow = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(draft.application_id, req.user.userId);
      if (!applicationRow) throw Object.assign(new Error('关联申请记录不存在'), { status:409 });
      const content = center.cleanText(req.body && req.body.content !== undefined ? req.body.content : draft.content, 12000);
      if (!content) throw Object.assign(new Error('材料内容不能为空'), { status:400 });
      const application = applicationView(applicationRow);
      const storedContent = content;
      const clientId = `v4_material_${draft.id}`;
      db.prepare(`
        INSERT OR IGNORE INTO application_materials
          (user_id, client_id, question_type, question_label, job_id, company, job_title, resume_name, resume_version_id, content,
           application_id, status, ai_draft_id, ai_model, prompt_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?, datetime('now'))
      `).run(req.user.userId, clientId, draft.material_type, LABELS[draft.material_type], application.jobId,
        application.company, application.jobTitle, draft.resume_id ? (db.prepare('SELECT name FROM resumes WHERE id=?').get(draft.resume_id) || {}).name || '' : '',
        String(draft.resume_version_id || ''), storedContent, application.id, draft.id, draft.ai_model, draft.prompt_version);
      const material = db.prepare('SELECT id FROM application_materials WHERE user_id=? AND ai_draft_id=?').get(req.user.userId, draft.id);
      if (!material) throw new Error('申请材料保存失败');
      if (draft.material_type === 'cover_letter') {
        db.prepare('UPDATE applications SET cover_letter=?, updated_at=datetime(\'now\') WHERE id=? AND user_id=?').run(content, application.id, req.user.userId);
      }
      const confirmed = db.prepare("UPDATE ai_application_material_drafts SET status='confirmed', content=?, saved_material_id=?, confirmed_at=datetime('now') WHERE id=? AND user_id=? AND status='pending'")
        .run(storedContent, material.id, draft.id, req.user.userId);
      if (confirmed.changes !== 1) throw Object.assign(new Error('草稿已处理，不能重复保存'), { status:409 });
      return { materialId: material.id, draftId: draft.id, idempotent: false };
    }).immediate();
    const confirmedDraft = db.prepare('SELECT * FROM ai_application_material_drafts WHERE id=? AND user_id=?').get(saved.draftId, req.user.userId);
    res.status(saved.idempotent ? 200 : 201).json({ code: 0, data: Object.assign(saved, { draft: draftView(confirmedDraft) }), message: '用户已确认，材料已保存' });
  } catch (error) {
    sendError(res, error, '申请材料保存失败');
  }
});

router.post('/saved/:id/archive', (req, res) => {
  const materialId = positiveId(req.params.id);
  if (!materialId) return res.status(400).json({ code:-1, message:'材料 ID 无效' });
  const result = db.prepare("UPDATE application_materials SET status='archived',updated_at=datetime('now') WHERE id=? AND user_id=?")
    .run(materialId, req.user.userId);
  if (!result.changes) return res.status(404).json({ code:-1, message:'材料不存在' });
  res.json({ code:0, message:'材料已归档' });
});

module.exports = router;
