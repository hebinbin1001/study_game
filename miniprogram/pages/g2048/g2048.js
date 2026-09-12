// 2048 页（B6-3）：固定关卡——目标数字递增 + 限定步数
// 滑动合成（支持方向键 + 触摸滑动），达到目标过关；步尽未达 / 无路可走失败。
var game = require('../../game/tw2048');
var storage = require('../../utils/storage');

// 关卡表（10 关）：目标 32 → 512，每个目标两档（标准 / 挑战）。
//
// 步数预算是按「合并次数」推算出来的，不是拍脑袋：
//   · 合成目标 T 至少需要 (T/2 − 1) 次合并（T=512 → 255 次）；
//   · 一次移动最多合并 8 次（4 行 × 2），但实战平均只有约 1.2~1.5 次/步
//     （自动对局实测：32→17 步、64→34 步、128→57 步）；
//   · 所以步数预算必须与目标同量级增长，取 1.5 次合并/步作为「可达性下限」，
//     再按用户反馈放宽：入门档 = 下限 × 2.2、挑战档 = 下限 × 1.6（留足试错空间）。
//
// 原关卡表是「线性 +6」增长（32/20 → 2048/64），而难度是翻倍增长 ——
// 于是 1024/54、2048/64 两关在数学上不可能通过（2048 至少需要 128 步，
// 实战约 680 步）。本次按实测模型重算，并把目标上限收到 512：
// 1024 需要约 600 步、2048 约 1300 步（10~30 分钟一局），不适合作为关卡目标。
// 可达性回归见 miniprogram/utils/__tests__/g2048-levels.test.js。
var LEVELS = [
  { no: 1,  target: 32,  steps: 24,  tier: '入门' },
  { no: 2,  target: 32,  steps: 16,  tier: '挑战' },
  { no: 3,  target: 64,  steps: 48,  tier: '入门' },
  { no: 4,  target: 64,  steps: 34,  tier: '挑战' },
  { no: 5,  target: 128, steps: 96,  tier: '入门' },
  { no: 6,  target: 128, steps: 68,  tier: '挑战' },
  { no: 7,  target: 256, steps: 190, tier: '入门' },
  { no: 8,  target: 256, steps: 136, tier: '挑战' },
  { no: 9,  target: 512, steps: 380, tier: '入门' },
  { no: 10, target: 512, steps: 272, tier: '挑战' }
];

// 挑战模式（2026-09-12 用户认可「保留打到 2048 的成就感」）：
//   · 目标 2048、**不限步数**（只有「无路可走」才会失败）；
//   · 不写星级存档（关卡体系只到 512），只记录**最少步数**，越少越强。
var CHALLENGE = { target: 2048, stepsLimit: 999999 };
var CHALLENGE_BEST_KEY = 'ww_g2048_challenge_best';

