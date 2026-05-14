// pages/cron-status/cron-status.js
const { getCronLogs, getBigtechStats } = require('../../utils/api-jobs.js');

const STATUS_MAP = {
  ok:      { label: '成功',   color: '#16a34a' },
  partial: { label: '部分失败', color: '#d97706' },
  error:   { label: '失败',   color: '#dc2626' },
};

Page({
  data: {
    loading:   true,
    logs:      [],
    stats:     null,
    lastRun:   null,
    totalRuns: 0,
    nextRunIn: '',
  },

  onLoad() {
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [logsRes, statsRes] = await Promise.all([getCronLogs(), getBigtechStats()]);

      const logs = (logsRes.logs || []).map(l => ({
        ...l,
        statusLabel: (STATUS_MAP[l.status] || STATUS_MAP.ok).label,
        statusColor: (STATUS_MAP[l.status] || STATUS_MAP.ok).color,
        ranAtFmt:    this._fmtTime(l.ran_at),
        durationFmt: l.duration_ms ? `${(l.duration_ms / 1000).toFixed(1)}s` : '-',
      }));

      this.setData({
        loading:   false,
        logs,
        stats:     statsRes,
        lastRun:   logsRes.lastRun,
        totalRuns: logsRes.totalRuns || 0,
        nextRunIn: this._calcNextRun(logsRes.lastRun),
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  _fmtTime(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr.replace(' ', 'T') + (isoStr.includes('Z') ? '' : 'Z'));
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  _calcNextRun(lastRun) {
    if (!lastRun) return '未知';
    const last = new Date(lastRun.ran_at.replace(' ', 'T') + 'Z');
    const next = new Date(last.getTime() + 6 * 60 * 60 * 1000);
    const diff = next - Date.now();
    if (diff <= 0) return '即将运行';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}小时${m}分后` : `${m}分钟后`;
  },
});
