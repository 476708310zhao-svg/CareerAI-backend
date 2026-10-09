const navigation = require('../utils/navigation.js');
const unreadMessages = require('../utils/unread-messages.js');

const FULL_TAB_LIST = [
  {
    pagePath: 'pages/index/index',
    text: '首页',
    iconPath: '/images/home.png',
    selectedIconPath: '/images/home-active.png'
  },
  {
    pagePath: 'pages/jobs/jobs',
    text: '找岗位',
    iconPath: '/images/jobs.png',
    selectedIconPath: '/images/jobs-active.png'
  },
  {
    pagePath: 'pages/applications/applications',
    text: '进度',
    iconPath: '/images/icon-apply-muted.png',
    selectedIconPath: '/images/icon-apply.png'
  },
  {
    pagePath: 'pages/resources/resources',
    text: '资源中心',
    iconPath: '/images/assess.png',
    selectedIconPath: '/images/assess-active.png'
  },
  {
    pagePath: 'pages/profile/profile',
    text: '我的',
    iconPath: '/images/profile.png',
    selectedIconPath: '/images/profile-active.png',
    showBadge: true
  }
];

Component({
  options: {
    addGlobalClass: true
  },

  data: {
    selected: 0,
    unreadCount: 0,
    badgeText: '',
    list: FULL_TAB_LIST
  },

  lifetimes: {
    attached() {
      this.syncState();
    }
  },

  pageLifetimes: {
    show() {
      this.syncState();
    }
  },

  methods: {
    syncState() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1] || {};
      // app.json and the custom TabBar must expose the same five stable tabs.
      // Feature flags gate page content/actions, not the native tab topology.
      const list = FULL_TAB_LIST;
      const selected = this.routeToIndex(current.route, list);
      const unreadCount = unreadMessages.get();

      const nextSelected = selected >= 0 ? selected : this.data.selected;
      const nextBadgeText = unreadCount > 99 ? '99+' : String(unreadCount);
      if (
        nextSelected === this.data.selected &&
        unreadCount === this.data.unreadCount &&
        nextBadgeText === this.data.badgeText &&
        list.map(item => item.pagePath).join('|') === this.data.list.map(item => item.pagePath).join('|')
      ) return;

      this.setData({
        selected: nextSelected,
        unreadCount,
        badgeText: nextBadgeText,
        list
      });
    },

    routeToIndex(route, list) {
      const currentRoute = String(route || '').replace(/^\/+/, '');
      return (list || this.data.list).findIndex(item => item.pagePath === currentRoute);
    },

    setUnreadCount(count) {
      const unreadCount = Number(count) || 0;
      const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);
      if (unreadCount === this.data.unreadCount && badgeText === this.data.badgeText) return;
      this.setData({
        unreadCount,
        badgeText
      });
    },

    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;

      this.setData({ selected: index });
      const started = navigation.safeSwitchTab(`/${item.pagePath}`, {
        success: () => this.syncState(),
        fail: () => this.syncState()
      });
      if (!started) this.syncState();
    }
  }
});
