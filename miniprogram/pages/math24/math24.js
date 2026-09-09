// 算 24 点页（B6-4）：固定关卡——4 数(1~13)用 +−×÷ 凑 24
// 交互：逐步合成——点 2 张数字卡 + 选运算符 → 合成新卡（支持分数/负数）；
// 集合 4→3→2→1，最后一张 =24 即过关；否则该次尝试失败扣命（3❤）。
var m24 = require('../../game/math24');
var storage = require('../../utils/storage');

// 固定关卡（每关同题，便于复玩/比较）：由 generateLevels 筛出全部有解
var LEVELS = [
  { no: 1, nums: [8, 9, 3, 13] },
  { no: 2, nums: [6, 5, 11, 13] },
  { no: 3, nums: [10, 9, 1, 3] },
  { no: 4, nums: [7, 6, 12, 2] },
  { no: 5, nums: [6, 7, 7, 5] },
  { no: 6, nums: [8, 7, 10, 6] },
  { no: 7, nums: [9, 1, 4, 13] },
  { no: 8, nums: [12, 7, 8, 6] },
  { no: 9, nums: [5, 8, 9, 1] },
  { no: 10, nums: [9, 13, 3, 12] }
];
var LIVES = 3;

Page({
  data: {
    levelInfo: LEVELS,
    curLevel: 1,
    playing: false,
    // 对局状态
    pool: [],        // [{id, text, ok}] 当前数字/合成结果卡
    left: 0,
    lives: LIVES,
    tries: 0,        // 本关尝试次数（最终判定失败重来算一次）
    op: '',          // 当前选中运算符
    selA: -1,        // 选中第一张卡 index
    hint: '',        // 提示文案
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
    this._poolF = lv.nums.map(function (n) { return m24.frac(n, 1); });
    this._idSeq = 0;
    this.setData({
      curLevel: no,
      playing: true,
      pool: lv.nums.map(function (n) { return { id: ++this._idSeq, text: String(n) }; }, this),
      left: lv.nums.length,
      lives: LIVES,
      tries: 0,
      op: '',
      selA: -1,
      hint: '选两张数字，点运算符合成；4 张凑成 24 即过关',
      over: false, win: false, stars: 0, starsText: ''
    });
  },

  // —— 卡牌选择 ——
  tapCard: function (e) {
    if (!this.data.playing || this.data.over) return;
    var idx = e.currentTarget.dataset.idx;
    if (idx === this.data.selA) {
      // 再点取消
      this.setData({ selA: -1, op: '' });
      return;
    }
    if (this.data.selA === -1) {
      this.setData({ selA: idx, op: '' });
    } else {
      // 已选 A，再点 B → 若已选运算符则直接合成
      if (this.data.op) {
        this._merge(this.data.selA, idx, this.data.op);
      } else {
        // 未选运算符：换选 B 为第一张
        this.setData({ selA: idx });
      }
    }
  },

  // —— 运算符 ——
  pickOp: function (e) {
    if (this.data.selA === -1) { wx.showToast({ title: '先选第一张', icon: 'none' }); return; }
    this.setData({ op: e.currentTarget.dataset.op });
  },

  // 合成 selA 与 selB
  _merge: function (a, b, op) {
    var f = this._poolF;
    var fa = f[a], fb = f[b];
    var r = null;
    if (op === '+') r = m24.add(fa, fb);
    else if (op === '-') r = m24.sub(fa, fb);
    else if (op === '×') r = m24.mul(fa, fb);
    else if (op === '÷') r = m24.div(fa, fb);
    if (r === null) { wx.showToast({ title: '不能除以 0', icon: 'none' }); return; }

    // 新 pool：删 a,b 加入 r
    var newPool = [];
    var newF = [];
    for (var i = 0; i < f.length; i++) {
      if (i === a || i === b) continue;
      newPool.push({ id: this._pool[i].id, text: this._pool[i].text, isRes: this._pool[i].isRes });
      newF.push(f[i]);
    }
    this._idSeq++;
    newPool.push({ id: this._idSeq, text: m24.fracText(r), isRes: true });
    newF.push(r);
    this._pool = newPool;
    this._poolF = newF;

    this.setData({ pool: newPool, left: newPool.length, selA: -1, op: '' });

    if (newPool.length === 1) {
      if (m24.eq24(r)) this._win();
      else this._attemptFail();
    }
  },

  // 一次最终结果 ≠ 24 → 扣命重开本关（同题）
  _attemptFail: function () {
    var lives = this.data.lives - 1;
    var tries = this.data.tries + 1;
    this.setData({ lives: lives, tries: tries });
    if (lives <= 0) {
      this.setData({ playing: false, over: true, win: false, stars: 0, starsText: '', overMsg: '本关挑战失败 · 共尝试 ' + tries + ' 次' });
      return;
    }
    wx.showToast({ title: '结果 ≠ 24，再试一次', icon: 'none' });
    this._resetRound();
  },

  _resetRound: function () {
    var lv = LEVELS[this.data.curLevel - 1];
    this._poolF = lv.nums.map(function (n) { return m24.frac(n, 1); });
    this._idSeq = 0;
    this.setData({ pool: lv.nums.map(function (n) { return { id: ++this._idSeq, text: String(n) }; }, this), left: lv.nums.length, selA: -1, op: '', hint: '换个思路再试 · 试试括号式：先合成中间数' });
  },

  _win: function () {
    var stars = this.data.lives === 3 ? 3 : (this.data.lives === 2 ? 2 : 1);
    storage.saveStars('math24', this.data.curLevel, stars);
    var next = Math.min(this.data.curLevel + 1, LEVELS.length);
    storage.set('ww_math24_cur', next);
    this.setData({
      playing: false, over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars),
      overMsg: '凑出 24！共尝试 ' + (this.data.tries + 1) + ' 次'
    });
  },

  // —— 结算按钮 ——
  goNext: function () {
    if (this.data.curLevel < LEVELS.length) this.startLevel(this.data.curLevel + 1);
  },
  again: function () { this.startLevel(this.data.curLevel); },
  goLevels: function () { this.setData({ playing: false, over: false }); },
  pickLevel: function (e) {
    var no = e.currentTarget.dataset.no;
    this.startLevel(no);
  },
  goBack: function () { wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 算 24 点', path: '/pages/playlist/playlist' };
  }
});
