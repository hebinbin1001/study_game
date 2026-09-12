// 词义消消乐（B6-2）：词↔义配对消除
// 规则：随机学段取 8 个英文词 → 16 卡（8 词卡 + 8 中文释义卡）；
// 点「词」再点「义」→ 匹配则成对消除（消消乐）；错配扣命（3❤），
// 错配的两张记入本局错词（登录后上报错题本）。
// 全消通关 → 结算星级（按剩余命）。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var storage = require('../../utils/storage');
var auth = require('../../utils/auth');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var playReport = require('../../utils/play-report');

var GRADES = (constants.GRADES || []).filter(function (g) { return g.key !== 'college'; });
var PAIR_COUNT = 8; // 8 对 = 16 卡

Page({
  data: {
    gradeLabel: '',
    cards: [],            // [{t:'w'|'c', key, lab, en}]
    lives: 3,
    mistakes: 0,
    left: 0,              // 剩余卡数
    tip: '',
    over: false,
    win: false,
    stars: 0,
    starsText: '',
    challenge: false,     // 是否挑战主线关卡（结算写 <grade>@challenge@<level> 并上报成绩）
    challengeKey: ''
  },

  _sel: null,      // {idx}
  _gameKey: '',    // 当前局词 key（供错词去重）

  onLoad: function (options) {
    var opt = options || {};
    // 挑战主线（P2）：学段/对数按关卡参数固定，牌面用关卡种子（同一关每次同一套词）
    this._challenge = String(opt.challenge) === '1';
    this._gradeKey = opt.grade || '';
    this._level = parseInt(opt.level, 10) || 0;
    this._pairs = PAIR_COUNT;
    this._rng = null;
    this._challengeKey = '';
    if (this._challenge) {
      var lv = challenge.levelAt(this._gradeKey, this._level);
      this._pairs = (lv ? challenge.paramsOf(this._gradeKey, lv.mode).pairs : PAIR_COUNT) || PAIR_COUNT;
      var seed = parseInt(opt.seed, 10) || challenge.seedOf(this._gradeKey, this._level);
      this._rng = rng.makeRng(seed);
      this._challengeKey = this._gradeKey + '@' + challenge.STAR_KEY + '@' + this._level;
    }
    this.setData({ challenge: this._challenge, challengeKey: this._challengeKey });
    this.newRound();
  },

  newRound: function () {
    var self = this;
    var pairCount = this._pairs || PAIR_COUNT;
    var grade = this._challenge ? this._gradeByKey(this._gradeKey) : null;
    if (!grade) grade = GRADES[Math.floor(Math.random() * GRADES.length)];
    // 词池：只取「可成对展示」的英文单词。
    // 踩坑记录：原来写的是 filterByGroup(grade.key, 'w1') —— 'w1' 是**类型码不是分组 key**
    // （合法 key 只有 all/word/fill/wordCn/idiom/xhy），传未知 key 会命中「未知分组 → 放行全部」兜底，
    // 于是词卡会出现 '愚*移*' 这种带 * 的挖空词、甚至汉字。这里按 type 精确筛 w1 并用纯字母兜底。
    var pickWords = function (key) {
      return dict.loadByGrade(key).filter(function (w) {
        return w.type === 'w1' && /^[A-Za-z]+$/.test(String(w.q || ''));
      });
    };
    var words = pickWords(grade.key);
    if (words.length < pairCount) { grade = GRADES[0]; words = pickWords(grade.key); }

    // 挑战模式：取词与打乱都走关卡种子（同一关牌面一致）
    var pool = this._shuffle(words).slice(0, pairCount);
    this._gameKey = grade.key + '_' + Date.now();
    var cards = [];
    pool.forEach(function (w) {
      var key = w.q + '|' + w.a;
      cards.push({ t: 'w', key: key, lab: (w.q || w.a).toUpperCase(), en: w.q || w.a, hint: w.hint || '' });
      cards.push({ t: 'c', key: key, lab: w.hint || w.a, en: w.q || w.a, hint: w.hint || '' });
    });
    cards = this._shuffle(cards);

    this._sel = null;
    this.setData({
      gradeLabel: grade.label,
      cards: cards,
      lives: 3,
      mistakes: 0,
      left: cards.length,
      tip: '点「词」再点它的「释义」，成对消除',
      over: false,
      win: false,
      stars: 0,
      starsText: ''
    });
  },

  _shuffle: function (arr) {
    // 挑战模式用关卡随机源（可复现），自由玩用真随机
    return rng.shuffle(arr, this._rng || undefined);
  },

  /** 学段 key → 学段对象（挑战模式用） */
  _gradeByKey: function (key) {
    for (var i = 0; i < GRADES.length; i++) {
      if (GRADES[i].key === key) return GRADES[i];
    }
    return null;
  },

  tapCard: function (e) {
    if (this.data.over) return;
    var idx = e.currentTarget.dataset.idx;
    var card = this.data.cards[idx];
    if (card.gone) return;

    var self = this;
    if (!this._sel) {
      this._sel = { idx: idx };
      var p0 = {}; p0['cards[' + idx + '].sel'] = true;
      this.setData(p0);
      return;
    }
    if (this._sel.idx === idx) return;
    var a = this.data.cards[this._sel.idx];
    var b = card;
    if (a.t === b.t) { // 同类（词点词/义点义）→ 换选中
      var p1 = {}; p1['cards[' + this._sel.idx + '].sel'] = false;
      this.setData(p1);
      this._sel = { idx: idx };
      var p2 = {}; p2['cards[' + idx + '].sel'] = true;
      this.setData(p2);
      return;
    }
    // 词↔义是否同一 key
    if (a.key === b.key) {
      // 匹配成功：成对消除
      var idxA = this._sel.idx;
      this._sel = null;
      var patch = {};
      patch['cards[' + idxA + '].hit'] = true;
      patch['cards[' + idx + '].hit'] = true;
      patch['cards[' + idxA + '].gone'] = true;
      patch['cards[' + idx + '].gone'] = true;
      patch.left = this.data.left - 2;
      this.setData(patch);
      if (this.data.left - 2 <= 0) {
        var lives = this.data.lives;
        var stars = challenge.starsByLives(lives);
        this.setData({ over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars), tip: '全部配对成功！' });
        this._saveChallenge(stars, this.data.cards.length / 2 - this.data.mistakes, this.data.cards.length / 2);
      }
    } else {
      // 错配：扣命 + 记错词
      var self2 = this;
      this._reportWrong(a, b);
      var idxA2 = this._sel.idx;
      this._sel = null;
      var lives = this.data.lives - 1;
      var p = {};
      p['cards[' + idxA2 + '].miss'] = true;
      p['cards[' + idx + '].miss'] = true;
      p.lives = lives;
      p.mistakes = this.data.mistakes + 1;
      this.setData(p);
      setTimeout(function () {
        var clr = {};
        clr['cards[' + idxA2 + '].miss'] = false;
        clr['cards[' + idx + '].miss'] = false;
        clr['cards[' + idxA2 + '].sel'] = false;
        self2.setData(clr);
        if (lives <= 0) {
          self2.setData({ over: true, win: false, starsText: '', tip: '生命耗尽 · 再来一次' });
        }
      }, 420);
    }
  },

  // 错词上报（登录用户）——复用错题本：英文词为题目、hint 为义
  _reportWrong: function (a, b) {
    if (!auth.isLoggedIn()) return;
    var word = (a.t === 'w' ? a : b);
    var req = require('../../utils/request');
    req.post('/api/wrong/add', {
      questionId: 'match|' + word.en,
      question: {
        id: word.en,
        type: 'match',
        q: word.en,
        a: word.hint || word.en,
        hint: word.hint || ''
      }
    }).catch(function () {});
  },

  // 用本局错词启动「错题复习」？提供重玩
  again: function () { this.newRound(); },

  /**
   * 挑战关卡结算：写挑战星级（取历史最大值）+ 上报本局成绩（game_type=match，供玩法进度榜与玩法类成就）。
   * 自由玩（非挑战模式）不写进度，保持原有行为。
   */
  _saveChallenge: function (stars, correct, total) {
    if (!this._challenge || !this._gradeKey || !this._level) return;
    storage.saveStars(this._gradeKey, this._level, stars, challenge.STAR_KEY);
    playReport.reportPlay({
      gameType: challenge.gameTypeOf('match'),
      grade: this._gradeKey,
      level: this._level,
      score: stars * 10,
      correct: Math.max(0, correct || 0),
      total: Math.max(0, total || 0),
      stars: stars
    });
  },

  // 换学段再来
  changeGrade: function () { this.newRound(); },

  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 词义消消乐', path: '/pages/playlist/playlist' };
  }
});
