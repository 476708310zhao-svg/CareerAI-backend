const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const db      = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { imageExtForMime, isAllowedImageMime, rejectInvalidImage } = require('../utils/uploadSecurity');
const { UPLOAD_DIR, ensureDir } = require('../utils/paths');

let parsePdf = null;
try {
  parsePdf = require('pdf-parse');
} catch (e) {
  parsePdf = null;
}

// multer 配置：按日期分目录，用随机文件名防止冲突
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date().toISOString().slice(0, 10); // 2026-03-30
    const dir = ensureDir(path.join(UPLOAD_DIR, today));
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // 后缀强制从验证后的 MIME 推导，忽略客户端 originalname，防止 polyglot 攻击
    const ext = imageExtForMime(file.mimetype);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 最大 5MB
  fileFilter: (req, file, cb) => {
    if (!isAllowedImageMime(file.mimetype)) {
      return cb(new Error('只允许上传 JPG、PNG、WebP、GIF 格式的图片'));
    }
    cb(null, true);
  }
});

// POST /api/upload/avatar
// 微信小程序用 wx.uploadFile() 调用，文件字段名为 "file"
router.post('/avatar', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: -1, message: '未收到文件' });
  }

  // 二次校验：读取文件头魔数，防止 MIME 伪造
  if (rejectInvalidImage(req.file)) {
    return res.status(400).json({ code: -1, message: '文件内容与格式不符，请上传真实图片' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fileUrl = `/uploads/${today}/${req.file.filename}`;

  res.json({ code: 0, message: '上传成功', data: { url: fileUrl } });
});

// ── PDF 简历上传 ──────────────────────────────────────────────────────────────
const PDF_DIR = ensureDir(path.join(UPLOAD_DIR, 'resumes'));

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PDF_DIR),
  filename: (_req, _file, cb) => {
    cb(null, `resume_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`);
  },
});

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const originalName = file.originalname || '';
    const isPdfMime = file.mimetype === 'application/pdf';
    const isWeChatBinary = file.mimetype === 'application/octet-stream' || !file.mimetype;
    const hasPdfExt = path.extname(originalName).toLowerCase() === '.pdf';
    if (isPdfMime || isWeChatBinary || hasPdfExt) {
      return cb(null, true);
    }
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('只允许上传 PDF 文件'));
    }
    cb(null, true);
  },
});

function cleanOriginalName(value, fallback = 'resume.pdf') {
  const raw = String(value || fallback);
  const safe = path.basename(raw).replace(/[\r\n]/g, ' ').trim();
  return (safe || fallback).slice(0, 200);
}

function decodePdfString(value) {
  return String(value || '')
    .replace(/\\([nrtbf()\\])/g, (_, ch) => {
      const map = { n: '\n', r: '\r', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' };
      return map[ch] || ch;
    })
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 12000);
}

async function extractPdfText(filePath) {
  if (!parsePdf) return extractPdfTextBasic(filePath);
  const buffer = fs.readFileSync(filePath);
  try {
    const result = await parsePdf(buffer);
    const text = normalizeExtractedText(result && result.text);
    if (text) return text;
  } catch (e) {
    // 部分损坏或特殊编码 PDF 让基础解析器再尝试一次。
  }

  return extractPdfTextBasic(filePath);
}

function extractPdfTextBasic(filePath) {
  const raw = fs.readFileSync(filePath);
  const text = raw.toString('latin1');
  const parts = [];
  const literalPattern = /\((?:\\.|[^\\)]){2,}\)\s*Tj/g;
  let match;

  while ((match = literalPattern.exec(text))) {
    parts.push(decodePdfString(match[0].replace(/\)\s*Tj$/, '').slice(1)));
  }

  const arrayPattern = /\[((?:\s*\((?:\\.|[^\\)])*\)\s*-?\d*\.?\d*)+)\]\s*TJ/g;
  while ((match = arrayPattern.exec(text))) {
    const inner = match[1];
    const chunk = [];
    const itemPattern = /\((?:\\.|[^\\)])*\)/g;
    let item;
    while ((item = itemPattern.exec(inner))) {
      chunk.push(decodePdfString(item[0].slice(1, -1)));
    }
    if (chunk.length) parts.push(chunk.join(''));
  }

  return normalizeExtractedText(parts.join('\n'));
}

const SECTION_HEADERS = {
  education: /^(education|academic background|学历|教育经历|教育背景)$/i,
  work: /^(experience|work experience|professional experience|employment|internship experience|工作经历|实习经历|实践经历|职业经历)$/i,
  projects: /^(projects|project experience|selected projects|项目经历|项目经验|项目)$/i,
  skills: /^(skills|technical skills|技能|技能标签|专业技能)$/i,
  summary: /^(summary|profile|objective|个人优势|自我评价|简介)$/i
};

