// 算 24 点页（重做 · 成熟玩法：直接构造带括号算式并校验）
//
// 规则（对齐经典 24 点）：
//   从 4 张牌中各取一次、用一次 + − × ÷ 与括号组成算式，使结果 = 24。
//   关卡固定（4 数有解），每关同题便于复玩/比较。
// 交互（对齐主流 24 点 App）：
//   数字牌点一下把该数字插入算式（该牌置灰表示已用）；
//   运算符/括号按钮插入对应字符；「退格」删末尾；「清空」重来；
//   「＝ 校验」用精确有理数求值，等于 24 且 4 个数都用上 → 过关。
var m24 = require('../../game/math24');
var storage = require('../../utils/storage');

// 固定关卡库（60 关）：data/math24-levels.js，自动生成、每关保证有解。
// 生成与重新生成：node e2e/gen-math24-levels.js（用精确有理数求解器逐关校验）；
// 关卡库校验：node miniprogram/utils/__tests__/math24-levels.test.js
var LEVELS = require('../../data/math24-levels').levels;
var LIVES = 3;

Page({
  data: {
    levelInfo: LEVELS,
    curLevel: 1,
    playing: true,
    cards: [],         // [{num, used}]
    expr: '',          // 当前构造的算式
    lives: LIVES,
    tries: 0,
    hint: '',
    over: false,
    win: false,
    stars: 0,
    starsText: '',
    overMsg: ''
  },

  onLoad: function () {
    this.startLevel(1);
  },

  startLevel: function (no) {
    var lv = LEVELS[no - 1];
    if (!lv) return;
    this.setData({
      curLevel: no,
      playing: true,
      cards: lv.nums.map(function (n) { return { num: n, used: false }; }),
      expr: '',
      lives: LIVES,
      tries: 0,
      hint: '把 4 张牌各用一次，用 + − × ÷ 和括号算出 24',
      over: false, win: false, stars: 0, starsText: ''
    });
  },

  // —— 点数字牌：追加到算式并标已用（同一张已用不可再插） ——
  tapCard: function (e) {
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var cards = this.data.cards.slice();
    if (cards[idx].used) { wx.showToast({ title: '这张已用过', icon: 'none' }); return; }
    var v = cards[idx].num;
    cards[idx].used = true;
    this.setData({ cards: cards, expr: this.data.expr + v });
  },

  // —— 运算符/括号/符号按钮 ——
  addSym: function (e) {
    this.setData({ expr: this.data.expr + e.currentTarget.dataset.s });
  },

  // 退格
  backspace: function () {
    var ex = this.data.expr;
    if (!ex.length) return;
    var cut = ex.slice(0, -1);
    // 同步还原被删数字牌的 used（若删的是某张牌）
    this.setData({ expr: cut, cards: this._syncUsed(cut) });
  },

  clearAll: function () {
    this.setData({ expr: '', cards: this.data.cards.map(function (c) { return { num: c.num, used: false }; }) });
  },

  // 根据当前 expr 计算哪些牌仍被使用（还原误删）
  _syncUsed: function (expr) {
    var used = [false, false, false, false];
    var rest = expr;
    this.data.cards.forEach(function (c, i) {
      var idx = rest.indexOf(String(c.num));
      if (idx >= 0) { used[i] = true; rest = rest.slice(0, idx) + ' ' + rest.slice(idx + String(c.num).length); }
    });
    return this.data.cards.map(function (c, i) { return { num: c.num, used: used[i] }; });
  },

  // —— 校验 ——
  check: function () {
    if (this.data.over) return;
    var expr = this.data.expr;
    if (!expr) { wx.showToast({ title: '先构造算式', icon: 'none' }); return; }
    // 1) 四张牌是否都用且各一次
    var used = this.data.cards.filter(function (c) { return c.used; }).length;
    if (used !== this.data.cards.length) {
      var self = this;
      wx.showModal({
        title: '还差 ' + (this.data.cards.length - used) + ' 张牌没用',
        content: '经典规则：4 张牌都要各用一次。继续补上吧。',
        showCancel: false
      });
      return;
    }
    var val = m24.evaluateExpr(expr);
    if (val === null) {
      wx.showToast({ title: '算式格式有误（括号不匹配/除零等）', icon: 'none' });
      return;
    }
    if (m24.eq24(val)) { this._win(); }
    else { this._wrong(val); }
  },

  _wrong: function (val) {
    var lives = this.data.lives - 1;
    var tries = this.data.tries + 1;
    this.setData({ lives: lives, tries: tries });
    if (lives <= 0) {
      this.setData({ over: true, win: false, stars: 0, starsText: '', overMsg: '等于 ' + m24.fracText(val) + '，不是 24 · 挑战失败' });
      return;
    }
    wx.showModal({
      title: '结果 = ' + m24.fracText(val),
      content: '不等于 24，再试一次（还剩 ' + lives + ' 次机会）。',
      showCancel: false,
      confirmText: '继续'
    });
    this.clearAll();
  },

  _win: function () {
    var stars = this.data.lives === 3 ? 3 : (this.data.lives === 2 ? 2 : 1);
    storage.saveStars('math24', this.data.curLevel, stars);
    var next = Math.min(this.data.curLevel + 1, LEVELS.length);
    storage.set('ww_math24_cur', next);
    this.setData({
      over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars),
      overMsg: this.data.expr + ' = 24 · 用了 ' + (this.data.tries + 1) + ' 次'
    });
  },

  // 结算按钮
  goNext: function () { if (this.data.curLevel < LEVELS.length) this.startLevel(this.data.curLevel + 1); },
  again: function () { this.startLevel(this.data.curLevel); },
  goLevels: function () { this.setData({ playing: false, over: false }); },
  pickLevel: function (e) { this.startLevel(parseInt(e.currentTarget.dataset.no, 10)); },
  goBack: function () { wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 算 24 点', path: '/pages/playlist/playlist' };
  }
});
