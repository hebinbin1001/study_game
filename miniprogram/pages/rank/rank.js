// 排行榜页（rank）—— 双榜：总榜（星星）/ 玩法榜（闯关进度）
//
// 2026-09-18 改版（用户反馈「玩法进度向右超出边界 + 显示不太友好」）：
//   原来玩法榜是一行平铺 14 个玩法 chips —— 既没有换行也没套滚动容器，把页面顶宽了；
//   而且平铺也看不出每个玩法各自的情况。现在改成**两层**：
//     · 总览：14 张玩法卡片（图标 / 玩法名 / 我的进度 / 榜首 / 参与人数）
//     · 详情：点卡片进入该玩法的完整榜（字词类才有学段 + 题型筛选）
//   总览数据用批量接口 /api/ranklist/progress-summary（逐玩法调 /progress 要发 14 个请求）。
var request = require('../../utils/request');
var constants = require('../../utils/constants');
// 段位徽章（大段 8 枚）+ 头像兜底（2026-09-13 用户反馈）
var rankBadge = require('../../utils/rank-badge');
// M5 T2.3：受限页直入门禁（未登录不拉数据，页内引导登录）
var auth = require('../../utils/auth');

var PAGE_SIZE = 50;

// 玩法元信息（唯一数据源）：key = 页面内标识，game = 后端 scores.game_type
// needGrade=true 的字词类玩法才按学段 + 题型过滤；数字智力类统一 grade='all'
var GAME_META = [
  { key: 'word', label: '字母射击', icon: '🔫', game: 'word_warrior', needGrade: true },
  { key: 'word_build', label: '字母拼词工坊', icon: '🔤', game: 'word_build', needGrade: true },
  { key: 'idiom', label: '成语拼字', icon: '🀄', game: 'idiom', needGrade: true },
  { key: 'match', label: '词义消消乐', icon: '🃏', game: 'match', needGrade: true },
  { key: 'link', label: '词语连连看', icon: '🔗', game: 'link', needGrade: true },
  { key: 'snake', label: '单词贪吃蛇', icon: '🐍', game: 'snake', needGrade: true },
  { key: 'math24', label: '算 24 点', icon: '🧮', game: 'math24', needGrade: false },
  { key: 'sudoku', label: '数独', icon: '🔢', game: 'sudoku', needGrade: false },
  { key: 'sprint', label: '口算冲刺', icon: '⚡', game: 'sprint', needGrade: false },
  { key: 'balance', label: '算式天平', icon: '⚖️', game: 'balance', needGrade: false },
  { key: 'g2048', label: '2048', icon: '🎲', game: 'g2048', needGrade: false },
  { key: 'memory', label: '记忆矩阵', icon: '🔲', game: 'memory', needGrade: false },
  { key: 'onestroke', label: '一笔画', icon: '✏️', game: 'onestroke', needGrade: false },
  { key: 'klotski', label: '华容道', icon: '🧩', game: 'klotski', needGrade: false }
];

function metaOfGame(gameType) {
  for (var i = 0; i < GAME_META.length; i++) {
    if (GAME_META[i].game === gameType) return GAME_META[i];
  }
  return null;
}

function metaOfKey(key) {
  for (var i = 0; i < GAME_META.length; i++) {
    if (GAME_META[i].key === key) return GAME_META[i];
  }
  return null;
}

