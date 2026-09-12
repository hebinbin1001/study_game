// 成语拼字（玩法落地：demo g3）——给释义，把字块（含 2 个干扰字）拼成四字成语
// 与 demo 的差异：复用公共 HUD / 结算弹层；字块用本地成语词库随机抽，
// 干扰字取其他成语里的真实字（不是乱码），拼满 4 格自动判题。
// 关联：game/word-build.js（与字母拼词共用纯逻辑引擎）
var lib = require('../../game/word-build');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var CONST = require('../../utils/constants');

var MODE = 'idiom';
var BEST_KEY = 'ww_idiom_build_best';

Page({
  data: {
    lives: lib.LIVES,
    score: 0,
    scoreText: '分',
    hudText: '',
    promptLabel: '根据释义拼出这个成语',
    prompt: '',
    meta: '',
    slots: [],
    slotsCls: '',
    tiles: [],
    hintLeft: lib.HINTS,
    settle: false,
    win: false,
    starsText: '',
    overMsg: '',
    best: 0
  },

  _pool: [],
  _queue: [],
  _qi: 0,
  _lives: lib.LIVES,
  _score: 0,
  _right: 0,
  _hintLeft: lib.HINTS,
  _cur: null,
  _tiles: [],
  _slots: [],
  _locked: false,
  _timers: [],

  onLoad: function () {
    this.setData({ best: storage.get(BEST_KEY) || 0 });
    this._buildPool();
    this.start();
  },
  onUnload: function () { this._clearTimers(); },
  onHide: function () { this._clearTimers(); },

  _clearTimers: function () {
    this._timers.forEach(function (t) { clearTimeout(t); });
    this._timers = [];
  },
  _later: function (fn, ms) { this._timers.push(setTimeout(fn, ms)); },

  // 幼儿园/小学低年级没成语词条，靠 mergePools 自动并入其他学段
  _buildPool: function () {
    var last = storage.get(CONST.STORAGE_KEYS.lastGrade) || 'primary34';
    var primary = dict.loadByGrade(last);
    var others = [];
    CONST.GRADES.forEach(function (gr) {
      if (gr.key === last) return;
      others = others.concat(dict.loadByGrade(gr.key));
    });
    this._pool = lib.mergePools(primary, others, MODE, lib.ROUND_Q);
  },

  start: function () {
    this._clearTimers();
    this._queue = lib.pickQuestions(this._pool, lib.ROUND_Q);
    this._qi = 0;
    this._lives = lib.LIVES;
    this._score = 0;
    this._right = 0;
    this._hintLeft = lib.HINTS;
    this.setData({ settle: false, win: false, starsText: '', overMsg: '', slotsCls: '' });
    if (!this._queue.length) {
      wx.showToast({ title: '本地词库没有可用成语', icon: 'none' });
      return;
    }
    this._loadQuestion();
  },

  _loadQuestion: function () {
    var item = this._queue[this._qi];
    var answer = String(item.a);
    this._cur = item;
    this._tiles = lib.makeTiles(answer, lib.noiseChars(this._pool, answer, lib.EXTRA_TILES));
    this._slots = lib.makeSlots(answer.length);
    this._locked = false;
    this.setData({
      prompt: lib.promptOf(item, MODE),
      meta: answer.length + ' 字成语 · 第 ' + (this._qi + 1) + '/' + this._queue.length
        + ' 题（字块中混有干扰字）',
      hudText: '第 ' + (this._qi + 1) + '/' + this._queue.length + ' 题',
      lives: this._lives,
      score: this._score,
      hintLeft: this._hintLeft,
      slotsCls: ''
    });
    this._render();
  },

  _render: function () {
    var self = this;
    var slots = this._slots.map(function (tid) {
      var filled = tid !== null && tid !== undefined;
      var tile = filled ? self._tiles[tid] : null;
      return {
        filled: filled,
        ch: filled ? tile.ch : '',
        cls: filled && tile.hinted ? 'hinted' : ''
      };
    });
    var tiles = this._tiles.map(function (t) { return { ch: t.ch, used: t.used }; });
    this.setData({ slots: slots, tiles: tiles });
  },

  tapTile: function (e) {
    if (this._locked) return;
    var idx = e.currentTarget.dataset.idx;
    var r = lib.placeTile(this._tiles, this._slots, idx);
    if (r.tiles === this._tiles && r.slots === this._slots) return;
    this._tiles = r.tiles;
    this._slots = r.slots;
    this._render();
    // 拼满即判定（少一次点击，和 demo 一致）
    if (lib.isComplete(this._slots)) {
      var self = this;
      this._later(function () { self.onCheck(); }, 220);
    }
  },

  tapSlot: function (e) {
    if (this._locked) return;
    var idx = e.currentTarget.dataset.idx;
    var r = lib.takeSlot(this._tiles, this._slots, idx);
    if (r.tiles === this._tiles && r.slots === this._slots) return;
    this._tiles = r.tiles;
    this._slots = r.slots;
    this._render();
  },

  onCheck: function () {
    if (this._locked) return;
    if (!lib.isComplete(this._slots)) {
      wx.showToast({ title: '还有空位没填哦', icon: 'none' });
      return;
    }
    var answer = String(this._cur.a);
    var text = lib.answerText(this._slots, this._tiles);
    var self = this;
    if (lib.isCorrect(text, answer)) {
      this._locked = true;
      this._right++;
      this._score += lib.POINTS;
      this.setData({ score: this._score, slotsCls: 'ok' });
      wx.showToast({ title: answer + ' · 正确，+' + lib.POINTS, icon: 'none' });
      this._later(function () { self._next(); }, 900);
      return;
    }
    this._lives--;
    this._locked = true;
    this.setData({ lives: Math.max(0, this._lives), slotsCls: 'bad' });
    wx.showToast({ title: '正确答案：' + answer, icon: 'none', duration: 1600 });
    this._later(function () {
      if (self._lives <= 0) { self._finish(false); return; }
      self._next();
    }, 1600);
  },

  onHint: function () {
    if (this._locked) return;
    if (this._hintLeft <= 0) {
      wx.showToast({ title: '提示已用完', icon: 'none' });
      return;
    }
    var r = lib.hintStep(String(this._cur.a), this._tiles, this._slots);
    if (!r) {
      wx.showToast({ title: '已经全部填对了', icon: 'none' });
      return;
    }
    this._tiles = r.tiles;
    this._slots = r.slots;
    this._hintLeft--;
    this.setData({ hintLeft: this._hintLeft });
    this._render();
    wx.showToast({ title: '已提示第 ' + (r.index + 1) + ' 个字，剩余 ' + this._hintLeft + ' 次', icon: 'none' });
  },

  _next: function () {
    this._qi++;
    if (this._qi >= this._queue.length) { this._finish(true); return; }
    this._loadQuestion();
  },

  _finish: function (cleared) {
    this._clearTimers();
    var total = this._queue.length;
    var stars = lib.starsFor(this._right, total);
    var best = this.data.best;
    if (this._score > best) {
      best = this._score;
      storage.set(BEST_KEY, best);
    }
    var msg = lib.resultText(this._right, total, this._score, this._hintLeft) + '\n最高分 ' + best;
    this.setData({
      settle: true,
      win: stars >= 1,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      overMsg: msg,
      best: best
    });
  },

  onRetry: function () { this.start(); },
  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 成语拼字', path: '/pages/playlist/playlist' };
  }
});
