// 字母拼词工坊（玩法落地：demo g2）——给中文意思，把打乱的字母块拼回英文单词
// 与 demo 的差异：复用公共 HUD / 结算弹层；词库取本地内置词库（首选最近学段，
// 不足一局时并入其他学段）；成绩只存本地最高分（固定玩法不入字词进度）。
// 关联：game/word-build.js（纯逻辑，可单测）
var lib = require('../../game/word-build');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var CONST = require('../../utils/constants');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var playReport = require('../../utils/play-report');

var MODE = 'letter';
var BEST_KEY = 'ww_word_build_best';

Page({
  data: {
    lives: lib.LIVES,
    score: 0,
    scoreText: '分',
    hudText: '',
    promptLabel: '请拼出下面这个意思的单词',
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
    challenge: false,      // 是否挑战主线关卡（true 时成绩写 <grade>@challenge@<level>）
    challengeKey: '',      // 挑战存档键（调试/测试可见）
    challengeLabel: ''     // 结算文案里的关卡说明
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
    // 挑战主线：按「学段 + 关卡 + 种子」固定出题；自由玩：沿用「最近学段」随机出题
    this._challenge = String(opt.challenge) === '1';
    this._gradeKey = (this._challenge && opt.grade)
      ? opt.grade
      : (storage.get(CONST.STORAGE_KEYS.lastGrade) || 'primary34');
    this._level = parseInt(opt.level, 10) || 0;
    this._roundQ = lib.ROUND_Q;
    this._rng = null;
    this._challengeKey = '';
    this._challengeLabel = '';
    if (this._challenge) {
      var lv = challenge.levelAt(this._gradeKey, this._level);
      if (lv) {
      this._roundQ = challenge.paramsOf(this._gradeKey, lv.mode, this._level).count || lib.ROUND_Q;
        this._challengeLabel = challenge.labelOf(this._gradeKey) + ' · 挑战第 ' + this._level + '/' + challenge.LEVELS_PER_GRADE + ' 关';
      }
      var seed = parseInt(opt.seed, 10) || challenge.seedOf(this._gradeKey, this._level);
      this._rng = rng.makeRng(seed);
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

  // 词池：首选最近学段（首页选过的），不足一局时并入其他学段，避免"开不了局"
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
    // 挑战关卡：题量按学段参数、出题用关卡种子（同一关每次一样）；
    // 自由玩：题量用引擎默认、随机源用真随机
    this._queue = lib.pickQuestions(this._pool, this._roundQ || lib.ROUND_Q, this._rng || undefined);
    this._qi = 0;
    this._lives = lib.LIVES;
    this._score = 0;
    this._right = 0;
    this._hintLeft = lib.HINTS;
    this.setData({ settle: false, win: false, starsText: '', overMsg: '', slotsCls: '' });
    if (!this._queue.length) {
      wx.showToast({ title: '本地词库没有可用单词', icon: 'none' });
      return;
    }
    this._loadQuestion();
  },

  _loadQuestion: function () {
    var item = this._queue[this._qi];
    var answer = String(item.a);
    this._cur = item;
    // 挑战关卡：字母块的打乱也用关卡种子（同一关每次题面完全一致）
    this._tiles = lib.makeTiles(answer, [], this._rng || undefined);
    this._slots = lib.makeSlots(answer.length);
    this._locked = false;
    this.setData({
      prompt: lib.promptOf(item, MODE),
      meta: answer.length + ' 个字母 · 第 ' + (this._qi + 1) + '/' + this._queue.length + ' 题',
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
      wx.showToast({ title: '正确，+' + lib.POINTS, icon: 'none' });
      this._later(function () { self._next(); }, 850);
      return;
    }
    this._lives--;
    this._locked = true;
    this.setData({ lives: Math.max(0, this._lives), slotsCls: 'bad' });
    wx.showToast({ title: '正确答案：' + answer, icon: 'none', duration: 1500 });
    this._later(function () {
      if (self._lives <= 0) { self._finish(false); return; }
      self._next();
    }, 1500);
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
    wx.showToast({ title: '已提示第 ' + (r.index + 1) + ' 个字母，剩余 ' + this._hintLeft + ' 次', icon: 'none' });
  },

  _next: function () {
    this._qi++;
    if (this._qi >= this._queue.length) { this._finish(true); return; }
    this._loadQuestion();
  },

  _finish: function (cleared) {
    this._clearTimers();
    var total = this._queue.length;
    // 只有「答完全部题」才计星；命耗尽判负不发星（与字母射击一致）
    var stars = cleared ? lib.starsFor(this._right, total) : 0;
    var best = this.data.best;
    if (this._score > best) {
      best = this._score;
      storage.set(BEST_KEY, best);
    }
    var msg = lib.resultText(this._right, total, this._score, this._hintLeft) + '\n最高分 ' + best;
    if (this._challenge) {
      msg = this._challengeLabel + '\n' + msg
        + (cleared ? '' : '\n（生命耗尽，本关不计星）');
      this._saveChallengeStars(stars);
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
   * 挑战关卡结算：写挑战星级存档 + 同步段位（累计星）。
   * 星级取历史最大值（storage.saveStars 内部保证，重玩不会降级）；
   * 只有通关（stars>=1）才同步段位，避免失败局也涨段位。
   */
  _saveChallengeStars: function (stars) {
    if (!this._challenge || !this._gradeKey || !this._level) return;
    storage.saveStars(this._gradeKey, this._level, stars, challenge.STAR_KEY);
    // 统一上报（成绩 + 段位）：game_type=word_build，供玩法进度榜与玩法类成就使用
    playReport.reportPlay({
      gameType: challenge.gameTypeOf('wordBuild'),
      grade: this._gradeKey,
      level: this._level,
      score: this._score,
      correct: this._right,
      total: this._queue.length,
      stars: stars
    });
  },

  onRetry: function () { this.start(); },
  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 字母拼词工坊', path: '/pages/playlist/playlist' };
  }
});
