// 找规律（数字智力第 9 款，2026-10-18 新增）
//
// 口径（用户拍板）：
//   · 30 关 × 每关 10 题，星星只记最高（30×3=90 星封顶，单测守着）；
//   · **不接年级**：难度只靠关卡序号（game/pattern.js 的 tierOf），引擎里没有任何 grade 依赖；
//   · 答完一题立刻公布规则（"每次 +3"），这是它相对其他玩法唯一的教学增量；
//   · 星级统一按正确率（challenge.starsByRightRate），与 2026-10-17 的拍板一致。
var pattern = require('../../game/pattern');
var storage = require('../../utils/storage');
var progress = require('../../utils/puzzle-progress');
var playReport = require('../../utils/play-report');
var challenge = require('../../utils/challenge');

// 题板内可用宽度（rpx）：750 - 页面左右各 32 - 题板左右各 20（.stage padding）
// 第一版按 686 算，结果珠子正好把题板内边距占满、左右压到卡片边缘（截图才发现）。
var BOARD_W = 646;
var CELL_GAP = 10;        // 与 wxss 的 .cells gap 保持一致
var GOOD_MS = 620;        // 答对后停留时间（看规则解释）
var BAD_MS = 1100;        // 答错后多停一会儿

/**
 * 珠子尺寸：按项数平分棋盘宽度。
 * 数字题固定 6 格、图形题固定 8 格，但这里按实际项数算，
 * 以后改题长也不会溢出屏幕（这是"元素跳出界面"的第一道防线）。
 */
function layoutOf(n) {
  var count = n > 0 ? n : 1;
  var w = Math.floor((BOARD_W - CELL_GAP * (count - 1)) / count);
  if (w > 120) w = 120;   // 项数很少时不至于变成大方块
  return { cellW: w, cellFont: Math.max(28, Math.round(w * 0.42)) };
}

