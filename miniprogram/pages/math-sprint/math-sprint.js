// 口算冲刺（玩法落地：来自 demo g6）——60 秒限时口算，连对越多倍率越高
// 与 demo 的差异：计时用引擎模块的常量、结算走公共 settle-pop、成绩不入字词进度（固定玩法）。
// 关联：game/math-sprint.js（纯逻辑，可单测）
var engineLib = require('../../game/math-sprint');
var storage = require('../../utils/storage');

Page({
  data: {
    lives: 1,          // 口算冲刺不设命数（HUD 保留组件形态，用固定 1 表示"无限"）
    score: 0,
    combo: 0,
    mult: 1,
    scoreText: '分',
    hudText: '',
    remainText: '60.0',
    remainPct: 100,
    low: false,
    expr: '',
    q: '?',
    options: [],
    picked: -1,        // 本题点中的选项下标（-1 未点）
    rightIdx: -1,      // 答对后展示的正确项
    settle: false,
    win: false,
    starsText: '',
    overMsg: '',
    best: 0
  },

  _remain: 0,
  _timer: null,
  _right: 0,
  _wrong: 0,
  _maxCombo: 0,
  _running: false,

  onLoad: function () {
    this.setData({ best: storage.get('ww_sprint_best') || 0 });
    this.start();
  },

  onUnload: function () { this._stop(); },
  onHide: function () { this._stop(); },

  _stop: function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._running = false;
  },

  start: function () {
    this._stop();
    this._remain = engineLib.TOTAL_MS;
    this._right = 0;
    this._wrong = 0;
    this._maxCombo = 0;
    this._running = true;
    this.setData({
      score: 0, combo: 0, mult: 1, settle: false, win: false, starsText: '',
      overMsg: '', remainPct: 100, low: false, remainText: '60.0'
    });
    this._nextQuestion();
    var self = this;
    this._timer = setInterval(function () { self._tick(); }, 100);
  },

  _tick: function () {
    if (!this._running) return;
    this._remain -= 100;
    if (this._remain <= 0) {
      this._remain = 0;
      this._renderTime();
      this.finish();
      return;
    }
    this._renderTime();
  },

  _renderTime: function () {
    this.setData({
      remainText: (this._remain / 1000).toFixed(1),
      remainPct: Math.max(0, Math.min(100, this._remain / engineLib.TOTAL_MS * 100)),
      low: this._remain <= 10000
    });
  },

  _nextQuestion: function () {
    var q = engineLib.makeQuestion(engineLib.TOTAL_MS - this._remain);
    this.setData({
      expr: q.expr,
      q: '?',
      options: engineLib.makeOptions(q.ans, 4),
      picked: -1,
      rightIdx: -1,
      hudText: q.tier
    });
    this._ans = q.ans;
  },

  tapOption: function (e) {
    if (!this._running || this.data.picked >= 0) return;
    var idx = e.currentTarget.dataset.idx;
    var v = this.data.options[idx];
    if (v === this._ans) {
      var combo = this.data.combo + 1;
      var gain = engineLib.scoreOf(combo - 1);
      if (combo > this._maxCombo) this._maxCombo = combo;
      this._right++;
      var self = this;
      this.setData({
        picked: idx, rightIdx: idx,
        score: this.data.score + gain,
        combo: combo, mult: engineLib.multiplier(combo)
      });
      setTimeout(function () { if (self._running) self._nextQuestion(); }, 220);
    } else {
      this._wrong++;
      var self2 = this;
      // 答错扣时 + 断连击；同时把正确项标出来，让低龄玩家看懂
      this._remain = Math.max(100, this._remain - engineLib.WRONG_PENALTY_MS);
      this.setData({ picked: idx, rightIdx: this.data.options.indexOf(this._ans), combo: 0, mult: 1 });
      this._renderTime();
      setTimeout(function () { if (self2._running) self2._nextQuestion(); }, 520);
    }
  },

  finish: function () {
    this._stop();
    var stars = engineLib.starsFor(this.data.score);
    var total = this._right + this._wrong;
    var acc = total ? Math.round(this._right / total * 100) : 0;
    var best = this.data.best;
    if (this.data.score > best) { best = this.data.score; storage.set('ww_sprint_best', best); }
    this.setData({
      settle: true,
      win: stars >= 1,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      best: best,
      overMsg: '答对 ' + this._right + ' 题 · 答错 ' + this._wrong + ' 题\n正确率 ' + acc
        + '% · 最高连击 ' + this._maxCombo + '\n最高分 ' + best
    });
  },

  onRetry: function () { this.start(); },
  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 口算冲刺 60 秒', path: '/pages/playlist/playlist' };
  }
});
