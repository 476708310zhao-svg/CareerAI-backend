const express = require('express');

const router = express.Router();

const today = () => new Date().toISOString().slice(0, 10);

const visaPolicies = [
  {
    id: 'us-opt',
    country: '美国',
    title: 'F-1 OPT 工作许可',
    type: '毕业后工作许可',
    audience: '美国 F-1 留学生',
    summary: '适合毕业后在美国从事与专业相关工作的同学，普通 OPT 通常最长 12 个月，STEM 专业可继续申请 STEM OPT Extension。',
    highlights: ['毕业前 90 天可启动申请', '拿到带 OPT 推荐的 I-20 后再提交 I-765', 'EAD 生效前不能开始工作'],
    steps: ['向学校国际学生办公室提交 OPT 申请', '获取带 DSO 推荐的新版 I-20', '通过 USCIS 在线提交 I-765', '等待 EAD 审批并记录就业状态'],
    materials: ['护照与 F-1 签证页', '最新 I-94', '带 OPT 推荐的 I-20', 'I-765 申请', '证件照与申请费'],
    timeline: '建议在毕业前 90 天开始准备，避免错过毕业后 60 天宽限期。',
    officialUrl: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment/optional-practical-training-opt-for-f-1-students',
    tags: ['OPT', 'F-1', 'EAD', '美国求职'],
    lastReviewed: today(),
  },
  {
    id: 'us-stem-opt',
    country: '美国',
    title: 'STEM OPT Extension',
    type: 'OPT 延期',
    audience: 'STEM 专业 F-1 学生',
    summary: '适合符合 STEM 专业目录、雇主加入 E-Verify 且需要延长工作许可的同学。',
    highlights: ['通常可在原 OPT 到期前 90 天内申请', '雇主需要配合 I-983 培训计划', '期间需要按要求完成地址和雇佣信息更新'],
    steps: ['确认专业 CIP Code 和 STEM 资格', '与雇主完成 I-983', '向 DSO 申请 STEM OPT I-20', '向 USCIS 提交 I-765 延期申请'],
    materials: ['I-983', '新版 STEM OPT I-20', 'EAD 卡', '雇主 E-Verify 信息', '学位证明'],
    timeline: '优先在当前 EAD 到期前 90 天内提交，预留补件和系统处理时间。',
    officialUrl: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/stem-opt',
    tags: ['STEM OPT', 'E-Verify', 'I-983'],
    lastReviewed: today(),
  },
  {
    id: 'us-h1b',
    country: '美国',
    title: 'H-1B Specialty Occupation',
    type: '雇主担保工作签证',
    audience: '需要美国雇主 Sponsor 的求职者',
    summary: '适合专业岗位雇佣，通常由雇主发起电子注册、抽签和正式申请。求职时应提前确认岗位是否支持 Sponsor。',
    highlights: ['雇主主导申请', '每年注册窗口通常在春季', '中签后提交完整 I-129 申请包'],
    steps: ['确认岗位和雇主 Sponsor 意愿', '雇主完成电子注册', '中签后准备 LCA 与申请材料', 'USCIS 审批后按生效日期入职或转身份'],
    materials: ['Offer 与岗位说明', '学历与成绩材料', 'LCA', 'I-129 申请包', '雇主支持信'],
    timeline: '求职时就应确认 Sponsor 政策，抽签窗口和生效日以 USCIS 当年公告为准。',
    officialUrl: 'https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations',
    tags: ['H-1B', 'Sponsor', 'LCA', 'USCIS'],
    lastReviewed: today(),
  },
  {
    id: 'uk-graduate-route',
    country: '英国',
    title: 'Graduate Route 毕业生签证',
    type: '毕业后留英工作签证',
    audience: '英国高校毕业国际学生',
    summary: '适合完成英国合规学位后留英求职或工作的同学，申请前需确认学校已向 UKVI 上报完成学业。',
    highlights: ['需要在英国境内申请', '本科和硕士通常 2 年，博士通常 3 年', '不可直接续签，后续需转其他签证'],
    steps: ['确认学校已上报完成学业', '在当前学生签证到期前在线申请', '完成身份验证', '等待 UKVI 审批结果'],
    materials: ['护照', 'BRP 或 eVisa 信息', 'CAS 编号', 'UKVI 在线申请信息'],
    timeline: '建议在学生签证到期前尽早确认学校上报状态并提交。',
    officialUrl: 'https://www.gov.uk/graduate-visa',
    tags: ['Graduate Route', 'PSW', 'UKVI', '英国求职'],
    lastReviewed: today(),
  },
  {
    id: 'uk-skilled-worker',
    country: '英国',
    title: 'Skilled Worker Visa',
    type: '雇主担保工作签证',
    audience: '获得英国持牌雇主工作机会的求职者',
    summary: '适合拿到英国持牌 Sponsor 雇主 Offer 的候选人，需要满足岗位、薪资、语言和 CoS 等要求。',
    highlights: ['雇主需要具备 Sponsor Licence', '岗位和薪资需满足规则', '申请前应确认 CoS 信息'],
    steps: ['确认雇主 Sponsor 资质', '获取 Certificate of Sponsorship', '准备薪资、英语和身份材料', '在线提交签证申请'],
    materials: ['CoS 编号', '护照', '英语能力证明', '薪资与岗位信息', '资金证明或雇主担保说明'],
    timeline: 'Offer 谈判阶段就要确认 Sponsor 和薪资门槛，避免入职时间受影响。',
    officialUrl: 'https://www.gov.uk/skilled-worker-visa',
    tags: ['Skilled Worker', 'CoS', 'Sponsor Licence'],
    lastReviewed: today(),
  },
  {
    id: 'ca-pgwp',
    country: '加拿大',
    title: 'Post-Graduation Work Permit',
    type: '毕业工签',
    audience: '加拿大 DLI 毕业国际学生',
    summary: '适合加拿大合规学校毕业后申请开放式工作许可的同学，资格与课程长度、学校类型和毕业证明相关。',
    highlights: ['需要在规定时间内提交', '工签长度通常与项目长度相关', '申请前确认项目和学校是否符合 PGWP 资格'],
    steps: ['确认 DLI 与项目资格', '获取毕业信和最终成绩单', '在线提交 PGWP 申请', '保存递交回执和临时工作资格证明'],
    materials: ['护照', '毕业确认信', '成绩单', '学习许可', '申请表与费用'],
    timeline: '毕业后尽快根据 IRCC 最新规则提交，避免身份断档。',
    officialUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation.html',
    tags: ['PGWP', 'IRCC', '加拿大求职'],
    lastReviewed: today(),
  },
  {
    id: 'au-485',
    country: '澳洲',
    title: 'Temporary Graduate Visa subclass 485',
    type: '毕业生临时签证',
    audience: '澳洲毕业国际学生',
    summary: '适合在澳洲完成符合条件课程后继续求职、工作或积累本地经验的同学。',
    highlights: ['需确认对应 Stream', '健康保险和英语要求需要提前准备', '政策和时长会随官方规则调整'],
    steps: ['确认毕业课程和 Stream', '准备英语、体检和保险材料', '在线提交 485 申请', '跟进补件和签证结果'],
    materials: ['护照', '毕业证明', '英语成绩', 'AFP 无犯罪记录', '健康保险'],
    timeline: '建议在学生签证到期前完成资格确认和材料准备。',
    officialUrl: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485',
    tags: ['485', '澳洲求职', 'Temporary Graduate'],
    lastReviewed: today(),
  },
  {
    id: 'hk-iang',
    country: '香港特别行政区',
    title: 'IANG 非本地毕业生留港安排',
    type: '毕业后留港就业安排',
    audience: '香港高校非本地毕业生',
    summary: '适合香港高校非本地毕业生留港求职或就业，通常分为应届和非应届申请路径。',
    highlights: ['应届毕业生通常无须先获得 Offer', '非应届申请通常需要已获聘用', '获批后需留意逗留期限和续签条件'],
    steps: ['确认应届或非应届身份', '准备学历和身份文件', '向入境事务处提交申请', '获批后按要求办理逗留签注'],
    materials: ['旅行证件', '香港身份证如适用', '毕业证明', '聘用文件如适用', '申请表'],
    timeline: '毕业季前后建议提前准备学历证明和申请材料。',
    officialUrl: 'https://www.immd.gov.hk/hks/services/visas/IANG.html',
    tags: ['IANG', '香港求职', '非本地毕业生'],
    lastReviewed: today(),
  },
];

