// 算 24 点页（**合并式**交互 · 2026-09-12 改版）
//
// 规则：4 张牌，任选两张 → 点一个运算符 → **立即合并成一张结果牌**，
//       且结果牌自动处于「已选中」状态，继续与其它牌合并；最后只剩一张且等于 24 过关。
//
// 为什么改成合并式（区别于旧的「拼算式 + ＝校验」）：
//   · 每步只做一次二元运算，天然没有优先级问题，**不再需要括号**；
//   · 也不需要表达式字符串与退格/清空——改成「撤销一步」更贴切；
//   · 手感更接近实物卡牌，点两下加一个运算符就走一步。
//
// 不设命数（用户拍板）：纯数学解谜，卡住时的惩罚意义不大，改为
//   「撤销一步」+「重来本关」+「提示一步」（提示用引擎反推一次可行的合并）。
//
// 值一律用**精确分数**表示（引擎的 frac/add/sub/mul/div），避免浮点误差
// —— 像 8 ÷ (3 − 8 ÷ 3) 这种题必须靠分数中间结果才算得对。
var m24 = require('../../game/math24');
var storage = require('../../utils/storage');
var playReport = require('../../utils/play-report');

// 固定关卡库（60 关）：data/math24-levels.js，自动生成、每关保证有解
var LEVELS = require('../../data/math24-levels').levels;

function toFrac(n) { return { n: n, d: 1 }; }
function textOf(f) { return m24.fracText(f); }

