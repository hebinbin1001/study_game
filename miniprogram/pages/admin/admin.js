// 管理后台（2026-09-13 用户需求）：统计概览 + 用户列表（含微信名，仅管理员可见）
//
// 进入方式：我的页**连点版本号 5 次**（隐藏入口，主流做法）；进去先输入管理口令。
// 权限：服务端 ADMIN_OPENIDS 白名单或 ADMIN_PASSCODE 口令（云托管环境变量，零 DDL）。
// 隐私：完整昵称与微信名只在本页展示；排行榜等公开接口返回的仍是用户自设昵称。
var request = require('../../utils/request');
var storage = require('../../utils/storage');

var PASSCODE_KEY = 'ww_admin_passcode';

Page({
  data: {
    ready: false,          // 口令校验通过
    checking: false,
    passcode: '',
    stats: null,
    users: [],
    page: 1,
    hasMore: false,
    loading: false,
    q: ''
  },

  onLoad: function () {
    var saved = storage.get(PASSCODE_KEY) || '';
    if (saved) {
      this.setData({ passcode: saved });
      this._check();
    }
  },

  onPasscodeInput: function (e) {
    this.setData({ passcode: e.detail.value });
  },

  onEnter: function () {
    var code = String(this.data.passcode || '').trim();
    if (!code) { wx.showToast({ title: '请输入管理口令', icon: 'none' }); return; }
    storage.set(PASSCODE_KEY, code);
    this._check();
  },

  _check: function () {
    var self = this;
    if (this.data.checking) return;
    this.setData({ checking: true });
    request.get('/api/admin/check?passcode=' + encodeURIComponent(this.data.passcode)).then(function (d) {
      var ok = !!(d && d.isAdmin);
      self.setData({ checking: false, ready: ok });
      if (!ok) {
        storage.set(PASSCODE_KEY, '');
        wx.showToast({ title: '口令无效或没有权限', icon: 'none' });
        return;
      }
      self.loadStats();
      self.loadUsers(true);
    }).catch(function (err) {
      self.setData({ checking: false });
      wx.showToast({ title: (err && err.message) || '校验失败', icon: 'none' });
    });
  },

  loadStats: function () {
    var self = this;
    request.get('/api/admin/stats?passcode=' + encodeURIComponent(this.data.passcode)).then(function (d) {
      if (!d) return;
      var dist = d.rankDist || {};
      var distList = Object.keys(dist).map(function (k) { return { name: k, count: dist[k] }; })
        .sort(function (a, b) { return b.count - a.count; });
      self.setData({ stats: Object.assign({}, d, { rankDistList: distList }) });
    }).catch(function () { /* 静默：统计失败不影响用户列表 */ });
  },

  loadUsers: function (reset) {
    var self = this;
    if (this.data.loading) return;
    var page = reset ? 1 : this.data.page + 1;
    if (!reset && !this.data.hasMore) return;
    this.setData({ loading: true });
    var url = '/api/admin/users?passcode=' + encodeURIComponent(this.data.passcode) +
      '&page=' + page + '&pageSize=20&q=' + encodeURIComponent(this.data.q || '');
    request.get(url).then(function (d) {
      var list = (d && d.list) || [];
      self.setData({
        users: reset ? list : self.data.users.concat(list),
        page: page,
        hasMore: !!(d && d.hasMore),
        loading: false
      });
    }).catch(function () { self.setData({ loading: false }); });
  },

  onSearchInput: function (e) {
    this.setData({ q: e.detail.value });
  },

  onSearch: function () { this.loadUsers(true); },

  onMore: function () { this.loadUsers(false); },

  goBack: function () { wx.navigateBack(); }
});
