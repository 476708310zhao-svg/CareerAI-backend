// pages/ai-history/ai-history.js
const { formatDate } = require('../../../utils/util.js');

Page({
  data: {
    records: [],
    isLoading: true,
    activeTab: 'history', // 'history' | 'bookmarks' | 'audio'
    bookmarks: [],
    audioHistory: [],
    dueCount: 0,
    bestScore: 0
  },

  onLoad(options = {}) {
    if (options.tab === 'audio') {
      this.setData({ activeTab: 'audio' });
    }
    this.loadHistory();
  },

  onShow() {
    this.loadHistory();
  },

  loadHistory() {
    this.setData({ isLoading: true });

    // 从 localStorage 读取真实面试记录
    const history = wx.getStorageSync('interviewHistory') || [];

    if (history.length > 0) {
      // 按时间倒序排列
      const records = history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).map((item, idx) => {
        const timeStr = formatDate(item.timestamp ? item.timestamp : Date.now());

        // 计算面试时长
        let duration = '未知';
        if (item.duration) {
          duration = item.duration;
        } else if (item.questionCount) {
          duration = `约${item.questionCount * 3}分钟`;
        }

        // 提取标签
        let tags = item.tags || [];
        if (tags.length === 0) {
          if (item.position) tags.push(item.position);
          if (item.interviewType) tags.push(item.interviewType === 'tech' ? '技术面' : (item.interviewType === 'behavior' ? '行为面' : item.interviewType));
          if (item.difficulty) tags.push(item.difficulty === 'hard' ? '困难' : (item.difficulty === 'medium' ? '中等' : '简单'));
        }
        const report = item.reportKey ? wx.getStorageSync(item.reportKey) : null;
        const dimensions = report && Array.isArray(report.dimensions) ? report.dimensions : [];
        const lowestDimension = item.lowestDimension || dimensions.slice().sort((a, b) => (a.score || 0) - (b.score || 0))[0] || null;
        const weakCount = item.weakCount !== undefined
          ? item.weakCount
          : (report && Array.isArray(report.weakQuestions)
            ? report.weakQuestions.length
            : (report && Array.isArray(report.qaList) ? report.qaList.filter(q => Number(q.score || 0) < 80).length : 0));
        const actionPlan = report && Array.isArray(report.actionPlan) ? report.actionPlan : [];
        const nextAction = item.nextAction || (actionPlan[0] && actionPlan[0].title) || '';

        return {
          id: item.id || `hist_${idx}`,
          role: item.position || item.company || '模拟面试',
          company: item.company || '',
          time: timeStr,
          duration: duration,
          score: item.score || item.overallScore || 0,
          tags: tags,
          reportKey: item.reportKey || '',
          weakCount,
          nextAction,
          lowestDimension
        };
      });

      this.setData({
        records,
        bestScore: records.reduce((max, item) => Math.max(max, item.score || 0), 0),
        isLoading: false
      });
    } else {
      this.setData({ records: [], bestScore: 0, isLoading: false });
    }

    // 同步加载错题本，计算复习计划
    this._loadBookmarks();
    this._loadAudioHistory();
  },

  _loadBookmarks() {
    const today = new Date().toISOString().slice(0, 10);
    const raw = wx.getStorageSync('bookmarkedQuestions') || [];

    const bookmarks = raw.map(b => {
      // 初始复习间隔：低分1天，中分3天，高分7天
      const interval = b.reviewInterval || (b.score < 60 ? 1 : b.score < 80 ? 3 : 7);
      const reviewedAt = b.reviewedAt || b.savedAt || today;
      const nextReviewDate = this._addDays(reviewedAt, interval);
      const isDue = nextReviewDate <= today;
      return { ...b, reviewInterval: interval, reviewedAt, nextReviewDate, isDue };
    });

    // 排序：待复习的优先，再按到期日期升序
    bookmarks.sort((a, b) => {
      if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
      return a.nextReviewDate.localeCompare(b.nextReviewDate);
    });

    const dueCount = bookmarks.filter(b => b.isDue).length;
    this.setData({ bookmarks, dueCount });
  },

  _loadAudioHistory() {
    const audioHistory = (wx.getStorageSync('audioReviewHistory') || []).map(item => {
      const analysis = item.analysis || {};
      return {
        ...item,
        analysis: {
          fluency: analysis.fluency || {},
          content: analysis.content || {},
          confidence: analysis.confidence || {},
          overall: analysis.overall || 0,
          summary: analysis.summary || ''
        }
      };
    });
    this.setData({ audioHistory });
  },

  _addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  },

  // 标记某题已复习，间隔翻倍（上限30天）
  markReviewed(e) {
    const qid = e.currentTarget.dataset.qid;
    let bqs = wx.getStorageSync('bookmarkedQuestions') || [];
    const idx = bqs.findIndex(b => b.qid === qid);
    if (idx >= 0) {
      const b = bqs[idx];
      const newInterval = Math.min((b.reviewInterval || 1) * 2, 30);
      bqs[idx] = {
        ...b,
        reviewedAt: new Date().toISOString().slice(0, 10),
        reviewInterval: newInterval
      };
      wx.setStorageSync('bookmarkedQuestions', bqs);
    }
    this._loadBookmarks();
    wx.showToast({ title: '已标记复习完成', icon: 'success' });
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  removeBookmark(e) {
    const qid = e.currentTarget.dataset.qid;
    wx.showModal({
      title: '移除收藏',
      content: '确认从错题本中移除此题？',
      success: (res) => {
        if (!res.confirm) return;
        let bqs = wx.getStorageSync('bookmarkedQuestions') || [];
        bqs = bqs.filter(b => b.qid !== qid);
        wx.setStorageSync('bookmarkedQuestions', bqs);
        this._loadBookmarks();
        wx.showToast({ title: '已移除', icon: 'none' });
      }
    });
  },

  clearBookmarks() {
    wx.showModal({
      title: '清空错题本',
      content: '确认清空所有收藏题目？',
      success: (res) => {
        if (!res.confirm) return;
        wx.removeStorageSync('bookmarkedQuestions');
        this.setData({ bookmarks: [], dueCount: 0 });
        wx.showToast({ title: '已清空', icon: 'success' });
      }
    });
  },

  // 跳转到详细报告页
  viewReport(e) {
    const item = e.currentTarget.dataset;
    const id = item.id;
    const reportKey = item.reportkey || '';

    // 如果有对应的报告缓存，先设置到 lastAiReport 以便报告页读取
    if (reportKey) {
      const report = wx.getStorageSync(reportKey);
      if (report) {
        wx.setStorageSync('lastAiReport', report);
      }
    }

    wx.navigateTo({
      url: `/package-ai/pages/ai-report/ai-report?id=${id}`,
      fail: () => {
        wx.showToast({ title: '报告页面不存在', icon: 'none' });
      }
    });
  },

  goToInterview() {
    wx.navigateTo({ url: '/package-ai/pages/interview-setup/interview-setup' });
  },

  goToAudioReview() {
    wx.navigateTo({ url: '/package-ai/pages/audio-review/audio-review' });
  },

  // 清空历史记录
  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '将删除所有面试记录，此操作不可恢复',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('interviewHistory');
          this.setData({ records: [], bestScore: 0 });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  }
})
