// 段位详情页（第三批 · 第 8 条）
//
// 用户要求：点段位能看到各段位需要的星星范围、当前段位、距离下一个段位还差多少星。
// 阶梯规则与后端同源（utils/rank-ladder.js 是前端副本，单测逐级比对两端）。
var ladder = require('../../utils/rank-ladder');
var rankBadge = require('../../utils/rank-badge');
var storage = require('../../utils/storage');
var request = require('../../utils/request');
var auth = require('../../utils/auth');

Page({
  data: {
    stars: 0, name: '', badge: '', progress: 0,
    nextName: '', need: 0, isMax: false, cells: [], curCell: 0,
    // 段位晋级考试（2026-10-08）
    needExam: false,        // 是否卡在待考状态（星数已封顶）
    examTierKey: '',        // 要考的大段 key（传给考试页做对账）
    examTierName: '',       // 要考的大段名（如「白银」，给人看）
    rawStars: 0             // 真实累计星（被卡住时比展示星数多）
  },

  onLoad: function (options) {
    var want = parseInt((options || {}).stars, 10);
    this._render(want >= 0 ? want : this._localStars());
  },

  /**
   * 每次进页面都问一次服务端 —— 晋级考试的状态（是否卡住、该考哪一段、封顶后的星数）
   * 只有服务端算得出来，本地那份是拿真实星数直接推的，会和服务端封顶口径对不上。
   */
  onShow: function () {
    var self = this;
    if (!auth.isLoggedIn()) return;
    request.get('/api/rank/info').then(function (d) {
      if (!d) return;
      self.setData({
        needExam: !!d.needExam,
        rawStars: Number(d.rawStars) || 0,
        examTierKey: d.nextExamTier || '',
        examTierName: self._tierName(d.nextExamTier)
      });
      // 展示用星数以服务端为准（它是封顶后的真值）
      if (typeof d.stars === 'number') self._render(d.stars);
    }).catch(function () { /* 静默：拿不到就沿用本地那份，页面不至于空 */ });
  },

  /** 大段 key → 中文名（考哪一段要显示给人看） */
  _tierName: function (key) {
    var list = ladder.BIG_RANKS || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i].name;
    }
    return '';
  },

  /** 去考试（带上服务端算好的目标大段，考试页用它做对账） */
  goExam: function () {
    wx.navigateTo({
      url: '/pages/rank-exam/rank-exam?tier=' + encodeURIComponent(this.data.examTierKey || '')
        + '&tierName=' + encodeURIComponent(this.data.examTierName || '')
    });
  },

  /** 没传 stars 时用本机累计星（首页/我的页会带上云端口径的数字） */
  _localStars: function () {
    var all = storage.getAllStars() || {};
    var sum = 0;
    Object.keys(all).forEach(function (k) { sum += (parseInt(all[k], 10) || 0); });
    return sum;
  },

  _render: function (stars) {
    var p = ladder.progressOf(stars);
    var curCell = p.current.cell;
    var cells = ladder.cells().map(function (c) {
      return {
        cell: c.cell,
        name: c.name,
        starsToEnter: c.starsToEnter,
        reached: c.cell <= curCell,
        isCur: c.cell === curCell,
        newBig: c.level === 1,
        badge: rankBadge.badgeUrl(c.bigRank.name)
      };
    });
    this.setData({
      stars: stars,
      name: p.current.name,
      badge: rankBadge.badgeUrl(p.current.bigRank.name),
      progress: p.progressPercent,
      nextName: p.nextName || '已是最高段位',
      need: p.starsNeeded,
      isMax: p.isMaxRank,
      cells: cells,
      curCell: curCell
    });
    wx.setNavigationBarTitle({ title: '段位详情' });
  },

  goBack: function () { wx.navigateBack(); },

  // M5 T4.1：段位详情分享（晒段位）
  onShareAppMessage: function () {
    var name = this.data.name || '';
    return {
      title: name ? ('词力战士 - 我已经是「' + name + '」了，来挑战我！') : '词力战士 - 看看段位阶梯，一起冲榜',
      path: '/pages/index/index'
    };
  }
});
