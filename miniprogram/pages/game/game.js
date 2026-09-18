/**
 * 游戏页 · 字母射击（2026-09-18 改版）
 *
 * 改版说明：
 *   旧版是 canvas 引擎（game/engine.js + renderer.js）画怪兽与炮弹；
 *   新版改为 **WXML/CSS 渲染 + game/shoot.js 纯逻辑判定**，玩法结构对齐
 *   demo/deepseek_html_20260918_d7a82c.html：词槽填空 + 底部字母面板 + Boss 血条 +
 *   打错就反击。视觉仍是本项目自己的浅色卡通风（不做深色主题）。
 *
 * 页面职责：
 *   1. onLoad 解析 grade/level/type/自定义关卡/挑战上下文，预取本关固定题；
 *   2. 逐题：shoot.buildRound() 造局面 → WXML 渲染词槽与字母面板；
 *   3. 点面板：命中补空、失误扣护盾并按节奏播 Boss 反击动画；
 *   4. 全部题打完 → 结算页（参数与旧版完全一致，result.js 无需改动）。
 *
 * 对外契约（刻意保持与旧版一致，避免影响结算/上报/排行榜）：
 *   · correctCount = 「零失误击破的题数」，totalQ = 本局题量，rate = correctCount/totalQ；
 *     result.js 用同样的公式重算星级（90/70/60），所以三档可达性不变；
 *   · 护盾 = CONFIG.initLives，每点错一次扣 1 —— 与旧版「答错 5 题判负」容错次数一致。
 */

var shoot = require('../../game/shoot');
var config = require('../../game/config');
var question = require('../../game/question');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var constants = require('../../utils/constants');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var audio = require('../../game/audio');
var auth = require('../../utils/auth');
var request = require('../../utils/request');
var review = require('../../utils/review');
var skins = require('../../utils/skins');

var CONFIG = config.CONFIG;

// 新手引导步骤（M6-L，首次游玩展示；ww_tutorial_done 持久化）
var TUTORIAL_STEPS = [
  { title: '欢迎，小战士！', desc: '怪兽身上是一道挖空的题目。从下面挑字母，把空补全就能打跑它！' },
  { title: '点字母开火', desc: '点对字母会飞出去补进空格，还会连击加分 🔥' },
  { title: '小心 Boss 反击', desc: '点错字母 Boss 会反击，扣掉 1 点护盾；护盾用完本局就结束啦。' }
];