const ANY_SECTION_HEADER = new RegExp(
  Object.values(SECTION_HEADERS).map(r => r.source.replace(/^\^|\$$/g, '')).join('|'),
  'i'
);

function isSectionHeader(line) {
  const value = String(line || '').replace(/[:：]/g, '').trim();
  return value.length <= 40 && ANY_SECTION_HEADER.test(value);
}

function extractSection(lines, type) {
  const header = SECTION_HEADERS[type];
  const start = lines.findIndex(line => header.test(String(line || '').replace(/[:：]/g, '').trim()));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (isSectionHeader(lines[i])) break;
    out.push(lines[i]);
  }
  return out.filter(Boolean);
}

function isDateLine(line) {
  return /(?:20\d{2}|19\d{2}|present|current|now|至今|目前|迄今)/i.test(line || '');
}

function findDateRange(lines) {
  const line = (lines || []).find(isDateLine) || '';
  return line
    .replace(/.*?((?:19|20)\d{2}(?:[./-]\d{1,2})?\s*(?:-|–|—|~|至|到)\s*(?:(?:19|20)\d{2}(?:[./-]\d{1,2})?|present|current|now|至今|目前|迄今)).*/i, '$1')
    .trim();
}

function compactDesc(lines, max = 420) {
  return (lines || [])
    .map(line => String(line || '').replace(/^[•·*-]\s*/, '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max);
}

function splitExperienceBlocks(sectionLines) {
  const blocks = [];
  let current = [];
  for (const line of sectionLines) {
    const startsNew = current.length >= 3 && isDateLine(line) && !/^[•·*-]/.test(line);
    if (startsNew) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks.slice(0, 4);
}

function parseEducation(lines) {
  const section = extractSection(lines, 'education');
  if (!section.length) return [];
  const schoolRe = /(university|college|institute|school|academy|大学|学院|学校)/i;
  const degreeRe = /(bachelor|master|ph\.?d|doctor|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|本科|硕士|博士|学士|研究生)/i;
  const schoolLine = section.find(line => schoolRe.test(line)) || section[0] || '';
  const degreeLine = section.find(line => degreeRe.test(line)) || '';
  const majorLine = section.find(line =>
    /(major|computer|science|engineering|business|finance|analytics|data|专业|计算机|金融|工程|数据|商业)/i.test(line) &&
    line !== schoolLine
  ) || '';
  const time = findDateRange(section);
  if (!schoolLine && !degreeLine) return [];
  return [{
    id: Date.now(),
    school: schoolLine.replace(/\s{2,}/g, ' ').trim(),
    degree: degreeLine.replace(/\s{2,}/g, ' ').trim(),
    major: majorLine.replace(/\s{2,}/g, ' ').trim(),
    time
  }];
}

function parseWorkExperience(lines) {
  const section = extractSection(lines, 'work');
  if (!section.length) return [];
  const roleRe = /(engineer|developer|manager|analyst|scientist|designer|consultant|researcher|intern|assistant|lead|director|工程师|开发|经理|分析师|实习|助理|研究员|顾问|设计师)/i;
  return splitExperienceBlocks(section).map((block, index) => {
    const time = findDateRange(block);
    const clean = block.filter(line => !isDateLine(line) && !isSectionHeader(line));
    const roleLine = clean.find(line => roleRe.test(line)) || '';
    const companyLine = clean.find(line => line !== roleLine && !/^[•·*-]/.test(line)) || clean[0] || '';
    const descLines = clean.filter(line => line !== companyLine && line !== roleLine);
    return {
      id: Date.now() + index,
      company: companyLine.trim(),
      role: roleLine.trim(),
      time,
      desc: compactDesc(descLines)
    };
  }).filter(item => item.company || item.role || item.desc);
}

function parseProjects(lines) {
  const section = extractSection(lines, 'projects');
  if (!section.length) return [];
  return splitExperienceBlocks(section).map((block, index) => {
    const time = findDateRange(block);
    const clean = block.filter(line => !isDateLine(line) && !isSectionHeader(line));
    const name = (clean.find(line => !/^[•·*-]/.test(line)) || clean[0] || '').trim();
    const desc = compactDesc(clean.filter(line => line !== name), 360);
    return {
      id: Date.now() + index,
      name,
      role: '',
      time,
      desc
    };
  }).filter(item => item.name || item.desc).slice(0, 4);
}

function buildResumeDraftFromText(text, filename) {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line && line.length <= 180);
  const joined = lines.join('\n');
  const email = (joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const phone = (joined.match(/(?:\+?\d[\d\s().-]{7,}\d)/) || [])[0] || '';
  const linkedin = (joined.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)]+/i) || [])[0] || '';
  const nameLine = lines.find(line => {
    if (line.includes('@') || /linkedin|github|phone|email/i.test(line)) return false;
    return /^[A-Za-z\u4e00-\u9fa5][A-Za-z\u4e00-\u9fa5\s.-]{1,50}$/.test(line);
  }) || '';
  const skillKeywords = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'SQL', 'React', 'Vue', 'Node.js',
    'Express', 'Spring', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Tableau', 'Power BI',
    'Excel', 'Figma', 'Axure', 'Machine Learning', 'Deep Learning', 'NLP', 'Data Analysis'
  ];
  const lower = joined.toLowerCase();
  const skills = skillKeywords.filter(skill => lower.includes(skill.toLowerCase())).slice(0, 20);
  const summaryLines = lines
    .filter(line => !line.includes('@') && !/linkedin|github/i.test(line))
    .slice(0, 6);

  return {
    score: 65,
    basicInfo: {
      name: nameLine,
      title: '',
      phone,
      email,
      location: '',
      linkedin
    },
    summary: summaryLines.join('；').slice(0, 500),
    workExp: parseWorkExperience(lines),
    education: parseEducation(lines),
    skills,
    projects: parseProjects(lines),
    sourceAttachment: {
      filename,
      extractedAt: new Date().toISOString()
    }
  };
}

