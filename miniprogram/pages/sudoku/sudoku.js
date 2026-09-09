// 数独页（B6）—— 闯关模式：4×4 → 6×6 → 9×9，给定数字递减
// 玩法：点空格 → 点数字键盘填入；与答案不符扣命（3❤）；
// 全填对过关 → 结算（星级按错次数）+ 本地存档 sudoku@level（不影响字词进度）。
// 本地纯逻辑（game/sudoku.js），不上报成绩/错题（属固定关卡玩法，进度记录在本机）。
var sudoku = require('../../game/sudoku');
var storage = require('../../utils/storage');

// 关卡 → (阶数, 给定数)：难度递增、给定递减
var STAGES = [
  { from: 1, to: 4, n: 4, givens: 10 },   // 4×4 入门
  { from: 5, to: 8, n: 6, givens: 20 },   // 6×6 初级
  { from: 9, to: 12, n: 9, givens: 38 },  // 9×9 中级
  { from: 13, to: 16, n: 9, givens: 32 }, // 9×9 高级
  { from: 17, to: 20, n: 9, givens: 27 }  // 9×9 大师
];
var TOTAL_LEVELS = 20;
var LIVES = 3;

function stageOf(level) {
  for (var i = 0; i < STAGES.length; i++) {
    if (level >= STAGES[i].from && level <= STAGES[i].to) return STAGES[i];
  }
  return STAGES[STAGES.length - 1];
}

