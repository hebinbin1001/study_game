// 管理后台（2026-09-13 用户需求）：统计概览 + 用户列表（含微信名，仅管理员可见）
//
// 进入方式：我的页**连点版本号 5 次**（隐藏入口，主流做法）；进去先输入管理口令。
// 权限：服务端 ADMIN_OPENIDS 白名单或 ADMIN_PASSCODE 口令（云托管环境变量，零 DDL）。
// 隐私：完整昵称与微信名只在本页展示；排行榜等公开接口返回的仍是用户自设昵称。
//
// 2026-09-29 补齐（用户：「你看下管理员界面还缺少，一起做了」）：
//   · 用户列表补头像（服务端一直在查 avatar_url，却没返回给端上 → 列表永远没头像）
//   · 排序切换（最近活跃 / 段位星数 / 注册时间）、搜索支持微信名与 openid、显示总人数
//   · 微信名采集率（微信名引导效果的唯一度量）、玩法热度、段位同步异常告警
//   · 时间一律显示相对文案（「3 天前」比 ISO 时间戳更能看出流失）
//   WXML 里不能调用方法（会静默渲染成空）—— 所有展示字段都在这里算好。
var request = require('../../utils/request');
var storage = require('../../utils/storage');
var relTime = require('../../utils/rel-time');

var PASSCODE_KEY = 'ww_admin_passcode';

/** 排序切换项（key 与服务端 server/admin-query.js 的白名单一致） */
var SORT_OPTIONS = [
  { key: 'active', label: '最近活跃' },
  { key: 'stars', label: '段位星数' },
  { key: 'created', label: '注册时间' }
];

/** 玩法热度只展开前 N 款，其余收成一行合计（避免把页面撑得很长） */
var HEAT_TOP_N = 8;

/** 给用户行补「显示用」字段（相对时间 / 微信名兜底文案） */
function decorateUsers(list) {
  return (list || []).map(function (u) {
    return Object.assign({}, u, {
      lastActiveText: u.lastActiveAt ? relTime.relTime(u.lastActiveAt) : '未上报',
      createdText: relTime.relTime(u.createdAt) || '未知',
      wxText: u.wxNickname || '未采集'
    });
  });
}

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
    q: '',
    total: 0,              // 当前筛选条件下的总人数（分页靠它算「已加载 / 共」）
    sort: 'active',        // 当前排序键
    sortOptions: SORT_OPTIONS,
    myOpenid: '',
    myOpenidMasked: '',
    adminBy: ''
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
    // 先把「我是谁」写进页面（管理员可见自己的完整 openid，便于转白名单；可一键复制）
    request.get('/api/admin/check?passcode=' + encodeURIComponent(this.data.passcode)).then(function (d) {
      if (d && d.isAdmin) {
        self.setData({ myOpenid: d.openid || '', myOpenidMasked: d.openidMasked || '', adminBy: d.by || '' });
      }
    }).catch(function () { /* 忽略 */ });
    request.get('/api/admin/stats?passcode=' + encodeURIComponent(this.data.passcode)).then(function (d) {
      if (!d) return;
      var dist = d.rankDist || {};
      var distList = Object.keys(dist).map(function (k) { return { name: k, count: dist[k] }; })
        .sort(function (a, b) { return b.count - a.count; });

      // 玩法热度：前 N 款画条形（宽度按第一名归一化），其余收成一行合计
      var heat = d.gameHeat || [];
      var maxCount = heat.length ? heat[0].count : 0;
      var heatTop = heat.slice(0, HEAT_TOP_N).map(function (g) {
        return {
          label: g.label,
          count: g.count,
          // 最小值给 6%，否则局数很少的玩法条形几乎看不见，像没渲染出来
          pct: maxCount ? Math.max(6, Math.round((g.count / maxCount) * 100)) : 0
        };
      });
      var heatRest = heat.slice(HEAT_TOP_N);
      var heatRestGames = heatRest.reduce(function (s, g) { return s + g.count; }, 0);

      self.setData({
        stats: Object.assign({}, d, {
          rankDistList: distList,
          gameHeatTop: heatTop,
          gameHeatRestTypes: heatRest.length,
          gameHeatRestGames: heatRestGames,
          // 段位同步自检：非空 = 最近一次重算失败（否则用户星星涨了段位不涨）
          rankSyncWarn: d.lastRankSyncError || ''
        })
      });
    }).catch(function () { /* 静默：统计失败不影响用户列表 */ });
  },

  loadUsers: function (reset) {
    var self = this;
    if (this.data.loading) return;
    var page = reset ? 1 : this.data.page + 1;
    if (!reset && !this.data.hasMore) return;
    // 请求序号：中途切排序/搜索会让旧请求作废，避免旧数据覆盖新结果（乱序回包）
    var seq = (this._reqSeq || 0) + 1;
    this._reqSeq = seq;
    this.setData({ loading: true });
    var url = '/api/admin/users?passcode=' + encodeURIComponent(this.data.passcode) +
      '&page=' + page + '&pageSize=20&sort=' + encodeURIComponent(this.data.sort || 'active') +
      '&q=' + encodeURIComponent(this.data.q || '');
    request.get(url).then(function (d) {
      if (seq !== self._reqSeq) return;   // 已被更新的请求取代，丢弃
      var list = decorateUsers((d && d.list) || []);
      self.setData({
        users: reset ? list : self.data.users.concat(list),
        page: page,
        hasMore: !!(d && d.hasMore),
        total: (d && d.total) || 0,
        loading: false
      });
    }).catch(function () {
      if (seq !== self._reqSeq) return;
      self.setData({ loading: false });
    });
  },

  onSearchInput: function (e) {
    this.setData({ q: e.detail.value });
  },

  onSearch: function () { this.loadUsers(true); },

  /** 切换排序：换键 + 回到第一页重拉（服务端排序，不是端上排） */
  onSortTap: function (e) {
    var key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key;
    if (!key || key === this.data.sort) return;
    // loading 一起放开，否则正在加载时切排序会被 loadUsers 的防重入直接吞掉
    this.setData({ sort: key, users: [], hasMore: false, page: 1, loading: false });
    this.loadUsers(true);
  },

  /** 复制自己的 openid（配 ADMIN_OPENIDS 白名单用） */
  copyOpenid: function () {
    var id = this.data.myOpenid || '';
    if (!id) { wx.showToast({ title: '暂无 openid', icon: 'none' }); return; }
    if (wx.setClipboardData) {
      wx.setClipboardData({ data: id, success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
    }
  },

  onMore: function () { this.loadUsers(false); },

  goBack: function () { wx.navigateBack(); }
});
