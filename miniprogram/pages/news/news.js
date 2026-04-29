// pages/news/news.js
const { API_BASE_URL } = require('../../utils/config.js');

Page({
  data: {
    // 分类
    tabs: [
      { id: 'all', name: '全部' },
      { id: 'news', name: '资讯' },
      { id: 'tip', name: '技巧' },
      { id: 'data', name: '数据' },
      { id: 'policy', name: '政策' }
    ],
    currentTab: 'all',

    // 快讯数据
    allNews: [],
    displayList: [],

    // 搜索
    searchKeyword: '',
    isSearching: false,

    // 分类标签映射
    typeLabel: { news: '资讯', tip: '技巧', data: '数据', policy: '政策' }
  },

  onLoad() {
    this.loadNews();
  },

  // ======== 从后端拉取新闻，失败降级 mock ========
  loadNews() {
    wx.request({
      url: API_BASE_URL + '/api/news?tab=all',
      method: 'GET',
      timeout: 8000,
      success: (res) => {
        const articles = res.data && res.data.articles;
        if (articles && articles.length > 0) {
          const personalNews = this._buildPersonalNews();
          const allNews = [...personalNews, ...articles];
          this.setData({ allNews, displayList: allNews });
        } else {
          // API 返回空（未配置 key 或无结果）→ 降级 mock
          this.buildAllNews();
        }
      },
      fail: () => {
        // 网络失败 → 降级 mock
        this.buildAllNews();
      }
    });
  },

  // ======== 构建个性化快讯（供两个路径复用）========
  _buildPersonalNews() {
    const profile = wx.getStorageSync('userProfile') || {};
    const interviewHistory = wx.getStorageSync('interviewHistory') || [];
    const personalNews = [];

    if (interviewHistory.length > 0) {
      const latest = interviewHistory[0];
      personalNews.push({
        id: 'p1', type: 'tip', isPersonal: true,
        title: '你的最近面试得分 ' + (latest.score || '--') + ' 分',
        desc: '继续练习可以提升面试表现，试试更高难度的模拟面试吧',
        content: '根据你的最近一次 AI 模拟面试记录，你的得分为 ' + (latest.score || '--') + ' 分。\n\n面试表现提升建议：\n\n1. 回顾弱项：重点复习你回答不够完善的题目类型\n2. 刻意练习：每天花 20 分钟做 2-3 道模拟面试题\n3. 录音回听：用手机录下练习过程，回听找改进点\n4. STAR法则：行为面试题务必用 Situation-Task-Action-Result 结构\n5. 限时训练：给自己限定 2 分钟内回答，训练简洁表达',
        time: this.getTimeLabel(0)
      });
    }

    if (profile.major) {
      personalNews.push({
        id: 'p2', type: 'data', isPersonal: true,
        title: profile.major + ' 专业热门岗位趋势',
        desc: '根据你的专业，为你推荐最匹配的求职方向',
        content: '基于你的专业「' + profile.major + '」，以下是当前市场上最热门的相关岗位方向：\n\n1. 岗位需求分析\n近 3 个月内，该专业相关岗位发布量环比增长 18%，尤其在北美和国内一线城市需求旺盛。\n\n2. 薪资区间\n应届留学生在对口岗位上的平均起薪约为 ¥15k-30k/月（国内）或 $80k-130k/年（北美），具体因方向和公司而异。\n\n3. 核心技能要求\n各头部公司 JD 中出现频率最高的技能关键词包括：Python、SQL、数据分析、算法基础、团队协作。\n\n4. 求职建议\n- 优先投递与专业强相关的岗位，匹配度更高\n- 简历中突出项目经历和量化成果\n- 利用 AI 模拟面试提前准备高频面试题',
        time: this.getTimeLabel(0)
      });
    }

    return personalNews;
  },

  // ======== 构建完整 mock 快讯库（无网络时兜底）========
  buildAllNews() {
    const personalNews = this._buildPersonalNews();

    const generalNews = [
      // === 资讯 ===
      {
        id: 'n1', type: 'news',
        title: '2026春招：字节跳动开放200+海外留学生岗位',
        desc: '涵盖技术、产品、运营等方向，投递截止日期为4月15日',
        content: '字节跳动 2026 年春季校园招聘已正式开启，本次面向海外留学生开放超过 200 个岗位。\n\n招聘方向：\n- 技术类：后端开发、前端开发、移动开发、算法工程师、数据工程师\n- 产品类：产品经理、产品运营、商业分析\n- 运营类：内容运营、国际化运营、市场营销\n- 设计类：UX设计师、交互设计师\n\n投递信息：\n- 投递截止：2026年4月15日\n- 面试形式：线上面试（支持多时区）\n- 入职时间：2026年7-9月\n\n薪资福利：\n- 技术岗 base 25-40k/月 + 年终奖 + 股票期权\n- 入职即提供租房补贴\n- 支持北京/上海/深圳/新加坡多地入职\n\n申请建议：\n1. 提前准备好中英文简历\n2. 刷 LeetCode Medium 难度 150 题以上\n3. 了解字节的产品矩阵（抖音/TikTok/飞书）\n4. 准备好"为什么选择字节"的回答',
        time: this.getTimeLabel(1)
      },
      {
        id: 'n2', type: 'news',
        title: 'Google 2026 New Grad 岗位已开放申请',
        desc: 'SWE/PM/DS等多个方向，支持H1B sponsorship',
        content: 'Google 2026 年 New Graduate 招聘计划已上线，面向全球应届毕业生开放。\n\n开放岗位：\n- Software Engineer (SWE) — Mountain View/NYC/Seattle\n- Product Manager (APM) — 全球\n- Data Scientist — 多地\n- UX Designer — 多地\n- Hardware Engineer — 硅谷\n\n关键信息：\n- 支持 H1B/OPT sponsorship\n- 面试流程：Phone Screen → Virtual Onsite (4-5轮)\n- 薪资参考：SWE L3 base $130-150k + bonus + RSU\n\n准备建议：\n1. LeetCode 刷题 200+ 是基础门槛\n2. System Design 对 new grad 不是重点但了解基础有加分\n3. Behavioral Interview 准备 Googleyness & Leadership 相关案例\n4. 投递时机：越早越好，rolling basis',
        time: this.getTimeLabel(2)
      },
      {
        id: 'n3', type: 'news',
        title: '腾讯海外招聘专场：覆盖北美/欧洲/新加坡',
        desc: '技术类岗位竞争激烈，提前投递更有优势',
        content: '腾讯 2026 年海外留学生招聘专场已启动，覆盖北美、欧洲和新加坡三大区域。\n\n重点方向：\n- 游戏开发（引擎/客户端/服务器）\n- 社交产品（微信/QQ国际化）\n- 云与智慧产业（云计算/AI）\n- 金融科技（支付/理财）\n\n时间线：\n- 网申：即日起 - 2026年4月30日\n- 笔试：2026年5月上旬\n- 面试：2026年5月中旬 - 6月\n\n往年数据：\n- 技术岗录取率约 3-5%\n- 笔试题型：算法（2道）+ 选择题（20道）\n- 面试轮次：技术一面 → 技术二面 → HR面',
        time: this.getTimeLabel(3)
      },
      {
        id: 'n4', type: 'news',
        title: 'Amazon 2026暑期实习申请截止倒计时',
        desc: 'SDE实习竞争激烈，建议尽早投递',
        content: 'Amazon 2026 暑期 SDE Intern 招聘即将截止，还未投递的同学请抓紧时间。\n\n实习信息：\n- 岗位：Software Development Engineer Intern\n- 时长：12 周（2026年5-8月）\n- 地点：Seattle/Bellevue/NYC/Austin 等\n- 薪资：$50-55/hr + 住房补贴 $3,500/月\n\n面试流程：\n- OA (Online Assessment)：2道算法题，70分钟\n- Virtual Interview：1轮，45-60分钟\n  - 1道 Coding 题 + 2个 Leadership Principles 行为面试题\n\n高频 LP 问题：\n1. Customer Obsession：描述一次你为用户着想的经历\n2. Ownership：描述你主动承担额外责任的经历\n3. Dive Deep：描述你深入调查问题根因的经历\n\n准备清单：\n- LeetCode Top Amazon Tagged 100 题\n- 熟读 16 条 Leadership Principles\n- 准备 6-8 个 STAR 案例',
        time: this.getTimeLabel(4)
      },
      {
        id: 'n5', type: 'news',
        title: '华为海外留学生招聘「天才少年」计划',
        desc: '顶尖薪资，面向AI/芯片/系统方向博士及硕士',
        content: '华为 2026 年「天才少年」计划持续招募中，面向全球顶尖院校的博士和优秀硕士。\n\n薪资档次：\n- 一档：200万+/年\n- 二档：100-200万/年\n- 三档：80-100万/年\n\n重点方向：\n- AI 大模型（盘古大模型/昇思MindSpore）\n- 芯片设计（海思/昇腾）\n- 操作系统（鸿蒙 HarmonyOS）\n- 通信技术（5.5G/6G）\n- 智能驾驶\n\n申请条件：\n- 全球 Top 院校博士（部分方向接受硕士）\n- 有顶会论文或突出项目成果\n- 技术面试 5-7 轮，含高管面\n\n注意事项：\n- 不限国籍，但需能在国内工作\n- 团队和方向可自选\n- 全年滚动招聘，无固定截止日期',
        time: this.getTimeLabel(5)
      },
      // === 技巧 ===
      {
        id: 'n6', type: 'tip',
        title: '面试技巧：如何用STAR法则回答行为面试题',
        desc: '行为面试是留学生最容易失分的环节',
        content: '行为面试（Behavioral Interview）是求职面试中非常重要的环节，尤其在外企和大厂面试中占比很高。STAR 法则是回答行为面试题的黄金框架。\n\nSTAR 法则详解：\n\nS - Situation（情境）\n简要描述背景和环境。回答"在什么情况下？"\n示例：在上学期的小组项目中，我们团队负责开发一个数据可视化平台...\n\nT - Task（任务）\n说明你的职责和目标。回答"你需要做什么？"\n示例：我负责后端 API 设计和数据处理模块，需要在 3 周内完成...\n\nA - Action（行动）\n详细描述你采取的具体行动。这是最重要的部分，要突出个人贡献。\n示例：我主动调研了三种技术方案，组织了技术评审会，最终选择了...\n\nR - Result（结果）\n量化你的成果。用数据说话。\n示例：最终项目提前 2 天交付，性能提升了 40%，获得教授 A+ 评分...\n\n常见行为面试题：\n1. Tell me about a time you dealt with a conflict\n2. Describe a situation where you showed leadership\n3. Tell me about a time you failed and what you learned\n4. Describe a time you had to work under pressure\n\n准备技巧：\n- 提前准备 8-10 个高质量案例\n- 每个案例练习控制在 2-3 分钟\n- 录音练习，检查是否有逻辑跳跃',
        time: this.getTimeLabel(2)
      },
      {
        id: 'n7', type: 'tip',
        title: '简历优化：量化你的项目成果',
        desc: '用数据说话，让简历脱颖而出',
        content: '在简历中量化你的成果是让 HR 和面试官快速建立好感的最有效方式。以下是具体方法和示例。\n\n原则：用数字替代形容词\n\n差：优化了系统性能\n好：通过 Redis 缓存和 SQL 优化，将 API 响应时间从 800ms 降至 120ms，提升 85%\n\n差：负责用户增长\n好：策划并执行 3 场线上活动，新增注册用户 1.2 万，转化率提升 23%\n\n差：参与开发了一个网站\n好：独立开发前端模块（React + TypeScript），包含 15 个页面，代码覆盖率 92%\n\n量化维度：\n- 性能指标：响应时间、吞吐量、可用性\n- 业务指标：用户数、转化率、营收\n- 效率指标：节省时间、自动化率、代码行数\n- 规模指标：数据量、并发数、团队规模\n- 质量指标：Bug率、测试覆盖率、满意度\n\n没有数字怎么办：\n- 找相对值：比之前提升了多少\n- 找规模值：处理了多少数据、服务了多少用户\n- 找效率值：用多少时间完成、自动化了什么',
        time: this.getTimeLabel(3)
      },
      {
        id: 'n8', type: 'tip',
        title: 'System Design 面试：从0到1设计思路',
        desc: '掌握需求分析→高层设计→详细设计→瓶颈优化四步法',
        content: 'System Design 面试是中高级岗位的必考环节，对于 New Grad 也越来越常见。掌握以下四步法可以让你的回答有章法。\n\n第一步：需求分析（5分钟）\n- 功能需求：核心功能有哪些？\n- 非功能需求：QPS、延迟、可用性、一致性\n- 估算规模：DAU、存储量、带宽\n\n第二步：高层设计（10分钟）\n- 画出核心组件：Client → Load Balancer → API Server → Database\n- 确定数据流：读写路径分别是什么\n- 选择数据库：SQL vs NoSQL，为什么\n\n第三步：详细设计（15分钟）\n- 数据库 Schema 设计\n- API 接口设计\n- 核心算法（如 Feed 排序、ID 生成）\n- 缓存策略：什么数据缓存、过期策略\n\n第四步：瓶颈优化（10分钟）\n- 如何应对流量突增\n- 单点故障怎么处理\n- 如何水平扩展\n- 监控和报警方案\n\n常考题目：\n1. 设计短链接系统（TinyURL）\n2. 设计消息推送系统\n3. 设计新闻 Feed 流\n4. 设计分布式缓存\n5. 设计限流器（Rate Limiter）',
        time: this.getTimeLabel(4)
      },
      {
        id: 'n9', type: 'tip',
        title: '网申技巧：如何让你的简历通过 ATS 筛选',
        desc: '90%的简历被ATS系统淘汰，学会优化才能过关',
        content: 'ATS（Applicant Tracking System）是大多数公司用来自动筛选简历的系统。据统计，超过 90% 的简历在 ATS 阶段就被淘汰了。以下是通过 ATS 的关键技巧。\n\n1. 关键词匹配\n- 仔细阅读 JD，提取核心关键词\n- 在简历中自然地融入这些关键词\n- 使用 JD 中的原始用词，不要自作聪明改写\n\n2. 格式规范\n- 使用标准 Section 标题：Education、Experience、Skills\n- 避免使用表格、图片、图标\n- 用 PDF 格式提交（除非要求 Word）\n- 字体用 Arial/Calibri/Times New Roman\n\n3. 文件命名\n- 格式：姓名_岗位_学校.pdf\n- 不要用 "简历.pdf" 或 "resume_final_v3.pdf"\n\n4. 内容技巧\n- 每个经历用 3-5 个 bullet point\n- 动词开头：Developed, Implemented, Optimized\n- 技能列表与 JD 对齐\n- GPA 3.5+ 一定要写\n\n5. 检查工具\n- 使用 Jobscan 检测 ATS 匹配度\n- 让朋友用"关键词搜索"测试你的简历\n- 投递后 1-2 周没回复，可尝试 LinkedIn 联系 HR',
        time: this.getTimeLabel(5)
      },
      {
        id: 'n10', type: 'tip',
        title: '英文面试：常用表达句式和加分技巧',
        desc: '非母语面试者掌握这些句式能显著提升表现',
        content: '对于留学生来说，英文面试中的表达流畅度和专业性至关重要。以下是各场景的高频句式和技巧。\n\n自我介绍开场：\n- "I\'m currently a [degree] student at [school], majoring in [major]."\n- "My experience spans across [area1] and [area2]."\n- "I\'m particularly passionate about [topic] because..."\n\n回答技术问题：\n- "Let me think about this for a moment..." （争取思考时间）\n- "My approach would be to..." （展示思路）\n- "The trade-off here is..." （展示深度思考）\n- "To summarize my solution..." （收尾总结）\n\n不确定时：\n- "I\'m not 100% sure, but my understanding is..."\n- "I haven\'t worked with that specifically, but a similar problem I solved was..."\n- 不要说 "I don\'t know" 就停住，要展示你的思考过程\n\n提问环节：\n- "What does a typical day look like for this role?"\n- "How does the team approach code reviews?"\n- "What are the biggest challenges the team is facing right now?"\n\n加分技巧：\n1. Think out loud — 边想边说，让面试官看到你的思考过程\n2. 确认理解 — "Just to clarify, you\'re asking about...?"\n3. 用具体例子 — 不要空谈理论\n4. 适度放慢语速 — 清晰比速度更重要',
        time: this.getTimeLabel(6)
      },
      // === 数据 ===
      {
        id: 'n11', type: 'data',
        title: '薪资报告：CS硕士美国平均起薪达$125k',
        desc: '计算机相关专业留学生薪资持续上涨',
        content: '根据 2025-2026 最新薪资调研数据，计算机科学相关专业留学生在美国的平均起薪持续上涨。\n\n薪资概况（年薪，含 Base + Bonus）：\n\nCS 硕士 — 美国市场：\n- Software Engineer：$125k - $180k\n- Data Scientist：$115k - $160k\n- ML Engineer：$140k - $200k\n- Product Manager：$120k - $170k\n\n按公司层级：\n- FAANG/Big Tech：$150k - $220k（含 RSU）\n- 中大型科技公司：$120k - $160k\n- 创业公司：$100k - $140k（+期权）\n- 金融科技：$130k - $180k\n\n按城市：\n- 旧金山湾区：最高，但生活成本也最高\n- 西雅图：薪资接近湾区，无州所得税\n- 纽约：薪资前三，金融科技岗尤其高\n- Austin/Denver：薪资适中，性价比最高\n\n国内回国就业参考（月薪）：\n- 大厂（BAT/TMD）：25k - 45k\n- 外企（Google/Microsoft 中国）：30k - 50k\n- 独角兽：20k - 35k\n\n趋势分析：\nAI/ML 方向薪资涨幅最大（同比+15%），传统后端开发增长平稳（+5%）。',
        time: this.getTimeLabel(1)
      },
      {
        id: 'n12', type: 'data',
        title: '数据分析师岗位需求同比增长35%',
        desc: 'Python+SQL+Tableau成为数据岗标配技能',
        content: '根据多家招聘平台的最新数据，数据分析师（Data Analyst）岗位的市场需求同比增长 35%，成为增速最快的岗位之一。\n\n市场需求分析：\n- LinkedIn 上 DA 岗位发布量较去年同期增长 35%\n- Indeed 上相关搜索量增长 28%\n- 金融、电商、医疗健康行业需求最旺\n\n必备技能 Top 10：\n1. SQL（出现在 95% 的 JD 中）\n2. Python（85%）\n3. Excel/Google Sheets（80%）\n4. Tableau / Power BI（70%）\n5. 统计分析（65%）\n6. A/B Testing（55%）\n7. R 语言（40%）\n8. ETL / 数据管道（35%）\n9. Machine Learning 基础（30%）\n10. 沟通和 Presentation（90%）\n\n薪资范围：\n- 初级 DA：$65k - $85k/年\n- 中级 DA：$85k - $120k/年\n- Senior DA：$120k - $160k/年\n\n入行建议：\n- 刷 StrataScratch / LeetCode SQL\n- Kaggle 实战 2-3 个项目\n- 学习 Storytelling with Data（数据可视化叙事）',
        time: this.getTimeLabel(3)
      },
      {
        id: 'n13', type: 'data',
        title: '2026留学生就业报告：回国比例创新高',
        desc: '超60%的留学生选择回国发展，一线城市最受青睐',
        content: '根据最新发布的《2026海外留学人才就业趋势报告》，留学生回国发展的比例持续上升。\n\n核心数据：\n- 回国就业比例：62%（较去年提升 5 个百分点）\n- 首选城市：上海（28%）> 北京（22%）> 深圳（16%）> 杭州（12%）\n- 平均求职周期：2.3 个月\n\n行业分布：\n1. 互联网/科技：35%\n2. 金融/咨询：22%\n3. 制造业/新能源：15%\n4. 消费品/零售：10%\n5. 教育/医疗：8%\n6. 其他：10%\n\n薪资满意度：\n- 非常满意：12%\n- 比较满意：38%\n- 一般：35%\n- 不太满意：15%\n\n求职渠道有效性排名：\n1. 校招/专场（最有效）\n2. 内推\n3. 招聘网站（BOSS直聘/牛客/实习僧）\n4. 猎头\n5. 学校 Career Center',
        time: this.getTimeLabel(5)
      },
      // === 政策 ===
      {
        id: 'n14', type: 'policy',
        title: 'OPT/CPT政策更新：STEM延期最新指南',
        desc: '了解最新的STEM OPT延期政策和申请注意事项',
        content: 'STEM OPT Extension 是留学生在美国合法工作的重要途径。以下是 2026 年最新政策要点和申请指南。\n\n基本政策：\n- OPT 基础期限：12 个月\n- STEM 延期：额外 24 个月（共 36 个月）\n- 适用专业：CIP Code 属于 STEM 的学位\n\n申请时间线：\n- 最早：OPT 到期前 90 天\n- 最晚：OPT 到期前提交（到期后不可补交）\n- 审批时间：3-5 个月（期间可继续工作）\n\n关键要求：\n1. 雇主必须加入 E-Verify\n2. 岗位需与 STEM 学位直接相关\n3. 需提交 I-983 培训计划表\n4. 每 12 个月需雇主确认一次\n5. 失业时间不超过 150 天（累计）\n\n常见问题：\n- 换工作需要在 10 天内向 SEVP 报告\n- Cap-gap 政策：H1B 审批期间 OPT 自动延期\n- 二硕可以再次使用 OPT（如果是新的 STEM 专业）\n\n注意事项：\n- I-983 表要认真填写，不要模板化\n- 保留工资单等就业证明\n- 关注 USCIS 官网政策变更公告',
        time: this.getTimeLabel(2)
      },
      {
        id: 'n15', type: 'policy',
        title: 'H1B 签证抽签改革：一人一签新规详解',
        desc: '新规堵住多次注册漏洞，对留学生影响几何？',
        content: '美国移民局（USCIS）已实施 H1B 签证抽签改革，采用"一人一签"新规，替代此前的"一注册一抽签"模式。\n\n新规变化：\n- 旧规：雇主可为同一受益人多次注册，提交多份申请\n- 新规：每个受益人（护照号）只算一次抽签，无论几家公司提交\n- 目的：杜绝通过多次注册提高中签率的行为\n\n对留学生的影响：\n- 正面：竞争更公平，不再被"抽签工厂"稀释概率\n- 预估中签率提升至 25-30%（之前约 14-20%）\n- 真正有 offer 的人机会增大\n\n时间线：\n- 注册期：每年 3 月 1-20 日\n- 抽签结果：3 月底\n- 材料提交：中签后 90 天内\n- 生效日期：10 月 1 日\n\n备选方案（未中签）：\n1. 继续使用 OPT/STEM OPT\n2. 回学校读书（维持 F1）\n3. O1 签证（杰出人才）\n4. L1 签证（跨国公司调动）\n5. 考虑加拿大/新加坡等地机会',
        time: this.getTimeLabel(4)
      },
      {
        id: 'n16', type: 'policy',
        title: '国内落户政策：留学生一线城市落户指南',
        desc: '北上广深杭落户条件汇总，把握窗口期',
        content: '对于计划回国发展的留学生，户口是绑定购房、子女教育等重要资源的关键。以下是主要城市的最新留学生落户政策。\n\n上海：\n- 世界 Top 50 院校：直接落户\n- Top 51-100：6 个月社保 + 1 倍基数\n- 其他：12 个月社保 + 1.5 倍基数\n- 首次就业需在留学后 2 年内来沪\n\n北京：\n- 须硕士及以上学历\n- 留学 365 天以上\n- 回国后 2 年内递交申请\n- 用人单位需有落户指标\n\n深圳：\n- 本科以上学历直接落户\n- 补贴：本科 1.5 万、硕士 2.5 万、博士 3 万\n- 办理时间约 1-2 个月\n\n杭州：\n- 本科以上可直接落户\n- 应届硕士补贴 3 万 + 租房补贴\n- 创业另有资助\n\n广州：\n- 在国外获本科以上学位\n- 在广州缴纳社保即可\n- 流程最快 2-4 周\n\n通用注意事项：\n- 毕业证需做教育部学历认证\n- 社保连续缴纳非常重要，不能断\n- 建议先确定落户城市再签约工作\n- 部分城市要求公司注册资本 50 万以上',
        time: this.getTimeLabel(6)
      }
    ];

    // 合并并排序
    const allNews = [...personalNews, ...generalNews];

    this.setData({
      allNews,
      displayList: allNews
    });
  },

  // ======== 搜索 ========
  onSearchInput(e) {
    const kw = e.detail.value || '';
    this.setData({ searchKeyword: kw });
    this._applyFilter(this.data.currentTab, kw);
  },

  onSearchConfirm(e) {
    const kw = e.detail.value || '';
    this._applyFilter(this.data.currentTab, kw);
  },

  clearSearch() {
    this.setData({ searchKeyword: '', isSearching: false });
    this._applyFilter(this.data.currentTab, '');
  },

  _applyFilter(tab, keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    const list = this.data.allNews.filter(n =>
      (tab === 'all' || n.type === tab) &&
      (!kw || n.title.toLowerCase().includes(kw) || n.desc.toLowerCase().includes(kw))
    );
    this.setData({ displayList: list, isSearching: !!kw });
  },

  // ======== 分类切换 ========
  switchTab(e) {
    const tab = e.currentTarget.dataset.id;
    this.setData({ currentTab: tab });
    this._applyFilter(tab, this.data.searchKeyword);
  },

  // ======== 查看详情 ========
  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    const news = this.data.allNews.find(n => n.id === id);
    if (news) {
      wx.setStorageSync('currentNewsDetail', news);
      wx.navigateTo({ url: '/pages/news-detail/news-detail?id=' + id });
    }
  },

  // ======== 工具方法 ========
  getTimeLabel(offset) {
    const labels = ['刚刚', '1小时前', '2小时前', '3小时前', '5小时前', '今天', '昨天', '2天前'];
    return labels[offset] || '近期';
  },

  onShareAppMessage() {
    return {
      title: '求职快讯 - 留学生求职助手',
      path: '/pages/news/news'
    };
  }
});
