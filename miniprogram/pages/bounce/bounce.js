// 单词弹弹球（B6-7）：释义球下落 → 移动篮子接「正确释义」
// 规则：
//   - 顶部显示一个英文词（含目标释义标红？不——直接显示单词）
//   - 3 列轨道定期落「释义球」（正确释义 + 2 干扰释义随机分布）
//   - 底部篮子用 ◀ ▶ 移动（或左右滑动），球落底时若所在列 == 篮子列：
//       球=正确释义 → +10 分、换新词
//       球=错误释义 → 扣 1 命
//   - 落空（球落底未接）不扣分继续；3 命尽结束；得分换 1-3 星 + 记录最高
// 题库随机学段 w1（词→hint 释义）。DOM 渲染，JS 定时器驱动。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var storage = require('../../utils/storage');

var GRADES = (constants.GRADES || []).filter(function (g) { return g.key !== 'college'; });
var COLS = 3;
var LIVES = 3;
var FALL_MS = 14;     // 下落步进
var SPAWN_MS = 1100;  // 生成新球间隔

Page({
  data: {
    word: '',
    balls: [],       // [{id, col, y, text, ok}] y=0..100(百分比)
    basket: 1,       // 篮子列 0..2
    score: 0,
    lives: LIVES,
    best: 0,
    over: false,
    starsText: '',
    tip: ''
  },

  onLoad: function () {
    var best = storage.get('ww_bounce_best') || 0;
    this.setData({ best: best });
    this.startGame();
  },

  startGame: function () {
    this._words = this._loadWords();
    this._nextWord();
    this._balls = [];
    this._idSeq = 0;
    this._score = 0;
    this._lives = LIVES;
    this._suspended = false;
    this.setData({
      balls: [], basket: 1, score: 0, lives: LIVES,
      tip: '接住「' + this._targetHint + '」对应的释义球', over: false
    });
    this._startLoops();
  },

  _loadWords: function () {
    var grade = GRADES[Math.floor(Math.random() * GRADES.length)];
    var all = dict.filterByGroup(grade.key, 'w1');
    if (all.length < 8) all = dict.loadByGrade(grade.key).filter(function (w) { return w.type === 'w1'; });
    return all;
  },

  _nextWord: function () {
    var w = this._words[Math.floor(Math.random() * this._words.length)];
    this._targetWord = w.q || w.a;
    this._targetHint = w.hint || w.q || w.a;
    // 干扰释义
    var dist = this._words.filter(function (x) { return (x.hint || x.q) !== this._targetHint; }, this);
    if (!dist.length) dist = this._words;
    this._distHints = [];
    var seen = { x: 1 };
    seen[this._targetHint] = 1;
    for (var i = 0; i < dist.length && this._distHints.length < 2; i++) {
      var h = dist[i].hint || dist[i].q;
      if (seen[h]) continue;
      seen[h] = 1;
      this._distHints.push(h);
    }
    while (this._distHints.length < 2) this._distHints.push('不是它');
    this.setData({ word: this._targetWord, tip: '接住释义「' + this._targetHint + '」' });
  },

  _startLoops: function () {
    var self = this;
    this._stopLoops();
    // 下落步进
    this._fallTimer = setInterval(function () { self._step(); }, FALL_MS);
    // 生成新球（3 轨各给正确/错误释义）
    this._spawnTimer = setInterval(function () { self._spawnRound(); }, SPAWN_MS);
    // 立即首轮
    this._spawnRound();
  },

  _stopLoops: function () {
    if (this._fallTimer) { clearInterval(this._fallTimer); this._fallTimer = null; }
    if (this._spawnTimer) { clearInterval(this._spawnTimer); this._spawnTimer = null; }
  },

  onUnload: function () { this._stopLoops(); },
  onHide: function () { this._stopLoops(); this._suspended = true; },
  onShow: function () {
    if (this._suspended && !this.data.over) { this._suspended = false; this._startLoops(); }
  },

  // 生成一轮球：三轨各一个（正确放随机轨，其余干扰）
  _spawnRound: function () {
    if (this.data.over || this._suspended) return;
    // 已有球过多则不生成（防叠屏）
    if (this._balls.length > 5) return;
    var okCol = Math.floor(Math.random() * COLS);
    for (var c = 0; c < COLS; c++) {
      var text = c === okCol ? this._targetHint : this._distHints[c % this._distHints.length];
      this._idSeq++;
      this._balls.push({ id: this._idSeq, col: c, y: -8 - Math.floor(Math.random() * 10), text: text, ok: c === okCol });
    }
    this._syncBalls();
  },

  _step: function () {
    if (this.data.over || this._suspended) return;
    var balls = this._balls;
    var drop = [];
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      b.y += 1.1;
      if (b.y >= 96) {
        // 落到底部：判定接住与否
        var caught = (b.col === this.data.basket);
        if (caught) {
          if (b.ok) {
            this._score += 10;
            this.setData({ score: this._score });
            this._nextWord();
          } else {
            this._lives--;
            this.setData({ lives: this._lives });
            wx.showToast({ title: '接错了 · 命-1', icon: 'none' });
            if (this._lives <= 0) { this._end(); return; }
          }
        }
        // 移除该球
        continue;
      }
      drop.push(b);
    }
    this._balls = drop;
    this._syncBalls();
  },

  _syncBalls: function () {
    this.setData({ balls: this._balls.map(function (b) { return { id: b.id, col: b.col, y: b.y, text: b.text, ok: b.ok }; }) });
  },

  move: function (e) {
    var d = e.currentTarget.dataset.d;
    var b = this.data.basket + parseInt(d, 10);
    if (b < 0) b = 0;
    if (b > COLS - 1) b = COLS - 1;
    this.setData({ basket: b });
  },

  _end: function () {
    this._stopLoops();
    var best = this.data.best;
    if (this._score > best) { best = this._score; storage.set('ww_bounce_best', this._score); }
    var stars = this._score >= 100 ? 3 : (this._score >= 50 ? 2 : 1);
    this.setData({ over: true, score: this._score, best: best, starsText: '⭐'.repeat(stars), tip: '命尽 · 得分 ' + this._score });
  },

  again: function () { this.startGame(); },
  goBack: function () { this._stopLoops(); wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 单词弹弹球', path: '/pages/playlist/playlist' };
  }
});
