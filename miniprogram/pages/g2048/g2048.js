// 2048 页（B6-3）：固定关卡——目标数字递增，**不限步数**
// 滑动合成（触摸滑动），达到目标过关；只有「棋盘无路可走」才失败。
//
// 2026-10-18 用户拍板取消步数硬上限（「留着有时候都过不了」）：
//   · 步数不再判负 —— 2048 本身就是「滑到不能滑」，硬性步数只会让人卡在差一点；
//   · 步数改用评星：≤par → 3★、≤1.5×par → 2★、其余 1★；
//   · par 依旧按「合并次数」模型定（合成 T 至少 (T/2 − 1) 次合并，实战约 1.2~1.5
//     次/步），校验见 tests/unit/g2048-levels.test.js。
// 关卡表在 data/g2048-levels.js（14 关）：关卡页与单测共用同一份
var LEVELS = require('../../data/g2048-levels').levels;
// 关卡进度 + 每关最短用时（用户 2026-09-13：每关显示最短时间）
var puzProgress = require('../../utils/puzzle-progress');
var playReport = require('../../utils/play-report');

// 挑战模式（2026-09-12 用户认可「保留打到 2048 的成就感」）：
//   · 目标 2048、只比**最少步数**；
//   · 不写星级存档，只记录**最少步数**，越少越强。
var CHALLENGE = { target: 2048 };
var CHALLENGE_BEST_KEY = 'ww_g2048_challenge_best';

