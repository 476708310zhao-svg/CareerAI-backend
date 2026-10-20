// pages/feedback/feedback.js
const { submitFeedback: submitFeedbackApi } = require('../../../utils/api-feedback.js');

Page({
  data: {
    types: ['功能建议', 'Bug反馈', '体验问题', '其他'],
    typeOptions: [
      { label: '功能建议', desc: '想要新增或改进的能力', icon: '💡' },
      { label: 'Bug反馈', desc: '页面报错、数据异常、无法使用', icon: '🛠' },
      { label: '体验问题', desc: '流程不顺、样式错位、交互不清晰', icon: '✨' },
      { label: '其他', desc: '合作、内容、账号或其他问题', icon: '💬' }
    ],
    typeIndex: 0,
    content: '',
    contact: '',
    submitting: false,
    submitError: ''
  },

  onTypeChange(e) {
    this.setData({ typeIndex: e.detail.value });
  },

  selectType(e) {
    this.setData({ typeIndex: Number(e.currentTarget.dataset.index) });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  submitFeedback() {
    const text = this.data.content.trim();
    if (!text) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (text.length < 10) {
      wx.showToast({ title: '反馈内容至少10个字', icon: 'none' });
      return;
    }
    if (text.length > 500) {
      wx.showToast({ title: '反馈内容不超过500字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true, submitError: '' });

    const payload = {
      type: this.data.types[this.data.typeIndex],
      content: text,
      contact: this.data.contact.trim()
    };

    submitFeedbackApi(payload)
      .then((res) => {
        this.setData({ submitting: false });
        if (res && res.code === 0) {
          wx.showToast({ title: '感谢您的反馈', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1500);
        } else {
          this.setData({ submitError: (res && res.message) || '提交失败，请检查后重试。' });
        }
      })
      .catch(() => {
        // 保留当前输入供用户重试，不将未提交的反馈误标为已送达。
        this.setData({ submitting: false, submitError: '网络异常，反馈尚未提交。请稍后重试。' });
      });
  }
});
