// 单词贪吃蛇（B6-6 重做 · 成熟玩法版）
//
// 规则（对齐成熟案例《单词贪吃蛇》：给目标单词→蛇按顺序吃到该词字母拼完过关）：
//   - 每轮给出一个「目标词」（英文词 + 中文释义），顶部显示拼写进度
//   - 网格上散布字母食物：含「当前需要拼的下一字母」与干扰字母
//   - 蛇吃到「当前应拼字母」→ 记入拼写（+分、蛇 +1 格、刷新该字母食物），继续拼下一个字母
//   - 蛇吃到干扰字母 → 扣 1 命（该食物作废）；撞墙/撞身 → 扣 1 命
//   - 拼完当前词 → 换下一个目标词；共拼完 WORDS_PER_ROUND 个词即通关
//   - 3 命用尽则结束；按正确命中率/剩余命给 1-3 星
// 触屏：网格上滑动改变方向（无实体方向键）。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var storage = require('../../utils/storage');

var GRADES = (constants.GRADES || []).filter(function (g) { return g.key !== 'college'; });
var SIZE = 10;
var TICK = 300;
var LIVES = 3;
var FOOD_N = 4;             // 场上字母食物数（含应拼字母+干扰）
var WORDS_PER_ROUND = 5;    // 每局拼 5 个词即通关

/**
 * 目标词是否可直接按字母逐个拼写。
 * w2 的 q 含挖空占位符（'g*v*r*m*nt'）、fill 的 q 是整句、换行/空格等都不能拼，
 * 这些条目一旦成为目标词，就会出现「要求吃掉 * 这个字母」的荒谬局面。
 */
function isSpellableWord(w) {
  return !!w && /^[A-Za-z]+$/.test(String(w.q || ''));
}

