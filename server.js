require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

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
const campusRoutes = require('./routes/campus');

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
app.use('/api/campus', campusRoutes);
const adminRoutes = require('./routes/admin');
const bannerRoutes = require('./routes/banners');
app.use('/api/banners', bannerRoutes);
app.use('/admin', adminRoutes);
const path = require('path');
app.use('/uploads', require('express').static(path.join(__dirname, 'uploads')));
app.use('/admin', require('express').static(require('path').join(__dirname, 'admin')));

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
