'use strict';
// routes/apply.js — 半自动投递
//
// GET  /api/apply/form     拉取 ATS 表单结构（Greenhouse / Lever）
// POST /api/apply/submit   提交申请（multipart 转发给 ATS）
// GET  /api/apply/pdfs     当前用户的 PDF 简历列表（同 upload 路由，方便聚合）

const express  = require('express');
const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const FormData = require('form-data');
const router   = express.Router();
const db       = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { sendToUser }     = require('./notify');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

// ── 表单结构拉取 ──────────────────────────────────────────────────────────────
// GET /api/apply/form?source=greenhouse&slug=stripe&jobId=12345
router.get('/form', authMiddleware, async (req, res) => {
  const { source, slug, jobId } = req.query;
  if (!source || !slug || !jobId) {
    return res.status(400).json({ code: -1, message: '缺少 source / slug / jobId' });
  }

  try {
    if (source === 'greenhouse') {
      const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}?questions=true`;
      const r   = await axios.get(url, { timeout: 12000 });
      const job = r.data;

      // 提取所有问题，标注哪些是必填且无法自动填写的
      const questions = (job.questions || []).map(q => ({
        label:    q.label,
        required: !!q.required,
        fields:   (q.fields || []).map(f => ({
          name:   f.name,
          type:   f.type,         // input_text | textarea | attachment | multi_value_single_select 等
          values: (f.values || []).map(v => ({ label: v.label, value: String(v.value) })),
        })),
      }));

      // 自动填字段（从用户简历拉取）
      const autoFields = _buildAutoFields(req.user.userId);

      // 筛出"必填 & AI 无法自动填"的自定义问题
      const AUTO_FIELD_NAMES = new Set([
        'first_name', 'last_name', 'email', 'phone', 'resume', 'cover_letter',
        'linkedin_profile', 'website', 'resume_text',
      ]);
      const customRequired = questions.filter(q =>
        q.required &&
        q.fields.some(f => !AUTO_FIELD_NAMES.has(f.name))
      );

      return res.json({
        code: 0,
        data: {
          source,
          slug,
          jobId,
          title:    job.title || '',
          company:  job.company ? job.company.name : slug,
          applyUrl: job.absolute_url || '',
          questions,
          customRequired,
          autoFields,
        },
      });
    }

    if (source === 'lever') {
      const url = `https://api.lever.co/v0/postings/${slug}/${jobId}?mode=json`;
      const r   = await axios.get(url, { timeout: 12000 });
      const job = r.data;

      const autoFields = _buildAutoFields(req.user.userId);

      // Lever 公开 API 不返回自定义表单字段，只能提交基础信息
      return res.json({
        code: 0,
        data: {
          source,
          slug,
          jobId,
          title:    job.text || '',
          company:  slug,
          applyUrl: job.hostedUrl || '',
          questions:      [],
          customRequired: [],  // Lever 无法预取自定义问题
          leverNote:      'Lever 职位仅支持基础字段自动填写，提交后请在邮件中补充完整材料',
          autoFields,
        },
      });
    }

    res.status(400).json({ code: -1, message: '不支持的 source 类型' });
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) return res.status(404).json({ code: -1, message: '职位不存在或已关闭' });
    console.error('[apply/form]', err.message);
    res.status(502).json({ code: -1, message: '获取表单失败，请稍后重试' });
  }
});

