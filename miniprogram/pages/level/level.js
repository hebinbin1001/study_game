// 关卡选择页逻辑（T14 · 题型分类）
//
// 职责：
//   1. 渲染 7 学段 tab + 题型分类 chips（综合/单词/填空/词语/成语/歇后语）+ 关卡网格
//   2. onShow 读取星级存档更新视图（REQ-GAME-13）
//   3. 点击关卡判断解锁，未解锁抖动提示/登录引导（REQ-GAME-14）
//   4. 分类维度独立存档：grade@<type>@level；「综合」沿用旧 grade_level（兼容历史存档）
//   5. 选中关卡携带「学段 + 关卡 + 分类」参数进入游戏页
//
// 关联需求：REQ-DICT-1、REQ-GAME-13、REQ-GAME-14、REQ-GUEST-1

var constants = require('../../utils/constants');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var auth = require('../../utils/auth');

// 每学段关卡数
var LEVELS_PER_GRADE = 10;

// 默认解锁关卡数：1~3 关（含游客）默认开放；第 4 关起需登录且逐关通关解锁
var DEFAULT_UNLOCKED = 3;

// ===== M7 Phase B：蛇形路径地图布局（2 列；O1 自适应，行距/节点随可用高度收缩） =====
var NODE_SIZE_MAX = 150;     // 节点圆直径上限（rpx）
var MAP_COL_X = [150, 548];  // 左右两列中心 x
var MAP_TOP = 52;            // 首行节点中心 y（兜底）
var MAP_ROW = 216;           // 行距（中心间距，兜底）
var MAP_HEIGHT = 1020;       // 地图容器高度（rpx，实际运行时动态传入）

/**
 * 由关卡数据生成蛇形地图节点与连线（纯展示派生，不改 levels 语义）。
 * @param {Array} levels 关卡列表
 * @param {number} mapHeightRpx 地图可用高度(rpx)：行距/节点尺寸按可用高自适应（O1）
 * 节点状态：done(已通关,金色✔)/cur(首个可挑战,呼吸“继续”)/lock(灰锁+条件小字)。
 * 连线点亮 = 该段起点关卡已通关。
 */
function buildMapData(levels, mapHeightRpx) {
  var nodes = [];
  var segs = [];
  var curIdx = -1;
  for (var i = 0; i < levels.length; i++) {
    if (curIdx === -1 && levels[i].unlocked && !levels[i].stars) curIdx = i;
  }
  var rows = Math.ceil(levels.length / 2);
  // 可用高：优先传入值；兜底旧常量（行数×行距 + 顶部留白）
  var availH = mapHeightRpx || (MAP_TOP + rows * MAP_ROW + 80);
  // 行距均分可用高（首行留半个行距），节点直径随行距收缩（上限 NODE_SIZE_MAX、下限 96）
  var rowGap = availH / rows;
  var nodeSize = Math.min(NODE_SIZE_MAX, Math.max(96, Math.round(rowGap * 0.72)));
  var half = nodeSize / 2;
  var topStart = Math.round(rowGap / 2);
  for (var i = 0; i < levels.length; i++) {
    var it = levels[i];
    var row = Math.floor(i / 2);
    var col = i % 2;
    var cx = MAP_COL_X[col];
    var cy = topStart + row * rowGap;
    var state = (it.stars > 0) ? 'done' : ((i === curIdx) ? 'cur' : 'lock');
    nodes.push({
      index: i,
      level: it.level,
      left: Math.round(cx - half),
      top: Math.round(cy - half),
      size: nodeSize,
      state: state,
      stars: it.stars || 0,
      badge: it.badge || '',
      lockTip: (state === 'lock') ? (it.needLogin ? '登录解锁' : '通关上一关解锁') : '',
      shaking: false
    });
  }
  for (var i = 0; i < levels.length - 1; i++) {
    var a = nodes[i];
    var b = nodes[i + 1];
    var dx = b.left + half - (a.left + half);
    var dy = b.top + half - (a.top + half);
    var len = Math.sqrt(dx * dx + dy * dy);
    var rot = Math.atan2(dy, dx) * 180 / Math.PI;
    segs.push({
      index: i,
      x1: a.left + half,            // 线段左端（节点中心）
      y1: a.top + half,
      len: Math.round(len),
      rot: rot.toFixed(1),
      on: !!levels[i].stars         // 起点已通关 → 该段点亮
    });
  }
  return { nodes: nodes, segs: segs };
}

