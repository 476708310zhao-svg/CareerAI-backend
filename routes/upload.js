const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// 允许的图片 MIME 类型白名单（明确列举，不用前缀匹配）
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// MIME 类型到安全文件后缀的映射（强制从服务端推导，不信任客户端 originalname）
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif'
};

// 各 MIME 对应的文件头魔数（magic bytes），防止客户端伪造 MIME
// WebP: RIFF????WEBP，需校验字节 0-3 为 RIFF 且字节 8-11 为 WEBP
const MAGIC_BYTES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47]],
  'image/gif':  [[0x47, 0x49, 0x46, 0x38]]  // GIF8
};

function checkMagicBytes(filePath, mime) {
  try {
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    if (mime === 'image/webp') {
      // RIFF at 0-3, WEBP at 8-11
      const riff = [0x52, 0x49, 0x46, 0x46];
      const webp = [0x57, 0x45, 0x42, 0x50];
      return riff.every((b, i) => buf[i] === b) && webp.every((b, i) => buf[8 + i] === b);
    }

    const patterns = MAGIC_BYTES[mime];
    if (!patterns) return false;
    return patterns.some(magic => magic.every((byte, i) => buf[i] === byte));
  } catch (e) {
    return false;
  }
}

// 确保 uploads 目录存在
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// multer 配置：按日期分目录，用随机文件名防止冲突
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date().toISOString().slice(0, 10); // 2026-03-30
    const dir = path.join(UPLOAD_DIR, today);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // 后缀强制从验证后的 MIME 推导，忽略客户端 originalname，防止 polyglot 攻击
    const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 最大 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
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
  if (!checkMagicBytes(req.file.path, req.file.mimetype)) {
    fs.unlink(req.file.path, () => {});  // 删除伪造文件
    return res.status(400).json({ code: -1, message: '文件内容与格式不符，请上传真实图片' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fileUrl = `/uploads/${today}/${req.file.filename}`;

  res.json({ code: 0, message: '上传成功', data: { url: fileUrl } });
});

// multer 错误统一处理
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: -1, message: '图片不能超过 5MB' });
  }
  res.status(400).json({ code: -1, message: err.message });
});

module.exports = router;
