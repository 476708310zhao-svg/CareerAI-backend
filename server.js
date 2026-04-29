require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { optionalAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
// ALLOWED_ORIGIN 必须在 .env 中显式配置；本地开发设为 http://localhost:3001
// 小程序请求不受 CORS 限制，此配置仅影响浏览器客户端（如管理后台）
// 支持多个来源，用逗号分隔，e.g. http://localhost:5173,https://yoursite.com
const rawOrigins = process.env.ALLOWED_ORIGIN || '';
const allowedOrigins = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);
if (allowedOrigins.length === 0) {
  console.warn('[CORS] ALLOWED_ORIGIN 未配置，跨域请求将被拒绝。');
}
app.use(cors({
  origin: (origin, callback) => {
    // 小程序/服务端请求无 origin，直接放行
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true
}));
// 安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
// 全局挂载可选鉴权（有 token 则解析 req.user，无 token 也不拦截）
app.use(optionalAuth);

// 静态文件服务（头像等上传文件）
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 导入路由
const jobRoutes         = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const experienceRoutes  = require('./routes/experiences');
const salaryRoutes      = require('./routes/salaries');
const userRoutes        = require('./routes/users');
const companyRoutes     = require('./routes/companies');
const commentRoutes     = require('./routes/comments');
const favoriteRoutes    = require('./routes/favorites');
const messageRoutes     = require('./routes/messages');
const aiRoutes          = require('./routes/ai');
const newsRoutes        = require('./routes/news');
const uploadRoutes      = require('./routes/upload');
const feedbackRoutes    = require('./routes/feedback');
const notifyModule      = require('./routes/notify');
const agencyRoutes      = require('./routes/agencies');
const campusRoutes      = require('./routes/campus');
const logoRoutes        = require('./routes/logo');
const resumeRoutes      = require('./routes/resumes');
const adminRoutes       = require('./routes/admin');
const bannerRoutes      = require('./routes/banners');
const asrRoutes         = require('./routes/asr');
const paymentRoutes     = require('./routes/payment');

// 注册路由
app.use('/api/jobs',         jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/experiences',  experienceRoutes);
app.use('/api/salaries',     salaryRoutes);
app.use('/api/users',        userRoutes);
app.use('/api/companies',    companyRoutes);
app.use('/api/comments',     commentRoutes);
app.use('/api/favorites',    favoriteRoutes);
app.use('/api/messages',     messageRoutes);
app.use('/api/ai',           aiRoutes);
app.use('/api/news',         newsRoutes);
app.use('/api/upload',       uploadRoutes);
app.use('/api/feedback',     feedbackRoutes);
app.use('/api/notify',       notifyModule.router);
app.use('/api/agencies',    agencyRoutes);
app.use('/api/campus',      campusRoutes);
app.use('/api/logo',        logoRoutes);
app.use('/api/resumes',     resumeRoutes);
app.use('/api/banners',     bannerRoutes);
app.use('/api/asr',         asrRoutes);
app.use('/api/payment',     paymentRoutes);
app.use('/admin',           adminRoutes);

// 管理后台静态文件（需放在 adminRoutes 之后，避免 /admin/api/* 被静态文件拦截）
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: '留学生求职小程序后端服务运行正常', time: new Date().toISOString() });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// 全局错误兜底
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ 留学生求职小程序后端运行在 http://localhost:${PORT}`);
});