Page({
  data: {
    curLevel: 1,          // 当前关
    stageLabel: '',        // 如 4×4 · 入门
    unlockedMax: 1,        // 已解锁最大关（从本地读）
    levels: [],            // 关卡列表（1..20）
    playing: false,
    // 棋盘
    grid: [],              // 渲染用 [{r,c,v,given,sel,err}]
    n: 0,
    // HUD
    lives: LIVES,
    mistakes: 0,
    sel: null,             // {r,c}
    doneCells: 0,
    totalCells: 0,
    // 结算
    settle: false,
    win: false,
    stars: 0,
    starsText: '',
    overMsg: '',
    // 后台状态
    _answer: null,
    _puzzle: null
  },

  onLoad: function () {
    this.loadLevels();
    this.setData({ curLevel: this._pickStart() });
    this.refreshStage();
  },

  loadLevels: function () {
    var unlockedMax = storage.get('ww_sudoku_max') || 1;
    var arr = [];
    for (var i = 1; i <= TOTAL_LEVELS; i++) {
      var st = stageOf(i);
      arr.push({
        no: i,
        label: st.n + '×' + st.n,
        state: i <= unlockedMax ? 'open' : (i === unlockedMax + 1 ? 'next' : 'lock'),
        stars: storage.getStars('sudoku', i) || 0
      });
    }
    this.setData({ levels: arr, unlockedMax: unlockedMax });
  },

  _pickStart: function () {
    var m = storage.get('ww_sudoku_max') || 1;
    return Math.min(m, TOTAL_LEVELS);
  },

  refreshStage: function () {
    var st = stageOf(this.data.curLevel);
    var names = { 4: '入门', 6: '初级', 9: '' };
    this.setData({ stageLabel: st.n + '×' + st.n });
  },

  // —— 关卡选择 ——
  pickLevel: function (e) {
    var no = e.currentTarget.dataset.no;
    var item = this.data.levels[no - 1];
    if (!item || item.state === 'lock') {
      wx.showToast({ title: '通关上一关解锁', icon: 'none' });
      return;
    }
    this.setData({ curLevel: no });
    this.refreshStage();
    this.startLevel(no);
  },

  // 开始本关
  startLevel: function (no) {
    var st = stageOf(no);
    var r = sudoku.generate(st.n, st.givens);
    if (!r) { wx.showToast({ title: '生成失败，重试', icon: 'none' }); return; }
    this._answer = r.answer;
    this._puzzle = r.puzzle;
    var cells = [];
    for (var i = 0; i < st.n; i++) {
      for (var j = 0; j < st.n; j++) {
        var v = r.puzzle[i][j];
        cells.push({ r: i, c: j, v: v, given: v > 0, sel: false, err: false });
      }
    }
    this.setData({
      playing: true,
      settle: false,
      n: st.n,
      grid: cells,
      lives: LIVES,
      mistakes: 0,
      doneCells: 0,
      totalCells: st.n * st.n - r.puzzle.flat().filter(function (x) { return x > 0; }).length,
      sel: null,
      stars: 0,
      starsText: ''
    });
  },

  // 点格子
  tapCell: function (e) {
    if (!this.data.playing || this.data.settle) return;
    var idx = e.currentTarget.dataset.idx;
    var grid = this.data.grid;
    var cell = grid[idx];
    if (cell.given) return;
    this._clearSel();
    var patch = {};
    patch['grid[' + idx + '].sel'] = true;
    patch.sel = { idx: idx, r: cell.r, c: cell.c };
    this.setData(patch);
  },

  _clearSel: function () {
    if (this.data.sel) {
      var si = this.data.sel.idx;
      var patch = {};
      patch['grid[' + si + '].sel'] = false;
      patch.sel = null;
      this.setData(patch);
    }
  },

  // 数字键盘
  pressNum: function (e) {
    if (!this.data.playing || this.data.settle) return;
    var val = e.currentTarget.dataset.v;
    if (!this.data.sel) { wx.showToast({ title: '先点一个空格', icon: 'none' }); return; }
    var idx = this.data.sel.idx;
    var cell = this.data.grid[idx];
    if (cell.given) return;

    var ans = this._answer[cell.r][cell.c];
    if (ans === val) {
      // 正确
      var ok = {};
      ok['grid[' + idx + '].v'] = val;
      ok['grid[' + idx + '].sel'] = false;
      ok.doneCells = this.data.doneCells + 1;
      this.setData(ok);
      if (this.data.doneCells + 1 >= this.data.totalCells) this._win();
    } else {
      // 错误：扣命，闪烁
      var lives = this.data.lives - 1;
      var bad = {};
      bad['grid[' + idx + '].err'] = true;
      bad.lives = lives;
      bad.mistakes = this.data.mistakes + 1;
      this.setData(bad);
      var self = this;
      setTimeout(function () {
        var clear = {};
        clear['grid[' + idx + '].err'] = false;
        self.setData(clear);
      }, 350);
      if (lives <= 0) this._lose();
    }
  },

  _win: function () {
    // 星级：0 错 3 星 / ≤2 错 2 星 / 其余 1 星
    var m = this.data.mistakes;
    var stars = m === 0 ? 3 : (m <= 2 ? 2 : 1);
    storage.saveStars('sudoku', this.data.curLevel, stars);
    var max = Math.max(this.data.unlockedMax, Math.min(this.data.curLevel + 1, TOTAL_LEVELS));
    storage.set('ww_sudoku_max', max);
    this.setData({
      settle: true, win: true, stars: stars, starsText: '⭐'.repeat(stars),
      overMsg: m === 0 ? '完美！一次都没错' : '通关成功 · 错 ' + m + ' 次',
      playing: false
    });
  },

  _lose: function () {
    this.setData({ settle: true, win: false, stars: 0, starsText: '', playing: false, overMsg: '生命耗尽 · 再来一次吧' });
  },

  // 结算按钮
  again: function () { this.startLevel(this.data.curLevel); },
  goNext: function () {
    if (this.data.curLevel < TOTAL_LEVELS) {
      this.setData({ curLevel: this.data.curLevel + 1 });
      this.refreshStage();
      this.loadLevels();
      this.startLevel(this.data.curLevel);
    }
  },
  backToLevels: function () {
    this.loadLevels();
    this.setData({ playing: false, settle: false });
  },
  goBack: function () { wx.navigateBack(); }
});
