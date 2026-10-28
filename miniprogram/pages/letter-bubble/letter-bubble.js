// Boss 补字母泡泡龙：题库闯关型玩法
// 一局逐词进行；命中唯一缺口字母会破盾并伤害 Boss，错误字母触发 Boss 反击。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var storage = require('../../utils/storage');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var lib = require('../../game/letter-bubble');
var playReport = require('../../utils/play-report');
var gameStatus = require('../../utils/game-status');
var skins = require('../../utils/skins');
var art = require('../../utils/art');
var audio = require('../../game/audio');
var auth = require('../../utils/auth');
var request = require('../../utils/request');
var battleFx = require('../../utils/battle-fx');

var GAME_KEY = 'letterBubble';
var BOSS_NAMES = ['字母吞噬兽', '拼写尖啸龙', '词盾暴君'];

Page({
  data: {
    booting: true,
    blocked: false,
    paused: false,
    over: false,
    win: false,
    challenge: false,
    challengeLabel: '',
    gradeLabel: '',
    qIndex: 1,
    totalQ: 10,
    lives: 5,
    livesText: '❤❤❤❤❤',
    score: 0,
    combo: 0,
    word: '',
    wordClass: '',
    meaning: '',
    ipa: '',
    letters: [],
    bubbles: [],
    bossHp: 100,
    bossPhase: 1,
    bossName: BOSS_NAMES[0],
    bossImg: '',
    bossEmoji: '👾',
    warriorImg: '',
    warriorEmoji: '🛡',
    activeBubbleId: '',
    activeResult: '',
    aiming: false,
    aimTargetId: '',
    aimLineStyle: '',
    toastText: '',
    toastClass: '',
    turnLabel: '你的回合',
    turnTone: 'normal',
    heroAttacking: false,
    heroAttackKind: '',
    heroStrikeStyle: '',
    bossCountering: false,
    bossCounterStyle: '',
    heroHurt: false,
    bossHurt: false,
    showNext: false,
    starsText: '',
    resultTitle: '',
    resultMsg: '',
    resultHint: '',
    fxSeq: 0,
    fxMode: '',
    fxText: ''
  },

  _timers: [],
  _attempts: 0,
  _correctWords: 0,
  _perfectWords: 0,
  _missInWord: false,
  _wrongReported: false,
  _busy: false,
  _pendingAction: '',
  _pausedAction: '',
  _arenaRect: null,

  onLoad: function (options) {
    var opt = options || {};
    this._opt = opt;
    var ctx = challenge.contextOf(opt);
    this._challenge = ctx.isChallenge;
    this._line = ctx.line;
    this._gradeKey = (ctx.isChallenge && opt.grade)
      ? opt.grade
      : (storage.getLastGrade() || constants.GRADES[0].key);
    this._level = parseInt(opt.level, 10) || 0;
    this._seed = ctx.seed || rng.hashSeed('letter-bubble-free:' + Date.now());
    this._nextUrl = challenge.nextLevelUrl(opt);
    this._params = ctx.params || challenge.paramsOf(this._gradeKey, GAME_KEY);

    var warrior = skins.getWarriorSkin(storage.getWarriorSkin());
    var bossId = storage.getBossSkin();
    var boss = skins.getMonsterSkin(bossId);
    var gradeLabel = challenge.labelOf(this._gradeKey);
    this.setData({
      challenge: this._challenge,
      challengeLabel: ctx.label || gradeLabel + ' · 补字母泡泡龙',
      gradeLabel: gradeLabel,
      totalQ: this._params.count || 10,
      showNext: !!this._nextUrl,
      warriorImg: art.artUrl(warrior.image || ''),
      warriorEmoji: warrior.emoji || '🛡',
      bossImg: art.artUrl(boss.image || ''),
      bossEmoji: boss.emoji || '👾',
      bossName: boss.name || BOSS_NAMES[0]
    });

    var self = this;
    gameStatus.isPaused(GAME_KEY).then(function (paused) {
      if (paused) {
        self._blocked = true;
        self.setData({ booting: false, blocked: true });
        wx.showModal({
          title: '玩法暂时关闭',
          content: '管理员已暂停「Boss 补字母泡泡龙」，请稍后再来。',
          showCancel: false,
          confirmText: '返回玩法页',
          success: function () {
            wx.navigateBack({
              fail: function () { wx.reLaunch({ url: '/pages/playlist/playlist' }); }
            });
          }
        });
        return;
      }
      self.startGame();
    });
  },

  onReady: function () {
    this._measureArena();
  },

  onShow: function () {
    this._measureArena();
  },

  onHide: function () {
    if (this.data.over || this.data.blocked) return;
    this._pausedAction = this._pendingAction;
    this._clearTimers();
    this.setData({ paused: true, aiming: false });
  },

  onUnload: function () {
    this._clearTimers();
    this._timers = [];
  },

  _later: function (fn, ms) {
    var self = this;
    var id = setTimeout(function () {
      self._timers = self._timers.filter(function (t) { return t !== id; });
      fn();
    }, ms);
    this._timers.push(id);
    return id;
  },

  _clearTimers: function () {
    (this._timers || []).forEach(function (id) { clearTimeout(id); });
    this._timers = [];
  },

  _measureArena: function () {
    var self = this;
    wx.createSelectorQuery()
      .select('#bubbleArena')
      .boundingClientRect(function (rect) {
        if (rect) self._arenaRect = rect;
      })
      .exec();
  },

  _loadWords: function () {
    var wanted = Math.max(6, parseInt(this._params.count, 10) || 10);
    var pool = lib.usableItems(dict.loadByGrade(this._gradeKey));
    if (pool.length < wanted) {
      constants.GRADES.forEach(function (grade) {
        if (grade.key !== this._gradeKey) pool = pool.concat(dict.loadByGrade(grade.key));
      }, this);
      pool = lib.usableItems(pool);
    }
    var random = this._challenge ? rng.makeRng(this._seed) : Math.random;
    return rng.pickN(pool, wanted, random);
  },

  startGame: function () {
    if (this._blocked) return;
    this._clearTimers();
    this._words = this._loadWords();
    if (this._words.length < 3) {
      this.setData({ booting: false });
      wx.showModal({
        title: '题库准备中',
        content: '当前学段暂时没有足够的英语单词，请先切换年级或补充题库。',
        showCancel: false
      });
      return;
    }
    this._maxLives = Math.max(3, parseInt(this._params.lives, 10) || lib.livesForCount(this._words.length));
    this._attempts = 0;
    this._correctWords = 0;
    this._perfectWords = 0;
    this._score = 0;
    this._combo = 0;
    this._bestCombo = 0;
    this._missInWord = false;
    this._wrongReported = false;
    this._busy = false;
    this._pendingAction = '';
    this._pausedAction = '';
    this._over = false;
    this._rng = this._challenge
      ? rng.makeRng((this._seed ^ 0x9e3779b9) >>> 0)
      : Math.random;
    this.setData({
      booting: false,
      paused: false,
      over: false,
      win: false,
      lives: this._maxLives,
      livesText: '❤'.repeat(this._maxLives),
      score: 0,
      combo: 0,
      totalQ: this._words.length,
      activeBubbleId: '',
      activeResult: '',
      activeX: 50,
      activeY: 50,
      aiming: false,
      aimTargetId: '',
      aimLineStyle: '',
      toastText: '',
      toastClass: '',
      turnLabel: '你的回合',
      turnTone: 'normal',
      heroAttacking: false,
      heroAttackKind: '',
      bossCountering: false,
      heroHurt: false,
      bossHurt: false,
      resultTitle: '',
      resultMsg: '',
      resultHint: ''
    });
    this._nextWord();
  },

  _nextWord: function () {
    if (this._over) return;
    if (this._correctWords >= this._words.length) {
      this._finish(true);
      return;
    }
    var item = this._words[this._correctWords];
    var bubbleBase = parseInt(this._params.bubbles, 10) || 7;
    var bubbleCount = Math.min(9, bubbleBase + Math.floor(this._correctWords / 3));
    this._round = lib.buildRound(item, {
      bubbleCount: bubbleCount,
      random: this._rng
    });
    this._missInWord = false;
    this._wrongReported = false;
    this._busy = false;
    var bossPhase = this._correctWords >= 7 ? 3 : (this._correctWords >= 4 ? 2 : 1);
    var wordClass = this._round.word.length >= 12
      ? 'word-xl'
      : (this._round.word.length >= 9 ? 'word-long' : '');
    this.setData({
      qIndex: this._correctWords + 1,
      word: this._round.word,
      wordClass: wordClass,
      meaning: this._round.meaning,
      ipa: this._round.ipa,
      letters: this._round.letters,
      bubbles: this._round.bubbles,
      bossHp: Math.round((this._words.length - this._correctWords) / this._words.length * 100),
      bossPhase: bossPhase,
      bossName: BOSS_NAMES[bossPhase - 1],
      activeBubbleId: '',
      activeResult: '',
      activeX: 50,
      activeY: 50,
      aiming: false,
      aimTargetId: '',
      aimLineStyle: '',
      toastText: '',
      toastClass: '',
      turnLabel: '你的回合',
      turnTone: 'normal',
      heroAttacking: false,
      heroAttackKind: '',
      bossCountering: false,
      heroHurt: false,
      bossHurt: false
    });
  },

  _refreshBubbles: function () {
    if (!this._round) return;
    var count = Math.min(9, (parseInt(this._params.bubbles, 10) || 7) + Math.floor(this._correctWords / 3));
    this._round.bubbles = lib.buildBubbles(this._round.missing, count, this._rng);
    this._busy = false;
    this.setData({
      bubbles: this._round.bubbles,
      activeBubbleId: '',
      activeResult: '',
      activeX: 50,
      activeY: 50,
      aiming: false,
      aimTargetId: '',
      aimLineStyle: '',
      toastText: '',
      toastClass: ''
    });
  },

  _pointOf: function (event) {
    var touch = (event.touches && event.touches[0])
      || (event.changedTouches && event.changedTouches[0]);
    if (!touch) return null;
    return { x: touch.clientX, y: touch.clientY };
  },

  _nearestBubble: function (point, limit) {
    var rect = this._arenaRect;
    if (!rect || !point) return null;
    var x = point.x - rect.left;
    var y = point.y - rect.top;
    var best = null;
    var bestDistance = limit || 76;
    (this.data.bubbles || []).forEach(function (bubble) {
      var bx = rect.width * bubble.x / 100;
      var by = rect.height * bubble.y / 100;
      var distance = Math.sqrt(Math.pow(bx - x, 2) + Math.pow(by - y, 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = bubble;
      }
    });
    return best;
  },

  _aimAtPoint: function (point) {
    var rect = this._arenaRect;
    if (!rect || !point) return;
    var sx = rect.left + rect.width / 2;
    var sy = rect.top + rect.height - 70;
    var dx = point.x - sx;
    var dy = point.y - sy;
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    var length = Math.max(0, Math.sqrt(dx * dx + dy * dy));
    var bubble = this._nearestBubble(point, 82);
    this.setData({
      aimTargetId: bubble ? bubble.id : '',
      aimLineStyle: 'width:' + Math.round(length) + 'px;transform:rotate(' + angle.toFixed(1) + 'deg);'
    });
  },

  onAimStart: function (event) {
    if (this.data.paused || this.data.over || this.data.booting || this.data.blocked || this._busy) return;
    // 直接从泡泡上按下时让子元素 catchtap 负责命中；父级只处理空白区域拖拽，
    // 否则 touchend 与 tap 会先后争抢同一次操作。
    this._touchStartedOnBubble = !!(event.target
      && event.target.dataset
      && event.target.dataset.id);
    if (this._touchStartedOnBubble) return;
    var point = this._pointOf(event);
    if (!point) return;
    this.setData({ aiming: true });
    this._aimAtPoint(point);
    this._aimPoint = point;
  },

  onAimMove: function (event) {
    if (!this.data.aiming) return;
    event.preventDefault && event.preventDefault();
    var point = this._pointOf(event);
    if (!point) return;
    this._aimPoint = point;
    this._aimAtPoint(point);
  },

  onAimEnd: function (event) {
    if (this._touchStartedOnBubble) {
      this._touchStartedOnBubble = false;
      this.setData({ aiming: false, aimTargetId: '', aimLineStyle: '' });
      return;
    }
    if (!this.data.aiming) return;
    var point = this._pointOf(event) || this._aimPoint;
    if (point) this._aimAtPoint(point);
    var bubble = this._nearestBubble(point, 92);
    this.setData({ aiming: false, aimTargetId: '', aimLineStyle: '' });
    if (bubble) this._launch(bubble.id);
  },

  onAimCancel: function () {
    this.setData({ aiming: false, aimTargetId: '', aimLineStyle: '' });
  },

  onBubbleTap: function (event) {
    this._launch(event.currentTarget.dataset.id);
  },

  _launch: function (bubbleId) {
    if (this.data.paused || this.data.over || this._busy || !this._round) return false;
    var result = lib.resolve(this._round, bubbleId);
    if (!result.bubble) return false;

    this._busy = true;
    this._attempts += 1;
    if (result.ok) {
      this._correctWords += 1;
      if (!this._missInWord) {
        this._perfectWords += 1;
        this._combo += 1;
      } else {
        this._combo = 1;
      }
      this._bestCombo = Math.max(this._bestCombo, this._combo);
      var gained = 80 + this._combo * 20 + this.data.lives * 5;
      this._score += gained;
      var letters = this.data.letters.map(function (item) {
        if (!item.blank) return item;
        return Object.assign({}, item, { filled: true, ch: result.missing, solved: true });
      });
      this._pendingAction = this._correctWords >= this._words.length ? 'win' : 'next';
      audio.playCorrect();
      audio.speakByItem(this._round.item, this._round.word);
      this.setData({
        letters: letters,
        score: this._score,
        combo: this._combo,
        activeBubbleId: bubbleId,
        activeResult: 'correct',
        activeX: result.bubble.x,
        activeY: result.bubble.y,
        bossHp: Math.round((this._words.length - this._correctWords) / this._words.length * 100),
        toastText: this._round.word.toUpperCase() + ' · ' + this._round.meaning + ' +' + gained,
        toastClass: 'good',
        turnLabel: '命中！Boss 受到 1 点伤害',
        turnTone: 'good'
      });
      this._playBattleFx(this._pendingAction === 'win' ? 'finish' : 'attack', '-1 护盾');
      this._later(this._runPending.bind(this), 620);
      return true;
    }

    this._combo = 0;
    this._missInWord = true;
    this._pendingAction = this.data.lives <= 1 ? 'fail' : 'refresh';
    audio.playWrong();
    if (!this._wrongReported) {
      this._wrongReported = true;
      this._reportWrong(this._round.item);
    }
    this.setData({
      lives: Math.max(0, this.data.lives - 1),
      livesText: '❤'.repeat(Math.max(0, this.data.lives - 1)),
      combo: 0,
      activeBubbleId: bubbleId,
      activeResult: 'wrong',
      activeX: result.bubble.x,
      activeY: result.bubble.y,
      toastText: result.bubble.letter + ' 不是缺口字母 · 护盾 -1',
      toastClass: 'bad',
      turnLabel: 'Boss 反击！护盾 -1',
      turnTone: 'danger'
    });
    this._playBattleFx('counter', '-1 ♥');
    this._later(this._runPending.bind(this), 620);
    return true;
  },

  _playBattleFx: function (mode, text) {
    var rect = this._arenaRect;
    var target = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.45 }
      : null;
    var player = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height - 45 }
      : null;
    if (target && player) {
      if (mode === 'counter') {
        this.setData({
          bossCountering: true,
          bossCounterStyle: '--counter-x:' + Math.round(player.x - target.x) + 'px;'
            + '--counter-y:' + Math.round(player.y - target.y) + 'px;',
          heroHurt: true
        });
      } else {
        this.setData({
          heroAttacking: true,
          heroAttackKind: mode,
          heroStrikeStyle: '--strike-x:' + Math.round(target.x - player.x) + 'px;'
            + '--strike-y:' + Math.round(target.y - player.y) + 'px;',
          bossHurt: true
        });
      }
    }
    battleFx.play(this, mode, text, target, player);
    var self = this;
    this._later(function () {
      self.setData({
        heroAttacking: false,
        heroAttackKind: '',
        bossCountering: false,
        heroHurt: false,
        bossHurt: false
      });
    }, mode === 'finish' ? 870 : (mode === 'counter' ? 520 : 630));
  },

  _runPending: function () {
    var action = this._pendingAction;
    this._pendingAction = '';
    this._pausedAction = '';
    this.setData({ activeBubbleId: '', activeResult: '' });
    if (action === 'next') this._nextWord();
    else if (action === 'refresh') this._refreshBubbles();
    else if (action === 'win') this._finish(true);
    else if (action === 'fail') this._finish(false);
  },

  _reportWrong: function (item) {
    if (!auth.isLoggedIn() || !item) return;
    request.post('/api/wrong/add', {
      questionId: 'letter_bubble|' + item.q + '|' + item.a,
      question: {
        type: item.type || 'w1',
        q: item.q || '',
        a: item.a || '',
        hint: item.hint || ''
      }
    }).catch(function () {});
  },

  _finish: function (win) {
    if (this._over) return;
    this._over = true;
    this._busy = true;
    this._clearTimers();
    var stars = win ? lib.starsOf(this._perfectWords, this._words.length) : 0;
    var perfectRate = this._words.length
      ? Math.round(this._perfectWords / this._words.length * 100)
      : 0;
    if (win) audio.playWin();

    if (this._challenge && this._gradeKey && this._level) {
      storage.saveStars(this._gradeKey, this._level, stars, this._line || challenge.STAR_KEY);
    }
    playReport.reportPlay({
      gameType: challenge.gameTypeOf(GAME_KEY),
      grade: this._gradeKey || 'all',
      level: this._level || 1,
      score: this._score,
      correct: this._perfectWords,
      total: this._words.length,
      stars: stars,
      maxCombo: this._bestCombo,
      typeKey: (this._challenge && this._line) ? this._line : ''
    });

    this.setData({
      over: true,
      win: win,
      paused: false,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      resultTitle: win ? 'Boss 护盾全线击破！' : '护盾耗尽，Boss 暂时守住',
      resultMsg: win
        ? '补全 ' + this._words.length + ' 个单词 · 零失误 ' + perfectRate + '%'
        : '完成 ' + this._correctWords + ' / ' + this._words.length + ' 个单词，下次先想词义再瞄准。',
      resultHint: challenge.starHint(this._perfectWords, this._words.length, win, '词')
    });
  },

  onRetry: function () {
    this.startGame();
  },

  onNext: function () {
    if (!this._nextUrl) return;
    wx.redirectTo({ url: this._nextUrl });
  },

  goBack: function () {
    wx.navigateBack();
  },

  onWarriorImgError: function () {
    this.setData({ warriorImg: '' });
  },

  onBossImgError: function () {
    this.setData({ bossImg: '' });
  },

  onGamePause: function () {
    if (this.data.over) return;
    this._pausedAction = this._pendingAction;
    this._clearTimers();
    this.setData({ paused: true, aiming: false });
  },

  onGameResume: function () {
    this.setData({ paused: false });
    if (this._pausedAction) {
      this._pendingAction = this._pausedAction;
      this._runPending();
    }
  },

  onGameRestart: function () {
    this.setData({ paused: false });
    this.startGame();
  },

  onGameQuit: function () {
    this.setData({ paused: false });
    wx.navigateBack();
  },

  onShareAppMessage: function () {
    return {
      title: '词力战士 - 补全字母击破 Boss 护盾',
      path: '/pages/playlist/playlist'
    };
  },

  _testFireCorrect: function () {
    var bubble = (this.data.bubbles || []).find(function (item) { return item.correct; });
    return bubble ? this._launch(bubble.id) : false;
  },

  _testFireWrong: function () {
    var bubble = (this.data.bubbles || []).find(function (item) { return !item.correct; });
    return bubble ? this._launch(bubble.id) : false;
  }
});
