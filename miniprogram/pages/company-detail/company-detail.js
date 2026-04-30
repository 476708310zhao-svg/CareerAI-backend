// pages/company-detail/company-detail.js
const { searchCompanyJobs, getCompanyDetail, generateExperience, generateBatchExperiences, generateCompanyQuestions, sendChatToDeepSeek, normalizeCompanyLogo } = require('../../utils/api.js');
const { formatSalaryRange } = require('../../utils/util.js');
const safePage = require('../../behaviors/safe-page');

Page({
  behaviors: [safePage],
  data: {
    companyId: '',
    company: null,
    currentTab: 0,
    loading: true,
    jobsLoading: false,
    expLoading: false,
    introLoading: false,   // AI 自动生成公司简介时的 loading
    insightLoading: false,
    insight: null,
    tabs: ['职位', '面经', '薪资', 'AI洞察'],
  },

  onLoad(options) {
    const id = options.id;
    const name = options.name ? decodeURIComponent(options.name) : '';
    this.setData({ companyId: id });
    this.loadCompanyDetail(id, name);
  },

  getCompanyInitial(name) {
    const text = String(name || 'C').trim();
    return text ? text.slice(0, 1).toUpperCase() : 'C';
  },

  buildCompanyLogo(name) {
    if (!name) return '';
    return normalizeCompanyLogo(`/api/logo?name=${encodeURIComponent(name)}`);
  },

  loadCompanyDetail(id, name) {
    this.setData({ loading: true });

    getCompanyDetail(id, name).then(res => {
      const company = res && res.data;
      if (!company || !company.id) throw new Error('company not found');
      company.logo = company.logo || this.buildCompanyLogo(company.name);
      company.initial = this.getCompanyInitial(company.name);
      company.logoFailed = false;

      company.jobs = (company.jobs || []).map(job => ({
        id: job.id,
        title: job.title,
        salary: job.salary || 'Negotiable',
        type: job.job_type || job.type || 'Full-time',
        location: job.location || company.headquarters || '',
        company: company.name,
        logo: company.logo,
        companyInitial: company.initial,
        isReal: false
      }));
      company.experiences = (company.experiences || []).map(exp => ({
        id: exp.id,
        title: exp.title,
        type: exp.type || '面试',
        round: exp.round || '',
        likesCount: exp.likesCount || exp.likes_count || 0,
        createdAt: exp.createdAt || exp.created_at || ''
      }));
      company.salaries = company.salaries || [];

      this.setData({ company, loading: false });
      wx.setNavigationBarTitle({ title: company.name });
      if (!company.description) this.fetchAICompanyIntro(company.name);
      if (!company.jobs.length) this.fetchCompanyJobs(company.name);
      this.loadCachedExperiences(company.name);
    }).catch(() => {
      const fallback = {
        id: id || 0,
        name: name || '未知公司',
        logo: this.buildCompanyLogo(name || 'Company'),
        initial: this.getCompanyInitial(name || 'Company'),
        logoFailed: false,
        industry: '-',
        size: '-',
        description: '',
        founded: '-',
        headquarters: '-',
        tags: [],
        rating: 0,
        jobs: [],
        experiences: [],
        salaries: []
      };
      this.setData({ company: fallback, loading: false });
      wx.setNavigationBarTitle({ title: fallback.name });
      this.fetchAICompanyIntro(fallback.name);
      this.fetchCompanyJobs(fallback.name);
      this.loadCachedExperiences(fallback.name);
    });
    return;

    // ── 公司数据库（覆盖首页全部24家 + 常见公司）──
    const companies = {
      // 中国
      '1':  { id: 1,  name: '字节跳动', logo: '/images/bytedance.png',       industry: '互联网',   size: '10万+',    description: '全球领先的内容平台和AI公司，旗下产品包括抖音、TikTok、今日头条、飞书等。以算法推荐和AI技术见长。', founded: '2012', headquarters: '北京', tags: ['AI', '短视频', '社交'],     rating: 4.5 },
      '2':  { id: 2,  name: '腾讯',   logo: '/images/Tencent.png',          industry: '互联网',   size: '10万+',    description: '全球领先的互联网科技公司，旗下产品包括微信、QQ、腾讯云、腾讯游戏等。游戏和社交双龙头。', founded: '1998', headquarters: '深圳', tags: ['社交', '游戏', '云计算'],   rating: 4.6 },
      '3':  { id: 3,  name: '阿里巴巴', logo: '/images/Alibaba.png',          industry: '互联网',   size: '22万+',    description: '全球领先的电商和云计算公司，旗下产品包括淘宝、天猫、支付宝、阿里云、菜鸟等。', founded: '1999', headquarters: '杭州', tags: ['电商', '云计算', '支付'],   rating: 4.4 },
      '8':  { id: 8,  name: '美团',   logo: '/images/logo_meituan.png',     industry: '互联网',   size: '10万+',    description: '中国领先的生活服务电商平台，业务涵盖外卖、到店、酒旅、出行、医疗等。', founded: '2010', headquarters: '北京', tags: ['本地生活', '外卖', '零售'], rating: 4.1 },
      '9':  { id: 9,  name: '华为',   logo: '/images/default-company.png',  industry: '通信/ICT', size: '19万+',    description: '全球领先的ICT基础设施和智能终端提供商，深耕5G、鸿蒙OS、昇腾AI芯片等核心技术。', founded: '1987', headquarters: '深圳', tags: ['5G', '芯片', '鸿蒙'],       rating: 4.5 },
      '11': { id: 11, name: '拼多多', logo: '/images/default-company.png',  industry: '电商',     size: '1万+',     description: '中国第二大电商平台，以"砍一刀"社交拼团起家，旗下跨境电商Temu快速扩张全球。', founded: '2015', headquarters: '上海', tags: ['电商', '农业', '出海'],     rating: 4.0 },
      '12': { id: 12, name: '京东',   logo: '/images/logo_jd.png',          industry: '电商',     size: '50万+',    description: '中国领先的自营电商和供应链公司，以次日达物流和正品保障著称，布局云计算、AI、零售等。', founded: '2004', headquarters: '北京', tags: ['电商', '物流', '云计算'],   rating: 4.2 },
      '13': { id: 13, name: '快手',   logo: '/images/default-company.png',  industry: '互联网',   size: '3万+',     description: '中国第二大短视频平台，在下沉市场和直播电商领域有极强的用户粘性，海外产品 Kwai 持续扩张。', founded: '2011', headquarters: '北京', tags: ['短视频', '直播', '电商'],   rating: 4.0 },
      '14': { id: 14, name: '小米',   logo: '/images/default-company.png',  industry: '硬件/IoT', size: '3.5万+',   description: '全球领先的智能手机和IoT生态公司，小米汽车2024年正式量产，生态链产品覆盖全屋智能。', founded: '2010', headquarters: '北京', tags: ['手机', 'IoT', '新能源车'], rating: 4.2 },
      '15': { id: 15, name: '大疆',   logo: '/images/default-company.png',  industry: '无人机/机器人', size: '1.4万+', description: '全球领先的无人机和机器人企业，占据全球消费级无人机约70%市场份额，布局机器人和自动驾驶。', founded: '2006', headquarters: '深圳', tags: ['无人机', '机器人', '影像'], rating: 4.7 },
      '16': { id: 16, name: '百度',   logo: '/images/default-company.png',  industry: '互联网/AI', size: '4万+',    description: '中国最大搜索引擎，AI时代全面转型，文心大模型（ERNIE）、自动驾驶Apollo领跑国内AI。', founded: '2000', headquarters: '北京', tags: ['搜索', 'AI', '自动驾驶'],  rating: 4.0 },
      '17': { id: 17, name: '比亚迪', logo: '/images/default-company.png',  industry: '新能源/汽车', size: '70万+', description: '全球新能源汽车销量冠军，自研刀片电池、DM混动、仰望等技术平台，同时布局半导体业务。', founded: '1995', headquarters: '深圳', tags: ['新能源车', '电池', '半导体'], rating: 4.3 },
      '18': { id: 18, name: '滴滴',   logo: '/images/default-company.png',  industry: '出行',     size: '1.6万+',   description: '中国最大的出行平台，覆盖网约车、顺风车、代驾等多种出行方式，同时布局自动驾驶。', founded: '2012', headquarters: '北京', tags: ['出行', '自动驾驶', '物流'], rating: 3.9 },
      '19': { id: 19, name: '网易',   logo: '/images/default-company.png',  industry: '互联网/游戏', size: '2.5万+', description: '中国知名互联网公司，游戏（阴阳师、原神竞品）、教育（有道）、音乐（网易云）、电商（严选）多线布局。', founded: '1997', headquarters: '杭州', tags: ['游戏', '教育', '音乐'],     rating: 4.1 },
      '20': { id: 20, name: '蔚来',   logo: '/images/default-company.png',  industry: '新能源/汽车', size: '3万+',  description: '高端智能电动汽车品牌，以换电模式和NIO Life用户社区著称，旗下乐道、萤火虫品牌覆盖大众市场。', founded: '2014', headquarters: '上海', tags: ['新能源车', '换电', '智能驾驶'], rating: 4.0 },
      '21': { id: 21, name: '商汤科技', logo: '/images/default-company.png', industry: 'AI',      size: '5000+',    description: '亚洲最大的AI视觉技术公司，在人脸识别、自动驾驶、AIGC等领域有深厚积累，布局大模型日日新。', founded: '2014', headquarters: '上海', tags: ['AI视觉', '大模型', 'AIGC'],  rating: 4.2 },
      // 北美
      '4':  { id: 4,  name: 'Google',    logo: '/images/logo_google.png',      industry: 'Tech',     size: '180,000+', description: 'Leading global technology company known for Search, Maps, YouTube, Android, and Google Cloud. Pioneer in AI with Gemini.', founded: '1998', headquarters: 'Mountain View, CA', tags: ['Search', 'AI', 'Cloud'],     rating: 4.7 },
      '5':  { id: 5,  name: 'Meta',      logo: '/images/default-company.png',  industry: 'Tech',     size: '80,000+',  description: 'Social media and metaverse technology company. Operates Facebook, Instagram, WhatsApp, and is leading investment in AR/VR (Quest).', founded: '2004', headquarters: 'Menlo Park, CA',  tags: ['Social', 'VR', 'AI'],        rating: 4.3 },
      '6':  { id: 6,  name: 'Amazon',    logo: '/images/default-company.png',  industry: 'Tech',     size: '1,500,000+', description: 'Global e-commerce and cloud computing leader. AWS dominates cloud infrastructure. Also expanding in healthcare, logistics, and AI.', founded: '1994', headquarters: 'Seattle, WA',       tags: ['E-commerce', 'AWS', 'AI'],   rating: 4.2 },
      '7':  { id: 7,  name: 'Apple',     logo: '/images/default-company.png',  industry: 'Tech',     size: '160,000+', description: "World's most valuable company. Creator of iPhone, Mac, iPad, and the App Store ecosystem. Advancing Apple Intelligence (AI) in iOS 18.", founded: '1976', headquarters: 'Cupertino, CA',     tags: ['Hardware', 'iOS', 'AI'],     rating: 4.8 },
      '10': { id: 10, name: 'Microsoft', logo: '/images/default-company.png',  industry: 'Tech',     size: '220,000+', description: 'Global tech corporation leading in cloud (Azure), productivity (Microsoft 365), and AI via OpenAI partnership and Copilot products.', founded: '1975', headquarters: 'Redmond, WA',       tags: ['Cloud', 'AI', 'Enterprise'], rating: 4.6 },
      '22': { id: 22, name: 'Netflix',   logo: '/images/default-company.png',  industry: 'Entertainment/Tech', size: '13,000+', description: 'World\'s leading streaming entertainment platform with 270M+ subscribers. Expanding into gaming and live events. Known for high-performance engineering culture.', founded: '1997', headquarters: 'Los Gatos, CA',     tags: ['Streaming', 'AI', 'Gaming'], rating: 4.4 },
      '23': { id: 23, name: 'Uber',      logo: '/images/default-company.png',  industry: 'Tech',     size: '32,000+',  description: 'Global ride-sharing and food delivery platform (Uber Eats). Operates in 70+ countries. Advancing in autonomous vehicles and logistics.', founded: '2009', headquarters: 'San Francisco, CA',  tags: ['Mobility', 'Delivery', 'AI'], rating: 4.0 },
      '24': { id: 24, name: 'Stripe',    logo: '/images/default-company.png',  industry: 'Fintech',  size: '8,000+',   description: 'Leading global payments infrastructure company. Powers payments for millions of businesses. Known for developer-first culture and strong engineering.', founded: '2010', headquarters: 'San Francisco, CA',  tags: ['Payments', 'Fintech', 'API'], rating: 4.5 }
    };

    let company = companies[id];
    if (!company && name) {
      company = Object.values(companies).find(c => c.name === name);
    }
    // 未收录公司：生成占位，后台用 AI 补充简介
    if (!company) {
      company = { id: 0, name: name || '未知公司', logo: '/images/default-company.png', industry: '-', size: '-', description: '', founded: '-', headquarters: '-', tags: [], rating: 0 };
    }

    // 初始化空数据，后续通过 API 填充
    company.jobs = [];
    company.experiences = [];
    company.salaries = [
      { position: '产品经理', avgSalary: '35k', range: '25k-45k', samples: 128 },
      { position: 'Software Engineer', avgSalary: '$160k', range: '$140k-$180k', samples: 256 },
      { position: '数据分析师', avgSalary: '28k', range: '20k-35k', samples: 86 }
    ];

    this.setData({ company, loading: false });
    wx.setNavigationBarTitle({ title: company.name });

    // 未收录公司：AI 自动补充简介
    if (!company.description) {
      this.fetchAICompanyIntro(company.name);
    }

    // 异步加载真实岗位数据
    this.fetchCompanyJobs(company.name);
    // 加载缓存的AI面经
    this.loadCachedExperiences(company.name);
  },

  // ======== AI 自动生成公司简介（未收录公司兜底）========
  fetchAICompanyIntro(companyName) {
    // 先读缓存
    const cacheKey = 'aiIntro_' + companyName;
    const cached = wx.getStorageSync(cacheKey);
    if (cached) {
      this.setData({ 'company.description': cached });
      return;
    }

    this.setData({ introLoading: true });
    sendChatToDeepSeek([
      { role: 'system', content: '你是一个企业信息助手，用简洁中文介绍公司，控制在100字以内，不要输出任何多余内容。' },
      { role: 'user', content: `请简要介绍"${companyName}"公司：主营业务、行业地位、代表产品。` }
    ]).then(res => {
      const intro = res?.choices?.[0]?.message?.content?.trim() || '';
      if (intro) {
        wx.setStorageSync(cacheKey, intro);
        this._safeSetData({ 'company.description': intro, introLoading: false });
      } else {
        this._safeSetData({ introLoading: false });
      }
    }).catch(() => {
      this._safeSetData({ introLoading: false });
    });
  },

  // ======== JSearch API 获取真实岗位 ========
  fetchCompanyJobs(companyName) {
    this.setData({ jobsLoading: true });

    searchCompanyJobs(companyName).then(res => {
      let jobs = [];
      if (res.data && res.data.length > 0) {
        jobs = res.data.slice(0, 8).map(job => {
          const salary = formatSalaryRange(job.job_min_salary, job.job_max_salary);
          return {
            id: job.job_id,
            title: job.job_title,
            salary: salary,
            type: job.job_employment_type || 'Full-time',
            location: (job.job_city || 'Remote') + (job.job_state ? ', ' + job.job_state : ''),
            company: companyName,
            logo: this.data.company.logo,
            companyInitial: this.data.company.initial,
            isReal: true
          };
        });
      }

      // 如果 API 无结果，用兜底数据
      if (jobs.length === 0) {
        jobs = this._getMockJobs(companyName);
      }

      this._safeSetData({ 'company.jobs': jobs, jobsLoading: false });
    }).catch(() => {
      this._safeSetData({ 'company.jobs': this._getMockJobs(companyName), jobsLoading: false });
    });
  },

  _getMockJobs(companyName) {
    const hq = this.data.company.headquarters || '';
    const logo = this.data.company.logo;
    const companyInitial = this.data.company.initial || this.getCompanyInitial(companyName);
    return [
      { id: 'cj1', title: 'Software Engineer', salary: 'Negotiable', type: 'Full-time', location: hq, company: companyName, logo, companyInitial },
      { id: 'cj2', title: 'Product Manager', salary: 'Negotiable', type: 'Full-time', location: hq, company: companyName, logo, companyInitial },
      { id: 'cj3', title: 'Data Analyst', salary: 'Negotiable', type: 'Full-time', location: hq, company: companyName, logo, companyInitial }
    ];
  },

  // ======== AI 生成面经 ========
  loadCachedExperiences(companyName) {
    // 从缓存加载之前AI生成的面经
    const cacheKey = 'aiExp_' + companyName;
    const cached = wx.getStorageSync(cacheKey) || [];
    if (cached.length > 0) {
      this.setData({ 'company.experiences': cached });
    } else {
      // 显示默认模板
      this.setData({
        'company.experiences': [
          { id: 1, title: companyName + ' 产品经理一面经验', type: '面试', round: '一面', likesCount: 234, createdAt: '2026-01-04' },
          { id: 2, title: companyName + ' 技术面试真题汇总', type: '笔试', round: '', likesCount: 156, createdAt: '2026-01-02' }
        ]
      });
    }
  },

  aiGenerateExperience() {
    const company = this.data.company;
    if (!company) return;

    this.setData({ expLoading: true });

    // 使用批量面经生成（一面/二面/HR面三轮）
    generateBatchExperiences(company.name, '', ['一面', '二面', 'HR面']).then(exps => {
      if (!exps || exps.length === 0) {
        // 降级为单篇生成
        return generateExperience(company.name).then(exp => exp ? [exp] : []);
      }
      return exps;
    }).then(exps => {
      if (!exps || exps.length === 0) {
        if (!this._unmounted) wx.showToast({ title: '生成失败，请重试', icon: 'none' });
        this._safeSetData({ expLoading: false });
        return;
      }

      const newExps = exps.map((exp, i) => ({
        id: Date.now() + i,
        title: exp.title || company.name + ' ' + (exp.round || '面试') + '经验',
        type: exp.type || '面试',
        round: exp.round || '',
        duration: exp.duration || '',
        format: exp.format || '',
        questions: exp.questions || [],
        difficulty: exp.difficulty || '中等',
        result: exp.result || '',
        likesCount: 0,
        createdAt: new Date().toISOString().slice(0, 10),
        content: exp.content || '',
        tags: exp.tags || [company.name],
        tips: exp.tips || '',
        isAI: true
      }));

      const experiences = [...newExps, ...this.data.company.experiences];
      this._safeSetData({ 'company.experiences': experiences, expLoading: false });

      const cacheKey = 'aiExp_' + company.name;
      wx.setStorageSync(cacheKey, experiences);
      if (!this._unmounted) wx.showToast({ title: '面经已生成', icon: 'success' });
    }).catch(() => {
      this._safeSetData({ expLoading: false });
      if (!this._unmounted) wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  switchTab(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ currentTab: idx });
    if (idx === 3 && !this.data.insight && !this.data.insightLoading) {
      this.fetchAIInsight(this.data.company.name);
    }
  },

  // ======== AI 公司洞察（面试风格/高频题/求职建议）========
  fetchAIInsight(companyName) {
    const cacheKey = 'aiInsight_' + companyName;
    const cached = wx.getStorageSync(cacheKey);
    if (cached) {
      this._safeSetData({ insight: cached });
      return;
    }
    this._safeSetData({ insightLoading: true });
    sendChatToDeepSeek([
      { role: 'system', content: '你是一位资深求职顾问，熟悉各大公司面试风格和求职攻略。请严格按JSON格式输出，不要输出任何JSON之外的内容。' },
      { role: 'user', content: `请为"${companyName}"生成公司求职洞察报告。严格按以下JSON格式输出：\n{"background":"公司核心业务和行业地位（100字以内）","interview_style":"面试流程和考察重点（80字以内）","frequent_questions":["高频题1","高频题2","高频题3","高频题4","高频题5"],"tips":["求职建议1","求职建议2","求职建议3"]}` }
    ]).then(res => {
      const content = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      try {
        const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          const insight = JSON.parse(match[0]);
          wx.setStorageSync(cacheKey, insight);
          this._safeSetData({ insight, insightLoading: false });
          return;
        }
      } catch (e) {}
      this._safeSetData({ insightLoading: false });
    }).catch(() => {
      this._safeSetData({ insightLoading: false });
    });
  },

  fetchAIInsightBtn() {
    this.fetchAIInsight(this.data.company.name);
  },

  refreshInsight() {
    const companyName = this.data.company.name;
    wx.removeStorageSync('aiInsight_' + companyName);
    this._safeSetData({ insight: null });
    this.fetchAIInsight(companyName);
  },

  goToJobDetail(e) {
    const id = e.currentTarget.dataset.id;
    const jobs = (this.data.company && this.data.company.jobs) || [];
    const job = jobs.find(item => String(item.id) === String(id));
    if (job && this.data.company) {
      const snapshot = {
        id: job.id,
        title: job.title,
        company: this.data.company.name,
        logo: job.logo || this.data.company.logo,
        logoFailed: !!this.data.company.logoFailed,
        companyInitial: job.companyInitial || this.data.company.initial,
        city: job.location,
        type: job.type,
        salary: job.salary,
        postedAt: job.isReal ? 'Recently posted' : ''
      };
      wx.setStorageSync('tempJobDetail', snapshot);
      wx.setStorageSync('jobDetailSnapshot_' + String(id), snapshot);
    }
    wx.navigateTo({ url: '/pages/job-detail/job-detail?id=' + id });
  },

  onCompanyLogoError() {
    this.setData({ 'company.logoFailed': true });
  },

  goToExperienceDetail(e) {
    const id = e.currentTarget.dataset.id;
    const exp = this.data.company.experiences.find(x => x.id === id);
    if (exp && exp.isAI && exp.content) {
      // AI生成的面经：存到临时缓存后跳转
      wx.setStorageSync('tempExpDetail', exp);
      wx.navigateTo({ url: '/pages/experience-detail/experience-detail?id=aiTemp' });
    } else {
      wx.navigateTo({ url: '/pages/experience-detail/experience-detail?id=' + id });
    }
  },

  toggleFavorite() {
    const isFav = this.data.company.isFavorited;
    this.setData({ 'company.isFavorited': !isFav });
    wx.showToast({ title: isFav ? '已取消收藏' : '已收藏', icon: 'none' });
  },

  onShareAppMessage() {
    return {
      title: (this.data.company ? this.data.company.name : '') + ' - 留学生求职助手',
      path: '/pages/company-detail/company-detail?id=' + this.data.companyId
    };
  }
});
