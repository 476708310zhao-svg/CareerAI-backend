// pages/news-detail/news-detail.js
const ACTION_DEFAULTS = {
  resume: { label: '优化简历', url: '/package-career/pages/resume/resume' },
  jd_match: { label: '做 JD 匹配', url: '/package-ai/pages/jd-match/jd-match' },
  interview: { label: '开始面试训练', url: '/package-ai/pages/interview-setup/interview-setup' },
  application: { label: '准备投递材料', url: '/package-ai/pages/ai-assistant/ai-assistant?action=application' },
  link: { label: '查看来源', url: '' }
};

Page({
  data: {
    news: null,
    typeLabel: { news: '资讯', tip: '技巧', data: '数据', policy: '政策' },
    typeBgMap: { news: '#FA8C16', tip: '#2B5CE6', data: '#059669', policy: '#6C5CE7' }
  },

  onLoad(options) {
    const news = this.normalizeNews(wx.getStorageSync('currentNewsDetail'));
    if (news) {
      this.setData({ news });
      wx.setNavigationBarTitle({ title: news.title });
    } else {
      wx.showToast({ title: '内容加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  normalizeNews(raw) {
    if (!raw || !raw.title) return null;
    const news = Object.assign({}, raw);
    news.type = news.type || 'news';
    news.time = news.time || '刚刚';
    news.desc = news.desc || news.summary || news.description || '';
    news.tags = this.normalizeList(news.tags);
    news.targetRoles = this.normalizeList(news.targetRoles || news.target_roles);
    news.targetRegions = this.normalizeList(news.targetRegions || news.target_regions);
    news.action = this.normalizeAction(news);
    const content = news.content || news.body || news.article || news.detail || '';
    news.content = content && content !== news.desc ? content : this.buildFallbackContent(news);
    return news;
  },

  normalizeList(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    const text = String(value || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (e) {}
    return text.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean);
  },

  normalizeAction(news) {
    const raw = news.action || {};
    const type = raw.type || news.actionType || news.action_type || '';
    const defaults = ACTION_DEFAULTS[type] || {};
    const label = raw.label || news.actionLabel || news.action_label || defaults.label || '';
    const url = raw.url || news.actionUrl || news.action_url || defaults.url || (type === 'link' ? (news.sourceUrl || news.url || '') : '');
    if (!label && !url) return null;
    return { type: type || 'link', label: label || '继续行动', url };
  },

  buildFallbackContent(news) {
    const title = news.title || '求职快讯';
    const desc = news.desc || '这条快讯暂未提供完整正文。';
    const type = news.type || 'news';
    const templates = {
      news: [
        '这条招聘资讯的核心信息如下：',
        '1. 关注时间节点：如果标题中包含申请截止、开放申请或倒计时，请优先确认官网投递入口和截止日期。',
        '2. 准备岗位材料：建议同步准备中英文简历、项目经历说明，以及与岗位匹配的技能关键词。',
        '3. 面试准备方向：技术岗优先准备算法、项目深挖和行为面试；非技术岗重点准备业务理解、案例拆解和动机表达。',
        '4. 下一步行动：可以先收藏目标公司，再到职位页搜索相关岗位，避免错过投递窗口。'
      ],
      tip: [
        '这条技巧内容适合直接落到求职动作里：',
        '1. 先把方法拆成可执行清单，今天完成其中 1-2 项。',
        '2. 用真实经历替代泛泛描述，尽量加入数字、结果和你的个人贡献。',
        '3. 如果用于面试回答，建议整理成 STAR 结构，并控制在 2 分钟以内。',
        '4. 如果用于简历优化，优先改最近一段经历和最匹配目标岗位的项目。'
      ],
      data: [
        '这条数据趋势可以这样理解：',
        '1. 先判断趋势是否与你的目标岗位、地区和毕业时间匹配。',
        '2. 如果岗位需求上涨，尽快补齐 JD 高频技能，并用项目证明能力。',
        '3. 如果竞争加剧，建议扩大投递范围，同时提高内推和定向沟通比例。',
        '4. 数据只能辅助判断，最终仍要结合公司官网、招聘平台和校招日历确认。'
      ],
      policy: [
        '这条政策信息建议重点关注：',
        '1. 确认适用人群：学历、毕业时间、签证身份或落户城市是否符合要求。',
        '2. 确认关键材料：成绩单、学历认证、雇主证明、社保或签证文件是否齐备。',
        '3. 确认时间窗口：政策类事项通常有申请期限或连续缴纳要求，尽量提前规划。',
        '4. 重要决策前请以官方公告或学校/雇主的最新说明为准。'
      ]
    };

    return [
      title,
      '',
      desc,
      '',
      ...(templates[type] || templates.news)
    ].join('\n');
  },

  onBack() {
    wx.navigateBack();
  },

  onCopyLink() {
    const url = this.data.news && this.data.news.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
  },

  onPrimaryAction() {
    const action = this.data.news && this.data.news.action;
    const url = action && action.url;
    if (!url) {
      wx.showToast({ title: '暂无可打开链接', icon: 'none' });
      return;
    }

    if (/^https?:\/\//i.test(url)) {
      wx.navigateTo({ url: '/package-content/pages/webview/webview?url=' + encodeURIComponent(url) });
      return;
    }

    if (url.charAt(0) === '/') {
      wx.navigateTo({
        url,
        fail: () => wx.switchTab({
          url,
          fail: () => wx.showToast({ title: '暂时无法打开', icon: 'none' })
        })
      });
      return;
    }

    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
  },

  onShareAppMessage() {
    const news = this.data.news;
    return {
      title: news ? news.title : '求职快讯',
      path: '/package-content/pages/news/news'
    };
  }
});