Page({
  data: {
    levelInfo: LEVELS,
    curLevel: 1,
    playing: true,
    tiles: [],          // [{ id, frac, text, sel }]
    picked: 0,          // 当前已选中的牌数（0/1/2）
    selText: '',        // 选中两张时的算式预览，如 "8 × 9"
    steps: 0,           // 本关已合并次数
    ops: [],            // 四个运算符按钮
    hint: '',
    deadEnd: false,     // 当前牌面已走不通（永远凑不出 24）
    over: false,
    win: false,
    stars: 0,
    starsText: '',
    overMsg: ''
  },

  _history: [],         // 撤销栈（存 tiles 快照）
  _tileId: 0,

  onLoad: function () {
    this.setData({ ops: m24.OPS.map(function (o) { return { key: o.key, label: o.label }; }) });
    this.startLevel(1);
  },

  startLevel: function (no) {
    var lv = LEVELS[no - 1];
    if (!lv) return;
    this._history = [];
    this._tileId = 0;
    var tiles = lv.nums.map(function (n) {
      var f = toFrac(n);
      return { id: 't' + (Math.random() * 1e9 | 0), frac: f, text: textOf(f), sel: false };
    });
    this.setData({
      curLevel: no,
      playing: true,
      tiles: tiles,
      picked: 0,
      selText: '',
      steps: 0,
      hint: '点两张牌 → 点一个运算符 → 合并成一个新数',
      deadEnd: false,
      over: false, win: false, stars: 0, starsText: '', overMsg: ''
    });
  },

  // —— 点牌：选中/取消选中（最多两张） ——
  tapTile: function (e) {
    if (this.data.over) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var tiles = this.data.tiles.map(function (t) { return t; });
    tiles = this.data.tiles.slice();
    var picked = this.data.picked;
    var t = tiles[idx];
    if (!t) return;
    if (t.sel) {                       // 再点一次取消
      tiles[idx] = Object.assign({}, t, { sel: false });
      picked--;
    } else if (picked >= 2) {          // 已选两张：换成新的一张
      tiles = tiles.map(function (x) { return Object.assign({}, x, { sel: false }); });
      tiles[idx] = Object.assign({}, tiles[idx], { sel: true });
      picked = 1;
    } else {
      tiles[idx] = Object.assign({}, t, { sel: true });
      picked++;
    }
    this.setData({ tiles: tiles, picked: picked, selText: this._selPreview(tiles), hint: this._guide(picked) });
  },

  _selPreview: function (tiles) {
    var sel = tiles.filter(function (t) { return t.sel; });
    if (sel.length < 2) return '';
    return sel[0].text + ' ? ' + sel[1].text;
  },

  _guide: function (picked) {
    if (picked === 0) return '点两张牌 → 点一个运算符 → 合并成一个新数';
    if (picked === 1) return '再点一张牌，然后选运算符';
    return '选一个运算符（＋ − × ÷）完成合并';
  },

  // —— 点运算符：把选中的两张合并成一张 ——
  tapOp: function (e) {
    if (this.data.over) return;
    if (this.data.picked !== 2) {
      wx.showToast({ title: '先选两张牌', icon: 'none' });
      return;
    }
    var key = e.currentTarget.dataset.key;
    var fn = null;
    for (var i = 0; i < m24.OPS.length; i++) {
      if (m24.OPS[i].key === key) { fn = m24.OPS[i].fn; break; }
    }
    if (!fn) return;

    var tiles = this.data.tiles.slice();
    var idxs = [];
    tiles.forEach(function (t, i) { if (t.sel) idxs.push(i); });
    var a = tiles[idxs[0]];
    var b = tiles[idxs[1]];
    var val = fn(a.frac, b.frac);
    if (val === null) {                // 除以 0：按原逻辑拒绝
      wx.showToast({ title: '不能除以 0', icon: 'none' });
      return;
    }

    // 记入撤销栈
    this._history.push(tiles.map(function (t) { return Object.assign({}, t); }));

    // 合并：删两张、插入一张结果牌（**自动选中**，便于连续操作）
    var rest = [];
    tiles.forEach(function (t, i) { if (i !== idxs[0] && i !== idxs[1]) rest.push(Object.assign({}, t, { sel: false })); });
    this._tileId++;
    var merged = {
      id: 'm' + this._tileId,
      frac: val,
      text: textOf(val),
      sel: true,
      justMerged: true
    };
    rest.push(merged);

    var steps = this.data.steps + 1;
    // 只剩一张：判定胜负
    if (rest.length === 1) {
      var ok = (val.n === 24 && val.d === 1);
      this.setData({
        tiles: rest.map(function (t) { return Object.assign({}, t, { sel: false }); }),
        picked: 0, selText: '', steps: steps, deadEnd: false,
        hint: ok ? '合并到 24，过关！' : '最后一张是 ' + textOf(val) + '，不是 24'
      });
      if (ok) { this._win(merged.text); } else { this._deadHint(); }
      return;
    }

    // 还有多张：判断这个局面是否还走得通
    var fracs = rest.map(function (t) { return t.frac; });
    var reachable = m24.canReachTarget(fracs, 24);
    this.setData({
      tiles: rest,
      picked: 1,                        // 结果牌已选中
      selText: '',
      steps: steps,
      deadEnd: !reachable,
      hint: reachable ? ('已合并为 ' + merged.text + '（已帮你选中，接着点一张牌继续）')
        : '这一步之后凑不出 24 了，撤销一步或重来本关'
    });
  },

  // —— 撤销一步 ——
  undo: function () {
    if (this.data.over) return;
    if (!this._history.length) { wx.showToast({ title: '没有可撤销的步骤', icon: 'none' }); return; }
    var prev = this._history.pop();
    this.setData({
      tiles: prev,
      picked: prev.filter(function (t) { return t.sel; }).length,
      selText: '',
      steps: Math.max(0, this.data.steps - 1),
      deadEnd: false,
      hint: this._guide(prev.filter(function (t) { return t.sel; }).length)
    });
  },

  // —— 重来本关 ——
  reset: function () { this.startLevel(this.data.curLevel); },

  // —— 提示一步：反推一次可行的合并 ——
  hint: function () {
    if (this.data.over) return;
    var tiles = this.data.tiles;
    var fracs = tiles.map(function (t) { return t.frac; });
    var h = m24.findHint(fracs, 24);
    if (!h) {
      this.setData({ deadEnd: true, hint: '这个局面已经凑不出 24 了，撤销一步或重来本关' });
      return;
    }
    var opLabel = h.op === '+' ? '＋' : (h.op === '-' ? '−' : (h.op === '*' ? '×' : '÷'));
    var extra = (h.i === 1) ? '（系统已帮你选中这两张）' : '';
    // 顺手把该合并的两张选中，玩家只需点运算符
    var next = tiles.map(function (t, i) { return Object.assign({}, t, { sel: (i === h.i || i === h.j) }); });
    this.setData({
      tiles: next,
      picked: 2,
      selText: this._selPreview(next),
      deadEnd: false,
      hint: '提示：先合并 ' + tiles[h.i].text + ' 和 ' + tiles[h.j].text + '，用 ' + opLabel + extra
    });
  },

  _deadHint: function () {
    this.setData({ deadEnd: true, hint: '最后一张不是 24 · 撤销一步或重来本关' });
  },

  _win: function (exprText) {
    // 星级：按合并步数（理论最少 3 步；超过 5 步给 2 星，超过 8 步给 1 星）
    var s = this.data.steps;
    var stars = s <= 4 ? 3 : (s <= 6 ? 2 : 1);
    storage.saveStars('math24', this.data.curLevel, stars);
    // 上报本局成绩（game_type=math24）：供「玩法进度榜」与玩法类成就使用
    playReport.reportPlay({
      gameType: 'math24',
      grade: 'all',
      level: this.data.curLevel,
      score: Math.max(0, 100 - this.data.steps * 10),
      correct: 1,
      total: 1,
      stars: stars
    });
    var next = Math.min(this.data.curLevel + 1, LEVELS.length);
    storage.set('ww_math24_cur', next);
    this.setData({
      over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars),
      overMsg: '4 张牌合并成 ' + exprText + '，用了 ' + s + ' 步'
    });
  },

  // —— 结算与导航 ——
  goNext: function () { if (this.data.curLevel < LEVELS.length) this.startLevel(this.data.curLevel + 1); },
  again: function () { this.startLevel(this.data.curLevel); },
  goLevels: function () { this.setData({ playing: false, over: false }); },
  pickLevel: function (e) { this.startLevel(parseInt(e.currentTarget.dataset.no, 10)); },
  goBack: function () { wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 算 24 点', path: '/pages/playlist/playlist' };
  }
});
