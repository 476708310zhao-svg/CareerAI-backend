// app.js
const favUtil = require('./utils/favorites.js');
const vipUtil  = require('./utils/vip.js');
const api      = require('./utils/api.js');

App({
  onLaunch: function () {
    console.log('小程序启动');
    this._initGlobalData();
    this._silentLogin();
    this._initTheme();
  },

  // 全局 JS 运行时错误捕获
  onError: function(error) {
    console.error('[全局错误]', error);
  },

  // 全局未处理的 Promise rejection 捕获
  onUnhandledRejection: function(res) {
    console.error('[未处理的 Promise 异常]', res.reason);
  },

  // ─── 全局状态初始化（启动时读取一次）───────────────────────────
  _initGlobalData: function() {
    const token = wx.getStorageSync('token');
    this.globalData.isLoggedIn = !!token;
    this.refreshGlobalData();
  },

  /**
   * 静默登录：启动时自动调用 wx.login() 换取服务端 token
   * - 若本地已有有效 token，跳过（避免每次启动都换新 token 浪费 wx.login 次数）
   * - 若无 token 或 token 已过期，自动重新登录
   */
  _silentLogin: function() {
    const token = wx.getStorageSync('token');
    if (token) {
      // 已有 token，后台校验是否仍有效（不阻塞启动）
      api.getUserProfile().then(res => {
        if (res && res.code === 0) {
          this.globalData.isLoggedIn = true;
        } else {
          // token 无效，触发重新登录
          this._doLogin();
        }
      }).catch(() => {
        // 网络失败时保留本地登录态，不强制登出
      });
    } else {
      // 无 token，静默登录（只换 token，不弹授权窗口）
      this._doLogin();
    }
  },

  /**
   * 执行登录流程（wx.login → 后端换 token）
   * 公开供页面调用：getApp()._doLogin()
   * @returns {Promise}
   */
  _doLogin: function() {
    return api.login().then(data => {
      this.globalData.isLoggedIn = true;
      this.refreshGlobalData();
      console.log('[Auth] 静默登录成功, userId:', data.user.id);
      // 通知已注册的回调（如 profile 页面正在等待登录完成）
      if (this._loginCallbacks) {
        this._loginCallbacks.forEach(cb => { try { cb(null, data); } catch(e) {} });
        this._loginCallbacks = [];
      }
      return data;
    }).catch(err => {
      console.warn('[Auth] 静默登录失败（用户未授权昵称头像，属正常）:', err.message);
      if (this._loginCallbacks) {
        this._loginCallbacks.forEach(cb => { try { cb(err); } catch(e) {} });
        this._loginCallbacks = [];
      }
    });
  },

  /**
   * 注册登录完成回调（页面在登录完成前先挂起）
   * 用法：getApp().onLogin((err, data) => { ... })
   */
  onLogin: function(callback) {
    if (this.globalData.isLoggedIn) {
      // 返回全局缓存的用户数据，保持与 _doLogin 回调签名的一致性
      callback(null, this.globalData.userProfile);
      return;
    }
    if (!this._loginCallbacks) this._loginCallbacks = [];
    this._loginCallbacks.push(callback);
  },

  /**
   * 刷新全局高频数据（在 onShow 或数据变更后调用）
   * 页面通过 getApp().globalData.xxx 直接读取，无需每次走 Storage I/O
   */
  refreshGlobalData: function() {
    const gd = this.globalData;
    gd.userProfile    = wx.getStorageSync('userProfile')  || null;
    gd.vipInfo        = vipUtil.getInfo();
    gd.unreadCount    = wx.getStorageSync('unreadMessages') || 0;
    gd.favorites      = favUtil.getAll();
  },

  /**
   * 更新未读消息数，同步到 Storage 和 TabBar 角标
   * @param {number} count
   */
  setUnreadCount: function(count) {
    this.globalData.unreadCount = count;
    wx.setStorageSync('unreadMessages', count);
    if (count > 0) {
      wx.setTabBarBadge({ index: 4, text: count > 99 ? '99+' : String(count) });
    } else {
      wx.removeTabBarBadge({ index: 4 });
    }
  },

  // ─── 主题管理 ─────────────────────────────────────────────────────
  /**
   * 初始化主题：读取用户上次手动设置的主题偏好
   * 若无手动设置则跟随系统（CSS @media 自动处理，无需 JS 干预）
   */
  _initTheme: function() {
    const saved = wx.getStorageSync('appTheme');
    if (saved === 'dark' || saved === 'light') {
      this._applyTheme(saved);
    }
    // 监听系统主题变化
    wx.onThemeChange && wx.onThemeChange(({ theme }) => {
      // 仅在用户未手动设置时跟随系统
      if (!wx.getStorageSync('appTheme')) {
        this.globalData.theme = theme;
      }
    });
  },

  /**
   * 手动切换主题
   * 用法（任意页面）：getApp().setTheme('dark') / setTheme('light') / setTheme('auto')
   * @param {'dark'|'light'|'auto'} theme
   */
  setTheme: function(theme) {
    if (theme === 'auto') {
      wx.removeStorageSync('appTheme');
      this._applyTheme(null);
      return;
    }
    wx.setStorageSync('appTheme', theme);
    this._applyTheme(theme);
  },

  /**
   * 将主题 class 写入所有当前页面的根节点
   * WeChat 小程序不能直接操作 page 元素 class，
   * 通过 wx.setBackgroundColor 同步状态栏颜色，
   * 页面通过 getApp().globalData.theme 读取当前主题并自行渲染
   */
  _applyTheme: function(theme) {
    this.globalData.theme = theme || 'auto';
    // 同步状态栏颜色
    if (theme === 'dark') {
      wx.setBackgroundColor({ backgroundColor: '#0F1117', backgroundColorTop: '#0F1117', backgroundColorBottom: '#0F1117' });
      wx.setNavigationBarColor && wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#1A1D27', animation: { duration: 300 } });
    } else if (theme === 'light' || theme === 'auto') { // 确保light和auto模式下背景都是纯白
      wx.setBackgroundColor({ backgroundColor: '#ffffff', backgroundColorTop: '#ffffff', backgroundColorBottom: '#ffffff' });
      wx.setNavigationBarColor && wx.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#ffffff', animation: { duration: 300 } });
    }
    // 通知当前所有存活页面更新（页面可选监听）
    const pages = getCurrentPages();
    pages.forEach(page => {
      if (typeof page._onThemeChange === 'function') {
        try { page._onThemeChange(this.globalData.theme); } catch(e) {}
      }
    });
  },

  /**
   * 获取当前主题（'dark' | 'light' | 'auto'）
   * 用法：getApp().getTheme()
   */
  getTheme: function() {
    return this.globalData.theme || 'auto';
  },

  globalData: {
    isLoggedIn:  false,
    userProfile: null,   // { nickName, avatarUrl, school, major }
    vipInfo:     null,   // { isVip, planName, expireDate }
    unreadCount: 0,      // 未读消息数（驱动 TabBar 角标）
    favorites:   null,   // { job:[], experience:[], company:[] }
    theme:       'auto'  // 'dark' | 'light' | 'auto'
  }
});