Page({
  data: {
    paused: false,          // 暂停弹层（game-pause 组件）
    levelText: '1/30',
    qText: '1/10',
    rightText: '0',
    pct: 0,
    bannerMain: '',
    bannerSub: '',
    fb: '',
    cells: [],
    optBig: false,      // 图形题：选项是 emoji，字号放大一档
    cellW: 104,
    cellFont: 37,
    stageTip: '',
    options: [],
    settle: false,
    win: false,
    starsText: '',
    overTitle: '',
    overMsg: '',
    overHint: '',
    showNext: false
  },

  _lv: 1,
  _qs: [],
  _i: 0,
  _right: 0,
  _wrong: 0,
  _locked: false,
  _timer: null,

  onLoad: function (options) {
    var want = parseInt((options || {}).level, 10) || 1;
    this.start(want);
  },
  onUnload: function () { this._clearTimer(); },
  onHide: function () { this._clearTimer(); },

  _clearTimer: function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  },

  /** 开始某一关（重玩也会走这里，seed 带时间 → 换一套题） */
  start: function (no) {
    this._clearTimer();
    var lv = parseInt(no, 10) || 1;
    if (lv < 1) lv = 1;
    if (lv > pattern.TOTAL_LEVELS) lv = pattern.TOTAL_LEVELS;
    this._lv = lv;
    this._i = 0;
    this._right = 0;
    this._wrong = 0;
    this._locked = false;

    var seed = (((Date.now() & 0x7fffffff) ^ (lv * 7919)) >>> 0) || 1;
    this._qs = pattern.genLevel(lv, seed);

    this.setData({
      settle: false, win: false, starsText: '', overTitle: '', overMsg: '', overHint: '', showNext: false,
      levelText: lv + '/' + pattern.TOTAL_LEVELS,
      rightText: '0'
    });
    this._render();
  },

  /** 渲染当前题：题面珠子 + 四个选项 */
  _render: function () {
    var q = this._qs[this._i];
    if (!q) return;
    var total = this._qs.length;
    var layout = layoutOf(q.known.length + 1);

    var cells = q.known.map(function (v) { return { v: v, blank: false, reveal: false }; });
    cells.push({ v: '?', blank: true, reveal: false });

    this.setData({
      cells: cells,
      cellW: layout.cellW,
      cellFont: q.unit === 'emoji' ? Math.max(28, Math.round(layout.cellW * 0.68)) : layout.cellFont,
      qText: (this._i + 1) + '/' + total,
      pct: Math.round(this._i / total * 100),
      rightText: String(this._right),
      options: q.options.map(function (o) { return { v: o.v, cls: '' }; }),
      optBig: q.unit === 'emoji',
      fb: '',
      bannerMain: q.unit === 'emoji' ? '看看符号是怎么排的' : '找出问号处的数',
      bannerSub: '第 ' + (this._i + 1) + ' 题 · ' + q.tierName + ' · ' + q.kindName,
      stageTip: '还剩 ' + (total - this._i) + ' 题'
    });
  },

  /** 选答案：立即判对错 + 公布规则，短暂停顿后下一题 */
  tapOption: function (e) {
    if (this._locked) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var q = this._qs[this._i];
    if (!q || !(idx >= 0 && idx < q.options.length)) return;

    this._locked = true;
    var ok = !!q.options[idx].ok;
    if (ok) this._right++; else this._wrong++;

    // 问号格翻开成答案，选项染色（正确项始终标绿，让答错的人也能对照）
    var cells = this.data.cells.map(function (c) { return { v: c.v, blank: c.blank, reveal: c.reveal }; });
    if (cells.length) cells[cells.length - 1] = { v: String(q.answer), blank: false, reveal: true };

    var options = q.options.map(function (o, i) {
      var cls = '';
      if (o.ok) cls = 'ok';
      else if (i === idx) cls = 'bad';
      return { v: o.v, cls: cls };
    });

    this.setData({
      cells: cells,
      options: options,
      fb: ok ? 'good' : 'bad',
      bannerMain: ok ? '答对了！' : '差一点～',
      bannerSub: '规律是：' + q.rule,
      rightText: String(this._right),
      stageTip: ok ? '' : '正确答案 ' + q.answer
    });

    var self = this;
    this._timer = setTimeout(function () { self._next(); }, ok ? GOOD_MS : BAD_MS);
  },

  _next: function () {
    this._timer = null;
    this._locked = false;
    this._i++;
    if (this._i >= this._qs.length) { this._finish(); return; }
    this._render();
  },

  /** 10 题答完：按正确率折星 + 记进度 + 上榜 */
  _finish: function () {
    this._clearTimer();
    var lv = this._lv;
    var right = this._right;
    var total = this._qs.length;
    var stars = challenge.starsByRightRate(right, total);
    var win = stars >= 1;              // 0 星不算过关（关卡页据此解锁下一关）
    var last = lv >= pattern.TOTAL_LEVELS;

    if (win) progress.markCleared('pattern', lv);
    storage.saveStars('pattern', lv, stars);
    playReport.reportPlay({
      gameType: 'pattern',
      grade: 'all',
      level: lv,
      score: lv,
      stars: stars,
      correct: right,
      total: total,
      maxCombo: 0
    });

    this.setData({
      pct: 100,
      settle: true,
      win: win,
      starsText: win ? '⭐'.repeat(stars) : '',
      // 失败时必须传空串：settle-pop 是 `title || 默认文案`，传了字就会显示「全部通关！」
      overTitle: win ? (last ? '全部通关！' : '过关！') : '',
      overMsg: win
        ? '第 ' + lv + ' 关 · 答对 ' + right + '/' + total
        : '第 ' + lv + ' 关 · 答对 ' + right + '/' + total + '，还没到 1 星线',
      overHint: challenge.starHint(right, total, win),
      showNext: win && !last
    });
  },

  onNext: function () {
    if (this._lv < pattern.TOTAL_LEVELS) this.start(this._lv + 1);
  },
  onRetry: function () { this.start(this._lv); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 找规律', path: '/pages/playlist/playlist' };
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
    this.start(this._lv);
  },

  onGameQuit: function () {
    this.setData({ paused: false });
    wx.navigateBack();
  }
});
