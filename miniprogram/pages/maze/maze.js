// 词义迷宫：门必须答完才开出口；星按正确率；题目取当前学段词库。
var maze = require('../../game/maze');
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var storage = require('../../utils/storage');
var skins = require('../../utils/skins');
var progress = require('../../utils/puzzle-progress');
var playReport = require('../../utils/play-report');
var challenge = require('../../utils/challenge');
var resume = require('../../utils/puzzle-resume');

var PAGE = 'maze';

// 棋盘 654rpx = 109rpx × 6，宽度整除
var BOARD_W = 654;
var LIFE_MAX = 3;

Page({
  data: {
    paused: false,          // 暂停弹层（game-pause 组件）
    levelText: '1/30',
    gateText: '0/0',
    hearts: '❤️❤️❤️',
    pct: 0,
    stepText: '0',
    bannerMain: '',
    bannerSub: '',
    fb: '',
    gradeLabel: '',
    size: maze.SIZE,
    boardW: BOARD_W,
    cellW: Math.floor(BOARD_W / maze.SIZE),
    cells: [],
    ask: false,
    askTitle: '',
    askPrompt: '',
    askText: '',
    askOptions: [],
    askTip: '',
    askTipCls: '',
    settle: false,
    win: false,
    starsText: '',
    overTitle: '',
    overMsg: '',
    overHint: '',
    showNext: false
  },

  _lv: 1,
  _seed: 0,
  _g: null,
  _pos: 0,
  _steps: 0,
  _lives: LIFE_MAX,
  _gateState: {},     // 门 idx → 0 未答 / 1 答对 / 2 答错
  _chestOpen: {},     // 宝箱 idx → 1 已开
  _visited: {},
  _qs: {},            // 题目缓存（同一局同一门永远是同一道）
  _asking: null,
  _locked: false,
  _hero: '⚔️',
  _gradeKey: 'kg',
  _gradeLabel: '幼儿园',
  _pool: [],
  _timer: null,

  onLoad: function (options) {
    var want = parseInt((options || {}).level, 10) || 0;
    this._loadWordPool();
    try {
      var w = skins.getWarriorSkin(storage.getWarriorSkin() || '');
      if (w && w.emoji) this._hero = w.emoji;
    } catch (e) { /* 皮肤模块异常不该挡玩法 */ }
    // 恢复必须连 seed 一起还原
    var snap = resume.load(PAGE);
    if (snap && (!want || snap.level === want) && this._restore(snap)) return;
    this.start(want >= 1 ? want : 1);
  },

  /** 当前学段词库；不足 8 条时并入全部学段，保证四选一有干扰项 */
  _loadWordPool: function () {
    var key = storage.getLastGrade() || 'kg';
    var grades = constants.GRADES || [];
    var label = '';
    for (var i = 0; i < grades.length; i++) {
      if (grades[i].key === key) { label = grades[i].label; break; }
    }
    this._gradeKey = key;
    this._gradeLabel = label || '幼儿园';
    var list = [];
    try { list = dict.loadByGrade(key) || []; } catch (e) { list = []; }
    if (list.length < 8) {
      list = [];
      grades.forEach(function (g) {
        try { list = list.concat(dict.loadByGrade(g.key) || []); } catch (e) { /* 跳过坏库 */ }
      });
    }
    this._pool = list;
    this.setData({ gradeLabel: this._gradeLabel });
  },
  onUnload: function () { this._clearTimer(); this._saveProgress(); },
  onHide: function () { this._clearTimer(); this._saveProgress(); },

  // ============ 断点续玩（2026-10-18） ============
  /** 恢复 seed/位置/步数/命/门状态/缓存题目 */
  _restore: function (snap) {
    var self = this;
    var st = snap && snap.state;
    if (!st) return false;
    var lv = parseInt(st.lv, 10);
    if (!(lv >= 1 && lv <= maze.TOTAL_LEVELS)) return false;
    var seed = parseInt(st.seed, 10);
    if (!(seed > 0)) return false;
    var g;
    try { g = maze.gen(lv, seed); } catch (e) { resume.clear(PAGE); return false; }
    var pos = parseInt(st.pos, 10);
    if (!(pos >= 0 && pos < g.cells.length)) { resume.clear(PAGE); return false; }

    this._lv = lv;
    this._seed = seed;
    this._g = g;
    this._pos = pos;
    this._steps = parseInt(st.steps, 10) || 0;
    this._lives = Math.max(1, Math.min(LIFE_MAX, parseInt(st.lives, 10) || LIFE_MAX));
    this._gateState = (st.gateState && typeof st.gateState === 'object') ? st.gateState : {};
    g.gateIds.forEach(function (i) {
      if (!(self._gateState[i] >= 1)) self._gateState[i] = 0;
    });
    this._chestOpen = (st.chestOpen && typeof st.chestOpen === 'object') ? st.chestOpen : {};
    this._qs = (st.qs && typeof st.qs === 'object') ? st.qs : {};
    this._visited = (st.visited && typeof st.visited === 'object') ? st.visited : {};
    this._visited[pos] = 1;
    this._asking = null;
    this._locked = false;

    this.setData({
      settle: false, win: false, starsText: '', overTitle: '', overMsg: '', overHint: '', showNext: false,
      ask: false, fb: '',
      gradeLabel: this._gradeLabel,
      levelText: lv + '/' + maze.TOTAL_LEVELS,
      bannerMain: (parseInt(st.steps, 10) || 0) > 0 ? '接着上次走 · 答完门再出口' : '答完所有门，出口才会开',
      bannerSub: this._gradeLabel + '词库 · ' + g.gateIds.length + ' 道门 · 答对 ≥60%'
    });
    this._paint();
    wx.showToast({ title: '已恢复上次进度 · 第 ' + lv + ' 关 · ' + this._steps + ' 步', icon: 'none', duration: 1600 });
    return true;
  },

  /** 把当前局面写进断点存档（每走一格 / 答完一题都写） */
  _saveProgress: function () {
    if (this.data.settle || !this._g) return;
    resume.save(PAGE, this._lv, {
      lv: this._lv,
      seed: this._seed,
      pos: this._pos,
      steps: this._steps,
      lives: this._lives,
      gateState: this._gateState,
      chestOpen: this._chestOpen,
      qs: this._qs,
      visited: this._visited
    });
  },

  _clearTimer: function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  },

  /** 开始某一关（重玩换 seed → 换一张迷宫） */
  start: function (no) {
    var self = this;
    this._clearTimer();
    resume.clear(PAGE);                 // 主动开新局 → 旧断点作废（重玩换 seed，旧档已对不上）
    var lv = parseInt(no, 10) || 1;
    if (lv < 1) lv = 1;
    if (lv > maze.TOTAL_LEVELS) lv = maze.TOTAL_LEVELS;
    this._lv = lv;
    this._seed = (((Date.now() & 0x7fffffff) ^ (lv * 7919)) >>> 0) || 1;
    this._g = maze.gen(lv, this._seed);
    this._pos = this._g.start;
    this._steps = 0;
    this._lives = LIFE_MAX;
    this._gateState = {};
    this._g.gateIds.forEach(function (i) { self._gateState[i] = 0; });
    this._chestOpen = {};
    this._qs = {};
    this._asking = null;
    this._locked = false;
    this._visited = {};
    this._visited[this._g.start] = 1;

    this.setData({
      settle: false, win: false, starsText: '', overTitle: '', overMsg: '', overHint: '', showNext: false,
      ask: false, fb: '',
      gradeLabel: this._gradeLabel,
      levelText: lv + '/' + maze.TOTAL_LEVELS,
      bannerMain: '答完所有门，出口才会开',
      bannerSub: this._gradeLabel + '词库 · 共 ' + this._g.gateIds.length + ' 道门 · 答对 ≥60%'
    });
    this._paint();
  },

  /** 重画棋盘 + HUD（每次移动后调一次，36 个格子开销很小） */
  _paint: function () {
    var self = this;
    var g = this._g;
    var right = 0;
    var attempted = 0;
    g.gateIds.forEach(function (i) {
      if (self._gateState[i] === 1) right++;
      if (self._gateState[i] === 1 || self._gateState[i] === 2) attempted++;
    });
    var total = g.gateIds.length;
    var allAttempted = attempted >= total;

    var cells = g.cells.map(function (c, i) {
      var w = maze.wallFlags(c);
      var cls = '';
      if (self._visited[i]) cls += ' seen';
      if (i === self._pos) cls += ' cur';

      var ico = '';
      if (i === self._pos) ico = self._hero;
      else if (c.kind === 'end') ico = allAttempted ? '🏁' : '🔒';
      else if (c.kind === 'start') ico = '🚩';
      else if (c.kind === 'gate') ico = self._gateState[i] === 1 ? '✅' : (self._gateState[i] === 2 ? '❌' : '🚪');
      else if (c.kind === 'chest') ico = self._chestOpen[i] ? '✨' : '🎁';

      if (c.kind === 'gate' && self._gateState[i] !== 1 && self._gateState[i] !== 2) cls += ' gate-lock';
      return { kn: w.n, ke: w.e, ks: w.s, kw: w.w, cls: cls, ico: ico };
    });

    this.setData({
      cells: cells,
      pct: total ? Math.round(right / total * 100) : 0,
      gateText: attempted + '/' + total,
      hearts: '❤️'.repeat(Math.max(0, this._lives)) + '🤍'.repeat(Math.max(0, LIFE_MAX - this._lives)),
      stepText: String(this._steps),
      bannerMain: allAttempted ? '出口已开 · 走到 🏁' : '答完所有门，出口才会开',
      bannerSub: allAttempted
        ? ('答对 ' + right + '/' + total + ' 道门 · 走到出口')
        : ('已答 ' + attempted + '/' + total + ' 道 · 答对 ' + right + ' 道')
    });
  },

  /** 点格子：只能走到已打通的相邻格 */
  tapCell: function (e) {
    if (this._locked || this.data.ask || this.data.settle) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    if (!(idx >= 0 && idx < this._g.cells.length)) return;
    if (idx === this._pos) return;

    if (!maze.canMove(this._g.cells, this._pos, idx)) {
      // 撞墙：轻轻提示一下就够，不扣机会（否则误触的代价太大）
      this.setData({ bannerMain: '这面有墙', bannerSub: '换一个相邻的格子试试', fb: 'bad' });
      return;
    }

    this._pos = idx;
    this._steps++;
    this._visited[idx] = 1;

    var cell = this._g.cells[idx];
    this.setData({ fb: '' });
    this._saveProgress();               // 走一格就存（走进终点会被 _finish 清掉，不留残局）

    if (cell.kind === 'gate' && !this._gateState[idx]) {
      this._askFor('gate', idx);
      return;
    }
    if (cell.kind === 'chest' && !this._chestOpen[idx]) {
      this._chestOpen[idx] = 1;
      this._askFor('chest', idx);
      return;
    }
    if (cell.kind === 'end') {
      var attempted = 0;
      var self = this;
      this._g.gateIds.forEach(function (i) {
        if (self._gateState[i] === 1 || self._gateState[i] === 2) attempted++;
      });
      if (attempted < this._g.gateIds.length) {
        this._paint();
        this.setData({
          bannerMain: '出口还锁着',
          bannerSub: '还有 ' + (this._g.gateIds.length - attempted) + ' 道门没答',
          fb: 'bad'
        });
        return;
      }
      this._paint();
      this._finish(true);
      return;
    }
    this._paint();
  },

  /** 打开答题浮层（题目按 seed + 格子号懒生成并缓存，同一局重进同一格题不变） */
  _askFor: function (kind, idx) {
    var key = kind + ':' + idx;
    if (!this._qs[key]) {
      var salt = kind === 'chest' ? 7717 : 13;
      this._qs[key] = maze.genWordQuestion(
        this._lv,
        (this._seed + idx * 104729 + salt) >>> 0,
        this._pool
      );
    }
    var q = this._qs[key];
    if (!q) {
      wx.showToast({ title: '词库不足，请先切换学段', icon: 'none' });
      return;
    }
    this._asking = { kind: kind, idx: idx };
    this.setData({
      ask: true,
      askTitle: kind === 'chest' ? '宝箱 · 答对回一次机会' : ('第 ' + (this._gateNo(idx)) + ' 道门'),
      askPrompt: q.prompt,
      askText: q.text,
      askOptions: q.options.map(function (o) { return { v: o.v, cls: '' }; }),
      askTip: '答错扣 1 次机会',
      askTipCls: ''
    });
  },

  /** 门在本关里的序号（1 起，按主路径先后） */
  _gateNo: function (idx) {
    var at = this._g.gateIds.indexOf(idx);
    return at < 0 ? 1 : at + 1;
  },

  tapAnswer: function (e) {
    if (this._locked || !this._asking) return;
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var key = this._asking.kind + ':' + this._asking.idx;
    var q = this._qs[key];
    if (!q || !(idx >= 0 && idx < q.options.length)) return;

    this._locked = true;
    var ok = !!q.options[idx].ok;
    var self = this;
    var tip;
    var tipCls = ok ? 'good' : 'bad';

    if (ok) {
      if (this._asking.kind === 'gate') {
        this._gateState[this._asking.idx] = 1;
        tip = '答对了 · 这道门打开';
      } else {
        var reopened = this._reopenFailedGates();
        this._lives = Math.min(LIFE_MAX, this._lives + 1);
        tip = reopened > 0
          ? '宝箱里是一块橡皮：' + reopened + ' 道答错的门可以重答了'
          : '答对了 · 机会 +1';
      }
    } else {
      this._lives--;
      if (this._asking.kind === 'gate') this._gateState[this._asking.idx] = 2;
      tip = this._lives > 0 ? ('答错了 · 正确答案：' + q.answer) : '机会用完了';
    }

    this.setData({
      askOptions: q.options.map(function (o, i) {
        var cls = '';
        if (o.ok) cls = 'ok';
        else if (i === idx) cls = 'bad';
        return { v: o.v, cls: cls };
      }),
      askTip: tip,
      askTipCls: tipCls
    });

    var wait = ok ? 850 : 1250;
    this._timer = setTimeout(function () {
      self._timer = null;
      self._locked = false;
      self.setData({ ask: false });
      self._asking = null;
      self._saveProgress();             // 答题结果（门开/扣命）也要落盘
      if (self._lives <= 0) { self._finish(false); return; }
      self._paint();
      // 站在终点（宝箱/门正好在终点格？不会，但兜底）
      if (self._pos === self._g.end) self._finish(true);
    }, wait);
  },

  /** 把答错的门恢复成"未答"（宝箱的橡皮擦） */
  _reopenFailedGates: function () {
    var n = 0;
    for (var k in this._gateState) {
      if (this._gateState[k] === 2) { this._gateState[k] = 0; n++; }
    }
    return n;
  },

  /** 结算：走到出口 or 机会耗尽 */
  _finish: function (reached) {
    this._clearTimer();
    resume.clear(PAGE);                 // 这一局结束了（通关或机会耗尽），断点作废
    this._locked = true;
    var self = this;
    var g = this._g;
    var right = 0;
    g.gateIds.forEach(function (i) { if (self._gateState[i] === 1) right++; });
    var total = g.gateIds.length;
    var stars = reached && this._lives > 0 ? challenge.starsByRightRate(right, total) : 0;
    var win = stars >= 1;
    var last = this._lv >= maze.TOTAL_LEVELS;

    if (win) progress.markCleared('maze', this._lv);
    storage.saveStars('maze', this._lv, stars);
    playReport.reportPlay({
      gameType: 'maze',
      grade: 'all',
      level: this._lv,
      score: this._lv,
      stars: stars,
      correct: right,
      total: total,
      maxCombo: 0
    });

    var msg;
    if (!reached) {
      msg = '机会用完了 · 答对 ' + right + '/' + total + ' 道门';
    } else {
      msg = '第 ' + this._lv + ' 关 · 答对 ' + right + '/' + total + ' 道门 · ' + this._steps + ' 步';
    }

    this.setData({
      settle: true,
      win: win,
      starsText: win ? '⭐'.repeat(stars) : '',
      overTitle: win ? (last ? '全部通关！' : '走出迷宫！') : (reached ? '还差一点' : '机会用完了'),
      overMsg: msg,
      overHint: reachHint(right, total, reached, this._lives),
      showNext: win && !last
    });
  },

  onNext: function () {
    if (this._lv < maze.TOTAL_LEVELS) this.start(this._lv + 1);
  },
  onRetry: function () { this.start(this._lv); },
  noop: function () { },

  onShareAppMessage: function () {
    return { title: '词力战士 - 词义迷宫', path: '/pages/playlist/playlist' };
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

/**
 * 「差一点」提示。
 * 迷宫和找规律不同：没答完门也会走到出口，所以这里要说清"为什么没星"。
 */
function reachHint(right, total, reached, lives) {
  if (!reached) return '机会用完了，再试一次吧';
  var need = Math.ceil(total * 0.6);
  if (right < need) return '答对 ' + right + '/' + total + '，需要达到 60% 才能过关';
  return '';
}
