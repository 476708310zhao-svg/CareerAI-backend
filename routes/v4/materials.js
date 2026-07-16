const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const { consumeDailyLimit, getQuotaStatus } = require('../../utils/aiQuota');
const center = require('../../services/v4ResumeCenter');
const analytics = require('../../services/v4Analytics');

const router = express.Router();
router.use(authMiddleware);

const MATERIAL_TYPES = ['tailored_resume', 'cover_letter', 'recruiter_message', 'follow_up_email'];
const LABELS = {
  tailored_resume: '按 JD 定制简历',
  cover_letter: 'Cover Letter',
  recruiter_message: 'Recruiter 消息',
  follow_up_email: 'Follow-up 邮件'
};

function applicationView(row) {
  const snapshot = center.parseJson(row.job_snapshot, {});
  return {
    id: row.id,
    jobId: row.job_id || '',
    company: row.company || snapshot.company || '目标公司',
    jobTitle: row.job_title || snapshot.title || snapshot.jobTitle || '目标岗位',
    jdText: snapshot.description || snapshot.jd || row.notes || ''
  };
}

function draftView(row) {
  return {
    id: row.id, applicationId: row.application_id, resumeId: row.resume_id,
    resumeVersionId: row.resume_version_id, materialType: row.material_type,
    materialLabel: LABELS[row.material_type] || row.material_type, status: row.status,
    content: row.material_type === 'tailored_resume' ? center.parseJson(row.content, {}) : row.content,
    aiModel: row.ai_model, promptVersion: row.prompt_version,
    quotaCost: row.quota_cost, savedMaterialId: row.saved_material_id,
    createdAt: row.created_at, confirmedAt: row.confirmed_at
  };
}

function resumeFacts(content) {
  const texts = [];
  (function walk(value) {
    if (typeof value === 'string' && value.trim()) texts.push(value.trim());
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  })(content);
  return texts.slice(0, 8);
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
  if (type === 'recruiter_message') {
    return `您好，我正在申请 ${application.company} 的 ${application.jobTitle}。我的相关经历包括：${primary}。如果方便，希望能与您交流岗位重点和团队需求，感谢！`;
  }
  return `主题：关于 ${application.jobTitle} 申请的跟进\n\n您好，我想礼貌跟进此前提交的 ${application.company} ${application.jobTitle} 职位申请。我对该机会仍然非常感兴趣；我的相关经历包括：${primary}。如需补充材料，我会及时提供。感谢您的时间。`;
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
  if (req.query.applicationId) { where += ' AND application_id=?'; params.push(Number(req.query.applicationId)); }
  if (req.query.status) { where += ' AND status=?'; params.push(center.cleanText(req.query.status, 30)); }
  const rows = db.prepare(`SELECT * FROM ai_application_material_drafts WHERE ${where} ORDER BY created_at DESC, id DESC`).all(...params);
  res.json({ code: 0, data: rows.map(draftView) });
});

