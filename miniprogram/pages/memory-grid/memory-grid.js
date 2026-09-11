// 记忆矩阵（玩法落地：demo g7）——亮格记忆，程序生成关卡，与词库无关
// 规则：亮起 N 格 → 熄灭 → 凭记忆点出；点错扣命（3 命）并把正确答案标出来；
// 全对过关，逐关多亮一格、展示更短。进度本地存档（固定玩法不计入字词进度）。
var lib = require('../../game/memory-grid');
var storage = require('../../utils/storage');

Page({
  data: {
    lives: 3,
    score: 0,
    scoreText: '分',
    hudText: '',
    cells: [],          // [{cls}]
    phase: 'watch',     // watch 观察 / play 作答 / reveal 揭晓
    mainText: '',
    subText: '',
    locked: true,
    settle: false,
    win: false,
    starsText: '',
    overMsg: ''
  },

  _level: 1,
  _lives: 3,
  _score: 0,
  _targets: [],
  _found: {},
  _timers: [],

  onLoad: function () { this.start(); },
  onUnload: function () { this._clearTimers(); },
  onHide: function () { this._clearTimers(); },

  _clearTimers: function () {
    this._timers.forEach(function (t) { clearTimeout(t); });
    this._timers = [];
  },
  _later: function (fn, ms) { this._timers.push(setTimeout(fn, ms)); },

  start: function () {
    this._level = 1;
    this._lives = 3;
    this._score = 0;
    this.setData({ settle: false, win: false, starsText: '', overMsg: '' });
    this._startLevel();
  },

  _buildCells: function () {
    var arr = [];
    for (var i = 0; i < lib.GRID; i++) arr.push({ cls: '' });
    return arr;
  },

  _startLevel: function () {
    this._clearTimers();
    this._found = {};
    this._targets = lib.pickTargets(lib.targetCount(this._level), lib.GRID);
    var cells = this._buildCells();
    this._targets.forEach(function (i) { cells[i].cls = 'lit'; });

    this.setData({
      cells: cells,
      phase: 'watch',
      locked: true,
      lives: this._lives,
      score: this._score,
      hudText: '第 ' + this._level + ' 关',
      mainText: '记住 ' + this._targets.length + ' 个亮格',
      subText: '约 ' + (lib.showMs(this._level) / 1000).toFixed(1) + ' 秒后消失'
    });

    var self = this;
    this._later(function () {
      var cleared = self._buildCells();
      self.setData({
        cells: cleared,
        phase: 'play',
        locked: false,
        mainText: '点出刚才亮过的格子',
        subText: '还需点出 ' + self._targets.length + ' 个'
      });
    }, lib.showMs(this._level));
  },

  tapCell: function (e) {
    if (this.data.locked) return;
    var idx = e.currentTarget.dataset.idx;
    if (this._found[idx]) return;

    if (this._targets.indexOf(idx) !== -1) {
      this._found[idx] = true;
      var patch = {};
      patch['cells[' + idx + '].cls'] = 'found';
      var left = this._targets.length - Object.keys(this._found).length;
      patch.subText = left > 0 ? ('还需点出 ' + left + ' 个') : '全部找对！';
      this.setData(patch);
      if (left === 0) this._levelClear();
      return;
    }

    // 点错：扣命 + 把正确格标出来，让玩家看清
    this._lives--;
    var self = this;
    var patch2 = {};
    patch2['cells[' + idx + '].cls'] = 'wrong';
    this._targets.forEach(function (i) {
      if (!self._found[i]) patch2['cells[' + i + '].cls'] = 'reveal';
    });
    patch2.locked = true;
    patch2.phase = 'reveal';
    patch2.lives = this._lives;
    patch2.mainText = '粉色就是刚才亮起的格子';
    patch2.subText = '剩余命数 ' + Math.max(0, this._lives);
    this.setData(patch2);

    this._later(function () {
      if (self._lives <= 0) { self._finish(); return; }
      self._startLevel();   // 同一关重来
    }, 1500);
  },

  _levelClear: function () {
    var self = this;
    this._score += 10;
    this.setData({
      locked: true,
      phase: 'reveal',
      score: this._score,
      mainText: '第 ' + this._level + ' 关通过！',
      subText: '准备下一关（格更多、时间更短）'
    });
    this._later(function () {
      self._level++;
      self._startLevel();
    }, 900);
  },

  _finish: function () {
    this._clearTimers();
    var cleared = this._level - 1;
    var stars = lib.starsFor(cleared);
    var best = storage.get('ww_memory_best') || 0;
    if (cleared > best) { best = cleared; storage.set('ww_memory_best', best); }
    this.setData({
      locked: true,
      settle: true,
      win: stars >= 1,
      starsText: stars > 0 ? '⭐'.repeat(stars) : '',
      overMsg: '通过 ' + cleared + ' 关 · 最高纪录 ' + best + ' 关\n总分 ' + this._score
    });
  },

  onRetry: function () { this.start(); },
  goBack: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '词力战士 - 记忆矩阵', path: '/pages/playlist/playlist' };
  }
});