Page({
  data: {
    mode: 'total',             // 'total' | 'game'
    // 总榜
    totalList: [],
    totalMe: null,
    totalCount: 0,
    totalLoading: false,
    needNickname: false,       // 没设昵称 → 不上榜（2026-09-19）
    // 玩法榜
    gameView: 'overview',      // 'overview'（玩法卡片总览）| 'detail'（某玩法完整榜）
    summaryList: [],           // 总览卡片
    summaryLoading: false,
    gameList: [],
    gameMe: null,
    gameCount: 0,
    gameLoading: false,
    curGame: 'word',
    curGameLabel: '',
    curGameIcon: '',
    curGameNeedGrade: false,
    // 字词榜的学段 + 题型筛选（详情视图里字词类才显示）
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
    this.loadSummary();
  },

  onShow: function () {
    if (!auth.requireLogin(this, '登录后成绩才会入榜，才能查看排行榜')) return;
    this.loadTotal();
    if (this.data.mode !== 'game') return;
    if (this.data.gameView === 'detail') this.loadGame();
    else this.loadSummary();
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
    if (mode === 'total') {
      if (!this.data.totalList.length) this.loadTotal();
    } else {
      // 每次切回玩法榜都回到总览（避免停在上次的详情里）
      this.setData({ gameView: 'overview' });
      this.loadSummary();
    }
  },

  // ===== 玩法榜：总览 =====
  loadSummary: function () {
    var self = this;
    self.setData({ summaryLoading: true });
    request.get('/api/ranklist/progress-summary').then(function (d) {
      var rows = (d && d.list) || [];
      // 后端按 SUMMARY_GAMES 顺序返回；这里补上端上的图标/名称/是否有学段维度
      var list = rows.map(function (it) {
        var meta = metaOfGame(it.game) || { label: it.game, icon: '🎮', needGrade: false, key: it.game };
        return {
          key: meta.key,
          game: it.game,
          label: meta.label,
          icon: meta.icon,
          players: it.players || 0,
          champion: it.champNickname || '',
          championValue: it.champValue || 0,
          myValue: it.myValue || 0,
          myRank: it.myRank || 0,
          hasMe: (it.myValue || 0) > 0
        };
      });
      self.setData({ summaryList: list, summaryLoading: false });
    }).catch(function () { self.setData({ summaryLoading: false }); });
  },

  /** 点玩法卡片 → 进该玩法的完整榜 */
  openGameDetail: function (e) {
    var key = e.currentTarget.dataset.key;
    var meta = metaOfKey(key);
    if (!meta) return;
    this.setData({
      gameView: 'detail',
      curGame: key,
      curGameLabel: meta.label,
      curGameIcon: meta.icon,
      curGameNeedGrade: !!meta.needGrade
    });
    this.loadGame();
  },

  /** 详情 → 回玩法总览 */
  backToOverview: function () {
    this.setData({ gameView: 'overview' });
    this.loadSummary();
  },

  /**
   * 左上角按钮：玩法详情里 = 回总览；其余 = 返回上一页。
   * 为什么不直接在 wxml 里写动态事件名：静态点击护栏（e2e/check-taps.js）解析不了
   * `bindtap="{{...}}"` 这种表达式，会误判成「绑定了不存在的方法」。
   */
  onBackTap: function () {
    if (this.data.mode === 'game' && this.data.gameView === 'detail') {
      this.backToOverview();
      return;
    }
    this.goBack();
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
        // /api/ranklist/me 返回 null = 还没设昵称（未完成注册）→ 提示去设置
        needNickname: !r[1],
        totalLoading: false
      });
    }).catch(function () { self.setData({ totalLoading: false }); });
  },

  // ===== 玩法进度榜（详情） =====
  loadGame: function () {
    var self = this;
    var meta = metaOfKey(this.data.curGame) || GAME_META[0];
    var needGrade = !!meta.needGrade;
    self.setData({ gameLoading: true, curGameNeedGrade: needGrade });
    var grade = needGrade ? this.data.curGradeKey : 'all';
    var type = needGrade ? this.data.curType : 'all';
    var url = '/api/ranklist/progress?game=' + meta.game + '&grade=' + grade +
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

  /** 没设昵称的用户：引导去「编辑资料」设置昵称（设置后即可上榜） */
  goSetNickname: function () {
    wx.navigateTo({ url: '/pages/nickname/nickname' });
  },

  // M5 T4.1：排行榜分享（邀好友来比一比）
  onShareAppMessage: function () {
    return {
      title: '词力战士 - 排行榜等你来冲，看看谁是字词王者',
      path: '/pages/index/index'
    };
  }
});
