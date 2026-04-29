// pages/star-library/star-library.js
const api = require('../../utils/api.js');
const sendChatToDeepSeek = api.sendChatToDeepSeek;

const TEMPLATES = [
  /* ── 咨询 ── */
  {
    id: 'star_c01', role: 'consulting', roleLabel: '咨询', roleColor: '#8B5CF6',
    title: '推动跨部门变革项目',
    tags: ['领导力', '变革管理', '利益相关方'],
    situation: '在某500强零售集团实习期间，公司推行新的全渠道供应链系统，IT部门与运营部门之间存在严重协作障碍，导致项目延期3个月。',
    task: '作为项目协调员，我被要求在2周内找出问题根源并提出解决方案，确保项目重回计划轨道。',
    action: '我首先单独访谈了IT、运营和采购三个部门负责人，绘制沟通矩阵，定位核心障碍为需求文档歧义和KPI冲突。随后主导设计"两周冲刺"工作坊，邀请三方制定统一术语表，重新协商各部门阶段性KPI，使各方利益对齐。',
    result: '项目在3周内成功重启，提前1周上线，跨部门沟通效率提升40%，解决方案被复用至公司另外2个数字化转型项目。',
  },
  {
    id: 'star_c02', role: 'consulting', roleLabel: '咨询', roleColor: '#8B5CF6',
    title: '数据驱动的市场进入建议',
    tags: ['数据分析', '市场研究', '结构化思维'],
    situation: '我在某咨询项目中负责评估客户（教育科技公司）进入东南亚市场的可行性，时间仅有2周，市场数据极度分散。',
    task: '独立完成市场规模测算、竞争格局分析和风险评估，向CEO团队汇报。',
    action: '采用自下而上的TAM测算框架，结合Python爬取15个国家公开教育数据，设计3×3竞争矩阵分析主要对手，并用蒙特卡洛模拟评估3种进入策略的NPV范围。',
    result: '报告获CEO高度认可，"越南优先"战略被采纳，客户最终投资5000万美元进入越南市场，ROI预期18个月内实现。',
  },
  /* ── PM ── */
  {
    id: 'star_p01', role: 'pm', roleLabel: 'PM', roleColor: '#3B82F6',
    title: '用户留存率提升30%',
    tags: ['用户研究', 'A/B测试', '数据驱动'],
    situation: '负责某音乐App的核心功能迭代，发现用户第7日留存率仅为12%，远低于行业平均的18%，公司增长陷入瓶颈。',
    task: '在Q2内将D7留存率提升到18%以上，同时不影响日活跃用户数。',
    action: '通过用户访谈（20人）和漏斗分析，定位"新用户建立播放列表"为留存关键节点。设计"智能歌单一键生成"功能，通过2周A/B测试（样本1万用户）验证方案，与设计师迭代4个版本后上线。',
    result: 'D7留存率从12%提升至19.2%，超额完成目标，功能上线后3个月DAU增长22%，被评为当季最佳迭代项目。',
  },
  {
    id: 'star_p02', role: 'pm', roleLabel: 'PM', roleColor: '#3B82F6',
    title: '解决跨团队资源争抢冲突',
    tags: ['优先级管理', '利益相关方', '沟通协作'],
    situation: '同时负责2个产品线，Q3因公司增长目标调整，两条线开发资源被大幅压缩，工程师团队出现疲态和抵触情绪。',
    task: '在资源减少30%的情况下，确保两条产品线核心功能按期交付，同时维护团队士气。',
    action: '组织跨产品线优先级工作坊，引入RICE评分框架重新评估所有需求，砍掉低价值功能40%，需求按三层分类。向上争取到1名外包工程师，设立每周15分钟"阻碍快速清除会"。',
    result: '两条线核心功能均按期交付（延迟率从35%降至8%），工程师满意度从6.1升至8.3/10，该优先级框架被推广至全部门。',
  },
  /* ── 运营 ── */
  {
    id: 'star_o01', role: 'ops', roleLabel: '运营', roleColor: '#F59E0B',
    title: '流程优化降低40%运营成本',
    tags: ['流程优化', '成本控制', '数据分析'],
    situation: '负责某电商平台仓储运营，发现拣货差错率高达3.2%，每月退换货成本约50万元，远超行业0.5%基准。',
    task: '在3个月内将差错率降至1%以下，不增加额外人力成本。',
    action: '通过鱼骨图分析，定位"货位标签不清晰"和"拣货路径混乱"为主因。设计新货位编码体系，引入波次拣货+路径优化算法，对员工进行2次专项培训，每周跟踪数据。',
    result: '差错率从3.2%降至0.8%，每月节省约45万元，拣货效率提升28%，方案被复制至集团其他3个仓库。',
  },
  {
    id: 'star_o02', role: 'ops', roleLabel: '运营', roleColor: '#F59E0B',
    title: '冷启动期用户增长策略',
    tags: ['用户增长', '内容运营', '社群运营'],
    situation: '负责某知识付费产品上线初期的用户增长，0-1阶段，无预算，无品牌认知，需3个月内达成5000名付费用户。',
    task: '在零预算条件下完成冷启动，建立最初的用户社区和口碑传播机制。',
    action: '制定"KOL种草+私域裂变"双引擎策略：联系30位垂直领域博主进行免费置换测评；设计"邀请1人得高级课程"裂变机制；亲自运营第一个500人微信群，每天发布高质量内容。',
    result: '3个月内获得5800名付费用户（超目标16%），裂变系数K值达到1.3，社群NPS为72，次季度付费用户规模翻倍。',
  },
  /* ── 技术 ── */
  {
    id: 'star_t01', role: 'tech', roleLabel: '技术', roleColor: '#10B981',
    title: '解决生产环境严重Bug',
    tags: ['问题排查', '技术能力', '压力处理'],
    situation: '在某互联网公司实习期间，凌晨2点收到告警，核心支付服务出现5%请求失败，每分钟损失约1万元。',
    task: '在1小时内定位并修复问题，事后给出系统改进方案。',
    action: '立即查看日志，发现错误集中在数据库连接池耗尽，追溯到新上线功能未正确释放连接。立即做hotfix，申请紧急上线，同时临时增加连接池大小。修复后撰写详细故障复盘，提出连接泄漏静态检测工具方案。',
    result: '故障在45分钟内得到控制，损失控制在3万元以内（预计可达30万元）。静态检测方案被采纳，后续3个月内未再出现同类问题，复盘文档纳入新人培训材料。',
  },
  {
    id: 'star_t02', role: 'tech', roleLabel: '技术', roleColor: '#10B981',
    title: '主导技术方案选型决策',
    tags: ['技术决策', '系统设计', '团队影响力'],
    situation: '团队在微服务改造过程中对消息队列选型（Kafka/RabbitMQ/Pulsar）存在较大分歧，讨论持续2周无法达成共识，影响项目进度。',
    task: '作为负责该模块的工程师，需主导评估并推动团队在1周内做出决定。',
    action: '设计5维度评估矩阵（吞吐量、延迟、运维成本、学习曲线、社区支持），针对实际业务场景进行量化评分，并搭建最小化测试环境对3个方案进行性能基准测试。',
    result: '团队采纳了推荐的RabbitMQ方案，项目按时完成，微服务改造后系统吞吐量提升3倍，团队1个月内完全掌握该技术栈。',
  },
  /* ── 金融 ── */
  {
    id: 'star_f01', role: 'finance', roleLabel: '金融', roleColor: '#EF4444',
    title: '量化策略研究与验证',
    tags: ['数据分析', '量化研究', '风险控制'],
    situation: '在某量化基金实习期间，被指派独立研究动量因子策略，使用过去2年A股数据，需在3周内完成回测并汇报。',
    task: '独立完成因子构建、回测框架搭建和风险分析，向投研团队汇报策略可行性。',
    action: '用Python构建基于12-1动量因子的多因子模型，实现滚动窗口回测框架，加入交易成本、换手率约束和最大回撤控制。发现原始策略在小盘股中存在严重过拟合，通过加入市值因子和流动性过滤显著改善稳健性。',
    result: '改进后策略年化Alpha为8.2%，夏普比率1.6，最大回撤控制在12%以内。策略进入纸面交易阶段，获得正式实习延长邀请。',
  },
  /* ── 通用 ── */
  {
    id: 'star_g01', role: 'general', roleLabel: '通用', roleColor: '#6B7280',
    title: '处理重大项目失败与复盘',
    tags: ['抗压能力', '复盘成长', '逆境应对'],
    situation: '大三时负责开发校园二手交易App，在公开发布前一天发现支付模块存在严重安全漏洞，无法按原计划发布。',
    task: '在48小时内修复漏洞，同时维持团队士气，避免项目夭折。',
    action: '立即联系导师和两名有安全经验的同学寻求支持，向合作方诚实说明情况并争取到72小时延期。连续工作约36小时排查修复漏洞，同时撰写详细技术复盘文档。',
    result: '项目延期3天发布，安全问题完全解决。发布后2周获500+用户。建立了"安全第一、提前测试"工作习惯，同时学会在压力下与利益相关方进行诚实的期望管理。',
  },
  {
    id: 'star_g02', role: 'general', roleLabel: '通用', roleColor: '#6B7280',
    title: '在跨文化团队中的协作',
    tags: ['跨文化协作', '团队合作', '沟通适应'],
    situation: '海外交换期间参与由5个国家学生组成的案例竞赛团队，因文化差异和时区问题，前两周效率极低，成员之间出现明显矛盾。',
    task: '作为团队中唯一具有咨询背景的成员，主动承担协调角色，带领团队在3周内完成高质量案例报告。',
    action: '设计"结构化每日站会"（15分钟），制定清晰任务分工矩阵，与每位成员进行1对1沟通了解工作方式偏好，建立"书面确认+口头对齐"双机制。',
    result: '团队最后3周实现高效协作，最终报告在60支队伍中获第2名，成员协作体验从3/10提升至8/10。',
  },
  {
    id: 'star_g03', role: 'general', roleLabel: '通用', roleColor: '#6B7280',
    title: '在资源极度有限下达成目标',
    tags: ['创造力', '资源整合', '目标导向'],
    situation: '担任学生社团公关负责人，需独立组织一场200人规模的年度招募活动，但预算仅有500元（往年标准为3000元）。',
    task: '在预算削减80%的情况下，确保招募活动效果不低于往年，获得不少于150名新成员报名。',
    action: '联系校园周边5家咖啡店和书店进行场地赞助换宣传，设计精美电子物料替代印刷品，招募摄影系同学免费提供摄影服务，并通过微信群裂变传播替代海报宣传。',
    result: '活动现场人流超过240人，收到213份报名表（超目标42%），赞助商反馈曝光效果优于预期，该低成本策略在社团内部被沿用至今。',
  },
];