Page({
  data: {
    cells: [],           // [{cls}]
    word: '',            // 当前目标词（英文）
    meaning: '',         // 目标词释义
    progress: [],        // 拼写进度 [{ch, done}]（done=已吃到）
    score: 0,
    lives: LIVES,
    over: false,
    win: false,
    tip: '',
    best: 0,
    starText: '',
    round: 0,            // 已拼完词数
    targetLabel: ''      // 第 x/y 词
  },

  onLoad: function () {
    this.startGame();
  },

  startGame: function () {
    var best = storage.get('ww_snake_best') || 0;
    this._words = this._loadWords();
    this._roundWords = this._pickRoundWords();
    this._score = 0;
    this._lives = LIVES;
    this._wordIdx = -1;
    this._snake = this._newSnake();
    this._dir = 1;
    this.setData({ best: best, score: 0, lives: LIVES, over: false, win: false, round: 0, starText: '' });
    this._nextWord();
    this._render();
    this._startLoop();
  },

  _newSnake: function () {
    return [{ r: 5, c: 3 }, { r: 5, c: 2 }, { r: 5, c: 1 }];
  },

  _loadWords: function () {
    var grade = GRADES[Math.floor(Math.random() * GRADES.length)];
    // 目标词必须能「按字母逐个拼写」，故只保留 q 为纯英文单词的条目。
    //
    // 踩坑记录（下面两种写法都不能用）：
    //   1. filterByGroup(grade, 'w1')：'w1' 是【类型码】不是【分组 key】。
    //      TYPE_GROUPS 的合法 key 只有 all/word/fill/wordCn/idiom/xhy，
    //      传未知 key 会命中 isItemInGroup 的「未知分组 → return true」兜底，
    //      静默放行整个学段词库，目标词会变成汉字/成语。
    //   2. filterByGroup(grade, 'word')：该分组含 w1+w2+trans+en，
    //      其中 w2 的 q 形如 'g*v*r*m*nt'（挖空占位符）、fill 的 q 是整句，
    //      都不是可逐字母拼写的目标词，会出现「要求吃掉 * 这个字母」的荒谬局面。
    // 因此按【类型】精确取 w1，并用纯英文字母串兜底校验。
    var all = dict.loadByGrade(grade.key).filter(function (w) {
      return w.type === 'w1' && isSpellableWord(w);
    });
    if (all.length < WORDS_PER_ROUND) {
      all = dict.filterByGroup(grade.key, 'word').filter(isSpellableWord);
    }
    return all;
  },

  _pickRoundWords: function () {
    var pool = this._shuffle(this._words);
    var need = Math.min(WORDS_PER_ROUND, pool.length);
    var out = [];
    for (var i = 0; i < need; i++) out.push({ en: (pool[i].q || pool[i].a), zh: pool[i].hint || pool[i].q || '' });
    return out;
  },

  _shuffle: function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },

  _nextWord: function () {
    this._wordIdx++;
    if (this._wordIdx >= this._roundWords.length) { this._win(); return; }
    var w = this._roundWords[this._wordIdx];
    this._curEn = w.en;
    this._curZh = w.zh;
    this._needIdx = 0;                       // 当前要拼第几个字母
    this._foods = [];
    this.setData({
      word: this._curEn,
      meaning: this._curZh,
      round: this._wordIdx + 1,
      targetLabel: '第 ' + (this._wordIdx + 1) + '/' + this._roundWords.length + ' 词',
      progress: this._curEn.split('').map(function (ch) { return { ch: ch.toUpperCase(), done: false }; })
    });
    this._spawnFoods(true);
    this._render();
  },

  // 生成字母食物：1 个=当前应拼字母（可多个同字母？用 FOOD_N 格：确保含 need 字母 + 干扰字母）
  _spawnFoods: function (force) {
    if (force) this._foods = [];
    var needCh = this._curEn.charAt(this._needIdx).toUpperCase();
    var occupied = {};
    this._snake.forEach(function (s) { occupied[s.r * SIZE + s.c] = 1; });
    this._foods.forEach(function (f) { occupied[f.i] = 1; });
    var empty = [];
    for (var i = 0; i < SIZE * SIZE; i++) if (!occupied[i]) empty.push(i);
    if (empty.length < FOOD_N) return;

    // 已有 need 字母食物则不重复放
    var hasNeed = this._foods.some(function (f) { return f.ch === needCh && !f.eaten; });
    var pool = empty.slice();
    function pick() { var k = Math.floor(Math.random() * pool.length); return pool.splice(k, 1)[0]; }

    if (!hasNeed) this._foods.push({ i: pick(), ch: needCh, eaten: false, isNeed: true });
    // 干扰字母（大小写随机，避开 need）
    var others = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(function (c) { return c !== needCh; });
    var seen = {};
    while (this._foods.length < FOOD_N && pool.length) {
      var c = others[Math.floor(Math.random() * others.length)];
      if (seen[c]) continue; seen[c] = 1;
      this._foods.push({ i: pick(), ch: c, eaten: false, isNeed: false });
    }
    this._render();
  },

  _startLoop: function () {
    var self = this;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(function () { self._tick(); }, TICK);
  },
  _stopLoop: function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },
  onUnload: function () { this._stopLoop(); },
  onHide: function () { this._stopLoop(); },
  onShow: function () {
    if (!this._timer && this.data.round > 0 && !this.data.over) this._startLoop();
  },

  _tick: function () {
    if (this.data.over) { this._stopLoop(); return; }
    var head = this._snake[0];
    var nr = head.r, nc = head.c;
    var d = this._dir;
    if (d === 0) nr--;
    else if (d === 1) nc++;
    else if (d === 2) nr++;
    else nc--;

    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) { this._hurt('撞墙'); return; }
    var nkey = nr * SIZE + nc;
    var bodyHit = this._snake.some(function (s) { return s.r === nr && s.c === nc; });
    if (bodyHit) { this._hurt('撞到自己'); return; }

    // 是否踩到食物
    var fi = -1;
    for (var i = 0; i < this._foods.length; i++) {
      if (this._foods[i].i === nkey) { fi = i; break; }
    }
    if (fi >= 0) {
      var food = this._foods[fi];
      var needCh = this._curEn.charAt(this._needIdx).toUpperCase();
      if (food.ch === needCh && !food.eaten) {
        // 吃到应拼字母：记入拼写 + 得分 + 蛇长 + 前进
        food.eaten = true;
        this._foods.splice(fi, 1);
        this._snake.unshift({ r: nr, c: nc }); // 生长（不 pop）
        this._score += 5;
        this._needIdx++;
        // 更新进度展示
        var prog = this.data.progress.map(function (p, pi) { p.done = pi < this._needIdx ? true : p.done; return p; }, this);
        this.setData({ score: this._score, progress: prog });
        if (this._needIdx >= this._curEn.length) {
          // 拼完一词
          this._snake.pop(); // 拼完则不再长，收尾
          this._render();
          wx.showToast({ title: '✅ 拼出 ' + this._curEn, icon: 'none' });
          var self = this;
          setTimeout(function () {
            self._snake = self._newSnake();
            self._dir = 1;
            self._nextWord();
            self._spawnFoods(true);
            self._render();
          }, 700);
          return;
        }
        // 继续下一个字母：补食物
        this._spawnFoods(false);
        this._render();
        return;
      }
      // 干扰字母：扣命 + 移除
      this._foods.splice(fi, 1);
      this._snake.unshift({ r: nr, c: nc });
      this._snake.pop();
      this._lives--;
      this.setData({ lives: this._lives });
      wx.showToast({ title: '吃错字母「' + food.ch + '」', icon: 'none' });
      if (this._lives <= 0) { this._end(); return; }
      this._spawnFoods(false);
      this._render();
      return;
    }

    // 普通前进
    this._snake.unshift({ r: nr, c: nc });
    this._snake.pop();
    this._render();
  },

  _hurt: function (why) {
    this._lives--;
    this.setData({ lives: this._lives });
    wx.showToast({ title: why + ' · 命-1', icon: 'none' });
    if (this._lives <= 0) this._end();
    else { this._stopLoop(); this._snake = this._newSnake(); this._dir = 1; this._spawnFoods(true); this._startLoop(); }
  },

  _render: function () {
    var cells = new Array(SIZE * SIZE);
    for (var i = 0; i < cells.length; i++) cells[i] = { cls: '' };
    this._snake.forEach(function (s, idx) {
      var c = cells[s.r * SIZE + s.c];
      c.cls = idx === 0 ? 'head' : 'body';
    });
    this._foods.forEach(function (f) {
      var c = cells[f.i];
      c.cls = f.eaten ? '' : (f.isNeed ? 'food-ok' : 'food-bad');
      c.ch = f.eaten ? '' : f.ch;
    });
    this.setData({ cells: cells });
  },

  _win: function () {
    this._stopLoop();
    var stars = this._lives === 3 ? 3 : (this._lives === 2 ? 2 : 1);
    if (this._score > this.data.best) storage.set('ww_snake_best', this._score);
    var best = Math.max(this.data.best, this._score);
    this.setData({
      over: true, win: true, starText: '⭐'.repeat(stars),
      score: this._score, best: best,
      tip: '拼完 ' + this._roundWords.length + ' 词 · 得分 ' + this._score
    });
  },

  _end: function () {
    this._stopLoop();
    var best = Math.max(this.data.best, this._score);
    if (this._score > this.data.best) storage.set('ww_snake_best', this._score);
    this.setData({ over: true, win: false, starText: '', score: this._score, best: best, tip: '生命耗尽 · 拼了 ' + this._wordIdx + '/' + this._roundWords.length + ' 词' });
  },

  // ===== 触屏控制 =====
  onTouchStart: function (e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    this._tx = t.clientX; this._ty = t.clientY;
  },
  onTouchEnd: function (e) {
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t || this._tx === undefined) return;
    var dx = t.clientX - this._tx, dy = t.clientY - this._ty;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    this._tx = this._ty = undefined;
    if (adx < 18 && ady < 18) return; // 点按不转向
    this._setDir(adx > ady ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  },
  _setDir: function (d) {
    if ((this._dir + d) % 2 === 0) return;
    this._dir = d;
    this.setData({ dir: d });
  },

  again: function () { this.startGame(); },
  goBack: function () { this._stopLoop(); wx.navigateBack(); },
  onShareAppMessage: function () {
    return { title: '词力战士 - 单词贪吃蛇', path: '/pages/playlist/playlist' };
  }
});
