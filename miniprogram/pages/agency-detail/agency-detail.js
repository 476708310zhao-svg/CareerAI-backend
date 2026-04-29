// pages/agency-detail/agency-detail.js
const api      = require('../../utils/api');
const favUtil  = require('../../utils/favorites');
const SK       = require('../../utils/store-keys');

const RATING_LABELS = ['很差', '较差', '一般', '不错', '很棒'];

Page({
  data: {
    agency: null,
    activeTab: 'ai',          // 'ai' | 'reviews'
    starList: [],             // ['full','full','half','empty','empty']

    // AI 测评
    aiLoading: false,

    // 用户评测
    reviews: [],
    reviewsPage: 1,
    reviewsPageSize: 10,
    reviewsHasMore: true,
    reviewsLoading: false,
    myUserId: null,

    // 收藏
    isFavorited: false,

    // 评测弹窗
    reviewModalVisible: false,
    reviewForm: {
      ratingOverall: 0,
      ratingEffect: 0,
      ratingValue: 0,
      ratingService: 0,
      title: '',
      content: '',
      pros: '',
      cons: '',
      isAnonymous: false
    },
    ratingLabels: RATING_LABELS,
    submitLoading: false
  },

  onLoad(options) {
    this.agencyId = parseInt(options.id);

    // 读取当前登录用户 id
    const profile = wx.getStorageSync(SK.USER_PROFILE);
    if (profile) this.setData({ myUserId: profile.userId });

    this.loadDetail();
    this.loadReviews(true);
  },

  onPullDownRefresh() {
    Promise.all([this.loadDetail(), this.loadReviews(true)])
      .finally(() => wx.stopPullDownRefresh());
  },

  // ── 加载机构详情 ──────────────────────────────────────────────────────────
  loadDetail() {
    return api.getAgencyDetail(this.agencyId).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      const agency = res.data;
      this.setData({
        agency,
        starList: this._buildStarList(agency.ratingAvg),
        isFavorited: favUtil.isFavorited('agency', String(this.agencyId))
      });
      wx.setNavigationBarTitle({ title: agency.name });
      // 无 AI 测评时自动触发生成
      if (!agency.aiEval) {
        this._autoGenerateAiEval();
      }
    }).catch(err => {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    });
  },

  // ── 自动触发 AI 测评（静默，不提示登录）────────────────────────────────
  _autoGenerateAiEval() {
    if (this.data.aiLoading) return;
    const token = wx.getStorageSync('token');
    if (!token) return; // 未登录时静默跳过，保留手动触发按钮
    this.setData({ aiLoading: true });
    api.triggerAgencyAiEval(this.agencyId).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      this.setData({
        'agency.aiEval':   res.data,
        'agency.aiEvalAt': new Date().toLocaleDateString(),
        aiLoading: false
      });
    }).catch(() => {
      this.setData({ aiLoading: false });
    });
  },

  // ── 评分 → 星列表 ────────────────────────────────────────────────────────
  _buildStarList(avg) {
    const list = [];
    for (let i = 1; i <= 5; i++) {
      if (avg >= i) list.push('full');
      else if (avg >= i - 0.5) list.push('half');
      else list.push('empty');
    }
    return list;
  },

  // ── 切换 Tab ─────────────────────────────────────────────────────────────
  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // ── 生成 AI 测评 ─────────────────────────────────────────────────────────
  generateAiEval() {
    if (this.data.aiLoading) return;

    const token = wx.getStorageSync('token');
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ aiLoading: true });
    api.triggerAgencyAiEval(this.agencyId).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      // 更新机构 aiEval 字段
      this.setData({
        'agency.aiEval':   res.data,
        'agency.aiEvalAt': new Date().toLocaleDateString(),
        aiLoading: false
      });
      wx.showToast({ title: res.cached ? '已是最新测评' : '测评生成成功', icon: 'success' });
    }).catch(err => {
      this.setData({ aiLoading: false });
      wx.showToast({ title: err.message || 'AI 生成失败', icon: 'none' });
    });
  },

  // ── 加载评测列表 ─────────────────────────────────────────────────────────
  loadReviews(reset = false) {
    if (this.data.reviewsLoading) return Promise.resolve();
    const page = reset ? 1 : this.data.reviewsPage;
    this.setData({ reviewsLoading: true });

    return api.getAgencyReviews(this.agencyId, page, this.data.reviewsPageSize).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      const newList = reset ? res.data : [...this.data.reviews, ...res.data];
      this.setData({
        reviews: newList,
        reviewsPage: page + 1,
        reviewsHasMore: newList.length < res.total,
        reviewsLoading: false
      });
    }).catch(err => {
      wx.showToast({ title: err.message || '评测加载失败', icon: 'none' });
      this.setData({ reviewsLoading: false });
    });
  },

  loadMoreReviews() {
    if (!this.data.reviewsHasMore || this.data.reviewsLoading) return;
    this.loadReviews(false);
  },

  // ── 点赞评测 ─────────────────────────────────────────────────────────────
  likeReview(e) {
    const reviewId = e.currentTarget.dataset.id;
    api.likeAgencyReview(this.agencyId, reviewId).then(res => {
      if (res.code !== 0) return;
      const reviews = this.data.reviews.map(r =>
        r.id === reviewId ? { ...r, likesCount: res.data.likesCount } : r
      );
      this.setData({ reviews });
    }).catch(() => {});
  },

  // ── 删除评测 ─────────────────────────────────────────────────────────────
  deleteReview(e) {
    const reviewId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除评测',
      content: '确认删除这条评测吗？',
      confirmColor: '#EF4444',
      success: ({ confirm }) => {
        if (!confirm) return;
        api.deleteAgencyReview(reviewId).then(res => {
          if (res.code !== 0) throw new Error(res.message);
          this.setData({ reviews: this.data.reviews.filter(r => r.id !== reviewId) });
          wx.showToast({ title: '删除成功', icon: 'success' });
          this.loadDetail(); // 刷新评分
        }).catch(err => {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        });
      }
    });
  },

  // ── 收藏 / 取消收藏 ──────────────────────────────────────────────────────
  toggleFavorite() {
    const { agency, isFavorited } = this.data;
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    favUtil.toggle('agency', String(this.agencyId), agency.name, agency.type);
    this.setData({ isFavorited: !isFavorited });
    wx.showToast({ title: isFavorited ? '已取消收藏' : '收藏成功', icon: 'success' });
  },

  // ── 机构认领 / 纠错入口 ──────────────────────────────────────────────────
  claimAgency() {
    const name = (this.data.agency && this.data.agency.name) || '该机构';
    wx.showModal({
      title: '申请认领或纠错',
      content: `如您是「${name}」的官方代表，或发现页面信息有误，请通过意见反馈页面联系我们，注明机构名称及联系方式，我们将在 3 个工作日内处理。`,
      confirmText: '前往反馈',
      cancelText: '取消',
      success: ({ confirm }) => {
        if (confirm) {
          wx.navigateTo({ url: '/pages/feedback/feedback' });
        }
      }
    });
  },

  // ── 打开 / 关闭评测弹窗 ──────────────────────────────────────────────────
  openReviewModal() {
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.showToast({ title: '请先登录后再评测', icon: 'none' });
      return;
    }
    this.setData({ reviewModalVisible: true });
  },

  closeReviewModal() {
    this.setData({ reviewModalVisible: false });
  },

  // ── 表单输入 ─────────────────────────────────────────────────────────────
  setRating(e) {
    const { dim, val } = e.currentTarget.dataset;
    this.setData({ [`reviewForm.${dim}`]: val });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`reviewForm.${field}`]: e.detail.value });
  },

  toggleAnonymous(e) {
    this.setData({ 'reviewForm.isAnonymous': e.detail.value });
  },

  // ── 提交评测 ─────────────────────────────────────────────────────────────
  submitReview() {
    if (this.data.submitLoading) return;
    const form = this.data.reviewForm;

    if (!form.ratingOverall) {
      wx.showToast({ title: '请选择综合评分', icon: 'none' });
      return;
    }
    if (!form.content || form.content.trim().length < 10) {
      wx.showToast({ title: '评测内容至少 10 个字', icon: 'none' });
      return;
    }

    this.setData({ submitLoading: true });

    api.submitAgencyReview(this.agencyId, {
      ratingOverall: form.ratingOverall,
      ratingEffect:  form.ratingEffect,
      ratingValue:   form.ratingValue,
      ratingService: form.ratingService,
      title:       form.title,
      content:     form.content,
      pros:        form.pros,
      cons:        form.cons,
      isAnonymous: form.isAnonymous
    }).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      this.setData({
        submitLoading: false,
        reviewModalVisible: false,
        reviewForm: { ratingOverall: 0, ratingEffect: 0, ratingValue: 0, ratingService: 0,
                      title: '', content: '', pros: '', cons: '', isAnonymous: false }
      });
      wx.showToast({ title: '评测提交成功', icon: 'success' });
      // 刷新评测列表和评分
      this.loadReviews(true);
      this.loadDetail();
      this.setData({ activeTab: 'reviews' });
    }).catch(err => {
      this.setData({ submitLoading: false });
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    });
  }
});