// POST /api/upload/resume-pdf
// 字段名 "file"，返回 { code:0, data: { id, url, filename, size } }
router.post('/resume-pdf', authMiddleware, pdfUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: -1, message: '未收到 PDF 文件' });

  // 验证 PDF 魔数（%PDF-）
  try {
    const buf = Buffer.alloc(5);
    const fd  = fs.openSync(req.file.path, 'r');
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    if (buf.toString('ascii') !== '%PDF-') {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ code: -1, message: '文件内容不是有效的 PDF' });
    }
  } catch (e) {
    return res.status(400).json({ code: -1, message: '文件读取失败' });
  }

  const fileUrl      = `/uploads/resumes/${req.file.filename}`;
  const originalName = cleanOriginalName(
    (req.body && req.body.originalName) || req.file.originalname,
    'resume.pdf'
  );

  const result = db.prepare(`
    INSERT INTO resume_pdfs (user_id, filename, original_name, file_url, file_size)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.userId, req.file.filename, originalName, fileUrl, req.file.size);

  res.json({ code: 0, message: '上传成功', data: {
    id:       result.lastInsertRowid,
    url:      fileUrl,
    filename: originalName,
    size:     req.file.size,
  }});
});

// GET /api/upload/resume-pdfs — 获取当前用户所有 PDF 简历
router.get('/resume-pdfs', authMiddleware, (req, res) => {
  const rows = db.prepare(
    'SELECT id, original_name, file_url, file_size, created_at FROM resume_pdfs WHERE user_id=? ORDER BY created_at DESC LIMIT 10'
  ).all(req.user.userId);
  res.json({ code: 0, data: rows });
});

router.post('/resume-pdf/:id/extract', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM resume_pdfs WHERE id=? AND user_id=?').get(id, req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: 'PDF 简历不存在' });

  const pdfPath = path.join(UPLOAD_DIR, 'resumes', row.filename);
  if (!fs.existsSync(pdfPath)) return res.status(404).json({ code: -1, message: 'PDF 文件不存在' });

  try {
    const text = await extractPdfText(pdfPath);
    if (!text || text.length < 20) {
      return res.json({
        code: 0,
        data: {
          text: '',
          resume: buildResumeDraftFromText('', row.original_name || 'resume.pdf'),
          extraction: {
            status: 'empty',
            warning: '该 PDF 可能是扫描件、图片型简历、加密 PDF，或使用了特殊字体编码。已创建空白草稿，请手动补充关键信息。'
          }
        },
        message: '暂时无法从该 PDF 提取文字，可能是扫描件或加密 PDF。请使用文字版 PDF，或先手动完善在线简历。'
      });
    }

    res.json({
      code: 0,
      data: {
        text,
        resume: buildResumeDraftFromText(text, row.original_name || 'resume.pdf'),
        extraction: { status: 'ok' }
      }
    });
  } catch (e) {
    res.status(500).json({ code: -1, message: '简历解析失败，请稍后重试' });
  }
});

// DELETE /api/upload/resume-pdf/:id — 删除 PDF 简历
router.delete('/resume-pdf/:id', authMiddleware, (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM resume_pdfs WHERE id=? AND user_id=?').get(id, req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '文件不存在' });
  fs.unlink(path.join(UPLOAD_DIR, 'resumes', row.filename), () => {});
  db.prepare('DELETE FROM resume_pdfs WHERE id=?').run(id);
  res.json({ code: 0, message: '已删除' });
});

// multer 错误统一处理
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: -1, message: '文件不能超过 10MB' });
  }
  res.status(400).json({ code: -1, message: err.message });
});

module.exports = router;
