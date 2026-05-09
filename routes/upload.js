const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { imageExtForMime, isAllowedImageMime, rejectInvalidImage } = require('../utils/uploadSecurity');

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

// multer 错误统一处理
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: -1, message: '图片不能超过 5MB' });
  }
  res.status(400).json({ code: -1, message: err.message });
});

module.exports = router;