Page({
  data: {
    curLevel: 1,
    target: 32,
    par: 24,          // 3★ 参考步数（不判负，只评星）
    stepsLimit: 0,    // 恒为 0：已取消步数上限（保留字段给端到端脚本/旧存档读取）
    levelInfo: [],
    playing: false,
    cells: [],       // 4x4 扁平 [{v}]
    score: 0,
    usedSteps: 0,
    maxTile: 2,
    over: false,
    win: false,
    challenge: false,        // 是否挑战模式（冲 2048，只比最少步数）
    challengeBest: 0,        // 挑战模式最佳步数（0 = 还没通关过）
    bestMsText: '',          // 本关最快用时文案（关卡页/结算显示）
    tipText: '',             // 底部操作提示（关卡模式带 3★ 基准步数）
    stars: 0,
    starsText: '',
    overMsg: '',
    hintText: ''
  },

  onLoad: function (options) {
    this.setData({ levelInfo: LEVELS });
    this.setData({ challengeBest: storage.get(CHALLENGE_BEST_KEY) || 0 });
    var cur = storage.get('ww_g2048_cur') || 1;
    if (cur > LEVELS.length) cur = LEVELS.length;
    // 数字智力关卡页可以指定从第几关进（?level=N）
    var want = parseInt((options || {}).level, 10) || 0;
    if (want >= 1 && want <= LEVELS.length) cur = want;
    this.loadLevel(cur);
  },

  _start: function (no) {
    var lv = LEVELS[no - 1];
    this._board = game.newBoard();
    this.setData({
      curLevel: no, target: lv.target, par: lv.par, stepsLimit: 0, challenge: false,
      playing: true, over: false, win: false,
      cells: this._flatten(this._board),
      score: 0, usedSteps: 0, maxTile: 2, stars: 0, starsText: '',
      tipText: '👆 滑动合成 · ' + lv.par + ' 步内拿 3★'
    });
  },

  /** 挑战模式：目标 2048，只比最少步数 */
  startChallenge: function () {
    this._board = game.newBoard();
    this.setData({
      curLevel: 0, target: CHALLENGE.target, par: 0, stepsLimit: 0, challenge: true,
      playing: true, over: false, win: false,
      cells: this._flatten(this._board),
      score: 0, usedSteps: 0, maxTile: 2, stars: 0, starsText: '',
      tipText: '👆 滑动合成 · 冲到 2048，只比谁用得更少',
      challengeBest: storage.get(CHALLENGE_BEST_KEY) || 0
    });
    wx.showToast({ title: '挑战模式：冲 2048，只比最少步数', icon: 'none', duration: 1800 });
  },

  loadLevel: function (no) {
    if (no > LEVELS.length) { this.setData({ playing: false }); return; }
    var prevBest = puzProgress.bestMsOf('g2048', no);
    this.setData({ bestMsText: prevBest ? ('本关最快 ' + (prevBest / 1000).toFixed(1) + ' 秒') : '' });
    this._levelStartAt = Date.now();
    this._start(no);
  },

  _flatten: function (b) {
    return b.reduce(function (acc, row) { return acc.concat(row.map(function (v) { return { v: v }; })); }, []);
  },

  // 触摸滑动（2026-09-12：方向键按钮已去掉，滑动成为唯一操作）
  _startX: 0, _startY: 0,
  onTouchStart: function (e) {
    var t = e.touches && e.touches[0];
    if (t) { this._startX = t.clientX; this._startY = t.clientY; }
  },
  // 空实现：配合 wxml 的 catchtouchmove 阻止页面跟着手指滚（竖滑才不会丢手感）
  onTouchMove: function () {},
  onTouchEnd: function (e) {
    var ch = e.changedTouches && e.changedTouches[0];
    if (!ch) return;
    var dx = ch.clientX - this._startX;
    var dy = ch.clientY - this._startY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) this._move(dx > 0 ? 1 : 3);
    else this._move(dy > 0 ? 2 : 0);
  },

  _move: function (d) {
    if (!this.data.playing || this.data.over) return;
    var r = game.slide(this._board, d);
    if (!r.moved) return;
    this._board = r.board;
    var usedSteps = this.data.usedSteps + 1;
    var score = this.data.score + r.gained;
    var flat = this._flatten(this._board);
    var maxTile = Math.max(this.data.maxTile, flat.reduce(function (m, c) { return Math.max(m, c.v); }, 0));
    this.setData({ cells: flat, score: score, usedSteps: usedSteps, maxTile: maxTile });

    if (maxTile >= this.data.target) { this._win(); return; }
    // 2026-10-18：步数不再判负 —— 只有棋盘无路可走才结束本局
    if (r.gameover) this._lose(true);
  },

  _win: function () {
    // 挑战模式：不写星级存档，只记「最少步数」
    if (this.data.challenge) {
      var used = this.data.usedSteps;
      var prevBest = storage.get(CHALLENGE_BEST_KEY) || 0;
      var best = (prevBest > 0 && prevBest < used) ? prevBest : used;
      storage.set(CHALLENGE_BEST_KEY, best);
      this.setData({
        playing: false, over: true, win: true, stars: 0, starsText: '🏆',
        challengeBest: best,
        overMsg: '冲到 2048 用了 ' + used + ' 步 · 最佳 ' + best + ' 步'
      });
      return;
    }
    // 星级（2026-10-18 改）：相对 3★ 参考步数，≤1 倍 3★ / ≤1.5 倍 2★ / 其余 1★
    var par = this.data.par || 0;
    var ratio = par > 0 ? this.data.usedSteps / par : 1;
    var stars = ratio <= 1 ? 3 : (ratio <= 1.5 ? 2 : 1);
    storage.saveStars('g2048', this.data.curLevel, stars);
    // 玩法进度榜上报（2026-09-13 补）：这一款原来不上报，玩法榜里永远空着
    playReport.reportPlay({
      gameType: 'g2048',
      grade: 'all',
      level: this.data.curLevel,
      score: this.data.maxTile || 0,
      stars: stars,
      maxCombo: 0
    });
    // 关卡进度 + 最短用时（本机）：通关才算，取历史最快
    var usedMs = Date.now() - (this._levelStartAt || Date.now());
    puzProgress.markCleared('g2048', this.data.curLevel);
    var isNewBest = puzProgress.setBestMs('g2048', this.data.curLevel, usedMs);
    var bestMs = puzProgress.bestMsOf('g2048', this.data.curLevel);
    var bestText = ' · 用时 ' + (usedMs / 1000).toFixed(1) + ' 秒'
      + (bestMs ? '（最快 ' + (bestMs / 1000).toFixed(1) + ' 秒' + (isNewBest ? ' · 新纪录！' : '）') : '）');
    this.setData({ bestMsText: '本关最快 ' + (bestMs / 1000).toFixed(1) + ' 秒' });
    var next = Math.min(this.data.curLevel + 1, LEVELS.length);
    storage.set('ww_g2048_cur', next);
    this.setData({
      playing: false, over: true, win: true, stars: stars, starsText: '⭐'.repeat(stars),
      overMsg: '达成 ' + this.data.target + '！用了 ' + this.data.usedSteps + ' 步（3★ 基准 ' + par + ' 步）' + bestText,
      hintText: ''
    });
  },

  _lose: function (stuck) {
    this.setData({
      playing: false, over: true, win: false, stars: 0, starsText: '',
      overMsg: stuck ? '棋盘满了 · 没有可走的路了' : '这一局结束了',
      hintText: '还差 ' + Math.max(0, this.data.target - this.data.maxTile) + ' 就到目标 ' + this.data.target
    });
  },

  again: function () { this.loadLevel(this.data.curLevel); },
  goNext: function () {
    // 挑战模式没有「下一关」，重开一次挑战即可
    if (this.data.challenge) { this.startChallenge(); return; }
    var n = Math.min(this.data.curLevel + 1, LEVELS.length);
    storage.set('ww_g2048_cur', n);
    this.loadLevel(n);
  },
  goLevels: function () {
    this.setData({
      playing: false, over: false,
      challengeBest: storage.get(CHALLENGE_BEST_KEY) || 0
    });
  },
  pickLevel: function (e) {
    var no = e.currentTarget.dataset.no;
    if (no > (storage.get('ww_g2048_cur') || 1) && no > this.data.curLevel && this.data.curLevel < no - 1) {
      // 未解锁：仅允许顺序挑战
    }
    this.loadLevel(no);
  },

  goBack: function () { wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 2048 闯关', path: '/pages/playlist/playlist' };
  }
});
