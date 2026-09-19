// 限时抢答（2026-09-19 新增玩法，第 7 条玩法线）
//
// 玩法：倒计时内「看释义抢词」——答对加分涨连击，答错扣 2 秒并断连击。
//   一局固定 10 题 **或** 60 秒先到者结束；星级按「答对 / 本局题量」折 90/70/60。
//
// 与其它玩法一致的接线（照抄现有模式，避免各页面口径分叉）：
//   · 主线/玩法线共用 challenge.contextOf，存档写 <学段>@<线>@<关卡>；
//   · 结算走公共 settle-pop（含「下一关」，来自 challenge.nextLevelUrl）；
//   · 挑战局上报 playReport（game_type=quiz），供玩法进度榜与玩法类成就使用。

var quiz = require('../../game/quiz');
var challenge = require('../../utils/challenge');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var constants = require('../../utils/constants');
var rng = require('../../utils/rng');
var playReport = require('../../utils/play-report');
var question = require('../../game/question');
var audio = require('../../game/audio');

var MODE = 'quiz';
var BEST_KEY = 'ww_quiz_best';

Page({
  data: {
    // HUD
    score: 0,
    combo: 0,
    qIndex: 1,
    totalQ: quiz.CONFIG.totalQ,
    timeLeft: quiz.CONFIG.seconds,
    timePercent: 100,
    best: 0,

    // 题目
    stem: '',
    stemLabel: '看释义，抢答出正确的词',
    options: [],          // [{text, ok, cls}]
    phase: 'idle',        // idle | locked
    feedback: '',         // 答对/答错的即时提示
    feedbackCls: 'ok',    // ok | bad（WXML 里不能调 indexOf，所以在 JS 里算好）

    // 挑战信息
    challenge: false,
    challengeLabel: '',
    showNext: false,

    // 结算
    settle: false,
    win: false,
    starsText: '',
    overMsg: ''
  },

  _queue: [],
  _qi: 0,
  _cur: null,
  _round: null,
  _score: 0,
  _combo: 0,
  _maxCombo: 0,
  _right: 0,
  _answered: 0,
  _timeLeft: quiz.CONFIG.seconds,
  _timer: null,
  _locked: false,
  _timers: [],
  _challenge: false,
  _line: '',
  _gradeKey: '',
  _level: 0,
  _totalQ: quiz.CONFIG.totalQ,
  _seconds: quiz.CONFIG.seconds,
  _nextUrl: '',

  onLoad: function (options) {
    var opt = options || {};
    // 主线 / 玩法线共用解析：line=mode_quiz → 存档写 <学段>@mode_quiz@<关卡>
    var ctx = challenge.contextOf(opt);
    this._challenge = ctx.isChallenge;
    this._line = ctx.line;
    this._gradeKey = (this._challenge && opt.grade)
      ? opt.grade
      : (storage.get(constants.STORAGE_KEYS.lastGrade) || 'primary34');
    this._level = parseInt(opt.level, 10) || 0;
    this._totalQ = (ctx.params && ctx.params.count) || quiz.CONFIG.totalQ;
    this._seconds = (ctx.params && ctx.params.seconds) || quiz.CONFIG.seconds;
    this._nextUrl = challenge.nextLevelUrl(opt);

    // 挑战局：题面/选项顺序也要可复现（同种子同牌面）
    if (this._challenge) question.setRandom(rng.makeRng(ctx.seed));
    else question.setRandom();

    this.setData({
      best: storage.get(BEST_KEY) || 0,
      challenge: this._challenge,
      challengeLabel: ctx.label || '',
      totalQ: this._totalQ,
      showNext: !!this._nextUrl
    });

    this._buildPool();
    this.start();
  },

  onUnload: function () { this._stop(); this._clearTimers(); question.setRandom(); },
  onHide: function () { this._stop(); this._clearTimers(); },

  _clearTimers: function () {
    (this._timers || []).forEach(function (t) { clearTimeout(t); });
    this._timers = [];
  },
  _later: function (fn, ms) { this._timers.push(setTimeout(fn, ms)); },
  _stop: function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  /** 题池：首选本学段（挑战/玩法线用关卡学段），不足一局时并入其它学段 */
  _buildPool: function () {
    var key = this._gradeKey || 'primary34';
    var primary = dict.loadByGrade(key);
    var pool = primary.slice();
    if (pool.length < this._totalQ) {
      constants.GRADES.forEach(function (g) {
        if (g.key === key) return;
        pool = pool.concat(dict.loadByGrade(g.key));
      });
    }
    this._pool = pool;
  },

  start: function () {
    this._stop();
    this._clearTimers();
    this._score = 0;
    this._combo = 0;
    this._maxCombo = 0;
    this._right = 0;
    this._answered = 0;
    this._qi = 0;
    this._locked = false;
    this._timeLeft = this._seconds;
    this._used = {};
    this._queue = [];
    this.setData({
      settle: false, win: false, starsText: '', overMsg: '', feedback: '',
      score: 0, combo: 0, qIndex: 1, timeLeft: this._seconds, timePercent: 100
    });
    this._loadQuestion();
    this._startTimer();
  },

  _startTimer: function () {
    var self = this;
    this._timer = setInterval(function () {
      self._timeLeft -= 1;
      var pct = Math.max(0, Math.round(self._timeLeft / self._seconds * 100));
      self.setData({ timeLeft: Math.max(0, self._timeLeft), timePercent: pct });
      if (self._timeLeft <= 0) self._finish(false, true);
    }, 1000);
  },

  /** 出下一题：随机抽一条能成题的词条（跳过「题干=答案」这类不可用条目） */
  _loadQuestion: function () {
    var pool = this._pool || [];
    var tries = 0;
    var round = null;
    while (!round && tries < 40 && pool.length) {
      var idx = Math.floor(Math.random() * pool.length);
      var item = pool[idx];
      var key = (item.type || '') + '|' + (item.q || '');
      if (this._used[key]) { tries++; continue; }
      round = quiz.buildRound(item, pool);
      if (round) { this._used[key] = true; this._cur = item; }
      tries++;
    }
    if (!round) { this._finish(true); return; }   // 抽不到可用题就按答完处理

    this._round = round;
    this._locked = false;
    this.setData({
      stem: round.stem,
      options: round.options.map(function (o) { return { text: o.text, ok: o.ok, cls: '' }; }),
      phase: 'idle',
      feedback: '',
      qIndex: this._answered + 1
    });
  },

  /** 选答案 */
  choose: function (e) {
    if (this._locked || this.data.settle) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var opt = this.data.options[idx];
    if (!opt) return;
    this._locked = true;
    var self = this;

    if (opt.ok) {
      this._combo += 1;
      if (this._combo > this._maxCombo) this._maxCombo = this._combo;
      var gain = quiz.scoreOf(this._combo);
      this._score += gain;
      this._right += 1;
      this._answered += 1;
      audio.playCorrect();
      this.setData({
        score: this._score,
        combo: this._combo,
        phase: 'locked',
        feedback: '+' + gain,
        feedbackCls: 'ok',
        ['options[' + idx + '].cls']: 'ok'
      });
      this._later(function () { self._afterAnswer(); }, 620);
      return;
    }

    // 答错：扣时间 + 断连击（比扣命更贴合「限时」主题）
    this._combo = 0;
    this._answered += 1;
    this._timeLeft = Math.max(0, this._timeLeft - quiz.CONFIG.wrongPenalty);
    audio.playWrong();
    var okIdx = -1;
    this.data.options.forEach(function (o, i) { if (o.ok) okIdx = i; });
    var patch = {
      combo: 0,
      phase: 'locked',
      feedback: '−' + quiz.CONFIG.wrongPenalty + '秒',
      feedbackCls: 'bad',
      timeLeft: this._timeLeft,
      timePercent: Math.max(0, Math.round(this._timeLeft / this._seconds * 100)),
      ['options[' + idx + '].cls']: 'bad'
    };
    if (okIdx >= 0) patch['options[' + okIdx + '].cls'] = 'ok';
    this.setData(patch);
    this._later(function () {
      if (self._timeLeft <= 0) { self._finish(false, true); return; }
      self._afterAnswer();
    }, 900);
  },

  /** 一题结束：题量到就结算，否则下一题 */
  _afterAnswer: function () {
    if (this._answered >= this._totalQ) { this._finish(true); return; }
    this._loadQuestion();
  },

  _finish: function (cleared, timeout) {
    if (this.data.settle) return;
    this._stop();
    this._clearTimers();
    var r = quiz.resultOf({
      score: this._score, right: this._right, answered: this._answered,
      totalQ: this._totalQ, maxCombo: this._maxCombo, timeLeft: this._timeLeft
    });
    // 时间耗尽不算通关（星级按总题量算，没答完的题算错）
    var stars = (cleared && r.win) ? r.stars : 0;
    var best = this.data.best;
    if (this._score > best) { best = this._score; storage.set(BEST_KEY, best); }

    var lines = ['答对 ' + this._right + '/' + this._totalQ + ' 题 · 得分 ' + this._score,
      '最高连击 ' + this._maxCombo + ' · 最高分 ' + best];
    if (timeout) lines.push('⏰ 时间到，没答完的题按错算');
    if (this._challenge) {
      lines.unshift(this._challengeLabel);
      this._saveChallenge(stars, this._totalQ);
    }
    this.setData({
      settle: true,
      win: stars >= 1,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      overMsg: lines.join('\n'),
      best: best
    });
    if (stars >= 1) audio.playWin();
  },

  /** 挑战关卡结算：写挑战星级（取历史最大值）+ 上报成绩（玩法进度榜/成就用） */
  _saveChallenge: function (stars, total) {
    if (!this._challenge || !this._gradeKey || !this._level) return;
    storage.saveStars(this._gradeKey, this._level, stars, this._line || challenge.STAR_KEY);
    playReport.reportPlay({
      gameType: challenge.gameTypeOf(MODE),
      grade: this._gradeKey,
      level: this._level,
      score: this._score,
      correct: this._right,
      total: total,
      stars: stars
    });
  },

  onRetry: function () { this.start(); },

  /** 通关后进入下一关（玩法线：同一条线的下一关） */
  onNext: function () {
    if (!this._nextUrl) return;
    wx.redirectTo({ url: this._nextUrl });
  },

  goBack: function () { wx.navigateBack(); },

  // ============ E2E 钩子（确定性驱动，避免依赖倒计时） ============
  _testAnswer: function (correct) {
    if (this._locked || this.data.settle) return false;
    var idx = -1;
    this.data.options.forEach(function (o, i) {
      if (correct ? o.ok : !o.ok) { if (idx < 0) idx = i; }
    });
    if (idx < 0) return false;
    this.choose({ currentTarget: { dataset: { idx: idx } } });
    return true;
  },
  _testStopTimer: function () { this._stop(); return true; },
  _saveChallengeStars: function (stars) { this._saveChallenge(stars, this._totalQ); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 限时抢答，看谁反应快', path: '/pages/index/index' };
  }
});
