// pages/my-experiences/my-experiences.js
const { generateExperience } = require('../../utils/api.js');

Page({
  data: {
    aiLoading: false,
    currentTab: 0,
    searchKeyword: '',
    loading: false,
    collectionList: [],
    myPostList: [],

    // 发布弹窗
    showPublish: false,
    publishForm: {
      title: '',
      company: '',
      type: '面试',
      tags: '',
      content: ''
    },
    publishTypes: ['面试', '笔试', '经验', '心得']
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    // 从 localStorage 加载收藏的面经
    const favUtil = require('../../utils/favorites.js');
    const favExps = favUtil.getList('experience');
    const collectionList = favExps.map(item => ({
      id: item.targetId || item.id,
      title: item.title,
      author: item.author || '匿名用户',
      avatar: '/images/default-avatar.png',
      summary: item.subtitle || item.desc || '',
      tags: item.tags || [],
      read: item.read || 0,
      likes: item.likes || 0,
      date: item.createdAt || ''
    }));

    // 从 localStorage 加载自己发布的面经
    const myPosts = wx.getStorageSync('myExperiencePosts') || [];

    this.setData({ collectionList, myPostList: myPosts });
  },

  switchTab(e) {
    this.setData({ currentTab: Number(e.currentTarget.dataset.index) });
  },

  // 搜索过滤
  onSearchInput(e) {
    const kw = e.detail.value.toLowerCase();
    this.setData({ searchKeyword: kw });
  },

  // 获取当前显示的列表（支持搜索过滤）
  _getDisplayList() {
    const list = this.data.currentTab === 0 ? this.data.collectionList : this.data.myPostList;
    const kw = this.data.searchKeyword;
    if (!kw) return list;
    return list.filter(item =>
      (item.title || '').toLowerCase().includes(kw) ||
      (item.company || '').toLowerCase().includes(kw)
    );
  },

  onPullDownRefresh() {
    this.loadData();
    setTimeout(() => {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '刷新成功', icon: 'none' });
    }, 500);
  },

  // 点击文章跳转
  viewArticle(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/experience-detail/experience-detail?id=' + id,
      fail: () => wx.showToast({ title: '详情页不存在', icon: 'none' })
    });
  },

  // 操作自己的文章
  handleMyPostAction(e) {
    if (this.data.currentTab !== 1) return;
    const index = e.currentTarget.dataset.index;

    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 编辑：填充表单并打开弹窗
          const item = this.data.myPostList[index];
          this.setData({
            showPublish: true,
            publishForm: {
              title: item.title,
              company: item.company || '',
              type: item.type || '面试',
              tags: (item.tags || []).join('、'),
              content: item.content || item.summary || ''
            },
            _editIndex: index
          });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '确认删除',
            content: '删除后不可恢复',
            success: (modal) => {
              if (modal.confirm) {
                const newList = this.data.myPostList.slice();
                newList.splice(index, 1);
                this.setData({ myPostList: newList });
                wx.setStorageSync('myExperiencePosts', newList);
                wx.showToast({ title: '已删除', icon: 'success' });
              }
            }
          });
        }
      }
    });
  },

  // ========== 发布功能 ==========
  goToPublish() {
    this.setData({
      showPublish: true,
      publishForm: { title: '', company: '', type: '面试', tags: '', content: '' },
      _editIndex: -1
    });
  },

  closePublish() {
    this.setData({ showPublish: false });
  },

  onPublishInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['publishForm.' + field]: e.detail.value });
  },

  onTypeChange(e) {
    this.setData({ 'publishForm.type': this.data.publishTypes[e.detail.value] });
  },

  submitPublish() {
    const form = this.data.publishForm;
    if (!form.title.trim()) {
      wx.showToast({ title: '请填写标题', icon: 'none' });
      return;
    }
    if (!form.content.trim()) {
      wx.showToast({ title: '请填写内容', icon: 'none' });
      return;
    }

    const profile = wx.getStorageSync('userProfile') || {};
    const tags = form.tags ? form.tags.split(/[、,，\s]+/).filter(Boolean).slice(0, 5) : [];
    if (form.company && !tags.includes(form.company)) tags.unshift(form.company);

    const myPosts = this.data.myPostList.slice();
    const postData = {
      id: Date.now(),
      title: form.title.trim(),
      company: form.company.trim(),
      type: form.type,
      author: profile.nickName || '我',
      avatar: profile.avatarUrl || '/images/default-avatar.png',
      summary: form.content.trim().substring(0, 100),
      content: form.content.trim(),
      tags: tags,
      read: 0,
      likes: 0,
      date: new Date().toISOString().slice(0, 10)
    };

    if (this.data._editIndex >= 0) {
      // 编辑模式
      postData.id = myPosts[this.data._editIndex].id;
      postData.read = myPosts[this.data._editIndex].read;
      postData.likes = myPosts[this.data._editIndex].likes;
      myPosts[this.data._editIndex] = postData;
    } else {
      myPosts.unshift(postData);
    }

    this.setData({
      myPostList: myPosts,
      showPublish: false,
      currentTab: 1
    });
    wx.setStorageSync('myExperiencePosts', myPosts);
    wx.showToast({ title: this.data._editIndex >= 0 ? '已更新' : '发布成功', icon: 'success' });
  },

  // ========== AI 生成面经 ==========
  aiGenerateExp() {
    wx.showModal({
      title: 'AI 生成面经',
      placeholderText: '输入公司名称，如：Google',
      editable: true,
      success: (res) => {
        if (!res.confirm || !res.content || !res.content.trim()) return;
        const companyName = res.content.trim();

        this.setData({ aiLoading: true });
        wx.showLoading({ title: 'AI生成中...', mask: true });

        generateExperience(companyName).then(exp => {
          wx.hideLoading();
          this.setData({ aiLoading: false });

          if (!exp) {
            wx.showToast({ title: '生成失败，请重试', icon: 'none' });
            return;
          }

          // 预填充到发布表单
          this.setData({
            showPublish: true,
            _editIndex: -1,
            publishForm: {
              title: exp.title || companyName + ' 面试经验分享',
              company: companyName,
              type: exp.type || '面试',
              tags: (exp.tags || []).join('、'),
              content: (exp.content || '') + (exp.tips ? '\n\n建议：' + exp.tips : '')
            }
          });
          wx.showToast({ title: 'AI已填充，可编辑后发布', icon: 'none' });
        }).catch(() => {
          wx.hideLoading();
          this.setData({ aiLoading: false });
          wx.showToast({ title: '网络错误', icon: 'none' });
        });
      }
    });
  }
})
