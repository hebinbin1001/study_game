// 段位详情页（第三批 · 第 8 条）
//
// 用户要求：点段位能看到各段位需要的星星范围、当前段位、距离下一个段位还差多少星。
// 阶梯规则与后端同源（utils/rank-ladder.js 是前端副本，单测逐级比对两端）。
var ladder = require('../../utils/rank-ladder');
var rankBadge = require('../../utils/rank-badge');
var storage = require('../../utils/storage');

Page({
  data: {
    stars: 0, name: '', badge: '', progress: 0,
    nextName: '', need: 0, isMax: false, cells: [], curCell: 0
  },

  onLoad: function (options) {
    var want = parseInt((options || {}).stars, 10);
    this._render(want >= 0 ? want : this._localStars());
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

  goBack: function () { wx.navigateBack(); }
});
