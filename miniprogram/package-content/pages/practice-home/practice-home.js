'use strict';
const api = require('../../../utils/api-question-bank.js');
const navigation = require('../../../utils/navigation.js');

const LIST = { sets: 'sets', history: 'history', mistakes: 'mistakes', favorites: 'favorites' };
const LIMIT = 30;
function errorText(error) { return error && error.message || '加载失败，请重试'; }
function safeRows(value) { return Array.isArray(value) ? value : []; }
function rowsFor(view, rows) {
  return view === 'mistakes' || view === 'favorites'
    ? safeRows(rows).map(item => ({ ...item, rowKey: `${item.sessionId}-${item.position}` })) : safeRows(rows);
}

Page({
  data: { view: 'sets', loading: false, loadingMore: false, busySetId: null, error: '', moreError: '',
    loggedIn: false, sets: [], active: [], history: [], mistakes: [], favorites: [],
    nextCursor: null, total: 0, currentPage: 1, hasPrevious: false },
  onLoad() { this._active = true; this._request = 0; this._attempts = Object.create(null);
    this._pageCursors = [0]; this._pageIndex = 0; },
  onShow() {
    this._active = true;
    const owner = api.capture();
    if (!this._owner || !api.current(this._owner) || this._owner.token !== owner.token) {
      this._owner = owner; this._attempts = Object.create(null); this.clearPrivate();
    }
    return this.load();
  },
  onHide() { this._active = false; this._request++; this.clearPrivate(); },
  onUnload() { this._active = false; this._request++; this.clearPrivate(); },
  clearPrivate() {
    this._pageCursors = [0]; this._pageIndex = 0;
    this.setData({ sets: [], active: [], history: [], mistakes: [], favorites: [],
      loading: false, loadingMore: false, busySetId: null, nextCursor: null, total: 0,
      currentPage: 1, hasPrevious: false });
  },
  ownerLive(owner, request) { return this._active && request === this._request && api.current(owner); },
  ownerChanged(owner, request) {
    if (request !== undefined && (request !== this._request || !this._active)) return false;
    if (!api.current(owner)) { this._request++; this._owner = api.capture(); this._attempts = Object.create(null);
      this.clearPrivate(); this.setData({ loggedIn: !!this._owner.token, error: '账号已变化，请重新加载' }); return true; }
    return false;
  },
  changeView(event) {
    const view = event.currentTarget.dataset.view;
    if (!LIST[view] || view === this.data.view) return;
    this._request++; this.clearPrivate(); this.setData({ view, error: '', moreError: '' }); return this.load();
  },
  async load() {
    const owner = this._owner = api.capture();
    const request = ++this._request;
    this.clearPrivate();
    if (!owner.token) { this.setData({ loggedIn: false, error: '' }); return; }
    const view = this.data.view;
    this.setData({ loggedIn: true, loading: true, error: '', moreError: '' });
    try {
      if (view === 'sets') {
        const [catalogue, active] = await Promise.all([
          api.sets({ cursor: 0, limit: LIMIT }), api.sessions({ cursor: 0, limit: LIMIT, status: 'active' })]);
        if (!this.ownerLive(owner, request)) { this.ownerChanged(owner, request); return; }
        this.setData({ sets: safeRows(catalogue.sets), active: safeRows(active.sessions),
          total: Number(catalogue.total || 0), nextCursor: catalogue.nextCursor });
      } else {
        const data = await this.fetchView(view, 0);
        if (!this.ownerLive(owner, request)) { this.ownerChanged(owner, request); return; }
        this.setData({ [view]: rowsFor(view, data[view === 'history' ? 'sessions' : view]),
          total: Number(data.total || 0), nextCursor: data.nextCursor });
      }
    } catch (error) {
      if (this.ownerLive(owner, request)) {
        if (error.statusCode === 403 || error.statusCode === 401) this.clearPrivate();
        this.setData({ error: errorText(error) });
      } else this.ownerChanged(owner, request);
    } finally { if (this.ownerLive(owner, request)) this.setData({ loading: false }); }
  },
  fetchView(view, cursor) {
    const params = { cursor, limit: LIMIT };
    if (view === 'history') return api.sessions({ ...params, status: 'finished' });
    if (view === 'mistakes') return api.mistakes(params);
    return api.favorites(params);
  },
  async loadMore() {
    if (this.data.loadingMore || this.data.nextCursor == null || this.data.loading) return;
    if (this.data.view === 'mistakes' || this.data.view === 'favorites')
      return this.loadPrivatePage(this.data.nextCursor, this._pageIndex + 1);
    const owner = this._owner, request = ++this._request, view = this.data.view, cursor = this.data.nextCursor;
    this.setData({ loadingMore: true, moreError: '' });
    try {
      const data = view === 'sets' ? await api.sets({ cursor, limit: LIMIT }) : await this.fetchView(view, cursor);
      if (!this.ownerLive(owner, request) || view !== this.data.view) { this.ownerChanged(owner, request); return; }
      const key = view === 'history' ? 'sessions' : view;
      this.setData({ [view]: [...this.data[view], ...rowsFor(view, data[key])], nextCursor: data.nextCursor,
        total: Number(data.total || this.data.total) });
    } catch (error) {
      if (this.ownerLive(owner, request)) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          this.clearPrivate();
          this.setData({ error: errorText(error), loggedIn: error.statusCode === 401 ? false : this.data.loggedIn });
        } else this.setData({ moreError: errorText(error) });
      }
      else this.ownerChanged(owner, request);
    } finally { if (this.ownerLive(owner, request)) this.setData({ loadingMore: false }); }
  },
  loadPrevious() {
    if (this.data.loadingMore || this.data.loading || this._pageIndex < 1 ||
        !['mistakes', 'favorites'].includes(this.data.view)) return;
    return this.loadPrivatePage(this._pageCursors[this._pageIndex - 1], this._pageIndex - 1);
  },
  async loadPrivatePage(cursor, index) {
    const owner = this._owner, request = ++this._request, view = this.data.view;
    this.setData({ [view]: [], loadingMore: true, moreError: '' });
    try {
      const data = await this.fetchView(view, cursor);
      if (!this.ownerLive(owner, request) || view !== this.data.view) { this.ownerChanged(owner, request); return; }
      this._pageCursors = this._pageCursors.slice(0, index);
      this._pageCursors[index] = cursor;
      this._pageIndex = index;
      this.setData({ [view]: rowsFor(view, data[view]), nextCursor: data.nextCursor,
        total: Number(data.total || 0), currentPage: index + 1, hasPrevious: index > 0 });
    } catch (error) {
      if (this.ownerLive(owner, request)) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          this.clearPrivate();
          this.setData({ error: errorText(error), loggedIn: error.statusCode === 401 ? false : this.data.loggedIn });
        } else this.setData({ moreError: errorText(error) });
      } else this.ownerChanged(owner, request);
    } finally { if (this.ownerLive(owner, request)) this.setData({ loadingMore: false }); }
  },
  async startSet(event) {
    const setId = Number(event.currentTarget.dataset.id);
    if (!Number.isSafeInteger(setId) || setId < 1 || this.data.busySetId) return;
    const owner = this._owner;
    if (!owner || !api.current(owner)) { this.ownerChanged(owner); return; }
    const attempt = this._attempts[setId] || { owner, key: api.key() };
    this._attempts[setId] = attempt;
    const request = this._request;
    this.setData({ busySetId: setId, error: '' });
    try {
      const data = await api.start(setId, attempt.key);
      if (!this.ownerLive(owner, request)) { this.ownerChanged(owner, request); return; }
      delete this._attempts[setId];
      if (!data.session || !data.session.id) throw new Error('会话创建失败，请刷新后重试');
      navigation.safeNavigateTo(api.sessionUrl(data.session.id));
    } catch (error) {
      if (this.ownerLive(owner, request)) {
        if (error.statusCode === 403 || error.statusCode === 401) this.clearPrivate();
        this.setData({ error: errorText(error) });
      } else this.ownerChanged(owner, request);
    } finally { if (this.ownerLive(owner, request)) this.setData({ busySetId: null }); }
  },
  openSession(event) {
    const owner = this._owner;
    if (!owner || !api.current(owner)) { this.ownerChanged(owner); return; }
    const id = Number(event.currentTarget.dataset.id);
    const position = Number(event.currentTarget.dataset.position);
    if (Number.isSafeInteger(id) && id > 0) navigation.safeNavigateTo(api.sessionUrl(id,
      Number.isSafeInteger(position) && position > 0 ? position : null));
  },
  openLogin() { navigation.safeSwitchTab('/pages/profile/profile'); },
  onPullDownRefresh() { return Promise.resolve(this.load()).finally(() => wx.stopPullDownRefresh()); }
});
