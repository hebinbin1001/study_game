// 成语拼字（玩法落地：demo g3）——给释义，把字块（含 2 个干扰字）拼成四字成语
// 与 demo 的差异：复用公共 HUD / 结算弹层；字块用本地成语词库随机抽，
// 干扰字取其他成语里的真实字（不是乱码），拼满 4 格自动判题。
// 关联：game/word-build.js（与字母拼词共用纯逻辑引擎）
var lib = require('../../game/word-build');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var CONST = require('../../utils/constants');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var playReport = require('../../utils/play-report');

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
    best: 0,
    challenge: false,
    challengeKey: '',
    challengeLabel: ''
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

  onLoad: function (options) {
    var opt = options || {};
    // 挑战主线（P2）：学段/题量按关卡参数，出题与字块用关卡种子（同一关每次一样）
    this._challenge = String(opt.challenge) === '1';
    this._gradeKey = (this._challenge && opt.grade) ? opt.grade : (storage.get(CONST.STORAGE_KEYS.lastGrade) || 'primary34');
    this._level = parseInt(opt.level, 10) || 0;
    this._roundQ = lib.ROUND_Q;
    this._rng = null;
    this._challengeKey = '';
    this._challengeLabel = '';
    if (this._challenge) {
      var lv = challenge.levelAt(this._gradeKey, this._level);
      if (lv) {
        this._roundQ = challenge.paramsOf(this._gradeKey, lv.mode).count || lib.ROUND_Q;
        this._challengeLabel = challenge.labelOf(this._gradeKey) + ' · 挑战第 ' + this._level + '/' + challenge.LEVELS_PER_GRADE + ' 关';
      }
      this._rng = rng.makeRng(parseInt(opt.seed, 10) || challenge.seedOf(this._gradeKey, this._level));
      this._challengeKey = this._gradeKey + '@' + challenge.STAR_KEY + '@' + this._level;
    }
    this.setData({
      best: storage.get(BEST_KEY) || 0,
      challenge: this._challenge,
      challengeKey: this._challengeKey,
      challengeLabel: this._challengeLabel
    });
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
    var last = this._gradeKey || storage.get(CONST.STORAGE_KEYS.lastGrade) || 'primary34';
    var primary = dict.loadByGrade(last);
    var others = [];
    CONST.GRADES.forEach(function (gr) {
      if (gr.key === last) return;
      others = others.concat(dict.loadByGrade(gr.key));
    });
    this._pool = lib.mergePools(primary, others, MODE, this._roundQ || lib.ROUND_Q);
  },

  start: function () {
    this._clearTimers();
    // 挑战关卡：题量按学段参数、出题用关卡种子；自由玩：引擎默认 + 真随机
    this._queue = lib.pickQuestions(this._pool, this._roundQ || lib.ROUND_Q, this._rng || undefined);
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
    // 挑战关卡：干扰字与字块打乱也走关卡种子（同一关题面完全一致）
    this._tiles = lib.makeTiles(answer, lib.noiseChars(this._pool, answer, lib.EXTRA_TILES, this._rng || undefined),
      this._rng || undefined);
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
    // 只有答完全部题目才计星；命耗尽判负不发星（与字母射击一致）
    var stars = cleared ? lib.starsFor(this._right, total) : 0;
    var best = this.data.best;
    if (this._score > best) {
      best = this._score;
      storage.set(BEST_KEY, best);
    }
    var msg = lib.resultText(this._right, total, this._score, this._hintLeft) + '\n最高分 ' + best;
    if (this._challenge) {
      msg = this._challengeLabel + '\n' + msg + (cleared ? '' : '\n（生命耗尽，本关不计星）');
      this._saveChallenge(stars, total);
    }
    this.setData({
      settle: true,
      win: stars >= 1,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      overMsg: msg,
      best: best
    });
  },

  /**
   * 挑战关卡结算：写挑战星级（取历史最大值）+ 上报本局成绩（game_type=idiom，
   * 供「玩法进度榜」与玩法类成就使用）。自由玩不写进度。
   */
  _saveChallenge: function (stars, total) {
    if (!this._challenge || !this._gradeKey || !this._level) return;
    storage.saveStars(this._gradeKey, this._level, stars, challenge.STAR_KEY);
    playReport.reportPlay({
      gameType: challenge.gameTypeOf('idiom'),
      grade: this._gradeKey,
      level: this._level,
      score: this._score,
      correct: this._right,
      total: total,
      stars: stars
    });
  },

  onRetry: function () { this.start(); },
  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 成语拼字', path: '/pages/playlist/playlist' };
  }
});