Page({
  data: {
    // ---- 本局配置 ----
    grade: 'kindergarten',
    level: 1,
    type: '',
    challenge: false,
    challengeLabel: '',

    // ---- HUD ----
    shield: CONFIG.initLives,
    // 沿用旧字段名 livesText（页面/用例/结构护栏都读它），语义 = 剩余护盾
    livesText: '❤'.repeat(CONFIG.initLives),
    score: 0,
    combo: 0,
    qIndex: 1,
    totalQ: CONFIG.totalQ,
    dots: [],            // HUD 进度点 [{ i, done, cur }]

    // ---- 战场 ----
    warriorEmoji: '🛡',
    warriorImg: '',
    warriorImgOk: true,
    bossEmoji: '👾',
    bossImg: '',
    bossImgOk: true,
    bossName: '',
    bossHp: 100,
    heroHurt: false,
    bossHit: false,
    bossCharging: false,
    shake: false,

    // ---- 题目 ----
    kind: 'letter',
    meaning: '',
    head: '',
    tail: '',
    hasSlot: false,
    slots: [],
    pad: [],
    tip: '',

    // ---- 反馈浮层 ----
    phase: 'idle',       // idle | flying | counter | hurt | clearing
    hitText: '',
    missText: '',
    damageText: '',
    comboText: '',

    // ---- 暂停 / 声音 ----
    paused: false,
    soundOn: true,

    // ---- 新手引导 ----
    tutorialStep: 0,
    tutorialTitle: '',
    tutorialDesc: ''
  },

  // ============ 运行时状态（不进 setData） ============
  _round: null,          // 当前题（shoot.buildRound 产物）
  _busy: false,          // 动画期间锁输入
  _over: false,          // 本局是否已结束
  _timers: [],           // 待清理的定时器
  _usedItems: [],        // 已出题目（供抽题排重）
  _challengeItems: null, // 挑战/自定义关卡的固定题序
  _perfect: 0,           // 零失误击破的题数
  _answered: 0,          // 已完成的题数
  _missInRound: false,   // 本题是否失误过
  _wrongItems: [],       // 本局错题（结算回顾）
  _reviewPool: [],       // 错题回流池（R2）
  _skins: { warrior: null, monster: null },
  _line: '',
  _customLevel: null,
  _lives: CONFIG.initLives,
  _totalQ: CONFIG.totalQ,

  // ============ 定时器管理 ============
  _later: function (ms, fn) {
    var self = this;
    var id = setTimeout(function () {
      self._timers = self._timers.filter(function (t) { return t !== id; });
      fn();
    }, ms);
    this._timers.push(id);
    return id;
  },
  _clearTimers: function () {
    (this._timers || []).forEach(function (t) { clearTimeout(t); });
    this._timers = [];
  },

  // ============ 生命周期 ============
  onLoad: function (options) {
    var opts = options || {};
    var grade = opts.grade ? opts.grade : 'kindergarten';
    var level = opts.level ? parseInt(opts.level, 10) : 1;
    var type = opts.type ? opts.type : '';

    // B4：自定义关卡（10 个一组）——由 level-share / 公开广场带完整题目 JSON 进入
    var custom = null;
    if (opts.customLevel) {
      try { custom = JSON.parse(decodeURIComponent(opts.customLevel)); } catch (e) { custom = null; }
    }
    if (custom && Array.isArray(custom.items)) {
      this._customLevel = custom;
      grade = custom.grade || grade;
    }

    // 挑战主线 / 玩法线：按「学段 + 关卡」用固定种子出题（同关同题、同面板顺序）
    var ctx = challenge.contextOf(opts);
    var isChallenge = ctx.isChallenge;
    this._line = ctx.line;
    this._lives = CONFIG.initLives;
    this._totalQ = CONFIG.totalQ;
    question.setRandom();   // 先复位，避免上一局的种子泄漏进来
    if (isChallenge) {
      question.setRandom(rng.makeRng(ctx.seed));
      var lvParams = ctx.params;
      if (lvParams && lvParams.lives > 0) this._lives = lvParams.lives;
      this._challengeItems = challenge.pickItems(
        ctx.grade, ctx.level,
        (lvParams ? lvParams.totalQ : CONFIG.totalQ) || CONFIG.totalQ,
        type, ctx.seed
      );
    }
    // 实际题量以真正取到的题量为准（题库不足时不提前结算）
    this._totalQ = (this._challengeItems && this._challengeItems.length)
      ? this._challengeItems.length : CONFIG.totalQ;

    // 皮肤：战士立绘 + Boss 立绘（离线兜底 emoji）
    this._skins = {
      warrior: skins.getWarriorSkin(storage.getWarriorSkin()),
      monster: skins.getMonsterSkin(storage.getBossSkin())
    };
    var wSkin = this._skins.warrior || skins.DEFAULT_WARRIOR;
    var mSkin = this._skins.monster || skins.DEFAULT_MONSTER;

    this._usedItems = [];
    this._perfect = 0;
    this._answered = 0;
    this._wrongItems = [];
    this._reviewPool = [];
    this._over = false;
    this._busy = false;

    var soundOn = storage.get(constants.STORAGE_KEYS.sound) !== '0';
    audio.setSoundEnabled(soundOn);

    this.setData({
      grade: grade,
      level: level,
      type: type,
      challenge: isChallenge,
      challengeLabel: ctx.label || '',
      totalQ: this._totalQ,
      shield: this._lives,
      livesText: '❤'.repeat(this._lives),
      soundOn: soundOn,
      warriorEmoji: wSkin.emoji || '🛡',
      warriorImg: wSkin.image || '',
      bossEmoji: mSkin.emoji || '👾',
      bossImg: mSkin.image || '',
      bossName: mSkin.name || ''
    });

    this._loadReviewPool(type);
  },

  onReady: function () {
    this._nextQuestion();
    this._maybeShowTutorial();
  },

  onHide: function () {
    // 新版没有常驻主循环（动画全部是 CSS + 定时器），离开页面只需清定时器
    this._clearTimers();
    this._busy = false;
  },

  onUnload: function () {
    this._clearTimers();
    question.setRandom();   // 复位出题随机源，避免挑战种子泄漏到后续自由练
  },

  // ============ 抽题 ============

  /**
   * 取下一道题。
   * 优先级：挑战/自定义固定题序 → 错题回流（R2） → 本学段随机（按题型过滤）。
   * @returns {Object|null} 词条；无可用题目返回 null
   */
  _pickItem: function () {
    if (this._challengeItems && this._challengeItems.length) {
      var ci = this._usedItems.length;
      if (ci < this._challengeItems.length) {
        var chItem = this._challengeItems[ci];
        this._usedItems.push(chItem);
        return chItem;
      }
      return null;
    }
    if (this._customLevel && Array.isArray(this._customLevel.items)) {
      var idx = this._usedItems.length;
      if (idx < this._customLevel.items.length) {
        var citem = this._customLevel.items[idx];
        this._usedItems.push(citem);
        return citem;
      }
      return null;
    }

    // R2：以 reviewRate 概率优先出「待复习错题」，让主玩法承担自动复习
    if (this._reviewPool && this._reviewPool.length &&
        review.shouldUseReview(CONFIG.reviewRate)) {
      var hit = review.pickFromPool(this._reviewPool, review.usedMapOf(this._usedItems));
      if (hit) {
        this._usedItems.push(hit.item);
        return hit.item;
      }
    }

    var type = this.data.type;
    var item = (type && type !== 'all')
      ? dict.randomItemByGroup(this.data.grade, type, this._usedItems)
      : dict.randomItem(this.data.grade, this._usedItems);
    if (item) this._usedItems.push(item);
    return item;
  },

  /** 干扰字符来源词库（挑战/自定义关卡用本关固定题，避免出现没学过的字） */
  _bank: function () {
    if (this._challengeItems && this._challengeItems.length) return this._challengeItems;
    if (this._customLevel && Array.isArray(this._customLevel.items)) return this._customLevel.items;
    var type = this.data.type;
    if (type && type !== 'all') return dict.filterByGroup(this.data.grade, type);
    return dict.loadByGrade(this.data.grade);
  },

  /** R2：错题回流池（异步；未就绪时按纯随机出题，不阻塞对局） */
  _loadReviewPool: function (type) {
    var self = this;
    if (!auth.isLoggedIn()) return;
    request.get('/api/wrong/list').then(function (data) {
      var pending = (data && data.pending) || [];
      self._reviewPool = review.buildPool(pending, { typeKey: type });
      if (typeof console !== 'undefined' && console.log) {
        console.log('[review] 待复习错题池 ' + self._reviewPool.length + ' 条（pending ' + pending.length + ' 条）');
      }
    }).catch(function (err) {
      // 静默降级：错题拿不到不影响对局
      self._reviewPool = [];
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[review] 错题池拉取失败，本局走纯随机：code=' + (err && err.code));
      }
    });
  },

  /** 答错上报错题本（登录用户；游客不上报，静默失败不影响对局） */
  _reportWrong: function (item) {
    if (!auth.isLoggedIn() || !item || !item.q) return;
    var questionId = (item.type || '') + '|' + (item.q || '') + '|' + (item.a || '');
    request.post('/api/wrong/add', {
      questionId: questionId,
      question: {
        type: item.type || '',
        q: item.q || '',
        a: item.a || '',
        hint: item.hint || ''
      }
    }).then(function () {
      if (typeof console !== 'undefined' && console.log) console.log('[wrong] 错题已上报 ' + questionId);
    }).catch(function (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[wrong] 错题上报失败 code=' + (err && err.code) + ' msg=' + (err && err.message));
      }
    });
  },

  // ============ 出题 ============

  _nextQuestion: function () {
    if (this._over) return;
    var item = this._pickItem();
    if (!item) { this._finish(true); return; }

    var round = shoot.buildRound(item, this._bank());
    if (round.invalid) {
      // 词条异常（空词）：跳过，不计入答对也不扣护盾
      this._answered += 1;
      this._nextQuestion();
      return;
    }

    this._round = round;
    this._missInRound = false;
    this._busy = false;

    var tip = round.wordLevel
      ? (round.hintText || question.wordLevelGuide(item))
      : '选对字母补全它，打跑这只怪兽！';

    this.setData({
      kind: round.kind,
      meaning: question.meaningText(item),
      head: round.head,
      tail: round.tail,
      hasSlot: round.hasSlot,
      slots: round.slots.slice(),
      pad: round.pad.slice(),
      tip: tip,
      bossHp: 100,
      phase: 'idle',
      hitText: '',
      missText: '',
      damageText: '',
      bossHit: false,
      bossCharging: false,
      heroHurt: false,
      shake: false,
      qIndex: this._answered + 1,
      dots: this._dots()
    });
  },

  /** HUD 进度点：已完成打绿、当前打黄 */
  _dots: function () {
    var out = [];
    for (var i = 0; i < this._totalQ; i++) {
      out.push({ i: i, done: i < this._answered, cur: i === this._answered });
    }
    return out;
  },

  // ============ 作答 ============

  onPadTap: function (e) {
    // 引导蒙层还在时（异常路径兜底），先关引导
    if (this.data.tutorialStep > 0) { this.finishTutorial(); return; }
    if (this.data.paused || this._busy || !this._round || this._over) return;
    this._tapIndex(e.currentTarget.dataset.index);
  },

  _tapIndex: function (index) {
    var res = shoot.tap(this._round, index);
    if (res.ignored) return;
    if (res.ok) this._onHit(res, index);
    else this._onMiss(index);
  },

  _onHit: function (res, index) {
    var self = this;
    this._busy = true;
    var pad = this._round.pad.slice();
    this.setData({
      pad: pad,
      phase: 'flying',
      bossHit: true
    });
    audio.playCorrect();
    if (this._round.word) audio.speakByItem(this._round.item, this._round.word);

    this._later(CONFIG.flyMs, function () {
      var round = self._round;
      if (!round) return;
      var left = round.needed.length - round.filled;
      self.setData({
        slots: round.slots.slice(),
        pad: round.pad.slice(),
        bossHp: Math.round(left / round.needed.length * 100),
        hitText: '',
        bossHit: false,
        shake: true,
        phase: 'idle'
      });
      self._later(300, function () { self.setData({ shake: false, hitText: '' }); });
      if (res.done) self._onClear();
      else self._busy = false;
    });
  },

  /** 全部空填满：击破本题 */
  _onClear: function () {
    var self = this;
    // 计分口径必须与服务端一致：得分 = 零失误题数 × 10（见 game/config.js 顶部注释）。
    // 所以只有「本题一次都没点错」才加分、才续连击。
    var clean = !this._missInRound;
    var combo = clean ? this.data.combo + 1 : 0;
    var gain = clean ? shoot.scorePerCorrect() : 0;
    this.setData({
      phase: 'clearing',
      combo: combo,
      score: this.data.score + gain,
      hitText: clean ? ('+' + gain) : '过关',
      comboText: combo >= 2 ? (combo + ' 连击!' + (combo >= 5 ? '🎉' : (combo >= 3 ? '🔥' : ''))) : '',
      bossHp: 0
    });
    if (combo >= 2) audio.playCombo();

    this._later(CONFIG.clearMs, function () {
      if (clean) self._perfect += 1;
      self._answered += 1;
      self._busy = false;
      self.setData({ comboText: '', hitText: '', phase: 'idle' });
      self._nextQuestion();
    });
  },

  /** 点错：Boss 蓄力 → 反击弹 → 扣 1 点护盾 */
  _onMiss: function (index) {
    var self = this;
    this._busy = true;
    this._missInRound = true;
    this.setData({ phase: 'counter', missText: '✕ MISS', combo: 0, comboText: '' });
    audio.playWrong();

    // 本局错题只记一次（同一题多次失误不重复上报/回顾）
    if (this._round && this._wrongItems.indexOf(this._round.item) === -1) {
      this._wrongItems.push(this._round.item);
      this._reportWrong(this._round.item);
    }

    this._later(CONFIG.chargeMs, function () {
      self.setData({ bossCharging: true });
      self._later(CONFIG.counterMs, function () {
        var shield = Math.max(0, self.data.shield - 1);
        var dead = shield <= 0;
        self.setData({
          bossCharging: false,
          heroHurt: true,
          shake: true,
          damageText: '-1 🛡',
          phase: dead ? 'hurt' : 'counter',
          shield: shield,
          livesText: '❤'.repeat(shield)
        });
        self._later(400, function () {
          self.setData({ heroHurt: false, shake: false, missText: '', damageText: '' });
          if (dead) {
            self._later(CONFIG.defeatMs, function () { self._finish(false); });
          } else {
            self.setData({ phase: 'idle' });
            self._busy = false;
          }
        });
      });
    });
  },

  // ============ 结算 ============

  /**
   * 本局结束。参数与旧版完全一致（result.js 用 correctCount/totalQ 重算星级）。
   * @param {boolean} win 是否打完所有题（护盾耗尽 = false）
   */
  _finish: function (win) {
    if (this._over) return;
    this._over = true;
    this._busy = true;
    this._clearTimers();

    var correctCount = this._perfect;
    var totalQ = this._totalQ;
    var rate = totalQ > 0 ? Math.round(correctCount / totalQ * 100) : 0;
    var stars = shoot.starsOf(correctCount, totalQ);
    if (win) audio.playWin();

    // R4：本局错题经 storage 中转给结算页回顾（URL 长度有限，不能塞查询串）
    storage.set('ww_last_wrong', (this._wrongItems || []).slice(0, 20));

    var query =
      'grade=' + this.data.grade +
      '&level=' + this.data.level +
      '&type=' + (this.data.type || '') +
      '&custom=' + (this._customLevel ? '1' : '0') +
      '&challenge=' + (this.data.challenge ? '1' : '0') +
      '&line=' + (this.data.challenge ? (this._line || challenge.STAR_KEY) : '') +
      '&win=' + (win ? 1 : 0) +
      '&score=' + this.data.score +
      '&correctCount=' + correctCount +
      '&totalQ=' + totalQ +
      '&rate=' + rate +
      '&stars=' + stars +
      '&maxCombo=' + this.data.combo +
      '&shoot=1';

    this._later(260, function () {
      wx.redirectTo({ url: '/pages/result/result?' + query });
    });
  },

  // ============ 交互：暂停 / 声音 ============

  /** 立绘加载失败 → 退回 emoji（离线 / CDN 抖动时仍有画面） */
  onWarriorImgError: function () {
    this.setData({ warriorImgOk: false });
  },

  onBossImgError: function () {
    this.setData({ bossImgOk: false });
  },

  onToggleSound: function () {
    var next = !this.data.soundOn;
    storage.set(constants.STORAGE_KEYS.sound, next ? '1' : '0');
    audio.setSoundEnabled(next);
    this.setData({ soundOn: next });
    if (next) audio.playCorrect();
  },

  onPause: function () {
    this._clearTimers();
    this._busy = false;
    this.setData({ paused: true, phase: 'idle' });
  },

  onResume: function () {
    this.setData({ paused: false });
  },

  onQuit: function () {
    this._clearTimers();
    this.setData({ paused: false });
    wx.navigateBack();
  },

  // ============ 新手引导（M6-L） ============

  _maybeShowTutorial: function () {
    if (storage.get('ww_tutorial_done')) return;
    this._showTutorialStep(1);
  },

  _showTutorialStep: function (step) {
    var s = TUTORIAL_STEPS[step - 1];
    if (!s) { this.finishTutorial(); return; }
    this.setData({ tutorialStep: step, tutorialTitle: s.title, tutorialDesc: s.desc });
  },

  onTutorialTap: function () {
    var next = this.data.tutorialStep + 1;
    if (next > TUTORIAL_STEPS.length) this.finishTutorial();
    else this._showTutorialStep(next);
  },

  finishTutorial: function () {
    storage.set('ww_tutorial_done', '1');
    this.setData({ tutorialStep: 0, tutorialTitle: '', tutorialDesc: '' });
  },

  // ============ E2E 钩子（只读/驱动，供 e2e/verify-game.js 稳定断言） ============

  /** 当前题依次要填的字符（E2E 用来点对，避免依赖随机） */
  _testNeeded: function () {
    return this._round ? this._round.needed.slice() : [];
  },

  /** 当前题的完整词 */
  _testWord: function () {
    return this._round ? this._round.word : '';
  },

  /** 自动点下一个正确格子 */
  _testTapCorrect: function () {
    if (!this._round) return false;
    var need = shoot.expectedText(this._round);
    if (need === null) return false;
    for (var i = 0; i < this._round.pad.length; i++) {
      if (!this._round.pad[i].used && this._round.pad[i].text === need) {
        this._tapIndex(i);
        return true;
      }
    }
    return false;
  },

  /** 自动点一个错误格子（面板里没有错误项时返回 false） */
  _testTapWrong: function () {
    if (!this._round) return false;
    var need = shoot.expectedText(this._round);
    for (var i = 0; i < this._round.pad.length; i++) {
      if (!this._round.pad[i].used && this._round.pad[i].text !== need) {
        this._tapIndex(i);
        return true;
      }
    }
    return false;
  },

  // M5 T4.1：对局页分享（带当前学段，好友直接进同一条线）
  onShareAppMessage: function () {
    var grade = this.data.grade || '';
    return {
      title: '词力战士 - 打怪兽记单词，一起来拼词闯关！',
      path: grade ? ('/pages/game/game?grade=' + grade + '&level=1') : '/pages/index/index'
    };
  }
});