router.post('/drafts', (req, res) => {
  const body = req.body || {};
  const type = center.cleanText(body.materialType, 40);
  if (!MATERIAL_TYPES.includes(type)) return res.status(400).json({ code: -1, message: '材料类型无效' });
  const applicationRow = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(body.applicationId), req.user.userId);
  if (!applicationRow) return res.status(404).json({ code: -1, message: '申请记录不存在' });
  let owned = null;
  if (body.resumeId) {
    owned = center.ensureCurrentVersion(req.user.userId, Number(body.resumeId));
    if (!owned) return res.status(404).json({ code: -1, message: '简历不存在' });
  } else if (applicationRow.resume_id) {
    owned = center.ensureCurrentVersion(req.user.userId, applicationRow.resume_id);
  }
  if (type === 'tailored_resume' && !owned) return res.status(400).json({ code: -1, message: '定制简历必须选择原简历' });
  if (!consumeDailyLimit(req, res, 'application_assistant')) return;
  const application = applicationView(applicationRow);
  const generated = generateContent(type, application, owned && owned.version);
  const promptSnapshot = [LABELS[type], application.company, application.jobTitle, center.cleanText(body.jdText || application.jdText, 6000)].join('\n');
  const result = db.prepare(`
    INSERT INTO ai_application_material_drafts
      (user_id, application_id, resume_id, resume_version_id, material_type, content, ai_model, prompt_version, prompt_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.userId, application.id, owned && owned.resume.id, owned && owned.version.id, type,
    typeof generated === 'string' ? generated : JSON.stringify(generated), center.AI_MODEL, center.PROMPT_VERSION, promptSnapshot);
  const data = draftView(db.prepare('SELECT * FROM ai_application_material_drafts WHERE id=?').get(result.lastInsertRowid));
  analytics.track(req.user.userId, 'application_material_generated', { applicationId: application.id, materialType: type }, '/api/v4/materials/drafts');
  res.status(201).json({ code: 0, data: Object.assign(data, { quota: getQuotaStatus(req.user.userId) }), message: '草稿已生成，确认前不会保存到申请材料' });
});

router.post('/drafts/:id/reject', (req, res) => {
  const result = db.prepare("UPDATE ai_application_material_drafts SET status='rejected', confirmed_at=datetime('now') WHERE id=? AND user_id=? AND status='pending'")
    .run(Number(req.params.id), req.user.userId);
  if (!result.changes) return res.status(409).json({ code: -1, message: '草稿不存在或已处理' });
  res.json({ code: 0, message: '草稿已拒绝，未保存任何材料' });
});

router.post('/drafts/:id/confirm', (req, res) => {
  const draft = db.prepare('SELECT * FROM ai_application_material_drafts WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
  if (!draft) return res.status(404).json({ code: -1, message: '草稿不存在' });
  if (draft.status !== 'pending') return res.status(409).json({ code: -1, message: '草稿已处理，不能重复保存' });
  const applicationRow = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(draft.application_id, req.user.userId);
  if (!applicationRow) return res.status(409).json({ code: -1, message: '关联申请记录不存在' });
  let content = req.body && req.body.content !== undefined ? req.body.content : (draft.material_type === 'tailored_resume' ? center.parseJson(draft.content, {}) : draft.content);
  if (draft.material_type === 'tailored_resume' && (!content || typeof content !== 'object' || Array.isArray(content))) {
    return res.status(400).json({ code: -1, message: '定制简历内容必须是完整简历对象' });
  }
  if (draft.material_type !== 'tailored_resume') {
    content = center.cleanText(content, 12000);
    if (!content) return res.status(400).json({ code: -1, message: '材料内容不能为空' });
  }
  const application = applicationView(applicationRow);
  try {
    const saved = db.transaction(() => {
      let version = null;
      if (draft.material_type === 'tailored_resume') {
        version = center.createVersion({ userId: req.user.userId, resumeId: draft.resume_id, content,
          sourceVersionId: draft.resume_version_id, summary: `按 ${application.company} ${application.jobTitle} JD 定制`, createdBy: 'application_assistant_confirmed' });
      }
      const storedContent = draft.material_type === 'tailored_resume' ? JSON.stringify(content) : content;
      const clientId = `v4_material_${draft.id}`;
      const result = db.prepare(`
        INSERT INTO application_materials
          (user_id, client_id, question_type, question_label, job_id, company, job_title, resume_name, resume_version_id, content,
           application_id, status, ai_draft_id, ai_model, prompt_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?, datetime('now'))
      `).run(req.user.userId, clientId, draft.material_type, LABELS[draft.material_type], application.jobId,
        application.company, application.jobTitle, draft.resume_id ? (db.prepare('SELECT name FROM resumes WHERE id=?').get(draft.resume_id) || {}).name || '' : '',
        version ? String(version.id) : String(draft.resume_version_id || ''), storedContent, application.id, draft.id, draft.ai_model, draft.prompt_version);
      if (draft.material_type === 'cover_letter') {
        db.prepare('UPDATE applications SET cover_letter=?, updated_at=datetime(\'now\') WHERE id=? AND user_id=?').run(content, application.id, req.user.userId);
      }
      if (version) {
        db.prepare('UPDATE applications SET resume_id=?, resume_version_id=?, updated_at=datetime(\'now\') WHERE id=? AND user_id=?')
          .run(draft.resume_id, String(version.id), application.id, req.user.userId);
      }
      db.prepare("UPDATE ai_application_material_drafts SET status='confirmed', content=?, saved_material_id=?, confirmed_at=datetime('now') WHERE id=?")
        .run(storedContent, result.lastInsertRowid, draft.id);
      return { materialId: result.lastInsertRowid, version };
    })();
    res.status(201).json({ code: 0, data: Object.assign(saved, { draft: draftView(db.prepare('SELECT * FROM ai_application_material_drafts WHERE id=?').get(draft.id)) }), message: '用户已确认，材料已保存' });
  } catch (error) {
    res.status(error.status || 500).json({ code: error.code || -1, message: error.message || '保存失败' });
  }
});

module.exports = router;
