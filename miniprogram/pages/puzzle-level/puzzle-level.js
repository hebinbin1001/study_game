// 数字智力 · 关卡选择页（第三批 · 第 4 条 a）
//
// 用户拍板：数字智力类也要「先看关卡、再进游戏」——和题库类玩法一样。
// 关卡表来自 utils/puzzle-levels.js，进度/最短用时来自 utils/puzzle-progress.js；
// 点某一关就跳到对应玩法页并带 ?level=N（各玩法页负责从这一关开始）。
var catalog = require('../../utils/game-catalog');
var puzLv = require('../../utils/puzzle-levels');
var progress = require('../../utils/puzzle-progress');
var storage = require('../../utils/storage');

var DEFAULT_UNLOCKED = 3;      // 前 3 关默认解锁，与题库类关卡页同口径

// 玩法 key → 游戏页路径。
// 注意别用目录里的 url 来跳转：目录里 casual 玩法的 url 已经指向**本页**（关卡页），
// 用它跳会绕回自己（E2E 抓到的真 bug）。
var GAME_PAGE = {
  sudoku: '/pages/sudoku/sudoku',
  math24: '/pages/math24/math24',
  sprint: '/pages/math-sprint/math-sprint',
  balance: '/pages/math-balance/math-balance',
  g2048: '/pages/g2048/g2048',
  memory: '/pages/memory-grid/memory-grid',
  onestroke: '/pages/one-stroke/one-stroke',
  klotski: '/pages/klotski/klotski'
};

Page({
  data: {
    name: '', icon: '', desc: '', levels: [],
    clearedCount: 0, totalCount: 0, nextNo: 1, hasLevels: true,
    unlockedTip: ''
  },

  onLoad: function (options) {
    var mode = String((options || {}).mode || '');
    var game = null;
    catalog.forEach(function (g) { if (g.key === mode) game = g; });
    // 非法参数 / 题库类玩法（它们自己有关卡页）：退回玩法 tab
    if (!game || game.section !== 'casual') {
      // 玩法 tab 是 tabBar 页，只能用 switchTab（redirectTo 跳 tab 页会静默失败）
      wx.switchTab({ url: '/pages/playlist/playlist' });
      return;
    }
    this._game = game;
    this._mode = game.key;
    this._refresh();
  },

  onShow: function () {
    if (this._mode) this._refresh();   // 从游戏页返回要刷新「已通关 / 最快用时」
  },

  _refresh: function () {
    var mode = this._mode;
    var game = this._game;
    var rows = puzLv.levelsOf(mode);
    var cleared = progress.clearedOf(mode);
    // 通关判定取两个来源的并集：
    //   · 24点/数独/华容道/2048 会把星级写进 ww_stars（key 就是玩法名）
    //   · 其余玩法用 puzzle-progress 记录
    // 进度按「已通关的最大关号」推导，保证两种来源都能正确解锁下一关。
    var maxDone = 0;
    var list = rows.map(function (r) {
      var done = (!!cleared[r.no]) || (storage.getStars(mode, r.no) > 0);
      if (done && r.no > maxDone) maxDone = r.no;
      return { no: r.no, done: done, sub: r.sub, label: r.label };
    });
    var nextNo = maxDone + 1;
    var unlockTo = Math.max(DEFAULT_UNLOCKED, nextNo);
    list = list.map(function (r) {
      var locked = r.no > unlockTo;
      var best = progress.bestMsOf(mode, r.no);
      return {
        no: r.no,
        label: r.label,
        sub: r.sub,
        done: r.done,
        locked: locked,
        state: r.done ? 'done' : (locked ? 'lock' : (r.no === nextNo ? 'cur' : 'open')),
        bestText: best ? ('最快 ' + (best / 1000).toFixed(1) + ' 秒') : ''
      };
    });
    this.setData({
      name: game.name,
      icon: game.icon,
      desc: game.desc,
      levels: list,
      totalCount: list.length,
      clearedCount: Object.keys(cleared).length,
      nextNo: nextNo,
      hasLevels: list.length > 0,
      unlockedTip: '前 ' + DEFAULT_UNLOCKED + ' 关默认解锁，通关后解锁下一关'
    });
    wx.setNavigationBarTitle({ title: game.name + ' · 选择关卡' });
  },

  onLevelTap: function (e) {
    var row = this.data.levels[parseInt(e.currentTarget.dataset.index, 10)];
    if (!row) return;
    if (row.locked) {
      wx.showToast({ title: '通关第 ' + (row.no - 1) + ' 关解锁本关', icon: 'none' });
      return;
    }
    var page = GAME_PAGE[this._mode];
    if (!page) { wx.showToast({ title: '该玩法暂无关卡入口', icon: 'none' }); return; }
    wx.navigateTo({ url: page + '?level=' + row.no });
  },

  goBack: function () { wx.navigateBack(); }
});
