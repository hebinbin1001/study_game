// 一笔画（玩法落地：demo/一笔画小游戏.html，2026-10-18 移植 35 关）
//
// 与 demo 的差异：
//   · 不用 Canvas，改用「绝对定位的线 + 圆点」（坐标由引擎算，可单测）；
//   · 关卡数据与走边/撤回/提示/星级判定都在 game/one-stroke.js + one-stroke-levels.js，
//     页面只负责渲染与连击感。
// demo 的三个体验点都保留了：💡 每关 3 次提示（高亮一条还能走的线）、
// 顶部进度条、按「用了几次帮助」折星。
var lib = require('../../game/one-stroke');
var storage = require('../../utils/storage');
var playReport = require('../../utils/play-report');
var progress = require('../../utils/puzzle-progress');
var resume = require('../../utils/puzzle-resume');

var PAGE = 'one-stroke';

var BOARD = 600;          // 棋盘逻辑边长（rpx），与引擎 geometry() 同一单位
var HINT_SHOW_MS = 1600;  // 提示高亮时长
var HINT_PER_LEVEL = 3;   // 每关提示次数（与 demo 一致）
var BEST_KEY = 'ww_onestroke_best';

Page({
  data: {
    levelText: '1/35',
    levelName: '',
    tierText: '',
    edgeText: '0/0',
    stepText: '0',
    pct: 0,
    mainText: '点一个点开始画',
    subText: '每条线只能走一次，把所有线走完就过关',
    warn: false,
    hintLeft: HINT_PER_LEVEL,
    hintKey: '',
    hintTip: '',
    showOdd: false,
    edges: [],
    nodes: [],
    settle: false,
    win: false,
    starsText: '',
    overMsg: '',
    overHint: '',
    showNext: false,
    best: 0
  },

  _li: 0,
  _used: {},
  _path: [],
  _steps: 0,
  _undo: 0,
  _reset: 0,
  _hints: 0,
  _timers: [],

  onLoad: function (options) {
    this.setData({ best: storage.get(BEST_KEY) || 0 });
    // 关卡页指定关卡（?level=N → 内部下标 _li = N-1）
    var want = parseInt((options || {}).level, 10) || 0;
    // 断点续玩（2026-10-18）：先恢复画到一半的线（一笔画的路径状态没法靠重来还原）
    var snap = resume.load(PAGE);
    if (snap && (!want || snap.level === want) && this._restore(snap)) return;
    this.start(want >= 1 ? want - 1 : 0);
  },
  onUnload: function () { this._clearTimers(); this._saveProgress(); },
  onHide: function () { this._clearTimers(); this._saveProgress(); },

  // ============ 断点续玩 ============
  /**
   * 恢复：关卡下标 + 已走路径 + 已用边 + 步数 + 剩余提示次数。
   * 路径点序就足以重放出 `_used`，但这里直接存 `_used`，省一次重算也避免口径走偏。
   */
  _restore: function (snap) {
    var st = snap && snap.state;
    if (!st || !Array.isArray(st.path)) return false;
    var li = parseInt(st.li, 10);
    if (!(li >= 0 && li < lib.LEVELS.length)) return false;
    var lv = lib.LEVELS[li];
    var maxNode = lv.nodes.length;
    // 校验路径：每个点都要是这一关里存在的点，否则渲染会越界
    var bad = st.path.some(function (i) { return !(i >= 0 && i < maxNode); });
    if (bad) { resume.clear(PAGE); return false; }
    if (st.path.length && st.path[0] >= maxNode) return false;

    this._li = li;
    this._path = st.path.slice();
    this._used = (st.used && typeof st.used === 'object') ? st.used : {};
    this._steps = parseInt(st.steps, 10) || 0;
    this._undo = 0;
    this._reset = 0;
    this._hints = parseInt(st.hints, 10) || 0;
    this.setData({
      settle: false, win: false, starsText: '', overMsg: '', overHint: '',
      hintLeft: Math.max(0, parseInt(st.hintLeft, 10)),
      hintKey: '', hintTip: '', showOdd: false, warn: false,
      levelName: lv.name,
      tierText: lv.tier || '',
      mainText: '接着上次的画',
      subText: '已走 ' + lib.usedCount(this._used) + '/' + lv.edges.length + ' 条线'
    });
    this._render();
    wx.showToast({ title: '已恢复上次进度 · 第 ' + (li + 1) + ' 关', icon: 'none', duration: 1600 });
    return true;
  },

  /** 把当前路径写进断点存档（每画一条线 / 撤销一次都写） */
  _saveProgress: function () {
    if (!this._path.length || this.data.settle) return;
    resume.save(PAGE, this._li + 1, {
      li: this._li,
      path: this._path.slice(),
      used: this._used,
      steps: this._steps,
      hintLeft: this.data.hintLeft,
      hints: this._hints
    });
  },

  _clearTimers: function () {
    this._timers.forEach(function (t) { clearTimeout(t); });
    this._timers = [];
  },
  _later: function (fn, ms) { this._timers.push(setTimeout(fn, ms)); },

  _level: function () { return lib.LEVELS[this._li]; },

  /** 从头开始某一关（清掉帮助计数与提示次数） */
  start: function (startLi) {
    this._clearTimers();
    var li = parseInt(startLi, 10);
    this._li = (li >= 0 && li < lib.LEVELS.length) ? li : 0;
    resume.clear(PAGE);                 // 主动开新局 → 旧断点作废
    this._undo = 0;
    this._reset = 0;
    this._hints = 0;
    this.setData({
      settle: false, win: false, starsText: '', overMsg: '', overHint: '',
      hintLeft: HINT_PER_LEVEL, hintKey: '', hintTip: '', showOdd: false
    });
    var lv = this._level();
    this._clearBoard();
    this.setData({
      levelName: lv.name,
      tierText: lv.tier || '',
      mainText: '点一个点开始画',
      subText: '第 ' + (this._li + 1) + ' 关 · ' + lv.name + ' · ' + lv.edges.length + ' 条线'
    });
  },

  /** 只清空画布（撤销/重置/换关都用它） */
  _clearBoard: function () {
    this._used = {};
    this._path = [];
    this._steps = 0;
    this.setData({ warn: false, hintKey: '', hintTip: '', showOdd: false });
    this._render();
  },

  // 渲染：几何由引擎算（0~100 相对坐标 → rpx），已走的线变绿、当前点变橙、提示线闪黄
  _render: function () {
    var lv = this._level();
    var geo = lib.geometry(lv, BOARD);
    var path = this._path;
    var cur = path.length ? path[path.length - 1] : -1;
    var hintKey = this.data.hintKey;
    var showOdd = this.data.showOdd;
    var odd = showOdd ? lib.oddNodes(lv) : [];
    var edges = geo.edges.map(function (e) {
      return {
        key: e.key,
        style: 'left:' + e.left + 'rpx;top:' + e.top + 'rpx;width:' + e.len + 'rpx;transform: rotate(' + e.angle + 'deg);',
        used: !!this._used[e.key],
        hint: e.key === hintKey
      };
    }, this);
    var nodes = geo.nodes.map(function (n, i) {
      var cls = (i === cur ? 'cur' : '') + (path.indexOf(i) !== -1 ? ' visited' : '');
      if (odd.indexOf(i) !== -1) cls += ' odd';
      return { style: 'left:' + n.left + 'rpx;top:' + n.top + 'rpx;', cls: cls };
    });
    var done = lib.usedCount(this._used);
    this.setData({
      edges: edges,
      nodes: nodes,
      levelText: (this._li + 1) + '/' + lib.LEVELS.length,
      edgeText: done + '/' + lv.edges.length,
      stepText: String(this._steps),
      pct: lv.edges.length ? Math.round(done / lv.edges.length * 100) : 0
    });
  },

  /**
   * 手指滑动画线（用户 2026-09-13 反馈：只能点，期望轨迹贴合）。
   *
   * 做法：touchstart/touchmove 拿到触点 → 换算成棋盘 rpx 坐标 → 找**最近的点**，
   *      落在吸附半径内就直接当「点了这个点」处理（复用 tapNode 的全部规则：
   *      起点、可走、走错提示、撤销栈都一致，不做第二套逻辑）。
   * 防重复：滑完手指抬起时系统还会补一个 tap，所以滑动后 300ms 内的真实点击忽略。
   */
  onSlide: function (e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    var self = this;
    if (!this._canvasRect) {
      wx.createSelectorQuery().in(this).select('.canvas').boundingClientRect(function (r) {
        self._canvasRect = r || null;
      }).exec();
      return;                       // 这次先量尺寸，下一次滑动就能吸附
    }
    var rpxPerPx = BOARD / this._canvasRect.width;
    var x = (t.clientX - this._canvasRect.left) * rpxPerPx;
    var y = (t.clientY - this._canvasRect.top) * rpxPerPx;
    var geo = lib.geometry(this._level(), BOARD);
    var best = -1;
    var bestD = Infinity;
    for (var i = 0; i < geo.nodes.length; i++) {
      var n = geo.nodes[i];
      var d = Math.sqrt((n.left - x) * (n.left - x) + (n.top - y) * (n.top - y));
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > BOARD * 0.12) return;   // 吸附半径：棋盘短边的 12%
    this._lastSlideAt = Date.now();
    this.tapNode({ currentTarget: { dataset: { idx: best } }, __fromSlide: true });
  },

  tapNode: function (e) {
    // 滑动后紧跟的真实 tap 直接忽略，避免一步走两次
    if (!e.__fromSlide && Date.now() - (this._lastSlideAt || 0) < 300) return;
    var idx = e.currentTarget.dataset.idx;
    var lv = this._level();

    // 起点：随便点一个点出发（奇点数 2 时只有那两个点能走通，提示里会讲）
    if (!this._path.length) {
      this._path = [idx];
      this._steps = 0;
      this.setData({
        warn: false,
        hintKey: '', hintTip: '', showOdd: false,
        mainText: '从这里出发',
        subText: '点相邻的点继续画，走错了可以撤销'
      });
      this._render();
      return;
    }

    var last = this._path[this._path.length - 1];
    if (idx === last) return;

    var next = lib.step(lv, this._used, last, idx);
    if (!next) {
      this.setData({ warn: true, mainText: '这两个点之间没有可走的线', subText: '换一个相邻的点，或点「撤销一步」' });
      return;
    }

    this._used = next;
    this._path.push(idx);
    this._steps++;
    this.setData({ hintKey: '', hintTip: '' });
    this._render();
    this._saveProgress();               // 每接一个点存一次（通关会立刻 clear，不留残局）

    if (lib.isLevelClear(lv, this._used)) {
      this._levelClear();
      return;
    }
    if (lib.freeCountFrom(lv, this._used, idx) === 0) {
      this.setData({ warn: true, mainText: '走到死路了', subText: '还有线没走完，点「撤销一步」退回去换个走法' });
      return;
    }
    this.setData({
      warn: false,
      mainText: '继续画',
      subText: '还剩 ' + (lv.edges.length - lib.usedCount(this._used)) + ' 条线'
        + (this.data.hintLeft < HINT_PER_LEVEL ? ' · 提示剩 ' + this.data.hintLeft + ' 次' : '')
    });
  },

  onUndo: function () {
    if (this._path.length < 2) {
      this.setData({ warn: false, mainText: '还没画线', subText: '点一个点开始，再连相邻的点' });
      return;
    }
    this._undo++;
    var b = this._path.pop();
    var a = this._path[this._path.length - 1];
    this._used = lib.unstep(this._used, a, b);
    this._steps = Math.max(0, this._steps - 1);
    this._render();
    this.setData({
      warn: false,
      hintKey: '', hintTip: '', showOdd: false,
      mainText: '已撤销一步',
      subText: '还剩 ' + (this._level().edges.length - lib.usedCount(this._used)) + ' 条线'
    });
    this._saveProgress();
  },

  onReset: function () {
    this._reset++;
    resume.clear(PAGE);                 // 清空重来：断点也一并作废，避免下次恢复出撤销前的残线
    this._clearBoard();
    this.setData({
      mainText: '重来一次',
      subText: '第 ' + (this._li + 1) + ' 关 · ' + this._level().name + ' · 提示剩 ' + this.data.hintLeft + ' 次'
    });
  },

  /**
   * 💡 提示（demo 的 3 次/关）。
   *
   * 还没起手：高亮两个奇点，告诉用户该从哪开始（不消耗次数 —— 这一步只是讲规则）；
   * 画到一半：高亮一条「走完仍能通关」的线（引擎用欧拉路径判定筛过，不会把人带进死路）。
   */
  onHint: function () {
    var self = this;
    var lv = this._level();
    var cur = this._path.length ? this._path[this._path.length - 1] : -1;

    if (cur < 0) {
      var sh = lib.startHint(lv);
      this.setData({
        showOdd: true,
        hintTip: sh.any ? '这关任意点都能起手，挑一个点开始画' : '从高亮的两个点之一开始（连奇数条线的点只能当起点或终点）'
      });
      this._render();
      this._later(function () {
        self.setData({ showOdd: false, hintTip: '' });
        self._render();
      }, 2600);
      return;
    }

    if (this.data.hintLeft <= 0) {
      wx.showToast({ title: '本关提示用完了', icon: 'none' });
      return;
    }
    var h = lib.hintOf(lv, this._used, cur);
    if (!h) {
      wx.showToast({ title: '没线可走了，先撤销一步', icon: 'none' });
      return;
    }
    this._hints++;
    this.setData({
      hintLeft: this.data.hintLeft - 1,
      hintKey: h.key,
      hintTip: h.safe ? '顺着闪光的线走' : '这一步之后可能走不通，建议先撤销'
    });
    this._render();
    this._later(function () {
      self.setData({ hintKey: '', hintTip: '' });
      self._render();
    }, HINT_SHOW_MS);
  },

  _levelClear: function () {
    this._clearTimers();
    resume.clear(PAGE);                 // 已通关：断点不再有意义
    var lv = this._level();
    var no = this._li + 1;
    var stars = lib.starsByAssist(this._undo, this._reset, this._hints);

    // 本地进度：关卡页据此解锁下一关、显示星级
    progress.markCleared('onestroke', no);
    storage.saveStars('onestroke', no, stars);

    // 玩法进度榜上报（按关卡号记进度分；数字智力类没有正确率，reportPlay 会按星级反推样本）
    playReport.reportPlay({
      gameType: 'onestroke',
      grade: 'all',
      level: no,
      score: no,
      stars: stars,
      maxCombo: 0
    });

    var best = this.data.best;
    if (no > best) {
      best = no;
      storage.set(BEST_KEY, best);
    }
    var last = no >= lib.LEVELS.length;
    var uses = this._undo + this._reset + this._hints;
    var msg = '第 ' + no + ' 关「' + lv.name + '」· ' + lv.edges.length + ' 条线 · ' + this._steps + ' 步'
      + (uses ? '\n撤销 ' + this._undo + ' · 重置 ' + this._reset + ' · 提示 ' + this._hints : '\n一次画完，零帮助');
    this.setData({
      settle: true,
      win: true,
      hintKey: '',
      hintTip: '',
      showOdd: false,
      starsText: '⭐'.repeat(stars),
      overMsg: msg,
      overHint: stars === 3
        ? '三星标准：不用撤销 / 重置 / 提示。'
        : (stars === 2 ? '少用一次帮助就能拿三星。' : '先想好起手点再画，能少走很多弯路。'),
      showNext: !last,
      best: best
    });
  },

  onNext: function () {
    if (this._li < lib.LEVELS.length - 1) this.start(this._li + 1);
  },
  onRetry: function () { this.start(this._li); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 一笔画', path: '/pages/playlist/playlist' };
  },

  // ============ 暂停 / 音效（统一组件 game-pause） ============
  onGamePause: function () {
    this.setData({ paused: true });
    if (this._onPause) this._onPause();
  },

  onGameResume: function () {
    this.setData({ paused: false });
    if (this._onResume) this._onResume();
  },

  onGameRestart: function () {
    this.setData({ paused: false });
    this.start(this._li);
  },

  onGameQuit: function () {
    this.setData({ paused: false });
    wx.navigateBack();
  }
});
