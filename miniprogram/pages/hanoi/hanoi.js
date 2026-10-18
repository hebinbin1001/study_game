// 汉诺塔（数字智力第 12 款 · 6 关小品，2026-10-18 新增）
//
// 口径（复核意见 §1.4）：
//   · **只做 3 柱**：`2ⁿ−1` 只在 3 柱成立，4 柱（Reve's puzzle）没有闭式解，
//     原文"4 柱 + 闭式解单测"自相矛盾，这里不做；
//   · 只做 6 关（3~8 盘），不铺 30 关：最优解唯一，学完递归每关同一套动作，没有长线价值；
//   · 无题目 → 星级按步数倍率折（照 klotski 的 starsFor），不接年级。
var hanoi = require('../../game/hanoi');
var storage = require('../../utils/storage');
var progress = require('../../utils/puzzle-progress');
var playReport = require('../../utils/play-report');

Page({
  data: {
    levelText: '1/6',
    stepText: '0',
    minText: '7',
    bannerMain: '',
    bannerSub: '',
    fb: '',
    pegs: [],
    settle: false,
    win: false,
    starsText: '',
    overTitle: '',
    overMsg: '',
    overHint: '',
    showNext: false
  },

  _lv: 1,
  _n: 3,
  _state: null,
  _steps: 0,
  _sel: -1,
  _hist: [],

  onLoad: function (options) {
    var want = parseInt((options || {}).level, 10) || 1;
    this.start(want);
  },

  /** 开始某一关 */
  start: function (no) {
    var lv = hanoi.levelOf(no);
    this._lv = lv.no;
    this._n = lv.n;
    this._state = hanoi.initial(lv.n);
    this._steps = 0;
    this._sel = -1;
    this._hist = [];

    this.setData({
      settle: false, win: false, starsText: '', overTitle: '', overMsg: '', overHint: '', showNext: false,
      fb: '',
      levelText: lv.no + '/' + hanoi.LEVELS.length,
      minText: String(hanoi.minMoves(lv.n)),
      bannerMain: '把 ' + lv.n + ' 个盘全移到第 3 根柱子',
      bannerSub: '大盘不能压在小盘上 · 最少 ' + hanoi.minMoves(lv.n) + ' 步'
    });
    this._paint();
  },

  _paint: function () {
    var self = this;
    var maxN = this._n;
    var pegs = this._state.map(function (rod, i) {
      var disks = rod.map(function (size) {
        var d = hanoi.diskStyle(size, maxN);
        return { size: size, w: d.w, color: d.color, label: d.label, top: false };
      });
      // 数组末尾是顶部：只给最上面那个盘加 top（选中时它会被抬起来）
      if (disks.length) disks[disks.length - 1].top = true;
      return { disks: disks, sel: i === self._sel, no: String(i + 1) };
    });

    this.setData({
      pegs: pegs,
      stepText: String(this._steps)
    });
  },

  /** 点柱子：第一次拿起（选中），第二次放下 / 换一根 */
  tapPeg: function (e) {
    if (this.data.settle) return;
    var i = parseInt(e.currentTarget.dataset.i, 10);
    if (!(i >= 0 && i < 3)) return;

    if (this._sel < 0) {
      if (!this._state[i].length) {
        this._hint('这根柱子是空的', '先点有盘子的柱子');
        return;
      }
      this._sel = i;
      var sz = hanoi.top(this._state, i);
      this.setData({
        fb: '',
        bannerMain: '拿起了 ' + sz + ' 号盘',
        bannerSub: '再点一根柱子放下去（不能压到更小的盘上）'
      });
      this._paint();
      return;
    }

    if (this._sel === i) {
      this._sel = -1;
      this.setData({ fb: '', bannerMain: '放回原处', bannerSub: '重新选一个盘子吧' });
      this._paint();
      return;
    }

    var next = hanoi.move(this._state, this._sel, i);
    if (!next) {
      var from = hanoi.top(this._state, this._sel);
      var to = hanoi.top(this._state, i);
      this._hint('放不下', from + ' 号盘比 ' + to + ' 号盘大，大盘不能压小盘');
      return;
    }

    this._hist.push({ state: this._state.map(function (r) { return r.slice(); }), steps: this._steps });
    this._state = next;
    this._steps++;
    this._sel = -1;
    this.setData({ fb: '', bannerMain: '再想想下一步', bannerSub: '最少 ' + hanoi.minMoves(this._n) + ' 步就能完成' });
    this._paint();

    if (hanoi.isSolved(this._state, this._n)) this._finish();
  },

  _hint: function (main, sub) {
    this.setData({ fb: 'bad', bannerMain: main, bannerSub: sub });
  },

  /** 撤销一步：回退到上一步的状态与步数（防止误触把一局拖长） */
  onUndo: function () {
    if (this.data.settle) return;
    if (!this._hist.length) {
      this.setData({ fb: '', bannerMain: '还没有可以撤销的步骤', bannerSub: '' });
      return;
    }
    var h = this._hist.pop();
    this._state = h.state;
    this._steps = h.steps;
    this._sel = -1;
    this.setData({ fb: '', bannerMain: '已撤销一步', bannerSub: '' });
    this._paint();
  },

  onReset: function () {
    this.start(this._lv);
  },

  /** 完成：按步数倍率折星 */
  _finish: function () {
    var lv = this._lv;
    var min = hanoi.minMoves(this._n);
    var stars = hanoi.starsFor(min, this._steps);
    var win = stars >= 1;
    var last = lv >= hanoi.LEVELS.length;

    if (win) progress.markCleared('hanoi', lv);
    storage.saveStars('hanoi', lv, stars);
    playReport.reportPlay({
      gameType: 'hanoi',
      grade: 'all',
      level: lv,
      score: this._steps,
      stars: stars,
      maxCombo: 0
    });

    this.setData({
      settle: true,
      win: win,
      starsText: win ? '⭐'.repeat(stars) : '',
      overTitle: win ? (last ? '全部通关！' : '完成！') : '',
      overMsg: '第 ' + lv + ' 关 · 用了 ' + this._steps + ' 步（最少 ' + min + ' 步）',
      overHint: stars < 3 ? ('最少 ' + min + ' 步就能拿 3 星 · 试试重开一次') : '',
      showNext: win && !last
    });
  },

  onNext: function () {
    if (this._lv < hanoi.LEVELS.length) this.start(this._lv + 1);
  },
  onRetry: function () { this.start(this._lv); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 汉诺塔', path: '/pages/playlist/playlist' };
  }
});
