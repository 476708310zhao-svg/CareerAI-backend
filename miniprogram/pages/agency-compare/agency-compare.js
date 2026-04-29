// pages/agency-compare/agency-compare.js
const api = require('../../utils/api');

// 对比行定义：label / 取值函数
const ROWS = [
  {
    key: 'ratingAvg',
    label: '综合评分',
    type: 'rating',
    get: a => a.ratingAvg > 0 ? a.ratingAvg : null
  },
  {
    key: 'reviewCount',
    label: '评测数量',
    type: 'number',
    get: a => a.reviewCount,
    unit: '条'
  },
  {
    key: 'type',
    label: '机构类型',
    type: 'text',
    get: a => a.type || '—'
  },
  {
    key: 'city',
    label: '所在城市',
    type: 'text',
    get: a => a.city || '线上/全国'
  },
  {
    key: 'priceRange',
    label: '服务价格',
    type: 'price',
    get: a => a.priceRange
  },
  {
    key: 'effectRating',
    label: '就业效果',
    type: 'dim_rating',
    get: a => a.ratingDims && a.ratingDims.effect > 0 ? a.ratingDims.effect : null
  },
  {
    key: 'valueRating',
    label: '性价比',
    type: 'dim_rating',
    get: a => a.ratingDims && a.ratingDims.value > 0 ? a.ratingDims.value : null
  },
  {
    key: 'serviceRating',
    label: '服务态度',
    type: 'dim_rating',
    get: a => a.ratingDims && a.ratingDims.service > 0 ? a.ratingDims.service : null
  },
  {
    key: 'specialties',
    label: '专长方向',
    type: 'tags',
    get: a => a.specialties && a.specialties.length ? a.specialties.slice(0, 5) : []
  },
  {
    key: 'services',
    label: '服务项目',
    type: 'tags',
    get: a => a.services && a.services.length ? a.services.slice(0, 5) : []
  },
  {
    key: 'isVerified',
    label: '官方认证',
    type: 'bool',
    get: a => a.isVerified
  }
];

Page({
  data: {
    loading: true,
    agencies: [],   // 完整机构数据（2~3条）
    rows: [],       // 渲染用行数据
    colCount: 2     // 2 or 3
  },

  onLoad(options) {
    const rawIds = (options.ids || '').split(',').map(Number).filter(n => n > 0);
    if (rawIds.length < 2) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.ids = rawIds;
    this.loadCompare();
  },

  loadCompare() {
    this.setData({ loading: true });
    api.getAgenciesCompare(this.ids).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      const agencies = res.data;
      const rows = this._buildRows(agencies);
      this.setData({
        agencies,
        rows,
        colCount: agencies.length,
        loading: false
      });
    }).catch(err => {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  // ── 构建对比行数据 ────────────────────────────────────────────────────────
  _buildRows(agencies) {
    return ROWS.map(rowDef => {
      const cells = agencies.map(a => {
        const val = rowDef.get(a);
        return this._formatCell(rowDef.type, val, rowDef.unit);
      });

      // 找最优值（评分/数量类）用于高亮
      let bestIdx = -1;
      if (rowDef.type === 'rating' || rowDef.type === 'dim_rating' || rowDef.type === 'number') {
        const nums = cells.map(c => c.raw);
        const max = Math.max(...nums.filter(n => n !== null && n !== undefined));
        if (max > 0) {
          bestIdx = nums.indexOf(max);
        }
      }

      return {
        label: rowDef.label,
        type: rowDef.type,
        cells: cells.map((c, i) => ({ ...c, isBest: i === bestIdx }))
      };
    });
  },

  _formatCell(type, val, unit) {
    if (type === 'rating' || type === 'dim_rating') {
      if (val === null || val === undefined || val === 0) {
        return { raw: 0, display: '暂无', stars: [] };
      }
      return { raw: val, display: String(val), stars: this._buildStars(val) };
    }
    if (type === 'number') {
      return { raw: val || 0, display: `${val || 0}${unit || ''}` };
    }
    if (type === 'text') {
      return { raw: 0, display: val || '—' };
    }
    if (type === 'price') {
      if (!val) return { raw: 0, display: '价格面议' };
      const parts = [];
      if (val.china) parts.push(`国内 ${val.china}`);
      if (val.northAmerica) parts.push(`北美 ${val.northAmerica}`);
      if (val.uk) parts.push(`英国 ${val.uk}`);
      return { raw: 0, display: parts.join('\n') || '价格面议' };
    }
    if (type === 'tags') {
      return { raw: 0, tags: val || [], display: '' };
    }
    if (type === 'bool') {
      return { raw: val ? 1 : 0, display: val ? '已认证' : '未认证', isTrue: !!val };
    }
    return { raw: 0, display: '—' };
  },

  _buildStars(avg) {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (avg >= i) stars.push('full');
      else if (avg >= i - 0.5) stars.push('half');
      else stars.push('empty');
    }
    return stars;
  },

  // ── 跳转详情 ─────────────────────────────────────────────────────────────
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
  }
});
