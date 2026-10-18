// 认钟表（数字智力第 10 款，2026-10-18 新增）
//
// 口径（复核意见 §1.2 / §2.2）：
//   · 30 关 × 每关 10 题，星星只记最高（30×3 = 90 星封顶，单测守着）；
//   · **不接年级**：难度只靠关卡序号（game/clock.js 的 tierOf），引擎里没有任何 grade 依赖；
//   · 答完一题公布"怎么读"（分针走几小格、满 60 进 1 小时），这是它相对其他玩法的教学增量；
//   · 星级统一按正确率（challenge.starsByRightRate），与 2026-10-17 拍板一致。
var clock = require('../../game/clock');
var storage = require('../../utils/storage');
var progress = require('../../utils/puzzle-progress');
var playReport = require('../../utils/play-report');
var challenge = require('../../utils/challenge');

var GOOD_MS = 700;        // 答对后停留（看一眼规则）
var BAD_MS = 1200;        // 答错后多停一会儿（看清正确答案）

/** 表盘刻度角度：0, 6, 12 … 354（每秒一格） */
function buildTicks() {
  var out = [];
  for (var i = 0; i < 60; i++) out.push(i * 6);
  return out;
}

Page({
  data: {
    levelText: '1/30',
    qText: '1/10',
    rightText: '0',
    pct: 0,
    prompt: '',
    sub: '',
    fb: '',
    faceShow: true,
    faceText: '',
    hourDeg: 0,
    minDeg: 0,
    stageTip: '',
    ticks: buildTicks(),
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

  /** 开始某一关（重玩也走这里，seed 带时间 → 换一套题） */
  start: function (no) {
    this._clearTimer();
    var lv = parseInt(no, 10) || 1;
    if (lv < 1) lv = 1;
    if (lv > clock.TOTAL_LEVELS) lv = clock.TOTAL_LEVELS;
    this._lv = lv;
    this._i = 0;
    this._right = 0;
    this._locked = false;

    var seed = (((Date.now() & 0x7fffffff) ^ (lv * 7919)) >>> 0) || 1;
    this._qs = clock.genLevel(lv, seed);

    this.setData({
      settle: false, win: false, starsText: '', overTitle: '', overMsg: '', overHint: '', showNext: false,
      levelText: lv + '/' + clock.TOTAL_LEVELS,
      rightText: '0'
    });
    this._render();
  },

  /** 渲染当前题：题干 + 表盘角度 + 四个选项 */
  _render: function () {
    var q = this._qs[this._i];
    if (!q) return;
    var total = this._qs.length;
    this.setData({
      prompt: q.prompt,
      sub: q.sub,
      fb: '',
      faceShow: !!q.face.show,
      faceText: q.face.text || '',
      hourDeg: q.hourDeg,
      minDeg: q.minDeg,
      qText: (this._i + 1) + '/' + total,
      pct: Math.round(this._i / total * 100),
      rightText: String(this._right),
      options: q.options.map(function (o) { return { v: o.v, cls: '' }; }),
      stageTip: '还剩 ' + (total - this._i) + ' 题 · ' + q.kindName
    });
  },

  /** 选答案：立即判对错 + 说明读法 */
  tapOption: function (e) {
    if (this._locked) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var q = this._qs[this._i];
    if (!q || !(idx >= 0 && idx < q.options.length)) return;

    this._locked = true;
    var ok = !!q.options[idx].ok;
    if (ok) this._right++;

    var options = q.options.map(function (o, i) {
      var cls = '';
      if (o.ok) cls = 'ok';
      else if (i === idx) cls = 'bad';
      return { v: o.v, cls: cls };
    });

    this.setData({
      options: options,
      fb: ok ? 'good' : 'bad',
      prompt: ok ? '答对了！' : '差一点～',
      sub: q.rule,
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
    var last = lv >= clock.TOTAL_LEVELS;

    if (win) progress.markCleared('clock', lv);
    storage.saveStars('clock', lv, stars);
    playReport.reportPlay({
      gameType: 'clock',
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
      // 失败必须传空串：settle-pop 是 `title || 默认文案`，传字会显示「全部通关！」
      overTitle: win ? (last ? '全部通关！' : '过关！') : '',
      overMsg: win
        ? '第 ' + lv + ' 关 · 答对 ' + right + '/' + total
        : '第 ' + lv + ' 关 · 答对 ' + right + '/' + total + '，还没到 1 星线',
      overHint: challenge.starHint(right, total, win),
      showNext: win && !last
    });
  },

  onNext: function () {
    if (this._lv < clock.TOTAL_LEVELS) this.start(this._lv + 1);
  },
  onRetry: function () { this.start(this._lv); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 认钟表', path: '/pages/playlist/playlist' };
  }
});