Page({
  data: {
    grades: [],             // 学段列表（来自 GRADES，REQ-DICT-1）
    currentGradeIndex: 0,   // 当前选中的学段下标
    typeGroups: [],         // 题型分类 chips（{ key,label,count }，仅含可用分类，综合恒在）
    currentType: 'all',     // 当前题型分类 key（'all' = 综合）
    currentTypeLabel: '',   // 当前分类 label（供卡片徽标/进度文案，综合为空）
    levels: [],             // 当前学段的关卡卡片数据
    loggedIn: false,        // 登录态（未登录可玩前 3 关）
    gradeEarnedStars: 0,    // 进度卡：当前分类已得星星数
    gradeTotalStars: 30,    // 进度卡：星星总数（10 关 × 3 星）
    gradeStarPercent: 0     // 进度卡：星星进度百分比 0~100
  },

  onLoad: function () {
    // 初始化学段列表（7 个学段，REQ-DICT-1）
    this.setData({ grades: constants.GRADES });
    this.refreshLevels();
  },

  onShow: function () {
    // 从游戏页/登录返回后刷新星级与登录态（REQ-GAME-13、M5）
    this.refreshLevels();
  },

  // 切换学段 tab（REQ-DICT-1）
  pickGrade: function (e) {
    var index = e.currentTarget.dataset.index;
    if (index === this.data.currentGradeIndex) return;
    this.setData({ currentGradeIndex: index });
    this.refreshLevels();
  },

  // 切换题型分类 chip
  pickType: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.currentType) return;
    var groups = this.data.typeGroups || [];
    var label = '';
    var count = 0;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].key === key) { label = groups[i].label; count = groups[i].count; break; }
    }
    // 可用但不足一关（1..9 题）：提示且不切换
    if (key !== 'all' && count > 0 && count < 10) {
      wx.showToast({ title: '该学段「' + (label || key) + '」仅 ' + count + ' 题，暂不满一关', icon: 'none', duration: 1500 });
      return;
    }
    this.setData({ currentType: key });
    this.refreshLevels();
  },

  // 刷新当前学段 + 分类的关卡卡片数据（REQ-GAME-13/14、游客限制、分类维度）
  refreshLevels: function () {
    var grade = this.data.grades[this.data.currentGradeIndex];
    if (!grade) return;
    var key = grade.key;
    var loggedIn = auth.isLoggedIn();
    var self = this;

    // ① 分类可用性：题量 > 0 才展示（综合恒展示）
    var counts = {};
    var typeGroups = [];
    for (var g = 0; g < constants.TYPE_GROUPS.length; g++) {
      var grp = constants.TYPE_GROUPS[g];
      var n = dict.filterByGroup(key, grp.key).length;
      counts[grp.key] = n;
      if (grp.key === 'all' || n > 0) {
        typeGroups.push({ key: grp.key, label: grp.label, count: n });
      }
    }
    // ② 当前分类在切换学段后不可用 → 回退综合
    var typeKey = this.data.currentType;
    if (typeKey !== 'all' && !counts[typeKey]) typeKey = 'all';
    var typeLabel = '';
    for (var t = 0; t < constants.TYPE_GROUPS.length; t++) {
      if (constants.TYPE_GROUPS[t].key === typeKey) { typeLabel = constants.TYPE_GROUPS[t].label; break; }
    }
    // 综合不传 typeKey → storage 沿用旧 key（兼容历史存档）
    var typeArg = (typeKey === 'all') ? undefined : typeKey;

    // ③ 关卡卡数据
    var levels = [];
    var gradeEarnedStars = 0;
    for (var i = 1; i <= LEVELS_PER_GRADE; i++) {
      var stars = storage.getStars(key, i, typeArg);
      gradeEarnedStars += stars;
      // 解锁规则：1~DEFAULT_UNLOCKED 默认开放（游客同享）；其后登录用户过一关解锁一关；游客 4+ 需登录
      var needLogin = !loggedIn && i > DEFAULT_UNLOCKED;
      var unlocked = (i <= DEFAULT_UNLOCKED) ||
        (loggedIn && storage.isLevelUnlocked(key, i, typeArg));
      levels.push({
        level: i,
        stars: stars,
        starArr: [stars >= 1, stars >= 2, stars >= 3],
        unlocked: unlocked,
        needLogin: needLogin,
        badge: (typeKey === 'all') ? '' : typeLabel, // 分类徽标（卡片左上角小标）
        shaking: false
      });
    }

    // ④ 本分类星星进度
    var gradeTotalStars = LEVELS_PER_GRADE * 3;
    var gradeStarPercent = gradeTotalStars > 0
      ? Math.round(gradeEarnedStars / gradeTotalStars * 100)
      : 0;

    // ⑤ 蛇形路径地图派生数据（M7 Phase B；O1：按可用高度自适应）
    var mapH = this._calcMapHeightRpx();
    var map = buildMapData(levels, mapH);

    this.setData({
      typeGroups: typeGroups,
      currentType: typeKey,
      currentTypeLabel: typeLabel,
      levels: levels,
      mapNodes: map.nodes,
      mapSegs: map.segs,
      mapHeight: Math.round(mapH),
      loggedIn: loggedIn,
      gradeEarnedStars: gradeEarnedStars,
      gradeTotalStars: gradeTotalStars,
      gradeStarPercent: gradeStarPercent
    });
  },

  /**
   * O1：计算关卡地图可用高度(rpx) = 视口高 - 页面上方固定块(标题/游客横幅/学段/题型/进度卡)
   * - 页下方（自定义关卡入口）与安全区也扣除；结果夹在 [min, max]，
   *   保证矮屏地图能一屏（行距收缩），超高屏不至于拉得过松。
   */
  _calcMapHeightRpx: function () {
    if (!this._win) {
      var win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this._win = win;
    }
    var winH = this._win.windowHeight;      // px
    var winW = this._win.windowWidth;       // px
    // 750rpx = 屏宽 → rpx/px = 750/winW
    var rpp = 750 / winW;                    // rpx per px
    var viewportRpx = winH * rpp;

    var loggedIn = auth.isLoggedIn();
    // 上方固定内容（rpx 估算，含各块间距）
    var above = 30    // page padding
      + 100           // 标题区（title+sub+间距）
      + (loggedIn ? 0 : 100)  // 游客横幅
      + 96            // 学段 tab
      + 96            // 题型 chips
      + 150;          // 星星进度卡
    var below = 130   // 自定义关卡入口 + 底部
      + 30;           // 底部安全余量
    var h = viewportRpx - above - below;
    return Math.max(560, Math.min(h, 1400));
  },

  // 点击关卡卡片
  onLevelTap: function (e) {
    var index = e.currentTarget.dataset.index;
    var card = this.data.levels[index];
    if (!card) return;

    // 未解锁：区分「游客需登录」与「前关未通」（REQ-GAME-14 / M5 REQ-GUEST-1）
    if (!card.unlocked) {
      this.shakeCard(index);
      if (card.needLogin) {
        var self = this;
        auth.promptLogin('登录后可继续解锁更多关卡').then(function (user) {
          if (user) self.refreshLevels();
        });
      } else {
        wx.showToast({ title: '通关上一关即可解锁本关', icon: 'none', duration: 1200 });
      }
      return;
    }

    // 已解锁：携带学段 + 关卡（+ 分类）参数进入游戏页
    var grade = this.data.grades[this.data.currentGradeIndex];
    var url = '/pages/game/game?grade=' + grade.key + '&level=' + card.level;
    if (this.data.currentType && this.data.currentType !== 'all') {
      url += '&type=' + this.data.currentType;
    }
    wx.navigateTo({ url: url });
  },

  // 触发节点抖动动画（REQ-GAME-14；锁定/登录引导时点击）
  shakeCard: function (index) {
    var key = 'mapNodes[' + index + '].shaking';
    var on = {};
    on[key] = true;
    this.setData(on);
    var self = this;
    setTimeout(function () {
      var off = {};
      off[key] = false;
      self.setData(off);
    }, 400);
  },

  // 游客横幅点击：登录解锁第 4 关及以后
  guestLogin: function () {
    var self = this;
    auth.promptLogin('登录后可继续解锁第 4 关及以后关卡').then(function (user) {
      if (user) self.refreshLevels();
    });
  },

  // 进入自定义关卡编辑器（M3）
  goCustomLevel: function () {
    wx.navigateTo({ url: '/pages/level-editor/level-editor' });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  },

  // 页面分享（M5 P4）
  onShareAppMessage: function () {
    return {
      title: '词力战士 - 来挑战我的关卡吧',
      path: '/pages/index/index'
    };
  }
});
