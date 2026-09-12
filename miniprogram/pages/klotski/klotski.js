// 华容道（数字智力玩法 · A 类固定关卡）
//
// 规则（与参考实现一致，见 game/klotski.js 头部说明）：
//   · 5×4 棋盘标准 10 子，把「曹操」移到下方 2×2 出口即通关；
//   · 拖动棋子沿直线滑到尽头，**一次连续滑动算 1 步**（滑得越远越省步数）；
//   · 星级 = 实际步数 / 理论最少步数：≤1.15 → 3★、≤1.5 → 2★，其余 1★；
//   · 「演示」会按最优解自动走完，但**用演示通关不计星**（只作学习用）。
//
// 交互：拖拽为主（touchstart/move/end 判主轴 + 位移量），点击选中后用方向键滑 1 格兜底。
// 存档：`storage.saveStars('klotski', no, stars)`，与数独/2048/24 点同一套；
//      解锁沿用「上一关 ≥1 星」。

var K = require('../../game/klotski');
var LEVELS = require('../../data/klotski-levels');
var storage = require('../../utils/storage');

var PAGE = 'klotski';
var CUR_KEY = 'ww_klotski_cur';   // 上次玩到第几关（选关页默认高亮）

Page({
  data: {
    levelGroups: [],      // 选关页：按档位分组的 30 关
    totalLevels: LEVELS.total,
    playing: false,
    curLevel: 1,
    levelName: '',
    tier: '',
    minMoves: 0,
    moves: 0,
    pieces: [],           // 渲染用棋子（含百分比定位）
    cells: [],            // 棋盘 20 格的渲染模型（出口高亮用）
    selected: -1,
    hint: null,           // {from, dx, dy, to} 提示
    canUndo: false,
    over: false,
    win: false,
    stars: 0,
    starsText: '',
    settleTitle: '',
    settleMsg: '',
    demoUsed: false
  },

  onLoad: function () {
    this._pieces = [];
    this._history = [];
    this._boardRect = null;
    this._touch = null;
    this._demoTimer = null;
    this.setData({ levelGroups: this._buildGroups() });
  },

  onReady: function () { this._measureBoard(); },
  onUnload: function () { this._stopDemo(); },
  onHide: function () { this._stopDemo(); },

  // ============ 选关 ============
  /** 30 关按档位分组，并附上星级与解锁状态（上一关 ≥1 星才解锁） */
  _buildGroups: function () {
    var groups = [];
    var byTier = {};
    var unlocked = true;                  // 第 1 关默认解锁
    LEVELS.levels.forEach(function (lv) {
      var stars = storage.getStars(PAGE, lv.no);
      var item = {
        no: lv.no,
        name: lv.name,
        tier: lv.tier,
        classic: lv.classic,
        minMoves: lv.minMoves,
        stars: stars,
        starArr: [stars >= 1, stars >= 2, stars >= 3],
        locked: !unlocked
      };
      if (!byTier[lv.tier]) { byTier[lv.tier] = { tier: lv.tier, levels: [], done: 0 }; groups.push(byTier[lv.tier]); }
      byTier[lv.tier].levels.push(item);
      if (stars >= 1) byTier[lv.tier].done++;
      unlocked = stars >= 1;              // 这一关没通关（≥1 星）→ 下一关锁着
    });
    return groups;
  },

  pickLevel: function (e) {
    var no = parseInt(e.currentTarget.dataset.no, 10);
    var lv = LEVELS.levels[no - 1];
    if (!lv) return;
    // 解锁判定：第 1 关或上一关 ≥1 星
    if (no > 1 && storage.getStars(PAGE, no - 1) < 1) {
      wx.showToast({ title: '先通关上一关（拿到 1 星）', icon: 'none' });
      return;
    }
    this.startLevel(no);
  },

  // ============ 开局 ============
  startLevel: function (no) {
    var self = this;
    var lv = LEVELS.levels[no - 1];
    if (!lv) return;
    this._stopDemo();
    this._pieces = K.parseGrid(lv.grid);
    this._history = [];
    storage.set(CUR_KEY, no);
    this.setData({
      playing: true,
      over: false,
      win: false,
      stars: 0,
      starsText: '',
      curLevel: no,
      levelName: lv.name,
      tier: lv.tier,
      minMoves: lv.minMoves,
      moves: 0,
      selected: -1,
      hint: null,
      canUndo: false,
      demoUsed: false
    });
    this._render();
    // 延迟一点点再量棋盘（setData 之后元素才存在），并在拖拽时按需补量
    this._boardRect = null;
    setTimeout(function () { self._measureBoard(); }, 120);
    // 开局提示：一次「把手感教给玩家」的轻提示
    wx.showToast({ title: '拖动棋子滑到尽头 · 一次滑动算 1 步', icon: 'none', duration: 1800 });
    setTimeout(function () { if (self.data.playing && self.data.moves === 0) return; }, 0);
  },

  /**
   * 棋盘尺寸测量（拖拽换算格子用）。
   * 注意时序：startLevel 里 setData 是异步渲染，**立刻**查 .k-board 会查不到 ——
   * 所以这里除了延迟重测，还允许外部传 cb：量到后立刻回调（首次拖拽也能生效）。
   */
  _measureBoard: function (cb) {
    var self = this;
    wx.createSelectorQuery().select('.k-board').boundingClientRect(function (rect) {
      if (rect && rect.width) self._boardRect = rect;
      if (typeof cb === 'function') cb(self._boardRect);
    }).exec();
  },

  /** 拿棋盘尺寸：已有缓存直接用，没有就现量（异步回调里返回） */
  _withRect: function (cb) {
    if (this._boardRect && this._boardRect.width) { cb(this._boardRect); return; }
    this._measureBoard(cb);
  },

  // ============ 渲染 ============
  _render: function () {
    var pieces = this._pieces.map(function (p, i) {
      var model = {
        i: i,
        glyph: p.glyph,
        label: p.name,
        cell: p.y * K.COLS + p.x,
        cls: p.kind + (p.kind === 's' ? '' : ' big'),
        style: 'left:' + (p.x * 25) + '%;top:' + (p.y * 20) + '%;width:' + (p.w * 25) + '%;height:' + (p.h * 20) + '%;'
      };
      return model;
    });
    var cells = [];
    for (var c = 0; c < K.CELLS; c++) {
      cells.push({
        i: c,
        gate: false,
        // WXML 不支持 Math.* —— 定位样式一律在 JS 里算好
        style: 'left:' + ((c % K.COLS) * 25) + '%;top:' + (Math.floor(c / K.COLS) * 20) + '%;'
      });
    }
    // 出口：曹操左上角目标位 (1,3) 起的 2×2
    var gateCells = [K.GOAL_Y * K.COLS + K.GOAL_X, K.GOAL_Y * K.COLS + K.GOAL_X + 1,
      (K.GOAL_Y + 1) * K.COLS + K.GOAL_X, (K.GOAL_Y + 1) * K.COLS + K.GOAL_X + 1];
    gateCells.forEach(function (g) { if (cells[g]) cells[g].gate = true; });

    var hint = this.data.hint;
    if (hint) {
      pieces.forEach(function (p) { if (p.cell === hint.from) p.cls += ' hint'; });
    }
    this.setData({ pieces: pieces, cells: cells });
  },

  // ============ 拖拽 / 点击 ============
  onTouchStart: function (e) {
    if (!this.data.playing || this.data.over) return;
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.i !== undefined) {
      this._touch = { i: parseInt(e.currentTarget.dataset.i, 10), x: t.clientX, y: t.clientY, moved: false };
    }
  },

  onTouchMove: function (e) {
    if (!this._touch) return;
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    var dx = t.clientX - this._touch.x;
    var dy = t.clientY - this._touch.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) this._touch.moved = true;
  },

  onTouchEnd: function (e) {
    var touch = this._touch;
    this._touch = null;
    if (!touch || !this.data.playing || this.data.over) return;
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return;

    var dx = t.clientX - touch.x;
    var dy = t.clientY - touch.y;
    // 位移太小 → 视为点选（选中棋子，等玩家用方向键滑 1 格）
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      this.setData({ selected: touch.i });
      return;
    }

    var rect = this._boardRect;
    var self = this;
    if (rect && rect.width) {
      this._applyDrag(touch.i, dx, dy, rect);
      return;
    }
    // 首次拖拽时可能还没量到尺寸（setData 异步渲染）→ 现量一次再执行，别把这一拖丢掉
    this._withRect(function (r) {
      if (r && r.width) self._applyDrag(touch.i, dx, dy, r);
    });
  },

  /** 把「像素位移」换算成「方向 + 格数」并走一步（一次连续滑动 = 1 步） */
  _applyDrag: function (i, dx, dy, rect) {
    // 防御：坐标异常（自动化/异常机型可能给不出 clientX）时直接忽略，别把 NaN 传进引擎
    if (!isFinite(dx) || !isFinite(dy) || !rect || !rect.width || !rect.height) return;
    var cellW = rect.width / K.COLS;
    var cellH = rect.height / K.ROWS;
    var horizontal = Math.abs(dx) >= Math.abs(dy);
    var steps = horizontal ? Math.round(Math.abs(dx) / cellW) : Math.round(Math.abs(dy) / cellH);
    if (steps < 1) steps = 1;
    var d = horizontal ? [dx > 0 ? 1 : -1, 0] : [0, dy > 0 ? 1 : -1];
    this._doMove(i, d[0], d[1], steps);
  },

  /** 方向键：让选中的棋子滑 1 格（点击兜底操作，同样记 1 步） */
  nudge: function (e) {
    if (!this.data.playing || this.data.over) return;
    var i = this.data.selected;
    if (i < 0) { wx.showToast({ title: '先点一下要移动的棋子', icon: 'none' }); return; }
    var dir = e.currentTarget.dataset.dir || '';
    var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var d = map[dir];
    if (!d) return;
    this._doMove(i, d[0], d[1], 1);
  },

  // ============ 走一步 ============
  /**
   * 按「棋子左上角格位」移动（供端到端用例与将来的「局面分享/复盘」复用）。
   * @returns {boolean} 是否找到该棋子并尝试了移动
   */
  _moveAtCell: function (fromCell, dx, dy, dist) {
    var idx = K.indexAt(this._pieces, fromCell);
    if (idx < 0) return false;
    this._doMove(idx, dx, dy, dist);
    return true;
  },

  /**
   * @param {number} i 棋子下标
   * @param {number} dx/dy 单位方向
   * @param {number} dist 想滑几格（会被夹到实际可滑范围）
   */
  _doMove: function (i, dx, dy, dist) {
    var r = K.applyMove(this._pieces, i, dx, dy, dist);
    if (!r.moved) { wx.showToast({ title: '那边被挡住了', icon: 'none' }); return; }
    this._history.push(this._pieces);
    this._pieces = r.pieces;
    this.setData({
      moves: this.data.moves + 1,
      canUndo: true,
      hint: null,
      selected: i
    });
    this._render();
    if (K.isWin(this._pieces)) this._win();
  },

  undo: function () {
    if (!this.data.playing || !this._history.length) return;
    this._pieces = this._history.pop();
    this.setData({
      moves: Math.max(0, this.data.moves - 1),
      canUndo: this._history.length > 0,
      hint: null
    });
    this._render();
  },

  restart: function () { this.startLevel(this.data.curLevel); },

  // ============ 提示 / 演示 ============
  /** 提示：从**当前局面**现算最优走法（BFS，实测最难关 <110ms），只提示下一步 */
  hint: function () {
    if (!this.data.playing || this.data.over) return;
    var sol = K.solve(this._pieces, false);
    if (!sol || !sol.moves.length) { wx.showToast({ title: '已经是通关局面啦', icon: 'none' }); return; }
    var mv = sol.moves[0];
    var idx = K.indexAt(this._pieces, mv.from);
    this.setData({
      selected: idx,
      hint: { from: mv.from, dx: mv.dx, dy: mv.dy, dist: mv.dist, left: sol.len }
    });
    this._render();
    wx.showToast({
      title: '把「' + (idx >= 0 ? this._pieces[idx].name : '棋子') + '」' + this._dirText(mv.dx, mv.dy) + '滑 ' + mv.dist + ' 格',
      icon: 'none',
      duration: 1600
    });
  },

  _dirText: function (dx, dy) {
    if (dx > 0) return '向右';
    if (dx < 0) return '向左';
    if (dy > 0) return '向下';
    return '向上';
  },

  /**
   * 演示：按关卡自带的最优解自动走完（**用了演示就不计星**，只作学习）。
   * 每步 260ms，走完停在结算弹层。
   */
  demo: function () {
    var self = this;
    if (!this.data.playing || this.data.over) return;
    this._stopDemo();
    var lv = LEVELS.levels[this.data.curLevel - 1];
    if (!lv || !lv.solution || !lv.solution.length) { wx.showToast({ title: '本关暂无演示', icon: 'none' }); return; }

    // 从当前局面重新开始演示：先复位，再按最优解逐行走
    this._pieces = K.parseGrid(lv.grid);
    this._history = [];
    this.setData({ moves: 0, canUndo: false, hint: null, selected: -1, demoUsed: true });
    this._render();
    wx.showToast({ title: '演示中（用演示通关不计星）', icon: 'none', duration: 1500 });

    var step = 0;
    this._demoTimer = setInterval(function () {
      if (step >= lv.solution.length) { self._stopDemo(); return; }
      var mv = lv.solution[step++];
      var idx = K.indexAt(self._pieces, mv[0]);
      if (idx < 0) { self._stopDemo(); return; }
      var r = K.applyMove(self._pieces, idx, mv[1], mv[2], mv[3]);
      self._pieces = r.pieces;
      self.setData({ moves: step, selected: idx });
      self._render();
      if (K.isWin(self._pieces)) {
        self._stopDemo();
        self.setData({ demoUsed: true });
        self._win();
      }
    }, 260);
  },

  _stopDemo: function () {
    if (this._demoTimer) { clearInterval(this._demoTimer); this._demoTimer = null; }
  },

  // ============ 结算 ============
  _win: function () {
    this._stopDemo();
    var stars = this.data.demoUsed ? 0 : K.starsFor(this.data.minMoves, this.data.moves);
    if (!this.data.demoUsed) {
      storage.saveStars(PAGE, this.data.curLevel, stars);
    }
    var isLast = this.data.curLevel >= LEVELS.total;
    var msg = '用了 ' + this.data.moves + ' 步（最少 ' + this.data.minMoves + ' 步）';
    if (this.data.demoUsed) msg += ' · 演示通关不计星';
    this.setData({
      over: true,
      win: true,
      // 注意：这里**不能**把 playing 置 false —— 结算弹层（settle-pop）挂在「对局」分支里，
      // 一置 false 整个分支会被卸载，弹层也就跟着消失了（列表只在点「关卡列表」时显示）。
      stars: stars,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '👀',
      settleTitle: isLast ? '全部通关！' : '曹操突围成功！',
      settleMsg: msg,
      levelGroups: this._buildGroups()
    });
  },

  again: function () { this.startLevel(this.data.curLevel); },
  goNext: function () {
    var n = Math.min(this.data.curLevel + 1, LEVELS.total);
    this.startLevel(n);
  },
  goLevels: function () {
    this._stopDemo();
    this.setData({
      playing: false, over: false, win: false,
      levelGroups: this._buildGroups()
    });
  },

  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 华容道闯关', path: '/pages/playlist/playlist' };
  }
});