const helpArticles = [
  {
    id: 'jobs-real-data',
    category: '职位搜索',
    title: '官网职位数据是真实岗位吗？',
    summary: '职位搜索页通过后端公共接口聚合外部公开职位源，并统一字段、城市和详情链接。',
    answer: '官网职位列表使用 /api/proxy/jobs，后端再转发到 /api/jobs。当前逻辑优先读取公开职位源并做缓存，详情页会根据 source 和 externalId 继续拉取原始岗位详情；当外部源暂时不可用时才展示最小兜底数据，并会标注来源。',
    links: [{ label: '职位搜索', href: '/jobs' }, { label: '求职地图', href: '/job-map' }],
    tags: ['真实职位', '职位详情', '数据源'],
    updatedAt: today(),
  },
  {
    id: 'resume-ai',
    category: '简历优化',
    title: '如何用 AI 优化简历？',
    summary: '进入我的简历或编辑器后，可以按目标 JD 优化经历表达和关键词匹配。',
    answer: '建议先上传或创建一份基础简历，再粘贴目标岗位 JD。系统会围绕岗位关键词、量化结果、动作动词和 ATS 可读性给出优化建议。投递前建议保留原始版本，按公司和岗位生成不同版本。',
    links: [{ label: '我的简历', href: '/my-resume' }, { label: '简历编辑器', href: '/resume-editor' }],
    tags: ['AI 简历', 'ATS', 'JD 匹配'],
    updatedAt: today(),
  },
  {
    id: 'interview-ai',
    category: 'AI 面试',
    title: 'AI 模拟面试怎么使用？',
    summary: '可从职位详情或面经库带入岗位信息，生成更贴近目标公司的追问。',
    answer: '进入 AI 面试页后选择岗位、公司和面试类型。若从职位详情页或面经库进入，会自动带入 JD 或面经上下文，适合练习行为面、技术面、Case 或产品题。',
    links: [{ label: 'AI 面试', href: '/ai-interview' }, { label: '大厂面经库', href: '/interview-experiences' }],
    tags: ['模拟面试', '行为面', '技术面'],
    updatedAt: today(),
  },
  {
    id: 'applications',
    category: '网申投递',
    title: '如何追踪网申进度？',
    summary: '可以在网申助手里记录岗位、状态、截止日期和下一步动作。',
    answer: '建议把投递状态拆成待投递、已投递、OA、面试、Offer、拒信等阶段，并给每个岗位记录下一次跟进时间。后续可结合职位详情和简历版本做复盘。',
    links: [{ label: '网申助手', href: '/application-assistant' }, { label: '职位搜索', href: '/jobs' }],
    tags: ['网申', '投递管理', '进度追踪'],
    updatedAt: today(),
  },
  {
    id: 'salary',
    category: '薪资查询',
    title: '薪资查询应该怎么看？',
    summary: '薪资页面会按公司、岗位、地区和经验聚合样本，帮助判断 Offer 区间。',
    answer: '看薪资时不要只看总包数字，要拆分 Base、Bonus、Stock、签字费和归属周期。跨地区比较时还需要结合税率、生活成本和签证稳定性。',
    links: [{ label: '薪资查询', href: '/salary-insights' }],
    tags: ['薪资', 'Offer 比较', '总包'],
    updatedAt: today(),
  },
  {
    id: 'visa',
    category: '签证政策',
    title: '签证政策内容是否实时更新？',
    summary: '官网整理常见求职相关政策，并保留 USCIS、UKVI、IRCC 等官方入口。',
    answer: '签证政策页用于求职准备和材料清单梳理，不替代法律意见。由于政策会变化，页面会展示官方链接，关键申请前请以官方页面、学校国际学生办公室或持牌律师意见为准。',
    links: [{ label: '签证政策解读', href: '/visa-policies' }],
    tags: ['OPT', 'H-1B', '签证政策'],
    updatedAt: today(),
  },
  {
    id: 'account',
    category: '账号权限',
    title: '会员和普通用户有什么区别？',
    summary: '会员能力会逐步覆盖更高频的 AI 面试、简历优化和高级求职工具。',
    answer: '普通用户可以浏览公开职位、资讯和基础工具。会员权益会在产品页展示，包括更多 AI 使用额度、个性化求职规划、简历深度优化和高级数据能力。',
    links: [{ label: '联系我们', href: '/contact' }],
    tags: ['会员', '账号', '权限'],
    updatedAt: today(),
  },
  {
    id: 'contact-support',
    category: '联系支持',
    title: '遇到问题如何联系团队？',
    summary: '可以通过帮助中心在线反馈，也可以在联系页面留下合作或服务需求。',
    answer: '帮助中心的客服入口会把问题提交到后端反馈系统。若涉及账号、付款、合作或机构评估，请尽量附上联系方式和问题截图，便于团队定位。',
    links: [{ label: '联系页面', href: '/contact' }, { label: '隐私政策', href: '/privacy' }],
    tags: ['客服', '反馈', '合作'],
    updatedAt: today(),
  },
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesKeyword(item, keyword, fields) {
  if (!keyword) return true;
  const query = normalizeText(keyword);
  return fields.some((field) => {
    const value = item[field];
    if (Array.isArray(value)) return value.join(' ').toLowerCase().includes(query);
    return normalizeText(value).includes(query);
  });
}

router.get('/visa-policies', (req, res) => {
  const country = String(req.query.country || '').trim();
  const keyword = String(req.query.keyword || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);

  const items = visaPolicies
    .filter((item) => !country || item.country === country)
    .filter((item) => matchesKeyword(item, keyword, ['title', 'type', 'audience', 'summary', 'tags']))
    .slice(0, limit);

  res.json({
    code: 0,
    message: 'success',
    data: {
      source: 'curated_official_links',
      lastReviewed: today(),
      countries: [...new Set(visaPolicies.map((item) => item.country))],
      total: items.length,
      items,
    },
  });
});

router.get('/help-center', (req, res) => {
  const category = String(req.query.category || '').trim();
  const keyword = String(req.query.keyword || '').trim();

  const items = helpArticles
    .filter((item) => !category || category === '全部' || item.category === category)
    .filter((item) => matchesKeyword(item, keyword, ['title', 'summary', 'answer', 'tags', 'category']));

  res.json({
    code: 0,
    message: 'success',
    data: {
      source: 'product_knowledge_base',
      updatedAt: today(),
      categories: ['全部', ...new Set(helpArticles.map((item) => item.category))],
      total: items.length,
      items,
    },
  });
});

router.get('/resource-summary', (_req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      updatedAt: today(),
      modules: [
        { key: 'blog', title: '求职干货博客', endpoint: '/api/news?tab=tip', description: '简历、投递、面试和求职方法论' },
        { key: 'news', title: '求职资讯', endpoint: '/api/news?tab=all', description: '行业动态、招聘趋势和政策变化' },
        { key: 'experiences', title: '大厂面经库', endpoint: '/api/experiences', description: '公司、岗位、轮次维度的面试复盘' },
        { key: 'visa', title: '签证政策解读', endpoint: '/api/content/visa-policies', description: 'OPT、H-1B、Graduate Route 等官方政策入口' },
        { key: 'help', title: '帮助中心', endpoint: '/api/content/help-center', description: '产品使用、账号权限和反馈说明' },
      ],
    },
  });
});

module.exports = router;
