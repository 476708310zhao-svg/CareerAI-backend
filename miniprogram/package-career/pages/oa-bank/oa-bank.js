// pages/oa-bank/oa-bank.js
const { request, post, put, _write } = require('../../../utils/api-client.js');

const STATUS_MAP = {
  pending:    { label: '待完成', color: '#d97706', bg: '#fef9c3' },
  doing:      { label: '进行中', color: '#2563eb', bg: '#dbeafe' },
  done:       { label: '已完成', color: '#16a34a', bg: '#dcfce7' },
  expired:    { label: '已过期', color: '#6b7280', bg: '#f3f4f6' },
};
const TYPE_MAP = {
  coding:     '算法编程',
  video:      '视频面试',
  written:    '笔试',
  survey:     '问卷测评',
  case:       'Case Study',
  other:      '其他',
};
const DIFF_MAP = {
  easy:   { label: '简单', color: '#16a34a' },
  medium: { label: '中等', color: '#d97706' },
  hard:   { label: '困难', color: '#dc2626' },
};

const EMPTY_FORM = {
  company: '', role: '', oa_type: 'coding', platform: '',
  difficulty: 'medium', status: 'pending', deadline: '',
  duration_min: '', question_cnt: '', topics: '', notes: '', source_url: '',
};

Page({
  data: {
    // 列表
    items:    [],
    loading:  false,
    filterStatus: '',  // '' | pending | doing | done | expired

    // 统计
    stats: null,

    // 弹窗
    showForm:    false,
    editId:      null,   // null = 新建
    form:        { ...EMPTY_FORM },
    saving:      false,

    // 详情展开
    expandId: null,

    STATUS_MAP, TYPE_MAP, DIFF_MAP,
    typeList:   Object.entries(TYPE_MAP).map(([k, v]) => ({ key: k, label: v })),
    diffList:   Object.entries(DIFF_MAP).map(([k, v]) => ({ key: k, label: v.label })),
    statusList: Object.entries(STATUS_MAP).map(([k, v]) => ({ key: k, label: v.label })),
  },

  onLoad() {
    this.loadItems();
    this.loadStats();
  },

  onPullDownRefresh() {
    this.loadItems().finally(() => wx.stopPullDownRefresh());
  },

  async loadItems() {
    this.setData({ loading: true });
    const { filterStatus } = this.data;
    try {
      const res = await request({
        path: '/api/oa',
        params: filterStatus ? { status: filterStatus, pageSize: 100 } : { pageSize: 100 },
        cacheTTL: 0,
      });
      if (res && res.code === 0) {
        const items = (res.data.items || []).map(r => this._decorate(r));
        this.setData({ items });
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadStats() {
    try {
      const res = await request({ path: '/api/oa/stats', params: {}, cacheTTL: 0 });
      if (res && res.code === 0) this.setData({ stats: res.data });
    } catch (e) {}
  },

  _decorate(r) {
    const sm = STATUS_MAP[r.status] || STATUS_MAP.pending;
    const dm = DIFF_MAP[r.difficulty] || DIFF_MAP.medium;
    const deadlineFmt = r.deadline ? r.deadline.slice(0, 10) : '';
    const isUrgent = deadlineFmt && r.status !== 'done' && r.status !== 'expired'
      && (new Date(deadlineFmt) - new Date()) < 3 * 86400 * 1000
      && new Date(deadlineFmt) >= new Date();
    return {
      ...r,
      statusLabel:  sm.label,
      statusColor:  sm.color,
      statusBg:     sm.bg,
      diffLabel:    dm.label,
      diffColor:    dm.color,
      typeLabel:    TYPE_MAP[r.oa_type] || r.oa_type,
      deadlineFmt,
      isUrgent,
    };
  },

  setFilter(e) {
    const v = e.currentTarget.dataset.val;
    this.setData({ filterStatus: this.data.filterStatus === v ? '' : v });
    this.loadItems();
  },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandId: this.data.expandId === id ? null : id });
  },

  // ── 表单 ────────────────────────────────────────────────────
  openCreate() {
    this.setData({ showForm: true, editId: null, form: { ...EMPTY_FORM } });
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find(i => i.id === id);
    if (!item) return;
    this.setData({
      showForm: true,
      editId: id,
      form: {
        company:      item.company,
        role:         item.role,
        oa_type:      item.oa_type,
        platform:     item.platform,
        difficulty:   item.difficulty,
        status:       item.status,
        deadline:     item.deadline,
        duration_min: item.duration_min ? String(item.duration_min) : '',
        question_cnt: item.question_cnt ? String(item.question_cnt) : '',
        topics:       Array.isArray(item.topics) ? item.topics.join(', ') : '',
        notes:        item.notes,
        source_url:   item.source_url,
      },
    });
  },

  closeForm() { this.setData({ showForm: false }); },

  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  setFormField(e) {
    const key = e.currentTarget.dataset.key;
    const val = e.currentTarget.dataset.val;
    this.setData({ [`form.${key}`]: val });
  },

  async saveForm() {
    const { form, editId } = this.data;
    if (!form.company.trim()) { wx.showToast({ title: '公司名不能为空', icon: 'none' }); return; }
    this.setData({ saving: true });

    const body = {
      ...form,
      topics:       form.topics ? form.topics.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [],
      duration_min: parseInt(form.duration_min) || 0,
      question_cnt: parseInt(form.question_cnt) || 0,
    };

    try {
      let res;
      if (editId) {
        res = await put({ path: `/api/oa/${editId}`, body });
      } else {
        res = await post({ path: '/api/oa', body });
      }
      if (!res || res.code !== 0) throw new Error(res && res.message ? res.message : '保存失败');
      wx.showToast({ title: editId ? '已更新' : '已添加', icon: 'success' });
      this.setData({ showForm: false });
      this.loadItems();
      this.loadStats();
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async quickStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const next = status === 'pending' ? 'doing' : status === 'doing' ? 'done' : 'pending';
    try {
      await put({ path: `/api/oa/${id}`, body: { status: next } });
      const items = this.data.items.map(i => i.id === id ? this._decorate({ ...i, status: next }) : i);
      this.setData({ items });
      this.loadStats();
    } catch (e) {}
  },

  async deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: async ({ confirm }) => {
        if (!confirm) return;
        try {
          await _write({ path: `/api/oa/${id}`, method: 'DELETE', body: {} });
          const items = this.data.items.filter(i => i.id !== id);
          this.setData({ items });
          this.loadStats();
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },
});
