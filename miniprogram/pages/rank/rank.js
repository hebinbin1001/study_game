// 排行榜页（rank）—— B3 双榜：总榜(星星) / 按玩法·闯关进度
// 总榜：/api/ranklist/world（全服按累计星星）+ /api/ranklist/me
// 玩法榜：/api/ranklist/progress?game=&grade=&type=（进度优先；字词按学段+题型）
var request = require('../../utils/request');
var constants = require('../../utils/constants');
// 段位徽章（大段 8 枚）+ 头像兜底（2026-09-13 用户反馈）
var rankBadge = require('../../utils/rank-badge');
// M5 T2.3：受限页直入门禁（未登录不拉数据，页内引导登录）
var auth = require('../../utils/auth');

var PAGE_SIZE = 50;

Page({
  data: {
    mode: 'total',             // 'total' | 'game'
    // 总榜
    totalList: [],
    totalMe: null,
    totalCount: 0,
    // 玩法榜
    gameList: [],
    gameMe: null,
    gameCount: 0,
    gameLoading: false,
    totalLoading: false,
    // 玩法筛选 chips
    gameChips: [
      // 2026-09-13：玩法进度榜补全 —— 每个已开放玩法一款（key 是后端 scores.game_type）
      // needGrade=true 的（字词类）才按学段+题型过滤，数字智力类统一用 grade='all'
      { key: 'word', label: '📚 词汇', game: 'word_warrior', needGrade: true, on: true, ready: true },
      { key: 'word_build', label: '🔤 拼词', game: 'word_build', needGrade: true, on: false, ready: true },
      { key: 'idiom', label: '🀄 成语', game: 'idiom', needGrade: true, on: false, ready: true },
      { key: 'match', label: '🃏 消消乐', game: 'match', needGrade: true, on: false, ready: true },
      { key: 'link', label: '🔗 连连看', game: 'link', needGrade: true, on: false, ready: true },
      { key: 'snake', label: '🐍 贪吃蛇', game: 'snake', needGrade: true, on: false, ready: true },
      { key: 'math24', label: '🧮 24点', game: 'math24', needGrade: false, on: false, ready: true },
      { key: 'sudoku', label: '🔢 数独', game: 'sudoku', needGrade: false, on: false, ready: true },
      { key: 'memory', label: '🔲 记忆', game: 'memory', needGrade: false, on: false, ready: true },
      { key: 'sprint', label: '⚡ 口算', game: 'sprint', needGrade: false, on: false, ready: true },
      { key: 'balance', label: '⚖️ 天平', game: 'balance', needGrade: false, on: false, ready: true },
      { key: 'g2048', label: '🎲 2048', game: 'g2048', needGrade: false, on: false, ready: true },
      { key: 'onestroke', label: '✏️ 一笔画', game: 'onestroke', needGrade: false, on: false, ready: true },
      { key: 'klotski', label: '🧩 华容道', game: 'klotski', needGrade: false, on: false, ready: true }
    ],
    curGame: 'word',
    // 字词榜的学段 + 题型筛选（玩法榜=word 时显示）
    grades: [],
    curGradeIndex: 0,
    curGradeKey: '',
    types: [],
    curType: 'all',
    // M5 T2.3 门禁：未登录（直接 URL 进来）时展示引导条，不发请求
    needLogin: false,
    gateText: ''
  },

  onLoad: function () {
    if (!auth.requireLogin(this, '登录后成绩才会入榜，才能查看排行榜')) return;
    var grades = constants.GRADES || [];
    var types = [{ key: 'all', label: '综合' }].concat(
      (constants.TYPE_GROUPS || []).filter(function (t) { return t.key !== 'all'; }).map(function (t) {
        return { key: t.key, label: t.label };
      })
    );
    var curGradeKey = grades.length ? grades[0].key : '';
    this.setData({ grades: grades, curGradeKey: curGradeKey, types: types });
    this.loadTotal();
    this.loadGame();
  },

  onShow: function () {
    if (!auth.requireLogin(this, '登录后成绩才会入榜，才能查看排行榜')) return;
    this.loadTotal();
    if (this.data.mode === 'game') this.loadGame();
  },

  /** 门禁引导条「去登录」：成功后按 onLoad 原路径重新初始化并加载 */
  onGateLogin: function () {
    var self = this;
    auth.loginFromGate(this, function () {
      self.onLoad();
    }, '登录后成绩才会入榜，才能查看排行榜').then(function (user) {
      if (!user && typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '登录后才能查看排行榜', icon: 'none' });
      }
    });
  },

  switchMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode: mode });
    if (mode === 'total' && !this.data.totalList.length) this.loadTotal();
    if (mode === 'game' && !this.data.gameList.length) this.loadGame();
  },

  pickGame: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.curGame) return;
    var chip = this.data.gameChips.find(function (c) { return c.key === key; });
    if (!chip || !chip.ready) {
      wx.showToast({ title: key === 'sudoku' ? '数独榜上线中' : '该玩法即将上线', icon: 'none' });
      return;
    }
    this.setData({
      curGame: key,
      gameChips: this.data.gameChips.map(function (c) { return Object.assign({}, c, { on: c.key === key }); })
    });
    this.loadGame();
  },

  pickGrade: function (e) {
    var idx = e.currentTarget.dataset.index;
    if (idx === this.data.curGradeIndex) return;
    this.setData({ curGradeIndex: idx, curGradeKey: this.data.grades[idx].key });
    this.loadGame();
  },

  pickType: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.curType) return;
    this.setData({ curType: key });
    this.loadGame();
  },

  // ===== 总榜（星星）=====
  loadTotal: function () {
    var self = this;
    self.setData({ totalLoading: true });
    Promise.all([
      request.get('/api/ranklist/world?page=1&pageSize=' + PAGE_SIZE),
      request.get('/api/ranklist/me')
    ]).then(function (r) {
      var list = (r[0].list || []).map(function (it) { return self._decorate(it, it.stars, '⭐'); });
      self.setData({
        totalList: list,
        totalCount: r[0].total || 0,
        totalMe: r[1] ? Object.assign({}, r[1], { val: r[1].stars, unit: '⭐' }) : null,
        totalLoading: false
      });
    }).catch(function () { self.setData({ totalLoading: false }); });
  },

  // ===== 玩法进度榜 =====
  loadGame: function () {
    var self = this;
    self.setData({ gameLoading: true });
    // ⚠️ 原来这里写死 game=word_warrior —— 玩法榜永远只显示字母射击（用户反馈「好多玩法进度都没做」）
    var chip = (this.data.gameChips || []).filter(function (c) { return c.key === self.data.curGame; })[0];
    var game = (chip && chip.game) || 'word_warrior';
    var needGrade = !!(chip && chip.needGrade);
    self.setData({ curGameNeedGrade: needGrade });   // wxml 据此决定是否显示学段/题型筛选
    var grade = needGrade ? this.data.curGradeKey : 'all';
    var type = needGrade ? this.data.curType : 'all';
    var url = '/api/ranklist/progress?game=' + game + '&grade=' + grade +
      '&type=' + type + '&pageSize=' + PAGE_SIZE;
    request.get(url).then(function (d) {
      if (!d) return;
      var list = (d.list || []).map(function (it) {
        return self._decorate(it, '第 ' + it.maxLevel + ' 关', '进度 · ' + it.passedLevels + ' 关');
      });
      self.setData({
        gameList: list,
        gameCount: d.total || 0,
        gameMe: d.me ? self._decorate(d.me, '第 ' + d.me.maxLevel + ' 关', '进度') : null,
        gameLoading: false
      });
    }).catch(function () { self.setData({ gameLoading: false }); });
  },

  _decorate: function (it, valText, subText) {
    return {
      rank: it.rank,
      openid: it.openid,
      nickname: it.nickname || '未命名',
      avatarUrl: it.avatarUrl || '',
      rankName: it.rankName || '',
      // 名称前的两个位置：头像 + 段位徽章（头像缺失时用昵称首字兜底）
      rankIcon: rankBadge.badgeUrl(it.rankName),
      initial: String(it.nickname || '?').slice(0, 1),
      stars: it.stars || 0,
      valText: valText,
      subText: subText
    };
  },

  getRankClass: function (rank) {
    if (rank === 1) return 'top1';
    if (rank === 2) return 'top2';
    if (rank === 3) return 'top3';
    return '';
  },
  getRankEmoji: function (rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  },

  goBack: function () { wx.navigateBack(); },

  // M5 T4.1：排行榜分享（邀好友来比一比）
  onShareAppMessage: function () {
    return {
      title: '词力战士 - 排行榜等你来冲，看看谁是字词王者',
      path: '/pages/index/index'
    };
  }
});
