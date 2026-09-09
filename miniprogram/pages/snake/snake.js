// 单词贪吃蛇（B6-6）：辨词进食——蛇吃「匹配目标释义」的词长大
// 规则：
//   - 10×10 网格蛇，每 260ms 沿当前方向前进一格（底部分向键/滑动改向）
//   - 场上 3 个「词食」，其中恰 1 个 = 目标释义对应的英文词
//   - 蛇头吃到目标词 → +10 分、蛇 +1 格、换新目标与食物
//   - 吃到干扰词（不匹配）→ 扣 1 命并移除该食物；蛇撞墙/撞身 → 扣 1 命
//   - 命尽结束；按命中率/命 1-3 星
// DOM 网格渲染（无 Canvas），题库随机学段 w1 出词。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var storage = require('../../utils/storage');

var GRADES = (constants.GRADES || []).filter(function (g) { return g.key !== 'college'; });
var SIZE = 10;
var TICK = 260;
var LIVES = 3;
var FOOD_N = 3;

Page({
  data: {
    cells: [],        // 10x10 扁平，每格 {cls:'head'|'body'|'food-ok'|'food-bad'|''}
    target: '',       // 目标中文释义
    foods: [],        // 食物 [{i, word}]（i=格号）
    score: 0,
    lives: LIVES,
    dir: 1,           // 0上1右2下3左
    running: false,
    over: false,
    win: false,
    tip: '',
    stars: 0,
    starsText: '',
    best: 0,
    starsText2: ''
  },

  onLoad: function () {
    this.startGame();
  },

  startGame: function () {
    // 初始蛇：中部横向 3 格
    this._snake = [{ r: 5, c: 3 }, { r: 5, c: 2 }, { r: 5, c: 1 }];
    this._dir = 1;
    this._words = this._loadWords();
    this._target = this._nextTarget();
    this._score = 0;
    this._lives = LIVES;
    this._foods = [];
    this._render();
    this.setData({ target: this._target, score: 0, lives: LIVES, running: true, over: false });
    this._startLoop();
  },

  _loadWords: function () {
    // 随机学段，抽足 w1 词（目标 + 干扰）
    var grade = GRADES[Math.floor(Math.random() * GRADES.length)];
    var all = dict.filterByGroup(grade.key, 'w1');
    if (all.length < 8) all = dict.loadByGrade(grade.key).filter(function (w) { return w.type === 'w1'; });
    return all;
  },

  _nextTarget: function () {
    // 从词库随机选一个词作为目标（释义=显示）
    var w = this._words[Math.floor(Math.random() * this._words.length)];
    this._targetWord = w.q || w.a;
    this._targetHint = w.hint || '';
    return this._targetHint || this._targetWord;
  },

  // 生成 3 个食物：1 目标词 + 2 干扰词（来自词库，占空格）
  _spawnFoods: function () {
    var occupied = {};
    this._snake.forEach(function (s) { occupied[s.r * SIZE + s.c] = 1; });
    this._foods.forEach(function (f) { occupied[f.i] = 1; });
    var empty = [];
    for (var i = 0; i < SIZE * SIZE; i++) if (!occupied[i]) empty.push(i);
    if (empty.length < FOOD_N) return;
    var pool = empty.slice();
    function pick() {
      var k = Math.floor(Math.random() * pool.length);
      return pool.splice(k, 1)[0];
    }
    // 第 1 个 = 目标词食物；后两个干扰词
    var foods = [{ i: pick(), word: this._targetWord }];
    // 干扰词：从词库取与目标不同的词
    var dist = this._words.filter(function (w) { return w.q !== this._targetWord; }, this);
    if (dist.length < 2) dist = this._words.filter(function (w, _, arr) { return w.q !== arr[0].q; });
    for (var f = 0; f < FOOD_N - 1; f++) {
      var dw = dist[f % dist.length];
      foods.push({ i: pick(), word: (dw.q || dw.a) });
    }
    this._foods = foods;
  },

  _startLoop: function () {
    var self = this;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(function () { self._tick(); }, TICK);
  },

  _stopLoop: function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onUnload: function () { this._stopLoop(); },
  onHide: function () { this._stopLoop(); },
  onShow: function () {
    // 从其他页返回时若未结束则续跑
    if (!this._timer && this.data.running && !this.data.over) this._startLoop();
  },

  _tick: function () {
    if (this.data.over) { this._stopLoop(); return; }
    var head = this._snake[0];
    var nr = head.r, nc = head.c;
    var d = this._dir;
    if (d === 0) nr--;
    else if (d === 1) nc++;
    else if (d === 2) nr++;
    else nc--;

    // 撞墙
    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) { this._hurt(); return; }
    var nkey = nr * SIZE + nc;
    // 撞身（尾即将移开除外：简化允许撞尾前一格也可，简单判定撞全体则扣）
    var bodyHit = this._snake.some(function (s) { return s.r === nr && s.c === nc; });
    if (bodyHit) { this._hurt(); return; }

    // 吃食？
    var foodAt = null;
    for (var i = 0; i < this._foods.length; i++) {
      if (this._foods[i].i === nkey) { foodAt = this._foods[i]; break; }
    }
    if (foodAt) {
      if (foodAt.word === this._targetWord) {
        // 吃到目标词：加分、生长、换目标并补食物
        this._foods.splice(i, 1);
        this._snake.unshift({ r: nr, c: nc });
        this._score += 10;
        this._target = this._nextTarget();
        var self = this;
        this.setData({ score: this._score, target: this._target });
        this._spawnFoods();
        this._render();
        return;
      }
      // 干扰词：扣命、移除该食，蛇不生长不前移？仍移动但扣命
      this._foods.splice(i, 1);
      this._snake.unshift({ r: nr, c: nc });
      this._snake.pop();
      this._lives--;
      this.setData({ lives: this._lives });
      wx.showToast({ title: '吃错了！' + foodAt.word + ' ≠ ' + this.data.target, icon: 'none' });
      if (this._lives <= 0) { this._end(); return; }
      if (this._foods.length < 1) this._spawnFoods();
      this._render();
      return;
    }

    // 普通移动
    this._snake.unshift({ r: nr, c: nc });
    this._snake.pop();
    this._render();
  },

  _hurt: function () {
    this._lives--;
    this.setData({ lives: this._lives });
    wx.showToast({ title: '撞到了', icon: 'none' });
    if (this._lives <= 0) this._end();
    else { this._stopLoop(); this._resetSnake(); this._startLoop(); }
  },

  _resetSnake: function () {
    this._snake = [{ r: 5, c: 3 }, { r: 5, c: 2 }, { r: 5, c: 1 }];
    this._dir = 1;
    this._render();
  },

  _render: function () {
    var cells = new Array(SIZE * SIZE);
    for (var i = 0; i < cells.length; i++) cells[i] = { cls: '' };
    this._snake.forEach(function (s, idx) {
      var c = cells[s.r * SIZE + s.c];
      c.cls = idx === 0 ? 'head' : 'body';
    });
    this._foods.forEach(function (f) {
      cells[f.i].cls = (f.word === this._targetWord) ? 'food-ok' : 'food-bad';
    }, this);
    this.setData({ cells: cells });
  },

  _end: function () {
    this._stopLoop();
    // 记录最高分
    var best = storage.get('ww_snake_best') || 0;
    if (this._score > best) { storage.set('ww_snake_best', this._score); best = this._score; }
    // 星级按得分：>=100 三星 / >=60 二星 / 参与 1 星
    var stars = this._score >= 100 ? 3 : (this._score >= 60 ? 2 : 1);
    this.setData({
      running: false, over: true, win: false, stars: 0, starsText: '',
      score: this._score, best: best, starsText2: '⭐'.repeat(stars),
      tip: '得分 ' + this._score + ' · 最高 ' + best
    });
  },

  // 触屏控制：滑动方向（主）；点按也可按相对中心方位转向
  onTouchStart: function (e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    this._tx = t.clientX;
    this._ty = t.clientY;
  },

  onTouchEnd: function (e) {
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t || this._tx === undefined) return;
    var dx = t.clientX - this._tx;
    var dy = t.clientY - this._ty;
    var adx = Math.abs(dx), ady = Math.abs(dy);

    if (adx < 18 && ady < 18) {
      // 视为点按：按相对按下位置方位转向（中心上下左右）
      // 简化为点按不转向（避免误触），长提示由滑动承担
      this._tx = this._ty = undefined;
      return;
    }
    var d;
    if (adx > ady) d = dx > 0 ? 1 : 3;   // 右/左
    else d = dy > 0 ? 2 : 0;              // 下/上
    this._tx = this._ty = undefined;
    this._setDir(d);
  },

  _setDir: function (d) {
    if ((this._dir + d) % 2 === 0) return; // 不允许 180° 反向
    this._dir = d;
    this.setData({ dir: d });
  },

  // 兼容旧入口（若保留按键可调用）
  onDir: function (e) {
    var d = parseInt(e.currentTarget.dataset.d, 10);
    this._setDir(d);
  },

  again: function () { this.startGame(); },
  goBack: function () { this._stopLoop(); wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 单词贪吃蛇', path: '/pages/playlist/playlist' };
  }
});