Page({
  data: {
    curLevel: 1,
    target: 32,
    stepsLimit: 20,
    levelInfo: [],
    playing: false,
    cells: [],       // 4x4 扁平 [{v}]
    score: 0,
    usedSteps: 0,
    maxTile: 2,
    over: false,
    win: false,
    challenge: false,        // 是否挑战模式（不限步数冲 2048）
    challengeBest: 0,        // 挑战模式最佳步数（0 = 还没通关过）
    stars: 0,
    starsText: '',
    overMsg: ''
  },

  onLoad: function () {
    this.setData({ levelInfo: LEVELS });
    this.setData({ challengeBest: storage.get(CHALLENGE_BEST_KEY) || 0 });
    var cur = storage.get('ww_g2048_cur') || 1;
    if (cur > LEVELS.length) cur = LEVELS.length;
    this.loadLevel(cur);
  },

  _start: function (no) {
    var lv = LEVELS[no - 1];
    this._board = game.newBoard();
    this.setData({
      curLevel: no, target: lv.target, stepsLimit: lv.steps, challenge: false,
      playing: true, over: false, win: false,
      cells: this._flatten(this._board),
      score: 0, usedSteps: 0, maxTile: 2, stars: 0, starsText: ''
    });
  },

  /** 挑战模式：目标 2048、不限步数，只比最少步数 */
  startChallenge: function () {
    this._board = game.newBoard();
    this.setData({
      curLevel: 0, target: CHALLENGE.target, stepsLimit: CHALLENGE.stepsLimit, challenge: true,
      playing: true, over: false, win: false,
      cells: this._flatten(this._board),
      score: 0, usedSteps: 0, maxTile: 2, stars: 0, starsText: '',
      challengeBest: storage.get(CHALLENGE_BEST_KEY) || 0
    });
    wx.showToast({ title: '挑战模式：不限步数冲到 2048', icon: 'none', duration: 1800 });
  },

  loadLevel: function (no) {
    if (no > LEVELS.length) { this.setData({ playing: false }); return; }
    this._start(no);
  },

  _flatten: function (b) {
    return b.reduce(function (acc, row) { return acc.concat(row.map(function (v) { return { v: v }; })); }, []);
  },

  // 触摸滑动（2026-09-12：方向键按钮已去掉，滑动成为唯一操作）
  _startX: 0, _startY: 0,
  onTouchStart: function (e) {
    var t = e.touches && e.touches[0];
    if (t) { this._startX = t.clientX; this._startY = t.clientY; }
  },
  // 空实现：配合 wxml 的 catchtouchmove 阻止页面跟着手指滚（竖滑才不会丢手感）
  onTouchMove: function () {},
  onTouchEnd: function (e) {
    var ch = e.changedTouches && e.changedTouches[0];
    if (!ch) return;
    var dx = ch.clientX - this._startX;
    var dy = ch.clientY - this._startY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) this._move(dx > 0 ? 1 : 3);
    else this._move(dy > 0 ? 2 : 0);
  },

  _move: function (d) {
    if (!this.data.playing || this.data.over) return;
    var r = game.slide(this._board, d);
    if (!r.moved) return;
    this._board = r.board;
    var usedSteps = this.data.usedSteps + 1;
    var score = this.data.score + r.gained;
    var flat = this._flatten(this._board);
    var maxTile = Math.max(this.data.maxTile, flat.reduce(function (m, c) { return Math.max(m, c.v); }, 0));
    this.setData({ cells: flat, score: score, usedSteps: usedSteps, maxTile: maxTile });

    if (maxTile >= this.data.target) { this._win(); return; }
    if (usedSteps >= this.data.stepsLimit || r.gameover) this._lose(r.gameover);
  },

  _win: function () {
    // 挑战模式：不写星级存档（关卡体系只到 512），只记「最少步数」
    if (this.data.challenge) {
      var used = this.data.usedSteps;
      var prevBest = storage.get(CHALLENGE_BEST_KEY) || 0;
      var best = (prevBest > 0 && prevBest < used) ? prevBest : used;
      storage.set(CHALLENGE_BEST_KEY, best);
      this.setData({
        playing: false, over: true, win: true, stars: 0, starsText: '🏆',
        challengeBest: best,
        overMsg: '冲到 2048 用了 ' + used + ' 步 · 最佳 ' + best + ' 步'
      });
      return;
    }
    // 星级：≤50%步 3 星 / ≤80% 2 星 / 其余 1 星
    var ratio = this.data.usedSteps / this.data.stepsLimit;
    var stars = ratio <= 0.5 ? 3 : (ratio <= 0.8 ? 2 : 1);
    storage.saveStars('g2048', this.data.curLevel, stars);
    var next = Math.min(this.data.curLevel + 1, LEVELS.length);
    storage.set('ww_g2048_cur', next);
    this.setData({ playing: false, over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars), overMsg: '达成 ' + this.data.target + '！' });
  },

  _lose: function (stuck) {
    this.setData({
      playing: false, over: true, win: false, stars: 0, starsText: '',
      overMsg: stuck ? '没有可走的路了' : '步数用尽 · 差一点'
    });
  },

  again: function () { this.loadLevel(this.data.curLevel); },
  goNext: function () {
    // 挑战模式没有「下一关」，重开一次挑战即可
    if (this.data.challenge) { this.startChallenge(); return; }
    var n = Math.min(this.data.curLevel + 1, LEVELS.length);
    storage.set('ww_g2048_cur', n);
    this.loadLevel(n);
  },
  goLevels: function () {
    this.setData({
      playing: false, over: false,
      challengeBest: storage.get(CHALLENGE_BEST_KEY) || 0
    });
  },
  pickLevel: function (e) {
    var no = e.currentTarget.dataset.no;
    if (no > (storage.get('ww_g2048_cur') || 1) && no > this.data.curLevel && this.data.curLevel < no - 1) {
      // 未解锁：仅允许顺序挑战
    }
    this.loadLevel(no);
  },

  goBack: function () { wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 2048 闯关', path: '/pages/playlist/playlist' };
  }
});
