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
var constants = require('../../utils/constants');
var GAME_CATALOG = require('../../utils/game-catalog');

var PASSCODE_KEY = 'ww_admin_passcode';

/** 排序切换项（key 与服务端 server/admin-query.js 的白名单一致） */
var SORT_OPTIONS = [
  { key: 'active', label: '最近活跃' },
  { key: 'stars', label: '段位星数' },
  { key: 'created', label: '注册时间' }
];
var REVIEW_TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' }
];

/** 玩法热度只展开前 N 款，其余收成一行合计（避免把页面撑得很长） */
var HEAT_TOP_N = 8;

/** 给用户行补「显示用」字段（相对时间 / 微信名兜底文案） */
function decorateUsers(list) {
  return (list || []).map(function (u) {
    return Object.assign({}, u, {
      lastActiveText: u.lastActiveAt ? relTime.relTime(u.lastActiveAt) : '未上报',
      createdText: relTime.relTime(u.createdAt) || '未知',
      banActionText: u.banned ? '解除' : '拉黑'
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
    loadWarn: '',          // 列表异常提示（排序降级 / 加载失败）——空串 = 一切正常
    myOpenid: '',
    myOpenidMasked: '',
    adminBy: '',
    reviewTabs: REVIEW_TABS,
    reviewStatus: 'pending',
    reviewLevels: [],
    reviewLoading: false,
    reviewingId: '',
    gameControls: [],
    bannedControls: [],
    controlsLoading: false,
    controlBusy: ''
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
      self.loadReviews();
      self.loadControls();
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
        // 后端排序降级（非空）或返回了「有人但本页没人」这种异常，都要说出来 ——
        // 静默会把「共 22 人 · 已加载 0」摆在那里，看起来像用户数据丢了
        loadWarn: (d && d.orderError) ? ('排序降级为注册时间：' + d.orderError) : '',
        loading: false
      });
    }).catch(function () {
      if (seq !== self._reqSeq) return;
      // 此前这里完全静默 —— 接口挂了页面只会显示空列表，排查时只能靠猜
      self.setData({ loading: false, loadWarn: '列表加载失败，请下拉重试或检查网络' });
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

  /** 运营控制：玩法入口开关 + 当前黑名单摘要 */
  loadControls: function () {
    var self = this;
    if (this.data.controlsLoading) return;
    this.setData({ controlsLoading: true });
    request.get('/api/admin/controls?passcode=' + encodeURIComponent(this.data.passcode || ''))
      .then(function (d) {
        var paused = (d && d.paused) || [];
        var banned = (d && d.banned) || [];
        var pausedMap = {};
        paused.forEach(function (x) { pausedMap[x.gameKey] = x.reason || ''; });
        var controls = GAME_CATALOG.filter(function (g) {
          return g.unlocked;
        }).map(function (g) {
          return {
            key: g.key,
            name: g.name,
            icon: g.icon,
            paused: Object.prototype.hasOwnProperty.call(pausedMap, g.key),
            reason: pausedMap[g.key] || ''
          };
        });
        self.setData({
          gameControls: controls,
          bannedControls: banned,
          controlsLoading: false
        });
      })
      .catch(function () {
        self.setData({ controlsLoading: false });
      });
  },

  toggleGamePause: function (e) {
    var self = this;
    var key = e.currentTarget.dataset.key;
    var item = (this.data.gameControls || []).find(function (g) { return g.key === key; });
    if (!item || this.data.controlBusy) return;
    var nextPaused = !item.paused;
    if (!nextPaused) {
      this._setGamePause(key, false, '');
      return;
    }
    wx.showModal({
      title: '暂停「' + item.name + '」',
      editable: true,
      placeholderText: '填写暂停原因（可选，用户不可见）',
      success: function (res) {
        if (res.confirm) self._setGamePause(key, true, res.content || '');
      }
    });
  },

  _setGamePause: function (gameKey, paused, reason) {
    var self = this;
    this.setData({ controlBusy: gameKey });
    request.post('/api/admin/game-pause?passcode=' + encodeURIComponent(this.data.passcode || ''), {
      gameKey: gameKey,
      paused: paused,
      reason: reason
    }).then(function () {
      self.setData({ controlBusy: '' });
      wx.showToast({ title: paused ? '已暂停入口' : '已恢复入口', icon: 'success' });
      self.loadControls();
    }).catch(function (err) {
      self.setData({ controlBusy: '' });
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    });
  },

  toggleUserBan: function (e) {
    var self = this;
    var openid = e.currentTarget.dataset.openid;
    var row = (this.data.users || []).find(function (u) { return u.openid === openid; });
    var banned = !!(row && row.banned);
    var nickname = (row && row.nickname) || '该用户';
    if (!openid || this.data.controlBusy) return;
    if (banned) {
      wx.showModal({
        title: '解除限制',
        content: '恢复「' + nickname + '」的登录和游戏权限？',
        success: function (res) {
          if (res.confirm) self._setUserBan(openid, false, '');
        }
      });
      return;
    }
    wx.showModal({
      title: '拉黑用户',
      editable: true,
      placeholderText: '填写原因（仅管理员可见）',
      success: function (res) {
        if (res.confirm) self._setUserBan(openid, true, res.content || '');
      }
    });
  },

  _setUserBan: function (openid, banned, reason) {
    var self = this;
    this.setData({ controlBusy: openid });
    request.post('/api/admin/user-ban?passcode=' + encodeURIComponent(this.data.passcode || ''), {
      openid: openid,
      banned: banned,
      reason: reason
    }).then(function () {
      self.setData({ controlBusy: '' });
      wx.showToast({ title: banned ? '已拉黑' : '已解除', icon: 'success' });
      self.loadUsers(true);
      self.loadControls();
    }).catch(function (err) {
      self.setData({ controlBusy: '' });
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    });
  },

  /** 关卡审核：待审核 / 已通过 / 已拒绝 */
  loadReviews: function () {
    var self = this;
    if (this.data.reviewLoading) return;
    this.setData({ reviewLoading: true });
    var status = this.data.reviewStatus || 'pending';
    request.get('/api/level/reviews?status=' + encodeURIComponent(status)
      + '&passcode=' + encodeURIComponent(this.data.passcode || '')).then(function (d) {
      var list = Array.isArray(d) ? d : ((d && d.list) || []);
      var gradeMap = {};
      (constants.GRADES || []).forEach(function (g) { gradeMap[g.key] = g.label; });
      var statusText = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
      var rows = list.map(function (l) {
        var items = Array.isArray(l.items) ? l.items : [];
        return {
          levelId: l.levelId,
          title: l.title || '未命名关卡',
          description: l.description || '',
          gradeLabel: gradeMap[l.grade] || l.grade || '未知学段',
          totalQ: parseInt(l.totalQ, 10) || items.length,
          status: l.status || status,
          statusText: statusText[l.status || status] || l.status || '',
          shareCode: l.shareCode || '',
          authorOpenidMasked: l.authorOpenidMasked || '',
          createdText: l.createdAt ? (relTime.relTime(l.createdAt) || '未知') : '未知',
          itemsText: items.slice(0, 2).map(function (it) {
            return (it.q || '') + ' → ' + (it.a || '');
          }).join('；')
        };
      });
      self.setData({ reviewLevels: rows, reviewLoading: false });
    }).catch(function (err) {
      self.setData({ reviewLevels: [], reviewLoading: false });
      wx.showToast({ title: (err && err.message) || '审核列表加载失败', icon: 'none' });
    });
  },

  onReviewTab: function (e) {
    var key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key;
    if (!key || key === this.data.reviewStatus) return;
    this.setData({ reviewStatus: key, reviewLevels: [], reviewLoading: false });
    this.loadReviews();
  },

  approveLevel: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id || this.data.reviewingId) return;
    wx.showModal({
      title: '通过关卡',
      content: '通过后会进入公开关卡广场，所有玩家都可以玩。确认通过？',
      success: function (res) { if (res.confirm) self._submitReview(id, 'approved', ''); }
    });
  },

  rejectLevel: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id || this.data.reviewingId) return;
    wx.showModal({
      title: '拒绝关卡',
      editable: true,
      placeholderText: '填写拒绝原因（可选）',
      success: function (res) {
        if (res.confirm) self._submitReview(id, 'rejected', res.content || '');
      }
    });
  },

  _submitReview: function (levelId, status, comment) {
    var self = this;
    this.setData({ reviewingId: levelId });
    request.post('/api/level/review', {
      levelId: levelId,
      status: status,
      comment: comment,
      passcode: this.data.passcode
    }).then(function () {
      self.setData({ reviewingId: '' });
      wx.showToast({ title: status === 'approved' ? '已通过' : '已拒绝', icon: 'success' });
      self.loadReviews();
    }).catch(function (err) {
      self.setData({ reviewingId: '' });
      wx.showToast({ title: (err && err.message) || '审核失败', icon: 'none' });
    });
  },

  goBack: function () { wx.navigateBack(); }
});
