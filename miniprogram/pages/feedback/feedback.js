// pages/feedback/feedback.js
const config = require('../../utils/config.js');
const API_BASE = config.API_BASE_URL;

Page({
  data: {
    types: ['功能建议', 'Bug反馈', '体验问题', '其他'],
    typeIndex: 0,
    content: '',
    contact: '',
    submitting: false
  },

  onTypeChange(e) {
    this.setData({ typeIndex: e.detail.value });
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

    this.setData({ submitting: true });

    const payload = {
      type: this.data.types[this.data.typeIndex],
      content: text,
      contact: this.data.contact.trim()
    };

    const token = wx.getStorageSync('token') || '';

    wx.request({
      url: API_BASE + '/api/feedback',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      data: payload,
      success: (res) => {
        this.setData({ submitting: false });
        if (res.statusCode === 200 && res.data.code === 0) {
          wx.showToast({ title: '感谢您的反馈', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1500);
        } else {
          wx.showToast({ title: res.data.message || '提交失败，请重试', icon: 'none' });
        }
      },
      fail: () => {
        // 网络失败：降级存本地
        this.setData({ submitting: false });
        const feedbacks = wx.getStorageSync('userFeedbacks') || [];
        feedbacks.unshift({ ...payload, time: new Date().toISOString() });
        wx.setStorageSync('userFeedbacks', feedbacks);
        wx.showToast({ title: '网络异常，已保存到本地', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    });
  }
});
