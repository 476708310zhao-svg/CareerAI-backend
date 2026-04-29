/**
 * db/seed.js - 将现有 JSON 数据一次性导入 SQLite
 * 运行：node db/seed.js
 * 已导入的数据不会重复插入（幂等）
 */
const db = require('./database');
const path = require('path');
const fs = require('fs');

function readJson(filename) {
  const p = path.join(__dirname, '../data', filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function j(obj) { return JSON.stringify(obj || {}); }

let total = 0;

// ─── users ────────────────────────────────────────────────────────────────────
const usersData = readJson('users.json');
if (usersData) {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users
      (id, openid, nickname, avatar, email, phone, education, job_preference, vip_level, vip_expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertResume = db.prepare(`
    INSERT OR IGNORE INTO resumes
      (id, user_id, name, language, education, experience, skills, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertApp = db.prepare(`
    INSERT OR IGNORE INTO applications
      (id, user_id, job_id, resume_id, status, status_text, applied_at, viewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedUsers = db.transaction(() => {
    for (const u of (usersData.users || [])) {
      insertUser.run(u.id, u.openid, u.nickname, u.avatar, u.email || '',
        u.phone || '', j(u.education), j(u.jobPreference),
        u.vipLevel || 0, u.vipExpiresAt || null, u.createdAt);
    }
    for (const r of (usersData.resumes || [])) {
      insertResume.run(r.id, r.userId, r.name, r.language || 'zh',
        j(r.education), j(r.experience), j(r.skills),
        r.createdAt, r.updatedAt);
    }
    for (const a of (usersData.applications || [])) {
      insertApp.run(a.id, a.userId, String(a.jobId), a.resumeId,
        a.status, a.statusText, a.appliedAt, a.viewedAt || null);
    }
  });
  seedUsers();
  total += (usersData.users || []).length + (usersData.resumes || []).length + (usersData.applications || []).length;
  console.log('✅ users / resumes / applications 导入完成');
}

// ─── experiences ──────────────────────────────────────────────────────────────
const expData = readJson('experiences.json');
if (expData) {
  const insertExp = db.prepare(`
    INSERT OR IGNORE INTO experiences
      (id, user_id, user_name, user_avatar, company, position, type, round,
       title, content, tags, likes_count, comments_count, is_anonymous, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seedExp = db.transaction(() => {
    for (const e of (expData.experiences || [])) {
      insertExp.run(e.id, e.userId || null, e.userName || '匿名用户',
        e.userAvatar || '', e.company, e.position,
        e.type || '面试', e.round || '一面',
        e.title, e.content, j(e.tags),
        e.likesCount || 0, e.commentsCount || 0,
        e.isAnonymous ? 1 : 0, e.createdAt);
    }
  });
  seedExp();
  total += (expData.experiences || []).length;
  console.log('✅ experiences 导入完成');
}

// ─── salaries ─────────────────────────────────────────────────────────────────
const salData = readJson('salaries.json');
if (salData) {
  const insertSal = db.prepare(`
    INSERT OR IGNORE INTO salaries
      (id, company, position, location, years_of_experience,
       base_salary, bonus, stock, total_compensation, currency, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seedSal = db.transaction(() => {
    for (const s of (salData.salaries || [])) {
      insertSal.run(s.id, s.company, s.position, s.location || '',
        s.yearsOfExperience || 0, s.baseSalary || 0,
        s.bonus || 0, s.stock || 0, s.totalCompensation || 0,
        s.currency || 'CNY', s.createdAt);
    }
  });
  seedSal();
  total += (salData.salaries || []).length;
  console.log('✅ salaries 导入完成');
}

// ─── jobs（本地备用数据）──────────────────────────────────────────────────────
const jobsData = readJson('jobs.json');
if (jobsData) {
  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO jobs
      (id, title, company, company_logo, location, region, salary,
       job_type, industry, description, requirements,
       visa_sponsored, posted_at, view_count, apply_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seedJobs = db.transaction(() => {
    for (const job of (jobsData.jobs || [])) {
      insertJob.run(job.id, job.title, job.company, job.companyLogo || '',
        job.location || '', job.region || '', job.salary || '',
        job.jobType || '全职', job.industry || '',
        job.description || '', j(job.requirements),
        job.visaSponsored ? 1 : 0, job.postedAt,
        job.viewCount || 0, job.applyCount || 0);
    }
  });
  seedJobs();
  total += (jobsData.jobs || []).length;
  console.log('✅ jobs 导入完成');
}

// ─── feedbacks（如有历史数据）────────────────────────────────────────────────
const fbData = readJson('feedbacks.json');
if (fbData) {
  const insertFb = db.prepare(`
    INSERT OR IGNORE INTO feedbacks (id, user_id, type, content, contact, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const seedFb = db.transaction(() => {
    for (const f of (fbData.feedbacks || [])) {
      insertFb.run(f.id, f.userId || null, f.type || '其他',
        f.content, f.contact || '', f.createdAt);
    }
  });
  seedFb();
  total += (fbData.feedbacks || []).length;
  console.log('✅ feedbacks 导入完成');
}

// ─── 初始化消息示例数据 ────────────────────────────────────────────────────────
const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
if (msgCount === 0) {
  const insertMsg = db.prepare(`
    INSERT INTO messages (user_id, type, title, content, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const msgs = [
    [1, 'application', '投递状态更新', '您投递的「腾讯 - 产品经理」已被HR查看', 0, '2026-01-06T10:30:00'],
    [1, 'application', '面试邀请', '恭喜！您已收到「字节跳动 - 前端开发工程师」的面试邀请', 0, '2026-01-05T15:00:00'],
    [1, 'system', '系统通知', '您的VIP会员即将到期，续费可享8折优惠', 1, '2026-01-04T09:00:00'],
    [1, 'interaction', '评论回复', '留学生小王 回复了你的笔经面经', 1, '2026-01-03T14:20:00'],
    [1, 'application', 'Offer通知', '恭喜！您已收到「Google - Software Engineer」的Offer', 0, '2026-01-02T16:00:00']
  ];
  const seedMsgs = db.transaction(() => { msgs.forEach(m => insertMsg.run(...m)); });
  seedMsgs();
  console.log('✅ messages 初始化完成');
}

// ─── 初始化收藏示例数据 ────────────────────────────────────────────────────────
const favCount = db.prepare('SELECT COUNT(*) as c FROM favorites').get().c;
if (favCount === 0) {
  const insertFav = db.prepare(`
    INSERT OR IGNORE INTO favorites (user_id, type, target_id, title, subtitle, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const favs = [
    [1, 'job', 'mock_1', 'Frontend Developer', 'Google', '2026-01-04'],
    [1, 'experience', '1', '字节跳动产品经理一面经验分享', '字节跳动', '2026-01-05'],
    [1, 'company', '1', '字节跳动', '互联网 · AI', '2026-01-06']
  ];
  const seedFavs = db.transaction(() => { favs.forEach(f => insertFav.run(...f)); });
  seedFavs();
  console.log('✅ favorites 初始化完成');
}

// ─── 求职机构初始数据 ──────────────────────────────────────────────────────────
const agencyCount = db.prepare('SELECT COUNT(*) as c FROM agencies').get().c;
if (agencyCount === 0) {
  const insertAgency = db.prepare(`
    INSERT OR IGNORE INTO agencies
      (name, type, description, services, price_range, specialties, website, city, is_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const agencies = [
    {
      name: '北美猎聘（NorthAmericaJob）',
      type: '猎头',
      description: '专注北美留学生求职的猎头平台，覆盖美国、加拿大主流科技和金融公司，提供简历优化、内推资源和面试辅导一站式服务。',
      services: ['简历修改', '内推资源', '面试辅导', '1v1 Career Coaching'],
      price_range: { cn: '无', us: '$500–$2000/套', uk: '£400–£1500/套' },
      specialties: ['SWE', 'DS/MLE', '金融分析', 'PM'],
      website: 'https://northamericajob.com',
      city: '多伦多 / 纽约',
      is_verified: 1
    },
    {
      name: '一亩三分地求职服务',
      type: '综合',
      description: '北美最大华人留学生社区旗下求职服务，提供求职咨询、简历点评、模拟面试等，社区内推资源丰富。',
      services: ['简历点评', '模拟面试', '求职咨询', '内推对接'],
      price_range: { cn: '无', us: '$200–$800/次', uk: '无' },
      specialties: ['CS/SWE', 'Data Science', 'Quant', 'MFE'],
      website: 'https://www.1point3acres.com',
      city: '旧金山湾区',
      is_verified: 1
    },
    {
      name: 'CareerFair Plus',
      type: '背景提升',
      description: '针对留学生的综合背景提升平台，提供科研经历、实习对接和竞赛项目，主打简历背景加分。',
      services: ['科研经历', '实习内推', '竞赛培训', '论文指导'],
      price_range: { cn: '¥8000–¥30000/项目', us: '$1000–$5000/项目', uk: '£800–£4000/项目' },
      specialties: ['CS', 'EE', '金融', '生物医学'],
      website: 'https://careerfairplus.com',
      city: '北京 / 上海 / 纽约',
      is_verified: 1
    },
    {
      name: '留学生求职加速营',
      type: '简历优化',
      description: '专注留学生英文简历写作和优化，提供 ATS 关键词优化、LinkedIn 资料打磨、Cover Letter 代写等服务。',
      services: ['简历撰写/优化', 'LinkedIn 优化', 'Cover Letter', 'ATS 检测'],
      price_range: { cn: '¥2000–¥5000/份', us: '$300–$800/份', uk: '£250–£600/份' },
      specialties: ['全行业', '转行人群'],
      website: '',
      city: '北京',
      is_verified: 0
    },
    {
      name: '明略求职（MingLue Career）',
      type: '猎头',
      description: '深耕国内互联网大厂的猎头机构，专注字节、腾讯、阿里、美团等校招和社招内推，海外归国留学生资源丰富。',
      services: ['大厂内推', '简历优化', '薪资谈判指导', '面经分享'],
      price_range: { cn: '¥3000–¥10000/成功入职', us: '无', uk: '无' },
      specialties: ['互联网', 'SWE', '产品', '运营'],
      website: '',
      city: '北京 / 上海',
      is_verified: 0
    },
    {
      name: 'Coding Interview Pro',
      type: '面试培训',
      description: '专注算法和系统设计面试培训，提供 LeetCode 刷题辅导、模拟面试、System Design 课程，适合刷题进阶。',
      services: ['算法刷题辅导', 'System Design', '模拟面试', '班课+1v1'],
      price_range: { cn: '无', us: '$400–$2000/课程', uk: '£300–£1500/课程' },
      specialties: ['SWE', 'Backend', 'Full Stack'],
      website: '',
      city: '旧金山 / 西雅图',
      is_verified: 0
    },
    {
      name: '英国华人求职协会（BCSA）',
      type: '综合',
      description: '英国留学生求职互助社区，定期举办招聘会、求职分享会，提供英国本地职场文化和求职流程指导。',
      services: ['求职分享会', '招聘会', '简历反馈', '行业导师对接'],
      price_range: { cn: '无', us: '无', uk: '£0–£500/活动' },
      specialties: ['金融', '咨询', '互联网', '会计'],
      website: '',
      city: '伦敦',
      is_verified: 0
    },
    {
      name: '转码求职营（BreakIntoTech）',
      type: '背景提升',
      description: '专为非 CS 背景留学生提供转码培训，从编程基础到项目实战、求职模拟，帮助文理商科背景同学顺利进入科技行业。',
      services: ['Python/Java 基础课', '项目实战营', '求职模拟', '转行规划'],
      price_range: { cn: '¥15000–¥40000/全程', us: '$2000–$6000/全程', uk: '£1500–£4500/全程' },
      specialties: ['转码', '非CS背景', 'Data Analyst', 'SWE入门'],
      website: '',
      city: '线上',
      is_verified: 1
    },
    {
      name: '澳洲留学生求职平台（OZJob）',
      type: '猎头',
      description: '专注澳大利亚和新加坡市场的华人留学生猎头平台，提供本地内推、PR 友好职位匹配和职场文化适应培训。',
      services: ['本地内推', 'PR 友好职位', '职场文化培训', '简历本地化'],
      price_range: { cn: '无', us: '无', uk: '无' },
      specialties: ['会计', '工程', 'IT', '金融'],
      website: '',
      city: '悉尼 / 墨尔本 / 新加坡',
      is_verified: 0
    },
    {
      name: '金融求职加速器（FinanceCareer）',
      type: '面试培训',
      description: '专注投行、四大、基金等金融行业的求职培训，提供 Superday 模拟面试、技术面（Accounting/Valuation）和内推资源。',
      services: ['Superday 模拟', '技术面培训', '内推资源', 'Networking 指导'],
      price_range: { cn: '¥5000–¥20000/套餐', us: '$800–$3000/套餐', uk: '£600–£2500/套餐' },
      specialties: ['投行', '四大', '资产管理', 'Hedge Fund'],
      website: '',
      city: '纽约 / 伦敦 / 香港',
      is_verified: 1
    }
  ];

  const seedAgencies = db.transaction(() => {
    for (const a of agencies) {
      insertAgency.run(
        a.name, a.type, a.description,
        JSON.stringify(a.services),
        JSON.stringify(a.price_range),
        JSON.stringify(a.specialties),
        a.website, a.city, a.is_verified
      );
    }
  });
  seedAgencies();
  total += agencies.length;
  console.log('✅ agencies 初始化完成');
}

// ─── 补充求职机构数据（幂等：按名字 INSERT OR IGNORE）────────────────────────
const insertAgencyByName = db.prepare(`
  INSERT OR IGNORE INTO agencies
    (name, type, description, services, price_range, specialties, website, city, is_verified, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

const extraAgencies = [
  // ── 北美综合求职辅导 ──────────────────────────────────────────────────────
  {
    name: '求职鸭（JobDuck）',
    type: '综合',
    description: '北美最大华人留学生求职社区平台，提供求职直播课、简历诊断、内推对接、模拟面试等全链路服务，已累计服务数十万留学生。',
    services: ['求职直播课', '简历诊断', '内推资源对接', '模拟面试', '求职训练营'],
    price_range: { cn: '无', us: '免费–$500/训练营', uk: '无' },
    specialties: ['SWE', 'PM', 'DS/MLE', '金融', '咨询'],
    website: 'https://www.jobduck.com',
    city: '旧金山湾区（线上为主）',
    is_verified: 1
  },
  {
    name: '想要Offer',
    type: '综合',
    description: '专注北美CS/DS留学生的求职辅导平台，以小班制训练营著称，提供算法刷题、系统设计、行为面试全流程训练，有高质量内推资源。',
    services: ['算法训练营', '系统设计课', '行为面试辅导', '内推资源', '1v1 Mock Interview'],
    price_range: { cn: '无', us: '$800–$3000/训练营', uk: '无' },
    specialties: ['SWE', 'Data Engineer', 'MLE', 'Backend'],
    website: '',
    city: '湾区 / 西雅图（线上）',
    is_verified: 1
  },
  {
    name: '北美求职圈',
    type: '综合',
    description: '北美华人求职互助社区，提供求职经验分享、公司点评、内推资源整合，适合刚开始找工作、需要了解北美求职生态的留学生。',
    services: ['求职经验分享', '公司点评', '内推对接', '简历互改', '求职资料库'],
    price_range: { cn: '无', us: '免费（部分付费会员权益）', uk: '无' },
    specialties: ['CS/SWE', 'PM', 'Finance', '咨询'],
    website: '',
    city: '线上社区',
    is_verified: 0
  },
  {
    name: 'Cracking PM Interview',
    type: '面试培训',
    description: '专注产品经理求职方向，提供 PM Case Interview、产品设计题、数据分析题专项辅导，讲师多为 FAANG 在职 PM，课程体系完善。',
    services: ['PM Case辅导', '产品设计题', '数据分析面试', '简历优化', 'Mock Interview'],
    price_range: { cn: '无', us: '$600–$2500/套餐', uk: '£500–£2000/套餐' },
    specialties: ['PM', 'APM', 'Growth PM', 'Data PM'],
    website: '',
    city: '湾区（线上）',
    is_verified: 0
  },
  {
    name: 'Exponent',
    type: '面试培训',
    description: '覆盖 PM / SWE / DS 多方向的在线面试练习平台，提供视频课程、Mock Interview 匹配和社区讨论，性价比高，适合自主刷题党。',
    services: ['Mock Interview匹配', 'PM/SWE/DS视频课', '面试题库', '社区讨论'],
    price_range: { cn: '无', us: '$12–$50/月订阅', uk: '无' },
    specialties: ['PM', 'SWE', 'Data Science', 'Strategy & Ops'],
    website: 'https://www.tryexponent.com',
    city: '线上平台',
    is_verified: 1
  },
  // ── 国内/回国求职辅导 ─────────────────────────────────────────────────────
  {
    name: '牛客网求职服务',
    type: '综合',
    description: '国内最大的技术求职社区，提供在线笔试系统、面经库、内推职位、刷题题库，是国内互联网校招必备平台。',
    services: ['在线刷题', '面经社区', '内推职位', '求职直播', '笔试系统'],
    price_range: { cn: '免费（部分会员功能¥30–¥200/月）', us: '无', uk: '无' },
    specialties: ['SWE', '算法', '测试', '前端', '数据'],
    website: 'https://www.nowcoder.com',
    city: '线上（国内为主）',
    is_verified: 1
  },
  {
    name: '猎聘网',
    type: '猎头',
    description: '国内中高端人才招聘平台，有海量猎头资源，适合有2年以上经验的回国留学生找社招岗位，也有部分高质量校招职位。',
    services: ['猎头匹配', '简历投递', '薪资参考', '企业直招', '职业测评'],
    price_range: { cn: '求职端免费', us: '无', uk: '无' },
    specialties: ['互联网', '金融', '咨询', '市场营销'],
    website: 'https://www.liepin.com',
    city: '全国',
    is_verified: 1
  },
  {
    name: '海归求职联盟',
    type: '综合',
    description: '专注回国求职的留学生服务平台，整合国内大厂内推、海归专项招聘会、简历辅导等资源，针对回国求职流程提供系统化指导。',
    services: ['大厂内推', '海归专招', '简历辅导', '回国求职攻略', '职场文化适应'],
    price_range: { cn: '¥500–¥5000/套餐', us: '无', uk: '无' },
    specialties: ['互联网', 'SWE', 'PM', '运营', '金融科技'],
    website: '',
    city: '北京 / 上海 / 深圳（线上）',
    is_verified: 0
  },
  {
    name: 'BOSS直聘',
    type: '综合',
    description: '国内最活跃的直聊招聘平台，求职者可直接与 Boss/HR 对话，响应速度快，适合国内求职的留学生回国找实习或全职。',
    services: ['直聊招聘', '简历投递', 'AI简历优化', '职位推荐'],
    price_range: { cn: '求职端免费', us: '无', uk: '无' },
    specialties: ['互联网', '创业公司', '中小企业', '实习'],
    website: 'https://www.zhipin.com',
    city: '全国',
    is_verified: 1
  },
  // ── 英国/欧洲方向 ─────────────────────────────────────────────────────────
  {
    name: 'Bright Network UK',
    type: '综合',
    description: '英国顶尖大学生求职平台，与 Goldman Sachs、McKinsey、Google 等公司直接合作，提供 Early Careers 职位、求职指导和 Insight Week 机会。',
    services: ['Early Careers职位', 'Insight Week', '求职Workshop', '公司直投', '导师辅导'],
    price_range: { cn: '无', us: '无', uk: '免费（企业付费模式）' },
    specialties: ['金融', '咨询', '科技', '法律', '零售'],
    website: 'https://www.brightnetwork.co.uk',
    city: '伦敦（线上为主）',
    is_verified: 1
  },
  {
    name: 'TargetJobs UK',
    type: '综合',
    description: '英国权威的应届生求职平台，提供名企 Graduate Scheme 职位、行业指南、求职技巧文章，是在英留学生找 Graduate Job 的必备资源。',
    services: ['Graduate Scheme职位', '行业求职指南', '求职技巧', '公司评价', '实习职位'],
    price_range: { cn: '无', us: '无', uk: '免费' },
    specialties: ['金融', '咨询', '工程', '科技', '市场营销'],
    website: 'https://targetjobs.co.uk',
    city: '英国（线上）',
    is_verified: 1
  },
  {
    name: '英国华人求职（UK Job Help）',
    type: '简历优化',
    description: '专注英国留学生求职的华人辅导机构，提供英式简历和 Cover Letter 撰写、Assessment Centre 准备、Video Interview 辅导等服务。',
    services: ['英式简历撰写', 'Cover Letter', 'Assessment Centre培训', 'Video Interview辅导', '英国职场文化课'],
    price_range: { cn: '无', us: '无', uk: '£200–£800/套餐' },
    specialties: ['金融', '咨询', '会计', '市场', '科技'],
    website: '',
    city: '伦敦',
    is_verified: 0
  },
  // ── 澳洲/新加坡方向 ───────────────────────────────────────────────────────
  {
    name: '澳洲求职帮（AusCareer）',
    type: '综合',
    description: '专注澳大利亚留学生求职的中文辅导平台，提供澳洲本地化简历、LinkedIn 优化、大公司 Graduate Program 申请指导，熟悉澳洲 PR 政策。',
    services: ['澳洲简历本地化', 'LinkedIn优化', 'Graduate Program申请', 'PR友好职位推荐', '模拟面试'],
    price_range: { cn: '无', us: '无', uk: '无' },
    specialties: ['IT', '会计', '工程', '金融', '市场'],
    website: '',
    city: '悉尼 / 墨尔本',
    is_verified: 0
  },
  {
    name: '新加坡求职圈（SG Job Circle）',
    type: '综合',
    description: '服务新加坡华人留学生的求职社区，提供新加坡本地大厂（DBS、Grab、Sea Group 等）内推和 EP 签证政策指导，社区活跃度高。',
    services: ['本地内推', 'EP签证指导', '求职经验分享', '简历反馈', '面经整理'],
    price_range: { cn: '无', us: '无', uk: '无' },
    specialties: ['金融科技', 'SWE', '数据', '市场', '咨询'],
    website: '',
    city: '新加坡',
    is_verified: 0
  },
  // ── 量化/金融专项 ─────────────────────────────────────────────────────────
  {
    name: '破圈量化（QuantBreaker）',
    type: '面试培训',
    description: '专注量化研究员/交易员求职方向，提供概率统计、Brain Teaser、编程（Python/C++）、历史数据分析专项培训，讲师来自 Two Sigma/Citadel 等顶级量化基金。',
    services: ['概率统计专项', 'Brainteaser训练', 'C++/Python编程面试', '量化策略基础', 'Mock Interview'],
    price_range: { cn: '无', us: '$1000–$4000/套餐', uk: '£800–£3000/套餐' },
    specialties: ['Quant Researcher', 'Quant Trader', 'Quant Developer', 'MFE/MS Finance'],
    website: '',
    city: '纽约 / 伦敦（线上）',
    is_verified: 0
  },
  {
    name: '华尔街见闻求职学院',
    type: '面试培训',
    description: '国内知名金融资讯平台旗下求职培训品牌，提供投行/基金/券商面试培训、金融建模课程和行业人脉资源，适合有志于国内金融行业的留学生。',
    services: ['投行面试培训', '金融建模（Excel/VBA）', '估值分析', '行业人脉', '实习内推'],
    price_range: { cn: '¥3000–¥15000/套餐', us: '无', uk: '无' },
    specialties: ['投行', '券商', '基金', '四大', '战略咨询'],
    website: 'https://wallstreetcn.com',
    city: '北京 / 上海',
    is_verified: 0
  },
  // ── 运营/市场方向 ─────────────────────────────────────────────────────────
  {
    name: '三节课',
    type: '背景提升',
    description: '国内知名互联网运营/产品职业教育平台，提供用户增长、内容运营、产品设计等系统课程，适合想进互联网做运营/PM 的留学生补充国内求职竞争力。',
    services: ['运营系统课', '产品经理课', '数据分析课', '项目实战', '求职辅导'],
    price_range: { cn: '¥1000–¥8000/课程', us: '无', uk: '无' },
    specialties: ['运营', 'PM', '增长', '内容', '电商'],
    website: 'https://www.sanjieke.cn',
    city: '线上（国内）',
    is_verified: 1
  },
  {
    name: '起点学院',
    type: '背景提升',
    description: '专注产品经理方向的职业教育平台，课程涵盖需求分析、原型设计、数据驱动决策，提供实战项目和求职对接，适合转行做产品的留学生。',
    services: ['PM系统课', '原型设计（Axure/Figma）', '数据分析', '实战项目', '求职对接'],
    price_range: { cn: '¥2000–¥10000/课程', us: '无', uk: '无' },
    specialties: ['产品经理', 'B端产品', '增长', 'AI产品'],
    website: 'https://www.qidianla.com',
    city: '线上（国内）',
    is_verified: 0
  }
];

const seedExtraAgencies = db.transaction(() => {
  for (const a of extraAgencies) {
    insertAgencyByName.run(
      a.name, a.type, a.description,
      JSON.stringify(a.services),
      JSON.stringify(a.price_range),
      JSON.stringify(a.specialties),
      a.website, a.city, a.is_verified
    );
  }
});
seedExtraAgencies();
const addedCount = db.prepare('SELECT COUNT(*) as c FROM agencies').get().c;
console.log(`✅ 求职机构补充完成，当前共 ${addedCount} 家机构`);

// ─── 主流留学生求职机构（第二批）────────────────────────────────────────────
const mainAgencies = [
  {
    name: 'UniCareer',
    type: '综合',
    description: '面向海内外华人学生的综合求职平台，覆盖北美、英国、香港、国内等多地市场，提供职位直投、求职课程、简历优化、内推资源，是留学生圈知名度最高的求职平台之一。旗下有 UniCareer App 和多个求职训练营产品。',
    services: ['职位直投', '求职训练营', '简历优化', '内推资源', '行业讲座', '校园大使计划'],
    price_range: { cn: '¥0–¥8000/训练营', us: '$0–$2000/训练营', uk: '£0–£1500/训练营' },
    specialties: ['SWE', 'PM', '金融', '咨询', '运营', '数据'],
    website: 'https://www.unicareer.com',
    city: '北京 / 上海 / 纽约 / 伦敦',
    is_verified: 1
  },
  {
    name: '职问（Zhiwen）',
    type: '综合',
    description: '专注留学生求职的职业发展平台，以高质量的求职干货内容和训练营著称，覆盖咨询、金融、互联网、快消等多行业，提供简历指导、案例面试培训和1v1 Coaching，在留学生群体中口碑较好。',
    services: ['Case Interview培训', '简历1v1指导', '行业求职训练营', '内推资源', '求职干货内容'],
    price_range: { cn: '¥2000–¥15000/套餐', us: '$500–$3000/套餐', uk: '£400–£2500/套餐' },
    specialties: ['咨询', '投行', '快消', '互联网', 'PM'],
    website: 'https://www.zhiwen.com',
    city: '上海 / 北京（线上为主）',
    is_verified: 1
  },
  {
    name: '懂职帝（CareerKing）',
    type: '综合',
    description: '国内知名的留学生和应届生求职辅导机构，旗下有求职训练营、简历优化、模拟面试等产品线，专注互联网、咨询、金融等热门行业，内推资源较为丰富，在小红书等平台活跃度高。',
    services: ['求职训练营', '简历优化', '模拟面试', '内推对接', '行业求职手册'],
    price_range: { cn: '¥1500–¥12000/套餐', us: '无', uk: '无' },
    specialties: ['互联网', '咨询', '金融', '快消', 'SWE', '运营'],
    website: '',
    city: '上海 / 北京（线上）',
    is_verified: 1
  },
  {
    name: 'DBC职梦',
    type: '综合',
    description: '留学生求职辅导平台，主打"数据驱动"的求职方法论，提供行业研究、简历优化、面试培训等服务，覆盖北美和回国两大方向，训练营口碑在留学生社群中较高。',
    services: ['求职训练营', '简历指导', '面试培训', '行业研究报告', '求职规划'],
    price_range: { cn: '¥3000–¥18000/套餐', us: '$800–$3500/套餐', uk: '无' },
    specialties: ['咨询', '互联网', '金融', 'PM', '数据分析'],
    website: '',
    city: '线上（北美+国内）',
    is_verified: 0
  },
  {
    name: '互联派',
    type: '背景提升',
    description: '专注互联网行业的留学生求职辅导机构，提供产品、运营、数据、技术等方向的系统培训，以实战项目和内推资源见长，适合想进国内互联网大厂的留学生。',
    services: ['互联网岗位培训', '实战项目', '内推资源', '简历辅导', '模拟面试'],
    price_range: { cn: '¥3000–¥15000/课程', us: '无', uk: '无' },
    specialties: ['产品', '运营', '数据分析', '增长', 'SWE'],
    website: '',
    city: '上海 / 线上',
    is_verified: 0
  },
  {
    name: '新东方前途出国',
    type: '综合',
    description: '新东方旗下留学及职业发展品牌，除留学申请外提供海归求职辅导、简历修改、职业规划等服务，机构规模大、覆盖城市广，适合刚回国需要系统性职业规划的留学生。',
    services: ['海归求职辅导', '简历修改', '职业规划', '面试指导', '留学+求职一站式'],
    price_range: { cn: '¥2000–¥20000/套餐', us: '无', uk: '无' },
    specialties: ['各行业通用', '金融', '咨询', '互联网'],
    website: 'https://www.xdf.cn/qiantu',
    city: '全国各大城市',
    is_verified: 1
  },
  {
    name: '启德教育',
    type: '综合',
    description: '知名留学服务机构，除留学申请外设有职业发展部门，为海归留学生提供求职规划、简历优化和雇主对接服务，在一二线城市有线下门店，适合需要面对面辅导的学生。',
    services: ['职业规划', '简历优化', '雇主对接', '求职Workshop', '留学+就业一体化'],
    price_range: { cn: '¥3000–¥25000/套餐', us: '无', uk: '无' },
    specialties: ['各行业通用', '金融', '咨询', '外资企业'],
    website: 'https://www.eic.org.cn',
    city: '全国30+城市',
    is_verified: 1
  },
  {
    name: '蒸汽教育（STEM Career Group）',
    type: '面试培训',
    description: '专注STEM方向留学生的求职培训机构，涵盖算法刷题、系统设计、数据科学面试、量化研究员培训等，课程体系针对北美科技公司面试定制，讲师多为在职工程师。',
    services: ['算法刷题辅导', '系统设计课', 'DS/MLE面试培训', '量化研究员培训', '模拟面试'],
    price_range: { cn: '无', us: '$600–$3000/套餐', uk: '无' },
    specialties: ['SWE', 'Data Science', 'MLE', 'Quant', 'Backend'],
    website: '',
    city: '湾区 / 纽约（线上为主）',
    is_verified: 0
  },
  {
    name: 'Wall Street Tequila（WST）',
    type: '面试培训',
    description: '专注北美金融行业（投行、对冲基金、PE/VC）求职培训的华人机构，以高强度的 Superday 模拟面试、技术面（金融建模/估值）和内推网络著称，在金融求职圈口碑突出。',
    services: ['Superday模拟面试', '金融建模培训', 'IB技术面辅导', '内推网络', 'Networking指导'],
    price_range: { cn: '无', us: '$1000–$5000/套餐', uk: '£800–£4000/套餐' },
    specialties: ['投行（IBD）', 'Sales & Trading', 'PE/VC', 'Hedge Fund', 'Asset Management'],
    website: '',
    city: '纽约 / 伦敦（线上）',
    is_verified: 0
  },
  {
    name: '爱思益（AceOffer）',
    type: '综合',
    description: '留学生求职一站式服务平台，提供简历诊断、求职规划、面试培训和Offer谈判指导，覆盖技术、金融、咨询、快消多赛道，在小红书等平台有较高曝光度。',
    services: ['简历诊断', '求职规划', '面试培训', 'Offer谈判', '1v1 Coaching'],
    price_range: { cn: '¥2000–¥12000/套餐', us: '$500–$2500/套餐', uk: '£400–£2000/套餐' },
    specialties: ['SWE', '咨询', '金融', 'PM', '快消'],
    website: '',
    city: '线上（全球）',
    is_verified: 0
  }
];

const seedMainAgencies = db.transaction(() => {
  for (const a of mainAgencies) {
    insertAgencyByName.run(
      a.name, a.type, a.description,
      JSON.stringify(a.services),
      JSON.stringify(a.price_range),
      JSON.stringify(a.specialties),
      a.website, a.city, a.is_verified
    );
  }
});
seedMainAgencies();
const totalAgencies = db.prepare('SELECT COUNT(*) as c FROM agencies').get().c;
console.log(`✅ 主流求职机构补充完成，当前共 ${totalAgencies} 家机构`);

// ─── 主流留学生求职机构（第三批）────────────────────────────────────────────
const batch3Agencies = [
  {
    name: '青林职途',
    type: '综合',
    description: '专注留学生回国求职的辅导机构，以"精准匹配+全程陪跑"模式著称，提供简历优化、面试辅导、大厂内推，覆盖互联网、咨询、金融等主流赛道，在留学生社群中活跃度较高。',
    services: ['简历优化', '全程陪跑', '大厂内推', '面试辅导', '求职规划'],
    price_range: { cn: '¥2000–¥15000/套餐', us: '无', uk: '无' },
    specialties: ['互联网', '咨询', '金融', 'SWE', 'PM'],
    website: '',
    city: '线上（国内+海外）',
    is_verified: 0
  },
  {
    name: '搞定Offer（上海归悦教育）',
    type: '综合',
    description: '上海归悦教育旗下留学生求职品牌，专注帮助留学生和应届生拿到心仪Offer，提供从简历到Offer全链路辅导，强调实战模拟和内推资源对接，在上海地区线下服务较完善。',
    services: ['简历全程辅导', '模拟面试', '内推资源', 'Offer谈判', '线下workshop'],
    price_range: { cn: '¥3000–¥20000/套餐', us: '无', uk: '无' },
    specialties: ['互联网', '快消', '金融', '咨询', '外资企业'],
    website: '',
    city: '上海（线上+线下）',
    is_verified: 0
  },
  {
    name: 'CareerBro职咖',
    type: '面试培训',
    description: '专注技术类岗位求职辅导的机构，提供算法、系统设计、行为面试一站式培训，以小班制和1v1辅导为主要形式，讲师多为北美大厂在职工程师，适合冲刺FAANG的留学生。',
    services: ['算法专项培训', '系统设计辅导', '行为面试', '1v1 Mock', '简历优化'],
    price_range: { cn: '无', us: '$500–$2500/套餐', uk: '无' },
    specialties: ['SWE', 'Backend', 'Full Stack', 'MLE', 'Data Engineer'],
    website: '',
    city: '湾区（线上为主）',
    is_verified: 0
  },
  {
    name: '途鸽求职（Togo Career）',
    type: '综合',
    description: '面向北美华人留学生的求职辅导平台，提供简历诊断、模拟面试、内推资源和求职攻略，覆盖技术、产品、数据、运营多个方向，社群运营活跃，定期举办免费分享讲座。',
    services: ['简历诊断', '模拟面试', '内推资源', '求职攻略', '免费分享讲座'],
    price_range: { cn: '无', us: '$300–$2000/套餐', uk: '无' },
    specialties: ['SWE', 'PM', 'Data Science', '运营', '咨询'],
    website: '',
    city: '北美（线上）',
    is_verified: 0
  },
  {
    name: '海马职加',
    type: '综合',
    description: '留学生求职辅导机构，主打性价比路线，提供简历优化、面试辅导、行业求职攻略等服务，在英国和国内留学生群体中有一定知名度，适合预算有限的同学。',
    services: ['简历优化', '面试辅导', '行业求职攻略', '求职规划', '内推对接'],
    price_range: { cn: '¥1000–¥8000/套餐', us: '无', uk: '£300–£2000/套餐' },
    specialties: ['互联网', '金融', '咨询', '快消', '外资企业'],
    website: '',
    city: '线上（国内+英国）',
    is_verified: 0
  },
  {
    name: '海归桥',
    type: '综合',
    description: '专注海归回国求职的职业发展平台，提供海归专场招聘会、企业直推、职业规划咨询等，与多家国内知名企业有合作，是海归群体回国找工作的常用渠道之一。',
    services: ['海归专场招聘', '企业直推', '职业规划', '简历指导', '行业对接活动'],
    price_range: { cn: '求职端免费（部分增值服务收费）', us: '无', uk: '无' },
    specialties: ['金融', '咨询', '互联网', '外资企业', '国企'],
    website: '',
    city: '北京 / 上海',
    is_verified: 0
  },
  {
    name: '耐鲨求职',
    type: '面试培训',
    description: '专注金融和咨询行业求职的培训机构，以"耐得住、鲨出去"为理念，提供Case Interview、Investment Banking技术面、Superday模拟等专项训练，讲师均有投行/咨询从业背景。',
    services: ['Case Interview培训', 'IB技术面', 'Superday模拟', '金融建模基础', '行业内推'],
    price_range: { cn: '¥5000–¥25000/套餐', us: '$800–$4000/套餐', uk: '£600–£3000/套餐' },
    specialties: ['投行（IBD）', '咨询（MBB）', 'PE/VC', '四大', 'Asset Management'],
    website: '',
    city: '纽约 / 伦敦 / 上海（线上）',
    is_verified: 0
  },
  {
    name: '启途求职',
    type: '综合',
    description: '面向留学生和应届生的求职辅导机构，提供全程求职规划、简历优化、模拟面试等服务，覆盖互联网、金融、咨询、快消多行业，以学员口碑和社群运营为核心竞争力。',
    services: ['全程求职规划', '简历优化', '模拟面试', '内推对接', '社群支持'],
    price_range: { cn: '¥2000–¥15000/套餐', us: '无', uk: '无' },
    specialties: ['互联网', '金融', '咨询', '快消', 'SWE'],
    website: '',
    city: '线上（国内）',
    is_verified: 0
  },
  {
    name: '职业蛙（CareerFrog）',
    type: '背景提升',
    description: '国内知名的大学生职业发展平台，提供实习内推、职业测评、求职课程和企业直招，在高校中有较高知名度，适合在校生和应届生提前布局实习和校招。',
    services: ['实习内推', '职业测评', '求职课程', '企业直招', '校园大使'],
    price_range: { cn: '免费（部分付费课程¥500–¥5000）', us: '无', uk: '无' },
    specialties: ['互联网', '快消', '金融', '咨询', '制造业'],
    website: '',
    city: '全国高校（线上为主）',
    is_verified: 0
  },
  {
    name: '智远优聘',
    type: '猎头',
    description: '专注中高端留学生人才的猎头平台，为回国留学生提供精准的职位匹配和猎头服务，合作企业覆盖外资、互联网、金融、咨询等行业，以精准推荐和薪资谈判见长。',
    services: ['猎头精准匹配', '薪资谈判', '职位内推', '背景调查指导', '入职辅助'],
    price_range: { cn: '求职端免费（成功入职后收费）', us: '无', uk: '无' },
    specialties: ['外资企业', '互联网', '金融', '咨询', '高端管培'],
    website: '',
    city: '上海 / 北京',
    is_verified: 0
  },
  {
    name: '职汇研途',
    type: '背景提升',
    description: '以"求职+升学"双轨并行为特色的留学生服务机构，既提供研究生申请辅导，也提供求职准备服务，适合还在考虑是否继续深造的留学生进行职业规划咨询。',
    services: ['职业规划咨询', '研究生申请', '简历优化', '求职辅导', '升学vs就业分析'],
    price_range: { cn: '¥3000–¥20000/套餐', us: '$500–$3000/套餐', uk: '无' },
    specialties: ['CS', '金融', '商科', '工程', '跨专业转行'],
    website: '',
    city: '线上（国内+北美）',
    is_verified: 0
  },
  {
    name: 'BRC求职',
    type: '综合',
    description: '专注英国、欧洲留学生求职的辅导机构，提供英国本地化简历、Assessment Centre准备、Video Interview辅导等服务，对英国Graduate Scheme申请流程有深度研究，在英国华人留学生中知名度高。',
    services: ['英国简历本地化', 'Assessment Centre培训', 'Video Interview辅导', 'Graduate Scheme申请', 'Cover Letter写作'],
    price_range: { cn: '无', us: '无', uk: '£300–£2500/套餐' },
    specialties: ['金融', '咨询', '四大', '科技', '快消'],
    website: '',
    city: '伦敦（线上为主）',
    is_verified: 0
  },
  {
    name: 'CareerIn',
    type: '综合',
    description: '面向留学生的求职社区和辅导平台，提供真实职场内容分享、求职经验帖、内推资源整合，兼有付费辅导服务，定位类似"留学生版脉脉+求职辅导"，社区氛围活跃。',
    services: ['求职经验社区', '内推资源', '付费辅导', '行业分析', '职场内容'],
    price_range: { cn: '免费（辅导服务¥1000–¥8000）', us: '免费（辅导服务$300–$2000）', uk: '无' },
    specialties: ['互联网', 'SWE', 'PM', '金融', '咨询'],
    website: '',
    city: '线上（全球）',
    is_verified: 0
  },
  {
    name: '面包求职',
    type: '简历优化',
    description: '专注简历写作和优化的轻量级求职辅导平台，提供中英双语简历撰写、ATS优化、LinkedIn资料打磨等服务，定价透明，按需付费，适合只需要简历帮助而不需要全程辅导的求职者。',
    services: ['中英双语简历撰写', 'ATS关键词优化', 'LinkedIn优化', 'Cover Letter', '简历评分报告'],
    price_range: { cn: '¥500–¥3000/份', us: '$100–$800/份', uk: '£80–£600/份' },
    specialties: ['各行业通用', '转行人群', '应届生', '回国海归'],
    website: '',
    city: '线上（全球）',
    is_verified: 0
  },
  {
    name: 'PreTalent璞睿',
    type: '背景提升',
    description: '专注背景提升和科研经历的留学生辅导机构，提供顶校科研项目对接、名企实习内推、竞赛培训等服务，主打"真实背景提升"而非包装，适合背景薄弱需要补充经历的同学。',
    services: ['科研项目对接', '名企实习内推', '竞赛培训', '背景规划', '推荐信指导'],
    price_range: { cn: '¥5000–¥40000/项目', us: '$1000–$8000/项目', uk: '£800–£6000/项目' },
    specialties: ['CS', 'EE', '数据科学', '金融工程', '生物医学'],
    website: '',
    city: '线上（全球）',
    is_verified: 0
  },
  {
    name: '小灶能力派',
    type: '面试培训',
    description: '以"小班精英"模式运营的求职辅导机构，每期只招少量学员，提供高强度、深度定制化的面试培训和求职规划，覆盖咨询、金融、互联网方向，以高Offer率为卖点。',
    services: ['小班制面试培训', '定制化求职规划', '高强度模拟面试', '内推资源', '全程答疑'],
    price_range: { cn: '¥8000–¥30000/套餐', us: '$2000–$6000/套餐', uk: '无' },
    specialties: ['MBB咨询', '投行', '互联网大厂', 'PM', '数据科学'],
    website: '',
    city: '线上（国内+北美）',
    is_verified: 0
  },
  {
    name: 'CareerBuddy',
    type: '综合',
    description: '留学生求职辅导平台，主打一对一配对，将求职者与有同背景成功经历的学长学姐匹配，提供真实的求职经验分享、简历反馈和模拟面试，氛围接地气，适合需要过来人经验的学生。',
    services: ['一对一学长学姐配对', '简历反馈', '模拟面试', '求职经验分享', '行业导师对接'],
    price_range: { cn: '¥500–¥5000/套餐', us: '$100–$1500/套餐', uk: '£80–£1200/套餐' },
    specialties: ['各行业通用', 'SWE', '咨询', '金融', 'PM'],
    website: '',
    city: '线上（全球）',
    is_verified: 0
  },
  {
    name: '实习僧教育',
    type: '背景提升',
    description: '国内最大的实习招聘平台旗下教育品牌，提供职业技能课程、实习内推、求职培训等，帮助在校生和应届生快速积累实习经历，是国内找实习的必备平台之一。',
    services: ['实习职位推荐', '职业技能课程', '求职培训', '简历指导', '内推资源'],
    price_range: { cn: '免费（课程¥200–¥5000）', us: '无', uk: '无' },
    specialties: ['互联网', '金融', '快消', '咨询', '媒体'],
    website: 'https://www.shixiseng.com',
    city: '全国（线上为主）',
    is_verified: 1
  }
];

const seedBatch3 = db.transaction(() => {
  for (const a of batch3Agencies) {
    insertAgencyByName.run(
      a.name, a.type, a.description,
      JSON.stringify(a.services),
      JSON.stringify(a.price_range),
      JSON.stringify(a.specialties),
      a.website, a.city, a.is_verified
    );
  }
});
seedBatch3();
const totalAfterBatch3 = db.prepare('SELECT COUNT(*) as c FROM agencies').get().c;
console.log(`✅ 主流求职机构第三批补充完成，当前共 ${totalAfterBatch3} 家机构`);

// ─── 校招时间线初始数据（30条）────────────────────────────────────────────────
const campusCount = db.prepare('SELECT COUNT(*) as c FROM campus_schedules').get().c;
if (campusCount === 0) {
  const ins = db.prepare(`
    INSERT OR IGNORE INTO campus_schedules
      (company, company_logo, region, position_type, recruit_year,
       timeline, app_open_month, deadline_month, offer_month, notes, source, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const T = JSON.stringify; // 简写

  const records = [
    // ─── 中国内地 - 技术岗 ───────────────────────────────────────────────────
    ['字节跳动', '', '中国内地', '技术', 2025,
      T([{month:7,stage:'提前批',desc:'提前批通道开放，内推+官网均可投递，有意尽早'},{month:8,stage:'开放申请',desc:'秋招正式通道全面开放，覆盖SWE/算法/数据等岗位'},{month:9,stage:'大规模投递期/OA',desc:'投递截止并陆续发出在线测评，含编程+逻辑'},{month:10,stage:'一面/二面',desc:'技术面集中期，1-3轮技术面+1轮HR'},{month:11,stage:'发放Offer',desc:'正式录用通知下发，部分批次延至12月'}]),
      7, 9, 11, '提前批竞争激烈，建议7月前刷题到位。转正转岗机会多。', '历年招聘公告 & 社区反馈', 1],

    ['腾讯', '', '中国内地', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'官网及微信招聘小程序同步开放，名额较多'},{month:9,stage:'截止投递/OA',desc:'笔试含算法/数据结构/智力题，部分BG免笔试'},{month:10,stage:'一面/二面',desc:'技术面2-4轮，深度考察项目与算法'},{month:11,stage:'三面/HR面',desc:'总监/HR综合评估'},{month:12,stage:'发放Offer',desc:'Offer集中下发，部分延至次年1月'}]),
      8, 9, 12, '不同BG（互动娱乐/IEG/TEG等）节奏略有差异，多BG可同时申请。', '历年招聘公告 & 社区反馈', 1],

    ['阿里巴巴', '', '中国内地', '技术', 2025,
      T([{month:7,stage:'提前批',desc:'技术岗提前批，以内推为主'},{month:8,stage:'开放申请',desc:'官网全面开放，覆盖阿里云/淘天/蚂蚁等'},{month:9,stage:'截止/OA',desc:'笔试+编程题，多数BG要求2题AC'},{month:10,stage:'技术面',desc:'2-3轮技术面，考察算法+系统设计+项目'},{month:11,stage:'交叉面/HR面',desc:'跨BG交叉面，综合评定'},{month:11,stage:'发放Offer',desc:'Offer陆续下发，DingTalk/飞书通知'}]),
      7, 9, 11, '蚂蚁集团节奏略早，阿里云/国际站偏晚。内推优先审简历。', '历年招聘公告 & 社区反馈', 1],

    ['华为', '', '中国内地', '技术', 2025,
      T([{month:9,stage:'开放申请',desc:'华为官网及华为人才网同步开放'},{month:10,stage:'截止/笔试',desc:'华为机考3题，含编程+概念题，成绩分级影响薪资'},{month:11,stage:'综合面试',desc:'1-2轮技术面+1轮HR面'},{month:12,stage:'发放Offer',desc:'Offer含级别评定，薪资差异较大'}]),
      9, 10, 12, '机考成绩直接影响定级（13-18级），建议提前练习华为OJ。', '历年招聘公告 & 社区反馈', 1],

    ['美团', '', '中国内地', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'美团校招官网开放，推荐提前内推'},{month:9,stage:'截止/OA',desc:'在线测评含2道编程题+逻辑'},{month:10,stage:'技术面',desc:'2轮技术面，考察算法+系统设计'},{month:11,stage:'HR面/Offer',desc:'HR沟通后快速下发Offer'}]),
      8, 9, 11, '到店/外卖/买菜等不同业务线独立招聘，可同时申请。', '历年招聘公告 & 社区反馈', 1],

    ['百度', '', '中国内地', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'百度招聘官网全面开放，推荐内推'},{month:9,stage:'截止/OA',desc:'笔试含算法编程2-3题'},{month:10,stage:'技术面',desc:'2-3轮技术面，AI/搜索方向考察深度学习'},{month:11,stage:'HR面/Offer',desc:'综合面后Offer下发'}]),
      8, 9, 11, '文心一言/百度云等AI方向需掌握基础ML理论。', '历年招聘公告 & 社区反馈', 0],

    ['网易', '', '中国内地', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'网易招聘官网开放，游戏/有道/云音乐等均招'},{month:9,stage:'截止/OA',desc:'笔试3道编程题，较难'},{month:9,stage:'技术面',desc:'2轮技术面，游戏方向考C++/图形学'},{month:10,stage:'HR面/Offer',desc:'综合面快速出Offer'}]),
      8, 9, 10, '游戏方向（互娱）技术深度要求高，数据分析岗相对较易。', '历年招聘公告 & 社区反馈', 0],

    ['快手', '', '中国内地', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'快手招聘官网开放'},{month:9,stage:'截止/OA',desc:'在线测评2道编程题'},{month:10,stage:'技术面',desc:'2-3轮技术面，直播/推荐系统方向考察机器学习'},{month:11,stage:'HR面/Offer',desc:'HR面后Offer下发'}]),
      8, 9, 11, '短视频/直播基础架构方向需了解高并发系统设计。', '历年招聘公告 & 社区反馈', 0],

    ['拼多多', '', '中国内地', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'拼多多官网开放，名额少竞争激烈'},{month:9,stage:'截止/面试',desc:'一般无OA，直接面试，节奏快'},{month:10,stage:'技术面',desc:'2-3轮技术面，考察扎实算法与系统'},{month:11,stage:'Offer',desc:'Offer薪资普遍高于同类互联网'}]),
      8, 9, 11, '薪资高但淘汰率高，需要极强编程能力，建议LeetCode Hard刷熟。', '历年招聘公告 & 社区反馈', 0],

    ['蚂蚁集团', '', '中国内地', '技术', 2025,
      T([{month:7,stage:'提前批',desc:'提前批内推通道，早于阿里整体节奏'},{month:8,stage:'开放申请',desc:'官网招聘全面开放'},{month:8,stage:'OA',desc:'含编程2题+选择题'},{month:9,stage:'技术面',desc:'2-3轮，金融科技方向考察分布式/安全'},{month:10,stage:'Offer',desc:'Offer下发较早，可作压线选择'}]),
      7, 8, 10, '金融科技方向需了解支付/风控基础知识，薪资与字节/拼多多持平。', '历年招聘公告 & 社区反馈', 1],

    ['滴滴', '', '中国内地', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'滴滴官网开放，岗位覆盖SWE/数据/算法'},{month:9,stage:'截止/OA',desc:'在线测评，含编程2题'},{month:10,stage:'技术面',desc:'2-3轮技术面'},{month:11,stage:'HR面/Offer',desc:'Offer下发'}]),
      8, 9, 11, '出行/地图/自动驾驶方向需了解地理信息系统基础。', '历年招聘公告 & 社区反馈', 0],

    ['京东', '', '中国内地', '技术', 2025,
      T([{month:9,stage:'开放申请',desc:'京东招聘官网秋招开放，科技/物流/零售均招'},{month:10,stage:'截止/OA',desc:'含编程题+逻辑题'},{month:11,stage:'技术面',desc:'2-3轮面试'},{month:12,stage:'Offer',desc:'Offer下发，部分延至次年1月'}]),
      9, 10, 12, '京东科技（JDT）薪资较高，物流技术岗偏Java后端。', '历年招聘公告 & 社区反馈', 0],

    ['小米', '', '中国内地', '技术', 2025,
      T([{month:9,stage:'开放申请',desc:'小米招聘官网秋招开放'},{month:10,stage:'截止/OA',desc:'含编程2-3题'},{month:11,stage:'技术面',desc:'2轮技术面+1轮HR'},{month:12,stage:'Offer',desc:'Offer下发'}]),
      9, 10, 12, '手机端/IoT/互联网业务并行，嵌入式/底层方向有特色岗位。', '历年招聘公告 & 社区反馈', 0],

    ['商汤科技', '', '中国内地', '技术', 2025,
      T([{month:9,stage:'开放申请',desc:'商汤招聘官网秋招开放，AI/CV方向为主'},{month:10,stage:'截止/笔试',desc:'含编程+深度学习理论题'},{month:11,stage:'技术面',desc:'2-3轮，重点考察论文理解+工程能力'},{month:12,stage:'Offer',desc:'Offer下发'}]),
      9, 10, 12, '计算机视觉/大模型方向需有相关科研/项目背景，论文加分明显。', '历年招聘公告 & 社区反馈', 0],

    ['米哈游', '', '中国内地', '技术', 2025,
      T([{month:9,stage:'开放申请',desc:'米哈游校招开放，游戏/客户端/引擎方向为主'},{month:10,stage:'截止/笔试',desc:'图形学/C++编程专项笔试'},{month:11,stage:'技术面',desc:'2-3轮，深度考察图形/引擎/AI'},{month:12,stage:'Offer',desc:'Offer下发，薪资业内领先'}]),
      9, 10, 12, '图形学（OpenGL/Vulkan/DX）和C++/UE5是核心门槛，适合有游戏开发经验的同学。', '历年招聘公告 & 社区反馈', 0],

    // ─── 北美 - 技术岗 ───────────────────────────────────────────────────────
    ['Google', '', '北美', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'官网 careers.google.com 新岗位陆续上线，推荐提前设置 Job Alert'},{month:9,stage:'大规模投递期',desc:'大量 New Grad SWE 岗位开放，简历筛选约2-4周'},{month:9,stage:'Phone Screen',desc:'1-2轮电话/视频技术筛选，含算法题'},{month:10,stage:'Onsite面试',desc:'5轮 Virtual Onsite（4轮编程+1轮行为），Leetcode Medium/Hard水平'},{month:11,stage:'委员会评定',desc:'Hiring Committee Review，周期约2-4周'},{month:12,stage:'发放Offer',desc:'TC包含 Base+Bonus+RSU，通常含3-6个月等待期'}]),
      8, 10, 12, '刷题以 LeetCode Top100+Google Tag 为主，BFS/DFS/DP 必掌握。Referral 可跳过简历筛选。', '历年招聘信息 & Levels.fyi 社区', 1],

    ['Meta', '', '北美', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'Meta Careers 开放 New Grad 岗位，E3/E4 同步招募'},{month:9,stage:'Recruiter Screen',desc:'招聘人员初筛，确认背景匹配后进入技术环节'},{month:9,stage:'Technical Screen',desc:'1轮在线编程（45分钟，2道题），CoderPad 平台'},{month:10,stage:'Virtual Onsite',desc:'2轮编程+1轮系统设计+1轮行为，共4轮'},{month:11,stage:'Offer Review',desc:'薪酬谈判周期约1-2周'},{month:12,stage:'发放Offer',desc:'E3 Base约$170k+，含RSU'}]),
      8, 10, 12, '行为面试（Behavioral）同等重要，需准备 STAR 故事。系统设计对 New Grad 要求相对宽松。', '历年招聘信息 & Blind 社区', 1],

    ['Amazon', '', '北美', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'Amazon Jobs 全年持续开放，秋招高峰8-10月'},{month:9,stage:'Online Assessment',desc:'OA含2道编程题+工作样例调查，限时70分钟'},{month:10,stage:'Virtual Onsite',desc:'4轮面试（2-3轮编程+1轮系统设计），每轮均有 LP 问题'},{month:11,stage:'Bar Raiser面试',desc:'独立评审员交叉评估，重点考察 Leadership Principles'},{month:11,stage:'发放Offer',desc:'含签约奖金 Signing Bonus，RSU第一年分配少'}]),
      8, 11, 11, '14条 Leadership Principles 必须背熟并准备对应故事，是 Amazon 面试核心。', '历年招聘信息 & LeetCode 讨论区', 1],

    ['Microsoft', '', '北美', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'Microsoft Careers 开放 New Grad SWE 岗位'},{month:9,stage:'Online Assessment',desc:'HackerRank OA，含编程题+选择题，约90分钟'},{month:10,stage:'Virtual Onsite',desc:'4轮面试（编程+系统设计+行为），侧重解题思路沟通'},{month:11,stage:'Team Matching',desc:'过 Bar 后与不同组进行双选匹配'},{month:12,stage:'发放Offer',desc:'Base偏低但 RSU 稳定，工作生活平衡好'}]),
      8, 10, 12, 'Microsoft 面试注重沟通过程，边解题边思考出声很重要。Azure/AI方向招聘最多。', '历年招聘信息 & 社区反馈', 1],

    ['Apple', '', '北美', '技术', 2025,
      T([{month:9,stage:'开放申请',desc:'Apple Jobs 秋季开放，岗位分散各部门自主招聘'},{month:10,stage:'Phone/Video Screen',desc:'1-2轮技术电话面，含算法+系统相关题'},{month:11,stage:'Onsite面试',desc:'5-6轮面试，深度考察专项技术（iOS/ML/编译器等）'},{month:12,stage:'Team Review',desc:'面试评估期较长，约2-4周'},{month:1,stage:'发放Offer',desc:'次年1月下发，偶有延迟至2-3月'}]),
      9, 11, 1, 'Apple 各团队独立招聘，可投多个感兴趣的部门。面试深度高于广度，需准备专项技术。', '历年招聘信息 & Blind 社区', 0],

    ['Uber', '', '北美', '技术', 2025,
      T([{month:8,stage:'开放申请',desc:'Uber Careers 秋季岗位开放'},{month:9,stage:'Phone Screen',desc:'1轮技术电话面，含算法题'},{month:10,stage:'Virtual Onsite',desc:'4轮面试，含编程+系统设计+行为'},{month:11,stage:'发放Offer',desc:'TC 约$200k+，含签约奖'}]),
      8, 10, 11, '分布式系统和高并发设计是 Uber 技术面重点，地图/物流方向需了解路径算法。', '历年招聘信息 & 社区反馈', 0],

    ['Airbnb', '', '北美', '技术', 2025,
      T([{month:9,stage:'开放申请',desc:'Airbnb 秋季开放 New Grad 岗位，名额较少'},{month:10,stage:'Phone Screen',desc:'1-2轮技术筛选'},{month:11,stage:'Virtual Onsite',desc:'5轮面试，含前端/全栈重点考察'},{month:12,stage:'发放Offer',desc:'Offer含 RSU'}]),
      9, 11, 12, '全栈/前端方向需掌握 React，系统设计面试较看重 API 设计思维。', '历年招聘信息 & 社区反馈', 0],

    // ─── 北美 - 金融/咨询岗 ─────────────────────────────────────────────────
    ['Goldman Sachs', '', '北美', '金融', 2025,
      T([{month:7,stage:'开放申请',desc:'GS Careers 投行/量化/科技岗同步开放，竞争极激烈'},{month:8,stage:'HireVue/OA',desc:'视频面试或在线测评，含数学+逻辑+情境题'},{month:9,stage:'Superday',desc:'一日多轮面试，含技术+行为+case，每轮30分钟'},{month:10,stage:'最终评估',desc:'委员会审核期约1-2周'},{month:11,stage:'发放Offer',desc:'SA/FT Offer，Base+Bonus综合包'}]),
      7, 9, 11, '量化岗（Strats/Quant）需扎实数学/统计/编程；IBD 岗需准备 Fit + Technical（财务模型）。', '历年校招公告 & WSO 社区', 1],

    ['JP Morgan', '', '北美', '金融', 2025,
      T([{month:7,stage:'开放申请',desc:'JPM Careers 开放 SA/FT 岗位，覆盖 IB/Markets/Technology'},{month:8,stage:'HireVue',desc:'录制视频面试，行为题为主'},{month:9,stage:'Superday',desc:'多轮1v1或小组面试，含Behavioral+Technical'},{month:10,stage:'Review期',desc:'等待最终评估，约1-3周'},{month:11,stage:'发放Offer',desc:'FT Offer，可协商签约奖金'}]),
      7, 9, 11, 'Technology 方向可申请 Software Engineering Program（SEP），编程+Behavioral 双重考察。', '历年校招公告 & 社区反馈', 1],

    ['Jane Street', '', '北美', '金融', 2025,
      T([{month:8,stage:'开放申请',desc:'Jane Street Careers 开放 SWE/Trader 岗位'},{month:9,stage:'Phone Screen',desc:'1-2轮技术/交易逻辑电话面'},{month:10,stage:'Onsite面试',desc:'全天面试（编程+概率+交易问题），Trader岗重点考数学'},{month:11,stage:'发放Offer',desc:'Offer包超高，Trader岗薪酬业内顶级'}]),
      8, 9, 11, 'Trader 岗需强数学和概率，SWE 岗考 OCaml/函数式编程加分。面试难度极高。', '历年招聘信息 & Blind 社区', 1],

    ['McKinsey', '', '北美', '咨询', 2025,
      T([{month:9,stage:'开放申请',desc:'McKinsey 官网开放 BA/Associate 岗位'},{month:10,stage:'网申筛选',desc:'简历+推荐信审核，部分学校有 Campus Event'},{month:10,stage:'一轮面试',desc:'Case Interview+PEI（个人经历面试），1-2轮'},{month:11,stage:'二轮终面',desc:'2-3轮 Case+PEI，更高难度战略案例'},{month:12,stage:'发放Offer',desc:'Offer含 Signing Bonus，外驻频繁'}]),
      9, 10, 12, 'Case Interview 需大量练习（推荐 Case In Point），PEI 需准备3-4个深度故事。', '历年招聘信息 & ManagementConsulted', 1],

    // ─── 英国 - 金融/技术岗 ─────────────────────────────────────────────────
    ['Goldman Sachs London', '', '英国', '金融', 2025,
      T([{month:6,stage:'开放申请',desc:'GS London 开放 IBD/Markets/Technology Summer Analyst'},{month:9,stage:'HireVue/笔试',desc:'视频面试+数学逻辑测评'},{month:10,stage:'Superday',desc:'伦敦办公室一日多轮面试'},{month:11,stage:'Review期',desc:'委员会审核'},{month:12,stage:'发放Offer',desc:'FT/SA Offer，£薪酬'}]),
      6, 10, 12, '英国校招节奏比北美早1个月，6月前完善 LinkedIn 和 Networking。', '历年校招公告 & WSO UK', 1],

    ['Barclays', '', '英国', '金融', 2025,
      T([{month:7,stage:'开放申请',desc:'Barclays Graduate Programme 开放申请，覆盖 IB/Markets/Tech'},{month:9,stage:'在线测评',desc:'数值推理+逻辑推理+情景判断测评'},{month:10,stage:'Assessment Centre',desc:'小组练习+个人展示+结构化面试'},{month:12,stage:'发放Offer',desc:'Graduate Offer，含轮岗计划'}]),
      7, 10, 12, 'Assessment Centre 环节团队合作表现很重要，提前练习 Group Exercise。', '历年校招公告 & 社区反馈', 0],

    ['KPMG UK', '', '英国', '咨询', 2025,
      T([{month:9,stage:'开放申请',desc:'KPMG Graduate Scheme 开放，含审计/咨询/科技'},{month:10,stage:'在线测评',desc:'数值推理+情景判断，约60分钟'},{month:11,stage:'视频面试',desc:'录制视频面试，行为问题为主'},{month:12,stage:'Assessment Centre',desc:'全天评估中心：Case+Group+Interview'},{month:1,stage:'发放Offer',desc:'次年1月Offer，毕业年9月入职'}]),
      9, 11, 1, '英国四大早申请早拿Offer，建议9月就投递，名额有限先到先得。', '历年校招公告 & 社区反馈', 0],

    ['Deloitte UK', '', '英国', '咨询', 2025,
      T([{month:9,stage:'开放申请',desc:'Deloitte Graduate Programme 开放，多业务线均招'},{month:10,stage:'在线测评',desc:'Situational Judgement Test + 数值推理'},{month:11,stage:'视频面试',desc:'行为问题录制视频面，约20分钟'},{month:12,stage:'Discovery Centre',desc:'全天评估中心，含个人展示+小组讨论+合伙人面'},{month:1,stage:'发放Offer',desc:'Offer及时下发，毕业年入职'}]),
      9, 11, 1, 'Deloitte 看重 Commercial Awareness，需了解行业热点和四大业务。', '历年校招公告 & 社区反馈', 0],

    ['JP Morgan London', '', '英国', '金融', 2025,
      T([{month:6,stage:'开放申请',desc:'JPM London Graduate 开放，IB/Markets/Technology 均招'},{month:8,stage:'HireVue',desc:'视频面试，行为+动机题'},{month:10,stage:'Superday',desc:'伦敦 Canary Wharf 办公室，多轮面试'},{month:11,stage:'发放Offer',desc:'FT Offer 下发'}]),
      6, 10, 11, 'IB岗位强调 Networking，提前参加 JPM 校园活动和 Insight Programme。', '历年校招公告 & 社区反馈', 1]
  ];

  const seedCampus = db.transaction(() => {
    for (const r of records) {
      ins.run(...r);
    }
  });
  seedCampus();
  total += records.length;
  console.log('✅ campus_schedules 初始化完成（30条）');
}

console.log(`\n🎉 数据迁移完成，共导入 ${total} 条记录`);
console.log(`📁 数据库文件：${path.join(__dirname, 'jobapp.db')}`);
