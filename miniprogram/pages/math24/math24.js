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
    pool: [],        // [{id, text, isRes}] 当前数字/合成结果卡
    left: 0,
    lives: LIVES,
    tries: 0,        // 本关尝试次数（最终判定失败重来算一次）
    selA: -1,        // 选中的第一张卡 index（-1 未选）
    selB: -1,        // 选中的第二张卡 index（-1 未选）
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
    this._history = [];   // 撤销栈：{poolF:[...], texts:[...]}
    this.setData({
      curLevel: no,
      playing: true,
      pool: lv.nums.map(function (n) { return { id: ++this._idSeq, text: String(n), isRes: false }; }, this),
      left: lv.nums.length,
      lives: LIVES,
      tries: 0,
      selA: -1, selB: -1,
      hint: '点两张数字卡高亮，再点运算符合成；4 张合成一张 24 即过关',
      over: false, win: false, stars: 0, starsText: ''
    });
  },

  // —— 卡牌选择：支持两张同时选中（再点取消）——
  tapCard: function (e) {
    if (!this.data.playing || this.data.over) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var selA = this.data.selA, selB = this.data.selB;

    // 已选中的卡再点 → 取消该卡
    if (idx === selA) { this.setData({ selA: -1 }); return; }
    if (idx === selB) { this.setData({ selB: -1 }); return; }

    if (selA === -1) { this.setData({ selA: idx }); return; }
    if (selB === -1) { this.setData({ selB: idx }); return; }
    // 已选满两张还点第三张 → 用新卡替换第一张（保留第二张）
    this.setData({ selA: selB, selB: idx });
  },

  // —— 运算符：有 2 张选中时合成（与点选顺序无关）——
  pickOp: function (e) {
    if (!this.data.playing || this.data.over) return;
    var selA = this.data.selA, selB = this.data.selB;
    if (selA === -1 || selB === -1) {
      wx.showToast({ title: '请先点选两张数字卡', icon: 'none' });
      return;
    }
    this._merge(selA, selB, e.currentTarget.dataset.op);
  },

  // 撤销上一步合成（回到上一状态，不扣命）
  undo: function () {
    if (!this.data.playing || this.data.over) return;
    var h = this._history;
    if (!h || !h.length) { wx.showToast({ title: '没有可撤销的步骤', icon: 'none' }); return; }
    var prev = h.pop();
    this._poolF = prev.poolF;
    this._pool = prev.pool.map(function (c) { return { id: c.id, text: c.text, isRes: c.isRes }; });
    this.setData({ pool: this._pool, left: this._pool.length, selA: -1, selB: -1 });
  },

  // 重置本关（同题重排，不扣命）
  resetRound: function () {
    if (!this.data.playing || this.data.over) return;
    this._history = [];
    var lv = LEVELS[this.data.curLevel - 1];
    this._poolF = lv.nums.map(function (n) { return m24.frac(n, 1); });
    this._idSeq = 0;
    this.setData({
      pool: lv.nums.map(function (n) { return { id: ++this._idSeq, text: String(n), isRes: false }; }, this),
      left: lv.nums.length, selA: -1, selB: -1
    });
  },

  // 合成 selA 与 selB
  _merge: function (a, b, op) {
    // 入撤销栈（当前状态快照）
    this._history.push({
      poolF: this._poolF.map(function (f) { return { n: f.n, d: f.d }; }),
      pool: this._pool.map(function (c) { return { id: c.id, text: c.text, isRes: c.isRes }; })
    });

    var f = this._poolF;
    var fa = f[a], fb = f[b];
    var r = null;
    if (op === '+') r = m24.add(fa, fb);
    else if (op === '-') r = m24.sub(fa, fb);
    else if (op === '×') r = m24.mul(fa, fb);
    else if (op === '÷') r = m24.div(fa, fb);
    if (r === null) {
      this._history.pop(); // 无效操作不入栈
      wx.showToast({ title: '不能除以 0', icon: 'none' });
      return;
    }

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

    this.setData({ pool: newPool, left: newPool.length, selA: -1, selB: -1 });

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
    this._history = [];
    this.setData({ pool: lv.nums.map(function (n) { return { id: ++this._idSeq, text: String(n), isRes: false }; }, this), left: lv.nums.length, selA: -1, selB: -1, hint: '换个思路再试 · 可用「撤销」回退上一步' });
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