// ── 提交申请 ──────────────────────────────────────────────────────────────────
// POST /api/apply/submit
// Body (JSON): {
//   source, slug, jobId,
//   pdfId,            // resume_pdfs.id
//   basicInfo: { firstName, lastName, email, phone, linkedin?, website? },
//   customAnswers: [{ fieldName, value }],   // 用户手动填的自定义问题
//   jobSnapshot: { title, company, ... }
// }
router.post('/submit', authMiddleware, async (req, res) => {
  const { source, slug, jobId, pdfId, basicInfo, customAnswers = [], jobSnapshot = {} } = req.body;

  if (!source || !slug || !jobId) {
    return res.status(400).json({ code: -1, message: '缺少 source / slug / jobId' });
  }
  if (!pdfId) {
    return res.status(400).json({ code: -1, message: '请先上传 PDF 简历' });
  }
  if (!basicInfo || !basicInfo.email) {
    return res.status(400).json({ code: -1, message: '邮箱不能为空' });
  }

  // 查 PDF 文件
  const pdfRow = db.prepare('SELECT * FROM resume_pdfs WHERE id=? AND user_id=?')
    .get(parseInt(pdfId), req.user.userId);
  if (!pdfRow) return res.status(404).json({ code: -1, message: 'PDF 文件不存在，请重新上传' });

  const pdfPath = path.join(UPLOAD_DIR, 'resumes', pdfRow.filename);
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ code: -1, message: 'PDF 文件已丢失，请重新上传' });
  }

  // 防重复投递
  const exists = db.prepare(
    `SELECT id FROM applications WHERE user_id=? AND source_type=? AND source_job_id=?`
  ).get(req.user.userId, source, String(jobId));
  if (exists) return res.status(400).json({ code: -1, message: '您已经投递过该职位' });

  try {
    let atsResult = null;

    if (source === 'greenhouse') {
      atsResult = await _submitGreenhouse({ slug, jobId, basicInfo, customAnswers, pdfPath, pdfRow });
    } else if (source === 'lever') {
      atsResult = await _submitLever({ slug, jobId, basicInfo, customAnswers, pdfPath, pdfRow });
    } else {
      return res.status(400).json({ code: -1, message: '不支持的 source' });
    }

    // 写 applications 记录
    const snap = {
      title:   jobSnapshot.title   || '',
      company: jobSnapshot.company || slug,
      source_type: source,
    };
    const appResult = db.prepare(`
      INSERT INTO applications
        (user_id, job_id, job_snapshot, status, status_text,
         source_type, source_job_id, source_slug, tracking, job_active)
      VALUES (?, ?, ?, 'applied', '已投递', ?, ?, ?, 1, 1)
    `).run(
      req.user.userId,
      `${source}_${jobId}`,
      JSON.stringify(snap),
      source,
      String(jobId),
      slug,
    );

    // 站内消息 + 微信推送
    sendToUser(req.user.userId, {
      type:    'application',
      title:   '投递成功',
      content: `已成功投递「${snap.company}${snap.title ? ' · ' + snap.title : ''}」`,
      templateId: process.env.WX_TPL_APPLICATION,
      wxData: {
        thing1:  { value: snap.title.slice(0, 20) || '职位' },
        thing2:  { value: snap.company.slice(0, 20) },
        phrase3: { value: '已投递' },
      },
    }).catch(() => {});

    res.json({
      code: 0,
      message: '投递成功',
      data: {
        appId:      appResult.lastInsertRowid,
        atsResult,
        autoTracking: true,
      },
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data;
    console.error('[apply/submit]', status, err.message, detail);

    if (status === 422 || status === 400) {
      return res.status(422).json({
        code: -1,
        message: '表单验证失败，请检查填写内容',
        data: { detail: detail || err.message },
      });
    }
    res.status(502).json({ code: -1, message: '提交失败，请稍后重试或手动申请', data: { error: err.message } });
  }
});

// ── Greenhouse 提交 ───────────────────────────────────────────────────────────
async function _submitGreenhouse({ slug, jobId, basicInfo, customAnswers, pdfPath, pdfRow }) {
  const form = new FormData();

  // 基础字段
  const nameParts = (basicInfo.firstName + ' ' + basicInfo.lastName).trim().split(/\s+/);
  form.append('first_name', basicInfo.firstName || nameParts[0] || '');
  form.append('last_name',  basicInfo.lastName  || nameParts.slice(1).join(' ') || '');
  form.append('email',      basicInfo.email);
  if (basicInfo.phone)    form.append('phone',    basicInfo.phone);
  if (basicInfo.linkedin) form.append('linkedin_profile', basicInfo.linkedin);
  if (basicInfo.website)  form.append('website',  basicInfo.website);

  // 附加简历 PDF
  form.append('resume',
    fs.createReadStream(pdfPath),
    { filename: pdfRow.original_name || 'resume.pdf', contentType: 'application/pdf' }
  );

  // 用户填写的自定义答案
  for (const ans of customAnswers) {
    if (ans.fieldName && ans.value !== undefined && ans.value !== '') {
      form.append(ans.fieldName, String(ans.value));
    }
  }

  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}/applications`;
  const r   = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  return r.data;
}

// ── Lever 提交 ────────────────────────────────────────────────────────────────
async function _submitLever({ slug, jobId, basicInfo, customAnswers, pdfPath, pdfRow }) {
  const form = new FormData();

  form.append('name',  `${basicInfo.firstName || ''} ${basicInfo.lastName || ''}`.trim());
  form.append('email', basicInfo.email);
  if (basicInfo.phone)   form.append('phone',   basicInfo.phone);
  if (basicInfo.website) form.append('urls[website]', basicInfo.website);
  if (basicInfo.linkedin) form.append('urls[LinkedIn]', basicInfo.linkedin);

  form.append('resume',
    fs.createReadStream(pdfPath),
    { filename: pdfRow.original_name || 'resume.pdf', contentType: 'application/pdf' }
  );

  for (const ans of customAnswers) {
    if (ans.fieldName && ans.value !== undefined && ans.value !== '') {
      form.append(ans.fieldName, String(ans.value));
    }
  }

  const url = `https://api.lever.co/v0/postings/${slug}/${jobId}/apply`;
  const r   = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  return r.data;
}

// ── 从用户简历自动提取基础字段 ────────────────────────────────────────────────
function _buildAutoFields(userId) {
  try {
    const resume = db.prepare(
      'SELECT data FROM resumes WHERE user_id=? ORDER BY updated_at DESC LIMIT 1'
    ).get(userId);
    if (!resume || !resume.data) return {};

    let data = {};
    try { data = JSON.parse(resume.data); } catch (e) { return {}; }

    const b = data.basicInfo || {};
    const nameParts = (b.name || '').trim().split(/\s+/);

    return {
      firstName: b.firstName || nameParts[0]               || '',
      lastName:  b.lastName  || nameParts.slice(1).join(' ')|| '',
      email:     b.email     || '',
      phone:     b.phone     || '',
      linkedin:  b.linkedin  || '',
      website:   b.website   || b.portfolio || '',
    };
  } catch (e) {
    return {};
  }
}

module.exports = router;
