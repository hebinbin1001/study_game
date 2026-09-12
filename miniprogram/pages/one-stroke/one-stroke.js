// 一笔画（玩法落地：demo g8）——每条线只能走一次，把所有线走完即过关
// 与 demo 的差异：不用 Canvas，改用「绝对定位的线 + 圆点」（坐标由引擎算，可单测）；
// 关卡数据与走边/撤回/死路判定都在 game/one-stroke.js，页面只负责渲染与连击感。
var lib = require('../../game/one-stroke');
var storage = require('../../utils/storage');

var BOARD = 600;          // 棋盘逻辑边长（rpx），与引擎 geometry() 同一单位
var NEXT_MS = 1000;       // 过关后停留
var BEST_KEY = 'ww_onestroke_best';

Page({
  data: {
    levelText: '1/5',
    edgeText: '',
    stepText: '0',
    mainText: '点一个点开始画',
    subText: '每条线只能走一次，把所有线走完就过关',
    warn: false,
    edges: [],
    nodes: [],
    settle: false,
    win: false,
    starsText: '',
    overMsg: '',
    best: 0
  },

  _li: 0,
  _used: {},
  _path: [],
  _steps: 0,
  _finished: 0,
  _totalSteps: 0,
  _timers: [],

  onLoad: function () {
    this.setData({ best: storage.get(BEST_KEY) || 0 });
    this.start();
  },
  onUnload: function () { this._clearTimers(); },
  onHide: function () { this._clearTimers(); },

  _clearTimers: function () {
    this._timers.forEach(function (t) { clearTimeout(t); });
    this._timers = [];
  },
  _later: function (fn, ms) { this._timers.push(setTimeout(fn, ms)); },

  _level: function () { return lib.LEVELS[this._li]; },

  start: function () {
    this._clearTimers();
    this._li = 0;
    this._finished = 0;
    this._totalSteps = 0;
    this.setData({ settle: false, win: false, starsText: '', overMsg: '' });
    this._resetLevel('点一个点开始画', '每条线只能走一次，把所有线走完就过关');
  },

  _resetLevel: function (mainText, subText) {
    this._used = {};
    this._path = [];
    this._steps = 0;
    this.setData({ warn: false });
    this._render();
    var lv = this._level();
    this.setData({
      mainText: mainText || lv.name,
      subText: subText || ('第 ' + (this._li + 1) + ' 关：' + lv.name)
    });
  },

  // 渲染：几何由引擎算（0~100 相对坐标 → rpx），已走的线变绿、当前点变橙
  _render: function () {
    var lv = this._level();
    var geo = lib.geometry(lv, BOARD);
    var path = this._path;
    var cur = path.length ? path[path.length - 1] : -1;
    var edges = geo.edges.map(function (e) {
      return {
        key: e.key,
        style: 'left:' + e.left + 'rpx;top:' + e.top + 'rpx;width:' + e.len + 'rpx;transform: rotate(' + e.angle + 'deg);',
        used: !!this._used[e.key]
      };
    }, this);
    var nodes = geo.nodes.map(function (n, i) {
      return {
        style: 'left:' + n.left + 'rpx;top:' + n.top + 'rpx;',
        cls: (i === cur ? 'cur' : '') + (path.indexOf(i) !== -1 ? ' visited' : '')
      };
    });
    this.setData({
      edges: edges,
      nodes: nodes,
      levelText: (this._li + 1) + '/' + lib.LEVELS.length,
      edgeText: lib.usedCount(this._used) + '/' + lv.edges.length,
      stepText: String(this._steps)
    });
  },

  tapNode: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var lv = this._level();

    // 起点：随便点一个点出发
    if (!this._path.length) {
      this._path = [idx];
      this._steps = 0;
      this.setData({ warn: false, mainText: '从这里出发', subText: '点相邻的点继续画，走错了可以撤销' });
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
    this._totalSteps++;
    this._render();

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
    });
  },

  onUndo: function () {
    if (this._path.length < 2) {
      var lv0 = this._level();
      this._resetLevel('重来一次', '第 ' + (this._li + 1) + ' 关：' + lv0.name);
      return;
    }
    var b = this._path.pop();
    var a = this._path[this._path.length - 1];
    this._used = lib.unstep(this._used, a, b);
    this._steps = Math.max(0, this._steps - 1);
    this._render();
    this.setData({
      warn: false,
      mainText: '已撤销一步',
      subText: '还剩 ' + (this._level().edges.length - lib.usedCount(this._used)) + ' 条线'
    });
  },

  onReset: function () {
    var lv = this._level();
    this._resetLevel('重来一次', '第 ' + (this._li + 1) + ' 关：' + lv.name);
  },

  _levelClear: function () {
    var lv = this._level();
    this._finished++;
    this.setData({
      warn: false,
      mainText: lv.name + ' 完成',
      subText: '用了 ' + this._steps + ' 步走完所有线'
    });
    var self = this;
    this._later(function () {
      if (self._li >= lib.LEVELS.length - 1) { self._finish(); return; }
      self._li++;
      self._resetLevel('第 ' + (self._li + 1) + ' 关：' + self._level().name, '点一个点开始画');
    }, NEXT_MS);
  },

  _finish: function () {
    this._clearTimers();
    var stars = lib.starsFor(this._finished, lib.LEVELS.length);
    var best = this.data.best;
    if (this._finished > best) {
      best = this._finished;
      storage.set(BEST_KEY, best);
    }
    this.setData({
      settle: true,
      win: stars >= 1,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      best: best,
      overMsg: '完成关卡 ' + this._finished + ' / ' + lib.LEVELS.length
        + '\n总步数 ' + this._totalSteps + '\n最高通关 ' + best + ' 关'
        + '\n小知识：连了奇数条线的点叫奇点，最多只能有两个，它们是一笔画的起点和终点。'
    });
  },

  onRetry: function () { this.start(); },
  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 一笔画', path: '/pages/playlist/playlist' };
  }
});
