// 单词贪吃蛇（B6-6 重做 · 成熟玩法版）
//
// 规则（对齐成熟案例《单词贪吃蛇》：给目标单词→蛇按顺序吃到该词字母拼完过关）：
//   - 每轮给出一个「目标词」（英文词 + 中文释义），顶部显示拼写进度
//   - 网格上散布字母食物：含「当前需要拼的下一字母」与干扰字母
//   - 蛇吃到「当前应拼字母」→ 记入拼写（+分、蛇 +1 格、刷新该字母食物），继续拼下一个字母
//   - 蛇吃到干扰字母 → 扣 1 命（该食物作废）；撞墙/撞身 → 扣 1 命
//   - 拼完当前词 → 换下一个目标词；共拼完 WORDS_PER_ROUND 个词即通关
//   - 3 命用尽则结束；按正确命中率/剩余命给 1-3 星
// 触屏：相对转向 —— 以蛇头朝向为中心线，点左/右侧拐 90°、点正前方直行、点正后不掉头（无实体方向键，也不支持滑动）。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var storage = require('../../utils/storage');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var playReport = require('../../utils/play-report');

var GRADES = (constants.GRADES || []).filter(function (g) { return g.key !== 'college'; });
var SIZE = 10;
// 移动节奏（毫秒/步）：原来 300ms（每秒 3.3 步）对玩家太快——还没反应过来就撞了。
// 用户反馈后放慢到 450ms（每秒约 2.2 步），并加一个开局缓冲（见 _startLoop）留出反应时间。
var TICK = 450;
// 开局缓冲：进入对局后先静止这么久再开始移动，避免"一开局就被推着走"
var START_GRACE = 900;
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
    targetLabel: '',     // 第 x/y 词
    challenge: false,    // 是否挑战主线关卡
    challengeKey: ''     // 挑战存档键（调试/测试可见）
  },

  onLoad: function (options) {
    var opt = options || {};
    // 挑战主线（P2）：学段与词数按关卡参数固定，取词用关卡种子（同一关每次同一套词）
    this._challenge = String(opt.challenge) === '1';
    this._gradeKey = opt.grade || '';
    this._level = parseInt(opt.level, 10) || 0;
    this._roundWordCount = WORDS_PER_ROUND;
    this._rng = null;
    this._challengeKey = '';
    if (this._challenge) {
      var lv = challenge.levelAt(this._gradeKey, this._level);
      if (lv) this._roundWordCount = challenge.paramsOf(this._gradeKey, lv.mode).words || WORDS_PER_ROUND;
      this._rng = rng.makeRng(parseInt(opt.seed, 10) || challenge.seedOf(this._gradeKey, this._level));
      this._challengeKey = this._gradeKey + '@' + challenge.STAR_KEY + '@' + this._level;
    }
    this.setData({ challenge: this._challenge, challengeKey: this._challengeKey });
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
    this._graceUntil = Date.now() + START_GRACE;   // 开局缓冲：先给玩家反应时间再起步
    this._startLoop();
  },

  _newSnake: function () {
    return [{ r: 5, c: 3 }, { r: 5, c: 2 }, { r: 5, c: 1 }];
  },

  _loadWords: function () {
    // 挑战关卡：学段由关卡参数固定；自由玩：随机学段
    var grade = this._challenge ? this._gradeByKey(this._gradeKey) : null;
    if (!grade) grade = GRADES[Math.floor(Math.random() * GRADES.length)];
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

  /** 学段 key → 学段对象（挑战模式用） */
  _gradeByKey: function (key) {
    for (var i = 0; i < constants.GRADES.length; i++) {
      if (constants.GRADES[i].key === key) return constants.GRADES[i];
    }
    return null;
  },

  _pickRoundWords: function () {
    // 挑战关卡：打乱走关卡种子（同一关词序一致）
    var pool = this._challenge ? rng.shuffle(this._words, this._rng) : this._shuffle(this._words);
    var need = Math.min(this._roundWordCount || WORDS_PER_ROUND, pool.length);
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
    // 开局缓冲：先静静等一拍再起步（_graceUntil 由 startGame/重开设置）
    var now = Date.now();
    var wait = (this._graceUntil && this._graceUntil > now) ? (this._graceUntil - now) : 0;
    this._timer = setTimeout(function () {
      self._timer = setInterval(function () { self._tick(); }, TICK);
    }, wait);
  },
  _stopLoop: function () {
    // _timer 可能是 interval（正常步进）也可能是 timeout（开局缓冲等待中），两个都清
    if (this._timer) { clearInterval(this._timer); clearTimeout(this._timer); this._timer = null; }
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

    // 撞墙改为「穿到对面」（用户反馈：撞墙直接扣命太挫败，穿墙更友好也更好操作）
    nr = (nr + SIZE) % SIZE;
    nc = (nc + SIZE) % SIZE;
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
    else {
      this._stopLoop();
      this._snake = this._newSnake();
      this._dir = 1;
      this._spawnFoods(true);
      this._graceUntil = Date.now() + START_GRACE;
      this._startLoop();
    }
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
    var stars = challenge.starsByLives(this._lives);
    if (this._score > this.data.best) storage.set('ww_snake_best', this._score);
    var best = Math.max(this.data.best, this._score);
    this.setData({
      over: true, win: true, starText: '⭐'.repeat(stars),
      score: this._score, best: best,
      tip: '拼完 ' + this._roundWords.length + ' 词 · 得分 ' + this._score
    });
    // 挑战关卡：写挑战星级（自由玩不写进度）
    if (this._challenge && this._gradeKey && this._level) {
      storage.saveStars(this._gradeKey, this._level, stars, challenge.STAR_KEY);
    }
    // 上报本局成绩（game_type=snake）：挑战与自由玩都报，玩法进度榜/玩法成就都按它统计
    playReport.reportPlay({
      gameType: challenge.gameTypeOf('snake'),
      grade: (this._challenge && this._gradeKey) ? this._gradeKey : 'all',
      level: (this._challenge && this._level) ? this._level : this._roundWords.length,
      score: this._score,
      correct: this._roundWords.length,
      total: this._roundWords.length,
      stars: stars
    });
  },

  _end: function () {
    this._stopLoop();
    var best = Math.max(this.data.best, this._score);
    if (this._score > this.data.best) storage.set('ww_snake_best', this._score);
    this.setData({ over: true, win: false, starText: '', score: this._score, best: best, tip: '生命耗尽 · 拼了 ' + this._wordIdx + '/' + this._roundWords.length + ' 词' });
  },

  // ===== 触屏控制 =====
  /**
   * 点格子转向 —— **相对转向**（用户 2026-09-12 拍板：以蛇头为中心线，点左右 = 转 90°）。
   *
   * 规则（把「蛇头 → 被点格子」的向量，投影到蛇头朝向轴上判断）：
   *   · 点在前方 ±45° 内           → 直行，不改朝向
   *   · 点在前/后 ±45°~135° 之间   → 朝**被点的那一侧拐 90°**（新朝向 = 点的那一侧）
   *   · 点在正后方 ±135° 以外      → 不掉头（保持当前朝向，避免直接撞上自己的身体）
   *   · 点蛇头自己                 → 忽略
   *
   * 实现要点：以蛇头朝向为基准算叉积（cross）与点积（dot），用 atan2(cross, dot) 得到
   * 点击相对朝向的夹角（-π~π）；cross > 0 表示点在左侧（左拐），cross < 0 表示右侧（右拐）。
   * 方向编号 0=上 1=右 2=下 3=左，左拐 = (d+3)%4、右拐 = (d+1)%4。
   *
   * 注意：这是「转向」而不是「指哪走哪」—— 点远处和点相邻格效果一样，
   * 玩家连点同一侧两次可以掉头（与改造前一致，_setDir 只拦单次 180°）。
   */
  onCellTap: function (e) {
    if (this.data.over) return;
    var idx = parseInt(e.currentTarget.dataset.i, 10);
    if (isNaN(idx) || !this._snake || !this._snake.length) return;
    var head = this._snake[0];
    var dr = Math.floor(idx / SIZE) - head.r;
    var dc = (idx % SIZE) - head.c;
    if (dr === 0 && dc === 0) return;              // 点的是蛇头自己，忽略

    var d = this._dir;
    var hr = d === 0 ? -1 : (d === 2 ? 1 : 0);     // 朝向向量（行方向：向上为负）
    var hc = d === 1 ? 1 : (d === 3 ? -1 : 0);     // 朝向向量（列方向：向右为正）
    var dot = hr * dr + hc * dc;                   // > 0：点在朝向的前方
    var cross = hr * dc - hc * dr;                 // > 0：点在朝向的左侧
    var ang = Math.atan2(cross, dot);              // 点击相对朝向的夹角，-π ~ π
    var Q = Math.PI / 4;

    if (ang > Q && ang <= 3 * Q) this._setDir((d + 3) % 4);        // 左侧 → 左拐 90°
    else if (ang < -Q && ang >= -3 * Q) this._setDir((d + 1) % 4); // 右侧 → 右拐 90°
    // 其余情况（前方 ±45° 内 / 后方 ±135° 以外）保持直行
  },

  // 说明：原滑动转向（onTouchStart/onTouchEnd）已按用户反馈移除 ——
  // 有了「点蛇头哪一侧就往哪边走」之后，滑动既多余又容易误触，只保留点击操控。
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
