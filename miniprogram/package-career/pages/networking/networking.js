// pages/networking/networking.js
const { post } = require('../../../utils/api-client.js');

const BG_PRESETS = [
  '计算机硕士在读，有2年Python/ML实习经验，求软件工程师岗位',
  '金融MBA，CFA持证，有投行实习经历，求金融分析师岗位',
  '数据科学硕士，熟悉SQL/Tableau，有数据分析项目经验',
  '市场营销硕士，有品牌策划和社交媒体运营经验',
];

Page({
  data: {
    // 表单
    targetCompany:       '',
    targetRole:          '',
    senderBackground:    '',
    recipientBackground: '',
    tone:  'formal',   // formal | casual
    lang:  'zh',       // zh | en

    // 状态
    loading: false,
    result:  null,

    // 展示控制
    activeTab:      'linkedin',  // linkedin | email
    copiedLinkedin: false,
    copiedEmail:    false,

    // 快速预设背景
    bgPresets: BG_PRESETS,
    bgPresetChips: BG_PRESETS.map(text => ({
      text,
      shortText: text.slice(0, 12)
    })),
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  setTone(e) { this.setData({ tone: e.currentTarget.dataset.val }); },
  setLang(e) { this.setData({ lang: e.currentTarget.dataset.val }); },
  setTab(e)  { this.setData({ activeTab: e.currentTarget.dataset.tab }); },

  applyPreset(e) {
    this.setData({ senderBackground: e.currentTarget.dataset.text });
  },

  async generate() {
    const { targetCompany, targetRole, senderBackground, recipientBackground, tone, lang } = this.data;
    if (!targetCompany.trim()) { wx.showToast({ title: '请填写目标公司', icon: 'none' }); return; }
    if (!targetRole.trim())    { wx.showToast({ title: '请填写目标职位', icon: 'none' }); return; }
    if (!senderBackground.trim()) { wx.showToast({ title: '请填写你的背景', icon: 'none' }); return; }

    this.setData({ loading: true, result: null });
    try {
      const res = await post({
        path: '/api/ai/networking',
        body: { targetCompany, targetRole, senderBackground, recipientBackground, tone, lang },
        timeout: 65000,
      });
      if (!res || res.code !== 0) throw new Error(res && res.message ? res.message : '生成失败');
      this.setData({ result: res.data, activeTab: 'linkedin' });
    } catch (err) {
      const msg = err.message || '网络异常，请重试';
      wx.showModal({ title: '生成失败', content: msg.includes('次数') ? msg : '请稍后重试', showCancel: false });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyText(e) {
    const type = e.currentTarget.dataset.type;
    const { result } = this.data;
    if (!result) return;

    let text = '';
    if (type === 'linkedin') text = result.linkedin_message || '';
    if (type === 'email') text = `主题：${result.email_subject || ''}\n\n${result.email_body || ''}`;

    wx.setClipboardData({
      data: text,
      success: () => {
        const key = type === 'linkedin' ? 'copiedLinkedin' : 'copiedEmail';
        this.setData({ [key]: true });
        setTimeout(() => this.setData({ [key]: false }), 2000);
      },
    });
  },

  reset() {
    this.setData({ result: null });
  },
});
