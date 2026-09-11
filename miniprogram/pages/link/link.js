// 词语连连看（B6-5）：词↔义配对消除 + 连连看路径（≤2 弯无遮挡）
// 规则：4×4 = 8 词卡 + 8 义卡；点两张——是同一词对 且 两点连线≤2转弯不穿卡 → 消除；
// 否则错配扣命(3❤)。清空过关（按剩余命 1-3 星）。题库出题（随机学段 w1）。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var link = require('../../game/link');
var auth = require('../../utils/auth');

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
    starsText: ''
  },

  _sel: null,

  onLoad: function () { this.newRound(); },

  newRound: function () {
    var self = this;
    var words = [];
    var grade = GRADES[Math.floor(Math.random() * GRADES.length)];
    for (var t = 0; t < 20 && words.length < PAIR; t++) {
      var w = dict.randomItemByGroup ? dict.randomItemByGroup(grade.key, 'w1', words) : null;
      if (!w) w = this._randW1(grade.key, words);
      if (w) words.push(w);
    }
    if (words.length < PAIR) {
      grade = GRADES[0];
      words = this._loadW1(grade.key).slice(0, PAIR);
    }
    var cards = [];
    words.forEach(function (w) {
      var key = w.q + '|' + w.a;
      cards.push({ t: 'w', key: key, lab: (w.q || w.a).toUpperCase(), en: w.q || w.a, hint: w.hint || '' });
      cards.push({ t: 'c', key: key, lab: w.hint || w.a, en: w.q || w.a, hint: w.hint || '' });
    });
    cards = this._shuffle(cards).map(function (c, i) { c.i = i; return c; });

    this._sel = null;
    this.setData({
      gradeLabel: grade.label,
      cards: cards,
      lives: 3,
      left: cards.length,
      tip: '点「词」再点它的「释义」· 连线 ≤2 转弯且不穿其他牌',
      over: false, win: false, stars: 0, starsText: ''
    });
  },

  _loadW1: function (gradeKey) {
    return dict.filterByGroup(gradeKey, 'w1');
  },
  _randW1: function (gradeKey, exclude) {
    var list = this._loadW1(gradeKey);
    if (!list.length) return null;
    var seen = {};
    (exclude || []).forEach(function (e) { if (e && e.q) seen[e.q] = 1; });
    var pool = list.filter(function (w) { return !seen[w.q]; });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  },

  _shuffle: function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
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
        var stars = this.data.lives === 3 ? 3 : (this.data.lives === 2 ? 2 : 1);
        this.setData({ over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars), tip: '全部连上！' });
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

  again: function () { this.newRound(); },
  goBack: function () { wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 词语连连看', path: '/pages/playlist/playlist' };
  }
});
