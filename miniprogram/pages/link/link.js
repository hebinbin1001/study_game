// 词语连连看（B6-5）：词↔义配对消除 + 连连看路径（≤2 弯无遮挡）
// 规则：4×4 = 8 词卡 + 8 义卡；点两张——是同一词对 且 两点连线≤2转弯不穿卡 → 消除；
// 否则错配扣命(3❤)。清空过关（按剩余命 1-3 星）。题库出题（随机学段 w1）。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var link = require('../../game/link');
var storage = require('../../utils/storage');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var request = require('../../utils/request');
var playReport = require('../../utils/play-report');

var GRADES = (constants.GRADES || []).filter(function (g) { return g.key !== 'college'; });
var COLS = 4, PAIR = 8;

Page({
  data: {
    gradeLabel: '',
    cards: [],       // [{i, t:'w'|'c', key, lab, gone}]
    lives: 3,
    left: 0,
    tip: '',
    over: false,
    win: false,
    stars: 0,
    starsText: '',
    challenge: false,      // 是否挑战主线关卡
    challengeKey: ''       // 挑战存档键（调试/测试可见）
  },

  _sel: null,

  onLoad: function (options) {
    var opt = options || {};
    // 挑战主线：学段/对数按关卡参数固定，牌面用关卡种子（同一关每次同一套词）
    this._challenge = String(opt.challenge) === '1';
    this._gradeKey = opt.grade || '';
    this._level = parseInt(opt.level, 10) || 0;
    this._seed = parseInt(opt.seed, 10) || (this._challenge ? challenge.seedOf(this._gradeKey, this._level) : 0);
    this._roundTick = 0;   // 「换局」次数：挑战模式下用它派生子种子（题不变、牌面重排）
    this._rng = this._challenge ? rng.makeRng(this._seed) : null;
    this._words = null;    // 挑战模式下本关的词集（只取一次，换局复用 → 题不变）
    this._challengeKey = this._challenge
      ? (this._gradeKey + '@' + challenge.STAR_KEY + '@' + this._level)
      : '';
    this.setData({ challenge: this._challenge, challengeKey: this._challengeKey });
    this.newRound();
  },

  /** 本局随机源：挑战=关卡种子派生的可复现随机源；自由玩=真随机 */
  _rand: function () {
    return (this._rng || Math.random)();
  },

  newRound: function () {
    var self = this;
    var words = [];
    var grade;
    var pairCount = PAIR;
    if (this._challenge) {
      // 挑战关卡：学段取关卡参数，对数按关卡参数，取词用关卡种子（题不变）
      var lv = challenge.levelAt(this._gradeKey, this._level);
    pairCount = (lv ? challenge.paramsOf(this._gradeKey, lv.mode, this._level).pairs : PAIR) || PAIR;
      grade = this._gradeByKey(this._gradeKey) || GRADES[0];
      this._roundTick = this._roundTick || 0;
      // 词集只取一次（由关卡种子决定）；「换局」只重排牌面，不换题
      if (!this._words || !this._words.length) {
        this._words = rng.pickN(this._loadW1(grade.key), pairCount, rng.makeRng(this._seed));
        if (this._words.length < pairCount) {
          // 本学段单词不够 → 并入其他学段补齐（保证关卡可玩）
          var merged = [];
          for (var gi = 0; gi < GRADES.length; gi++) {
            merged = merged.concat(this._loadW1(GRADES[gi].key));
          }
          this._words = rng.pickN(merged, pairCount, rng.makeRng(this._seed));
        }
      }
      words = this._words;
      // 牌面重排用 tick 派生的新种子：同一关首次进入固定，换局后变（避免无解牌面卡死）
      this._rng = rng.makeRng(this._seed + this._roundTick * 7919);
    } else {
      grade = GRADES[Math.floor(this._rand() * GRADES.length)];
      for (var t = 0; t < 20 && words.length < pairCount; t++) {
        // 同样走 _loadW1（按类型码精确筛纯英文单词）——原来这里的
        // randomItemByGroup(grade.key, 'w1') 也踩了「w1 是类型码不是分组 key」的坑，
        // 会补进带 * 的挖空词（截图里出现过「临*不*」）。
        var w = this._randW1(grade.key, words);
        if (w) words.push(w);
      }
      if (words.length < pairCount) {
        grade = GRADES[0];
        words = this._loadW1(grade.key).slice(0, pairCount);
      }
    }
    var cards = [];
    words.forEach(function (w) {
      var key = w.q + '|' + w.a;
      cards.push({ t: 'w', key: key, lab: (w.q || w.a).toUpperCase(), en: w.q || w.a, hint: w.hint || '' });
      cards.push({ t: 'c', key: key, lab: w.hint || w.a, en: w.q || w.a, hint: w.hint || '' });
    });
    cards = this._shuffle(cards).map(function (c, i) { c.i = i; return c; });

    this._sel = null;
    var label = this._challenge
      ? (challenge.labelOf(this._gradeKey) + ' · 挑战第 ' + this._level + '/' + challenge.LEVELS_PER_GRADE + ' 关')
      : grade.label;
    this.setData({
      gradeLabel: label,
      cards: cards,
      lives: 3,
      left: cards.length,
      tip: '点「词」再点它的「释义」· 连线 ≤2 转弯且不穿其他牌',
      over: false, win: false, stars: 0, starsText: ''
    });
  },

  /** 学段 key → 学段对象（挑战模式用） */
  _gradeByKey: function (key) {
    for (var i = 0; i < GRADES.length; i++) {
      if (GRADES[i].key === key) return GRADES[i];
    }
    return null;
  },

  _loadW1: function (gradeKey) {
    // 只取「纯英文单词」词条：原来写的是 filterByGroup(gradeKey, 'w1')，
    // 而 'w1' 是**类型码不是分组 key** → 会静默放行整库，成语/挖空词混进来，
    // 牌面就会出现「舍*忘*」「扶*济*」这种带 * 的挖空词（2026-09-12 截图体检发现；
    // 消消乐之前修的是同一个坑）。
    return dict.loadByGrade(gradeKey).filter(function (w) {
      return w.type === 'w1' && /^[A-Za-z]+$/.test(String(w.q || ''));
    });
  },
  _randW1: function (gradeKey, exclude) {
    var list = this._loadW1(gradeKey);
    if (!list.length) return null;
    var seen = {};
    (exclude || []).forEach(function (e) { if (e && e.q) seen[e.q] = 1; });
    var pool = list.filter(function (w) { return !seen[w.q]; });
    if (!pool.length) return null;
    return pool[Math.floor(this._rand() * pool.length)];
  },

  _shuffle: function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(this._rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },

  tapCard: function (e) {
    if (this.data.over) return;
    var idx = e.currentTarget.dataset.idx;
    var card = this.data.cards[idx];
    if (card.gone) return;

    if (!this._sel) {
      this._sel = { idx: idx };
      var p0 = {}; p0['cards[' + idx + '].sel'] = true;
      this.setData(p0);
      return;
    }
    if (this._sel.idx === idx) return;

    var a = this.data.cards[this._sel.idx];
    var b = card;

    // 同类（词-词/义-义）→ 换选
    if (a.t === b.t) {
      var p1 = {}; p1['cards[' + this._sel.idx + '].sel'] = false;
      this.setData(p1);
      this._sel = { idx: idx };
      var p2 = {}; p2['cards[' + idx + '].sel'] = true;
      this.setData(p2);
      return;
    }

    // 是否同对且路径通
    var pair = (a.key === b.key);
    var ra = Math.floor(a.i / COLS), ca = a.i % COLS;
    var rb = Math.floor(b.i / COLS), cb = b.i % COLS;
    var grid = this._buildGrid();
    var passable = pair && link.canConnect(grid, ra, ca, rb, cb);

    if (passable) {
      var ia = this._sel.idx;
      this._sel = null;
      var ok = {};
      ok['cards[' + ia + '].gone'] = true;
      ok['cards[' + idx + '].gone'] = true;
      ok['cards[' + ia + '].sel'] = false;
      ok.left = this.data.left - 2;
      this.setData(ok);
      // 注意：setData 会同步更新 this.data.left，此处不能再减 2，
      // 否则剩最后 2 张牌（1 对未消）就会提前判过关。
      if (this.data.left <= 0) {
        var stars = challenge.starsByLives(this.data.lives);
        this.setData({ over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars), tip: '全部连上！' });
        this._saveChallengeStars(stars);
      }
    } else {
      var why = !pair ? '它不是它的释义' : '路径被挡或不满足 ≤2 转弯';
      var lives = this.data.lives - 1;
      var ia2 = this._sel.idx;
      this._sel = null;
      var bad = {};
      bad['cards[' + ia2 + '].sel'] = false;
      bad.lives = lives;
      this.setData(bad);
      this._flashErr([ia2, idx]);
      wx.showToast({ title: why, icon: 'none' });
      if (lives <= 0) {
        this.setData({ over: true, win: false, starsText: '', tip: '生命耗尽 · 再来一次' });
      }
    }
  },

  _flashErr: function (idxs) {
    var self = this;
    var f = {};
    idxs.forEach(function (i) { f['cards[' + i + '].err'] = true; });
    this.setData(f);
    setTimeout(function () {
      var clr = {};
      idxs.forEach(function (i) { clr['cards[' + i + '].err'] = false; });
      self.setData(clr);
    }, 320);
  },

  /**
   * 挑战关卡结算：写挑战星级（取历史最大值）+ 同步段位（累计星）。
   * 只有过关才写；失败（命耗尽）不写档，与字母射击一致。
   */
  _saveChallengeStars: function (stars) {
    if (!this._challenge || !this._gradeKey || !this._level) return;
    storage.saveStars(this._gradeKey, this._level, stars, challenge.STAR_KEY);
    // 统一上报（成绩 + 段位）：game_type=link，供玩法进度榜与玩法类成就使用
    playReport.reportPlay({
      gameType: challenge.gameTypeOf('link'),
      grade: this._gradeKey,
      level: this._level,
      score: stars * 10,
      correct: this.pairsUsed || 0,
      total: this.pairsUsed || 0,
      stars: stars
    });
  },

  _buildGrid: function () {
    var g = [];
    for (var r = 0; r < COLS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var card = this.data.cards[r * COLS + c];
        row.push(card && !card.gone ? 1 : 0);
      }
      g.push(row);
    }
    return g;
  },

  again: function () {
    // 挑战模式：题不变、牌面重排（避免无解牌面把玩家卡死）
    if (this._challenge) this._roundTick = (this._roundTick || 0) + 1;
    this.newRound();
  },
  goBack: function () { wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 词语连连看', path: '/pages/playlist/playlist' };
  }
});
