// 算式天平（玩法落地：demo g5）——左盘给算式，挑一个数字放右盘让天平平衡
// 与 demo 的差异：复用公共 HUD / 结算弹层；倾斜角度与托盘状态由引擎纯函数决定；
// 成绩只存本地最高分（固定玩法不入字词进度）。
// 关联：game/balance.js（纯逻辑，可单测）
var lib = require('../../game/balance');
var constants = require('../../utils/constants');
var playReport = require('../../utils/play-report');
var storage = require('../../utils/storage');

var BEST_KEY = 'ww_balance_best';
var NEXT_MS = 950;      // 答对后停留
var WRONG_MS = 1700;    // 答错后停留（要看懂天平往哪边歪）

Page({
  data: {
    lives: lib.LIVES,
    score: 0,
    scoreText: '分',
    hudText: '',
    expr: '',
    rightVal: '?',
    rightEmpty: true,
    tilt: 0,
    tiltNeg: 0,
    panCls: '',
    trend: '',
    options: [],
    picked: null,
    rightIdx: -1,
    locked: false,
    settle: false,
    win: false,
    starsText: '',
    overMsg: '',
    best: 0
  },

  _qi: 0,
  _lives: lib.LIVES,
  _score: 0,
  _right: 0,
  _ans: 0,
  _timers: [],

  onLoad: function (options) {
    // 数字智力关卡页按年级分档：?level=N → 第 N 个学段；不带参数 = 原来的题号递进手感
    var lv = parseInt((options || {}).level, 10) || 0;
    this._gi = (lv >= 1 && lv <= constants.GRADES.length) ? lv - 1 : -1;
    this.setData({ best: storage.get(BEST_KEY) || 0 });
    this.start();
  },
  onUnload: function () { this._clearTimers(); },
  onHide: function () { this._clearTimers(); },

  _clearTimers: function () {
    this._timers.forEach(function (t) { clearTimeout(t); });
    this._timers = [];
  },
  _later: function (fn, ms) { this._timers.push(setTimeout(fn, ms)); },

  start: function () {
    this._clearTimers();
    this._qi = 0;
    this._lives = lib.LIVES;
    this._score = 0;
    this._right = 0;
    this.setData({ settle: false, win: false, starsText: '', overMsg: '' });
    this._loadQuestion();
  },

  _loadQuestion: function () {
    var q = lib.makeQuestion(this._qi, null, this._gi);
    this._ans = q.ans;
    this.setData({
      expr: q.expr,
      rightVal: '?',
      rightEmpty: true,
      tilt: 0,
      tiltNeg: 0,
      panCls: '',
      picked: null,
      rightIdx: -1,
      locked: false,
      options: lib.optionSet(q.ans, 4),
      lives: this._lives,
      score: this._score,
      hudText: '第 ' + (this._qi + 1) + '/' + lib.ROUND_Q + ' 题',
      trend: (this._gi >= 0 ? constants.GRADES[this._gi].label + ' · ' : '')
        + '题型：' + q.label + ' · 第 ' + (this._qi + 1) + '/' + lib.ROUND_Q + ' 题'
    });
  },

  tapOption: function (e) {
    if (this.data.locked) return;
    var idx = e.currentTarget.dataset.idx;
    var v = this.data.options[idx];
    var self = this;

    if (v === this._ans) {
      this._right++;
      this._score += lib.POINTS;
      this.setData({
        picked: idx,
        rightIdx: idx,
        locked: true,
        rightVal: String(v),
        rightEmpty: false,
        tilt: 0,
        tiltNeg: 0,
        panCls: lib.panState(v, this._ans),
        score: this._score,
        trend: '平衡了！' + this.data.expr + ' = ' + v
      });
      wx.showToast({ title: '天平平衡 +' + lib.POINTS, icon: 'none' });
      this._later(function () { self._next(); }, NEXT_MS);
      return;
    }

    this._lives--;
    var tilt = lib.tiltDeg(v, this._ans);
    this.setData({
      picked: idx,
      rightIdx: this.data.options.indexOf(this._ans),
      locked: true,
      rightVal: String(v),
      rightEmpty: false,
      tilt: tilt,
      tiltNeg: -tilt,
      panCls: lib.panState(v, this._ans),
      lives: Math.max(0, this._lives),
      trend: lib.tiltHint(v, this._ans) + ' · 正确答案是 ' + this._ans
    });
    wx.showToast({ title: '再算一次：' + this.data.expr + ' = ?', icon: 'none', duration: WRONG_MS });
    this._later(function () {
      if (self._lives <= 0) { self._finish(false); return; }
      self._next();
    }, WRONG_MS);
  },

  _next: function () {
    this._qi++;
    if (this._qi >= lib.ROUND_Q) { this._finish(true); return; }
    this._loadQuestion();
  },

  _finish: function (cleared) {
    this._clearTimers();
    var stars = lib.starsFor(this._right, lib.ROUND_Q);
    // 玩法进度榜上报（2026-09-13 补）：这一款原来不上报，玩法榜里永远空着
    playReport.reportPlay({
      gameType: 'balance',
      grade: 'all',
      level: 1,
      score: this._score || 0,
      correct: this._right,
      total: lib.ROUND_Q,
      stars: stars,
      maxCombo: 0
    });
    var best = this.data.best;
    if (this._score > best) {
      best = this._score;
      storage.set(BEST_KEY, best);
    }
    this.setData({
      settle: true,
      win: stars >= 1,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      best: best,
      overMsg: '答对 ' + this._right + ' / ' + lib.ROUND_Q + ' 题\n本局得分 '
        + this._score + '\n最高分 ' + best
    });
  },

  onRestart: function () { this.start(); },
  onRetry: function () { this.start(); },
  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 算式天平', path: '/pages/playlist/playlist' };
  }
});
