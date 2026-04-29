// utils/api.js
// API 入口桶文件 - 统一导出所有模块接口
// 页面层只需 require('./utils/api.js')，无需关心内部模块划分

const jobs        = require('./api-jobs.js');
const leetcode    = require('./api-leetcode.js');
const ai          = require('./api-ai.js');
const user        = require('./api-user.js');
const agencies    = require('./api-agencies.js');
const campus      = require('./api-campus.js');
const comments    = require('./api-comments.js');
const companies   = require('./api-companies.js');
const experiences = require('./api-experiences.js');
const resumes     = require('./api-resumes.js');
const payment     = require('./api-payment.js');

module.exports = Object.assign({}, jobs, leetcode, ai, user, agencies, campus, comments, companies, experiences, resumes, payment);
