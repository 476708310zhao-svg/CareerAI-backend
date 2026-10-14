const navigation = require('../utils/navigation.js');
const unreadMessages = require('../utils/unread-messages.js');

const FULL_TAB_LIST = [
  {
    pagePath: 'pages/index/index',
    text: '首页',
    iconPath: '/images/zhiyin-icons/nav-home.png',
    selectedIconPath: '/images/zhiyin-icons/nav-home-active.png'
  },
  {
    pagePath: 'pages/jobs/jobs',
    text: '找岗位',
    iconPath: '/images/zhiyin-icons/nav-jobs.png',
    selectedIconPath: '/images/zhiyin-icons/nav-jobs-active.png'
  },
  {
    pagePath: 'pages/ai-career/ai-career',
    text: 'AI求职',
    iconPath: '/images/zhiyin-icons/nav-ai.png',
    selectedIconPath: '/images/zhiyin-icons/nav-ai-active.png'
  },
  {
    pagePath: 'pages/resources/resources',
    text: '资源',
    iconPath: '/images/zhiyin-icons/nav-resources.png',
    selectedIconPath: '/images/zhiyin-icons/nav-resources-active.png'
  },
  {
    pagePath: 'pages/profile/profile',
    text: '我的',
    iconPath: '/images/zhiyin-icons/nav-profile.png',
    selectedIconPath: '/images/zhiyin-icons/nav-profile-active.png',
    showBadge: true
  }
];

Component({
  options: {
    addGlobalClass: true
  },

  data: {
    selected: 0,
    hidden: false,
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

    setHidden(hidden) {
      this.setData({ hidden: !!hidden });
    },

    setSelected(index) {
      const selected = Number(index);
      if (!Number.isInteger(selected) || selected < 0 || selected >= this.data.list.length) return;
      this.setData({ selected });
    },

    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;

      this.setData({ selected: index });
      if (item.pagePath === 'pages/ai-career/ai-career') {
        const started = navigation.openAiTab(this.buildAiContext(), {
          success: () => this.syncState(),
          fail: () => this.syncState()
        });
        if (!started) this.syncState();
        return;
      }
      const started = navigation.safeSwitchTab(`/${item.pagePath}`, {
        success: () => this.syncState(),
        fail: () => this.syncState()
      });
      if (!started) this.syncState();
    },

    buildAiContext() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1] || {};
      const route = String(current.route || '').replace(/^\/+/, '');
      const data = current.data || {};
      const context = { source: route.split('/').pop() || 'home' };

      if (route === 'pages/applications/applications') {
        const application = (data.visibleApplications || [])[0] || (data.applications || [])[0] || {};
        context.applicationId = application.id || '';
        context.company = application.company || '';
        context.role = application.jobTitle || application.title || '';
      } else if (route === 'pages/jobs/jobs') {
        context.role = data.searchKeyword || data.activeTag || '';
      } else if (route === 'pages/resources/resources') {
        context.company = data.company || '';
        context.role = data.role || '';
      }

      return context;
    }
  }
});