const ROLE_FILTERS = [
  { id: '', label: '全部', color: '#6B7280' },
  { id: 'consulting', label: '咨询', color: '#8B5CF6' },
  { id: 'pm',        label: 'PM',   color: '#3B82F6' },
  { id: 'ops',       label: '运营', color: '#F59E0B' },
  { id: 'tech',      label: '技术', color: '#10B981' },
  { id: 'finance',   label: '金融', color: '#EF4444' },
  { id: 'general',   label: '通用', color: '#6B7280' },
];

Page({
  data: {
    templates:   TEMPLATES,
    filtered:    TEMPLATES,
    roleFilters: ROLE_FILTERS,
    activeRole:  '',
    searchKey:   '',
    expandedId:  '',
    savedIds:    [],

    // AI customise
    customising: '',    // id of template being customised
    customInput: '',    // user's situation context for personalisation
    showCustomModal: false,
    customTarget: null,
    customResult: '',
    customLoading: false,
  },

  onLoad() {
    const saved = wx.getStorageSync('savedStarTemplates') || [];
    this.setData({ savedIds: saved });
  },

  onSearch(e) {
    this.setData({ searchKey: e.detail.value }, () => this._filter());
  },

  setRole(e) {
    const role = e.currentTarget.dataset.role;
    this.setData({ activeRole: this.data.activeRole === role ? '' : role }, () => this._filter());
  },

  _filter() {
    const { templates, activeRole, searchKey } = this.data;
    let list = templates;
    if (activeRole) list = list.filter(t => t.role === activeRole);
    if (searchKey) {
      const kw = searchKey.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(kw) || t.tags.some(tag => tag.includes(kw)));
    }
    this.setData({ filtered: list });
  },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  /* ── Bookmark ── */
  saveTemplate(e) {
    const id = e.currentTarget.dataset.id;
    let saved = [...this.data.savedIds];
    if (saved.includes(id)) {
      saved = saved.filter(s => s !== id);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      saved.unshift(id);
      wx.showToast({ title: '已收藏', icon: 'success' });
    }
    wx.setStorageSync('savedStarTemplates', saved);
    this.setData({ savedIds: saved });
  },

  /* ── Copy full text ── */
  copyTemplate(e) {
    const id = e.currentTarget.dataset.id;
    const t  = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    const text = `【${t.title}】\n\nS（情境）：${t.situation}\n\nT（任务）：${t.task}\n\nA（行动）：${t.action}\n\nR（结果）：${t.result}`;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制全文', icon: 'success' }) });
  },

  /* ── AI personalise ── */
  openCustomise(e) {
    const id = e.currentTarget.dataset.id;
    const t  = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    this.setData({ showCustomModal: true, customTarget: t, customInput: '', customResult: '', customLoading: false });
  },
  closeCustomise() { this.setData({ showCustomModal: false }); },
  noop() {},
  onCustomInput(e) { this.setData({ customInput: e.detail.value }); },

  generateCustom() {
    const { customTarget, customInput } = this.data;
    if (!customTarget || !sendChatToDeepSeek) return;
    if (!customInput.trim()) { wx.showToast({ title: '请先描述你的背景', icon: 'none' }); return; }

    this.setData({ customLoading: true, customResult: '' });

    const prompt = `以下是一个STAR面试模板：
标题：${customTarget.title}
S：${customTarget.situation}
T：${customTarget.task}
A：${customTarget.action}
R：${customTarget.result}

用户的实际经历背景：${customInput.trim()}

请帮用户将上面的STAR模板改写为贴合其实际经历的个性化版本，保持STAR结构，语言自然真实，结果部分需有具体数字或成果。直接输出改写后的STAR，不要输出任何说明文字。格式：
S（情境）：...
T（任务）：...
A（行动）：...
R（结果）：...`;

    sendChatToDeepSeek([
      { role: 'system', content: '你是一位资深求职辅导顾问，擅长帮助候选人用STAR法则构建真实有力的面试故事。' },
      { role: 'user',   content: prompt }
    ]).then(res => {
      const text = res.choices?.[0]?.message?.content || '生成失败，请重试';
      this.setData({ customResult: text, customLoading: false });
    }).catch(() => {
      this.setData({ customLoading: false });
      wx.showToast({ title: 'AI 请求失败', icon: 'none' });
    });
  },

  copyCustomResult() {
    const text = this.data.customResult;
    if (!text) return;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },

  /* ── Practice ── */
  practiceSTAR(e) {
    const role = e.currentTarget.dataset.role;
    const roleMap = { consulting: '咨询分析师', pm: '产品经理', ops: '运营专员', tech: '软件工程师', finance: '金融分析师', general: '综合岗位' };
    wx.navigateTo({ url: `/pages/interview-setup/interview-setup?type=behavior&position=${encodeURIComponent(roleMap[role] || '综合岗位')}` });
  },
});
