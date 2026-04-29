// pages/interview-bank/interview-bank.js
const api = require('../../utils/api.js');
const sendChatToDeepSeek = api.sendChatToDeepSeek;

const DIFF_LABELS  = { easy: '简单', medium: '中等', hard: '困难' };
const TYPE_LABELS  = { behavior: '行为面', technical: '技术面', case: '案例面', product: '产品面' };
const DIFF_COLORS  = { easy: '#059669', medium: '#F59E0B', hard: '#EF4444' };

Page({
  data: {
    allQuestions:  [],
    filtered:      [],
    bookmarked:    [],

    activeTab:       'all',   // 'all' | 'bookmarks' | 'custom'
    searchKey:       '',
    filterCompany:   '',
    filterRole:      '',
    filterDifficulty:'',
    filterType:      '',

    companies:   [],
    roles:       [],
    showFilter:  false,
    totalCount:  0,
    bookmarkCount: 0,
    expandedQid: '',

    // Add-question modal
    showAddModal: false,
    addForm: { question: '', answer: '', company: '', role: '', difficulty: 'medium', interviewType: 'behavior' },

    // AI analyse state
    analysingQid: '',
  },

  onLoad()  { this._harvest(); },
  onShow()  { this._harvest(); },

  /* ──────────────────────────────────────────
     Data loading
  ────────────────────────────────────────── */
  _harvest() {
    const history = wx.getStorageSync('interviewHistory') || [];
    const questions = [];

    history.forEach(h => {
      const reportKey = h.reportKey || ('aiReport_' + h.id);
      const report = wx.getStorageSync(reportKey);
      if (report && Array.isArray(report.qaList)) {
        report.qaList.forEach((qa, i) => {
          if (!qa.q) return;
          questions.push({
            qid:           `${h.id}_q${i}`,
            question:      qa.q,
            answer:        qa.a   || '',
            feedback:      qa.feedback || '',
            score:         qa.score || 0,
            company:       h.company   || '',
            role:          h.position  || '',
            interviewType: h.interviewType || '',
            difficulty:    h.difficulty || 'medium',
            timestamp:     h.timestamp  || 0,
            source:        'auto',
            typeLabel:     TYPE_LABELS[h.interviewType] || '综合',
            diffLabel:     DIFF_LABELS[h.difficulty]    || '中等',
            diffColor:     DIFF_COLORS[h.difficulty]    || '#F59E0B',
            bookmarked:    false,
          });
        });
      }
    });

    // Custom questions
    const custom = wx.getStorageSync('bankCustomQuestions') || [];
    custom.forEach(q => {
      questions.push({
        ...q,
        source:    'custom',
        typeLabel: TYPE_LABELS[q.interviewType] || '自定义',
        diffLabel: DIFF_LABELS[q.difficulty]    || '中等',
        diffColor: DIFF_COLORS[q.difficulty]    || '#F59E0B',
      });
    });

    // Mark bookmarked
    const bqsRaw = wx.getStorageSync('bookmarkedQuestions') || [];
    const bqSet  = new Set(bqsRaw.map(b => b.qid));
    questions.forEach(q => { q.bookmarked = bqSet.has(q.qid); });

    // Deduplicate
    const seen   = new Set();
    const unique = questions.filter(q => { if (seen.has(q.qid)) return false; seen.add(q.qid); return true; });

    // Build filter options
    const companies = [...new Set(unique.map(q => q.company).filter(Boolean))];
    const roles     = [...new Set(unique.map(q => q.role).filter(Boolean))];

    // Full bookmark objects (merge with harvest)
    const bookmarked = bqsRaw.map(b => {
      const full = unique.find(q => q.qid === b.qid) || b;
      return { ...full, ...b, bookmarked: true };
    });

    this.setData({
      allQuestions:  unique,
      bookmarked,
      companies,
      roles,
      totalCount:    unique.length,
      bookmarkCount: bookmarked.length,
    });
    this._applyFilter();
  },

  _applyFilter() {
    const { allQuestions, bookmarked, activeTab, searchKey, filterCompany, filterRole, filterDifficulty, filterType } = this.data;

    let list = activeTab === 'bookmarks' ? bookmarked
              : activeTab === 'custom'   ? allQuestions.filter(q => q.source === 'custom')
              : allQuestions;

    if (searchKey) {
      const kw = searchKey.toLowerCase();
      list = list.filter(q => (q.question || '').toLowerCase().includes(kw) || (q.company || '').toLowerCase().includes(kw));
    }
    if (filterCompany)   list = list.filter(q => q.company   === filterCompany);
    if (filterRole)      list = list.filter(q => q.role      === filterRole);
    if (filterDifficulty)list = list.filter(q => q.difficulty === filterDifficulty);
    if (filterType)      list = list.filter(q => q.interviewType === filterType);

    this.setData({ filtered: list });
  },

  /* ──────────────────────────────────────────
     Interactions
  ────────────────────────────────────────── */
  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab }, () => this._applyFilter());
  },

  onSearch(e) {
    this.setData({ searchKey: e.detail.value }, () => this._applyFilter());
  },

  toggleFilter() {
    this.setData({ showFilter: !this.data.showFilter });
  },

  setFilter(e) {
    const { key, val } = e.currentTarget.dataset;
    this.setData({ [key]: this.data[key] === val ? '' : val }, () => this._applyFilter());
  },

  clearFilter() {
    this.setData({ filterCompany: '', filterRole: '', filterDifficulty: '', filterType: '' }, () => this._applyFilter());
  },

  toggleExpand(e) {
    const qid = e.currentTarget.dataset.qid;
    this.setData({ expandedQid: this.data.expandedQid === qid ? '' : qid });
  },

  toggleBookmark(e) {
    const qid = e.currentTarget.dataset.qid;
    const q   = this.data.allQuestions.find(x => x.qid === qid)
             || this.data.bookmarked.find(x => x.qid === qid);
    if (!q) return;

    let bqs = wx.getStorageSync('bookmarkedQuestions') || [];
    const idx = bqs.findIndex(b => b.qid === qid);
    if (idx >= 0) {
      bqs.splice(idx, 1);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      bqs.unshift({ ...q, savedAt: new Date().toISOString().slice(0, 10), reviewInterval: q.score < 60 ? 1 : 3 });
      wx.showToast({ title: '已加入错题本', icon: 'success' });
    }
    wx.setStorageSync('bookmarkedQuestions', bqs);
    this._harvest();
  },

  practiceQuestion(e) {
    const q = e.currentTarget.dataset.question;
    wx.navigateTo({ url: `/pages/interview-setup/interview-setup?autoQuestion=${encodeURIComponent(q)}` });
  },

  goInterview() {
    wx.navigateTo({ url: '/pages/interview-setup/interview-setup' });
  },

  // AI improve: ask DeepSeek for a better answer to this question
  aiImprove(e) {
    const qid = e.currentTarget.dataset.qid;
    const q   = this.data.allQuestions.find(x => x.qid === qid) || this.data.bookmarked.find(x => x.qid === qid);
    if (!q || !sendChatToDeepSeek) return;

    this.setData({ analysingQid: qid });
    const prompt = `面试题目："${q.question}"。\n候选人之前的回答："${q.answer || '（未提供）'}"。\n请给出一个【满分示范回答】，结构清晰、有数据支撑，200字以内。`;
    sendChatToDeepSeek([
      { role: 'system', content: '你是一位资深面试教练，擅长用STAR法则和具体数据帮助候选人优化面试回答。' },
      { role: 'user',   content: prompt }
    ]).then(res => {
      const text = res.choices?.[0]?.message?.content || '生成失败，请重试';
      // Update the question's feedback field in-place
      const updated = [...this.data.filtered].map(item =>
        item.qid === qid ? { ...item, aiSuggest: text } : item
      );
      this.setData({ filtered: updated, analysingQid: '' });
    }).catch(() => {
      this.setData({ analysingQid: '' });
      wx.showToast({ title: 'AI 请求失败', icon: 'none' });
    });
  },

  /* ──────────────────────────────────────────
     Add question modal
  ────────────────────────────────────────── */
  showAdd() {
    this.setData({
      showAddModal: true,
      addForm: { question: '', answer: '', company: '', role: '', difficulty: 'medium', interviewType: 'behavior' },
    });
  },
  hideAdd() { this.setData({ showAddModal: false }); },
  noop()    {},

  onAddInput(e) {
    this.setData({ [`addForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },
  setAddField(e) {
    const { field, val } = e.currentTarget.dataset;
    this.setData({ [`addForm.${field}`]: val });
  },

  saveCustom() {
    const { question, answer, company, role, difficulty, interviewType } = this.data.addForm;
    if (!question.trim()) { wx.showToast({ title: '请填写题目', icon: 'none' }); return; }
    const custom = wx.getStorageSync('bankCustomQuestions') || [];
    custom.unshift({
      qid:           'custom_' + Date.now(),
      question:      question.trim(),
      answer:        answer.trim(),
      feedback:      '',
      score:         0,
      company:       company.trim(),
      role:          role.trim(),
      difficulty,
      interviewType,
      timestamp:     Date.now(),
    });
    wx.setStorageSync('bankCustomQuestions', custom);
    this.setData({ showAddModal: false });
    wx.showToast({ title: '已添加', icon: 'success' });
    this._harvest();
  },
});
