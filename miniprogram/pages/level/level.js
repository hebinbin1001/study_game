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
var config = require('../../game/config');

// 关卡规模与默认解锁数：取自 utils/constants.js（与首页「继续挑战」共用同一口径，避免漂移）
var LEVELS_PER_GRADE = constants.LEVELS_PER_GRADE;
var DEFAULT_UNLOCKED = constants.DEFAULT_UNLOCKED_LEVELS;

// 闯关形态（经典/Boss/极速）：由「每关弹层」改为本页的模式栏 ——
// 形态本质是玩法的难度/节奏档，属于设置项，不该每关点一次。
var MODES = config.MODES;

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
    mode: 'classic',        // 当前闯关形态（记忆上次选择：ww_mode）
    modeOptions: [],        // 形态元数据（config.MODES）
    modeDesc: '',           // 当前形态的说明文案
    mapHeight: 620,         // 地图高度(rpx)：先给初值渲染，再由运行时实测校正
    gradeEarnedStars: 0,    // 进度卡：当前分类已得星星数
    gradeTotalStars: 30,    // 进度卡：星星总数（10 关 × 3 星）
    gradeStarPercent: 0     // 进度卡：星星进度百分比 0~100
  },

  onLoad: function () {
    // 初始化学段列表（7 个学段，REQ-DICT-1）
    var mode = storage.getMode();
    this.setData({
      grades: constants.GRADES,
      mode: mode,
      modeOptions: MODES,
      modeDesc: this._modeDesc(mode)
    });
    this.refreshLevels();
  },

  // 取指定形态的说明文案（渲染在当前模式栏下方，帮助理解三种形态的差别）
  _modeDesc: function (key) {
    for (var i = 0; i < MODES.length; i++) {
      if (MODES[i].key === key) return MODES[i].desc || '';
    }
    return '';
  },

  // 切换闯关形态：写入本地（下次沿用），点关卡时随参数带进对局
  pickMode: function (e) {
    var key = e.currentTarget.dataset.mode;
    if (!key || key === this.data.mode) return;
    storage.setMode(key);
    this.setData({ mode: key, modeDesc: this._modeDesc(key) });
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
    // 先用当前高度渲染一版（首屏不闪），渲染完成后再由 _syncMapHeight 实测校正
    var mapH = this.data.mapHeight || 620;
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

    // 渲染完成后实测真实可用高度（onLoad 阶段量不到元素 rect）
    if (typeof wx !== 'undefined' && wx.nextTick) {
      wx.nextTick(function () { self._syncMapHeight(); });
    }
  },

  // 首次渲染完成后也实测一次（refreshLevels 在 onLoad 里跑，那时还没有 rect）
  onReady: function () {
    this._syncMapHeight();
  },

  /**
   * O1：同步关卡地图高度 —— **运行时实测，不做常量估算**。
   *
   * 为什么不用「累加各块 rpx 高度」的估算：那是猜。各块真实高度会随机型、系统字体缩放、
   * 文案长度变化（实际就踩过：形态模式栏按 96rpx 估、实测 152rpx，直接把地图挤出屏幕）。
   *
   * 现在的算法：
   *   地图可用高 = 视口高 - 地图上方实际内容底边 - 下方入口实际高度 - 间距余量
   * 换机型 / 改文案 / 加一行筛选都不需要再调常量。
   * 首帧（onLoad）量不到元素 rect，故由 refreshLevels 的 nextTick 与 onReady 各触发一次校正。
   */
  _syncMapHeight: function () {
    var self = this;
    if (!this._win) {
      this._win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    }
    var win = this._win;
    var rpp = 750 / win.windowWidth;   // rpx per px
    var gapRpx = 40;                   // 地图与下方入口的间距 + 底部余量（rpx，随屏宽缩放）
    var gapPx = gapRpx / rpp;

    wx.createSelectorQuery().in(this)
      .select('.progress-card').boundingClientRect()
      .select('.custom-level-entry').boundingClientRect()
      .exec(function (res) {
        var card = res && res[0];
        var entry = res && res[1];
        // 还未渲染出上方内容（首帧）：跳过，等下一次触发
        if (!card || !card.bottom) return;

        var reservedPx = (entry && entry.height ? entry.height : 0) + gapPx;
        var availPx = win.windowHeight - card.bottom - reservedPx;
        var h = Math.round(availPx * rpp);
        h = Math.max(520, Math.min(h, 1400));

        // 变化不大就不重排，避免抖动
        if (Math.abs(h - (self.data.mapHeight || 0)) < 4) return;

        var map = buildMapData(self.data.levels || [], h);
        self.setData({ mapHeight: h, mapNodes: map.nodes, mapSegs: map.segs });
      });
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

    // 已解锁：携带学段 + 关卡（+ 分类 + 形态）参数进入游戏页
    var grade = this.data.grades[this.data.currentGradeIndex];
    // 记下本次选择，供首页「继续挑战」定位到真正要继续的关卡
    storage.set(constants.STORAGE_KEYS.lastGrade, grade.key);
    storage.set(constants.STORAGE_KEYS.lastType, this.data.currentType || '');
    var url = '/pages/game/game?grade=' + grade.key + '&level=' + card.level
      + '&mode=' + (this.data.mode || 'classic');
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
