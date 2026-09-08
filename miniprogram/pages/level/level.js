// 关卡选择页逻辑（T14）
//
// 职责：
//   1. 渲染 7 学段 tab + 关卡卡片网格（REQ-DICT-1）
//   2. onShow 读取星级存档更新视图（REQ-GAME-13）
//   3. 点击关卡判断 isLevelUnlocked，未解锁触发抖动提示（REQ-GAME-14）
//   4. 选中关卡携带「学段 + 关卡」参数进入游戏页
//
// 关联需求：REQ-DICT-1、REQ-GAME-13、REQ-GAME-14

var constants = require('../../utils/constants');
var storage = require('../../utils/storage');
var auth = require('../../utils/auth');

// 每学段关卡数
var LEVELS_PER_GRADE = 10;

// 默认解锁关卡数：1~3 关（含游客）默认开放；第 4 关起需登录且逐关通关解锁
var DEFAULT_UNLOCKED = 3;

Page({
  data: {
    grades: [],             // 学段列表（来自 GRADES，REQ-DICT-1）
    currentGradeIndex: 0,   // 当前选中的学段下标
    levels: [],             // 当前学段的关卡卡片数据
    loggedIn: false,        // 登录态（M5：未登录仅第 1 关可玩）
    gradeEarnedStars: 0,    // 进度卡：本学段已得星星数（模板预处理）
    gradeTotalStars: 30,    // 进度卡：本学段星星总数（10 关 × 3 星）
    gradeStarPercent: 0     // 进度卡：星星进度百分比 0~100（模板预处理）
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

  // 刷新当前学段的关卡卡片数据（REQ-GAME-13、REQ-GAME-14、M5 游客限制）
  refreshLevels: function () {
    var grade = this.data.grades[this.data.currentGradeIndex];
    if (!grade) return;
    var key = grade.key;
    var loggedIn = auth.isLoggedIn();
    var levels = [];
    var gradeEarnedStars = 0;
    for (var i = 1; i <= LEVELS_PER_GRADE; i++) {
      var stars = storage.getStars(key, i);
      gradeEarnedStars += stars;
      // 解锁规则（产品拍板 2026-09-08）：
      //   - 1~DEFAULT_UNLOCKED 关默认开放（游客同享前 3 关）；
      //   - 其后逐关解锁：登录用户需上一关 ≥1 星（过一关解锁下一关）；游客第 4 关起需登录。
      var needLogin = !loggedIn && i > DEFAULT_UNLOCKED;
      var unlocked = (i <= DEFAULT_UNLOCKED) ||
        (loggedIn && storage.isLevelUnlocked(key, i));
      levels.push({
        level: i,
        stars: stars,
        starArr: [stars >= 1, stars >= 2, stars >= 3],  // 渲染用布尔数组
        unlocked: unlocked,                              // 解锁状态
        needLogin: needLogin,                            // 游客 4+ 关（点击引导登录）
        shaking: false                                    // 抖动动画标记
      });
    }
    // 本学段星星进度（UI 进度卡展示用，纯模板预处理）
    var gradeTotalStars = LEVELS_PER_GRADE * 3;
    var gradeStarPercent = gradeTotalStars > 0
      ? Math.round(gradeEarnedStars / gradeTotalStars * 100)
      : 0;
    this.setData({
      levels: levels,
      loggedIn: loggedIn,
      gradeEarnedStars: gradeEarnedStars,
      gradeTotalStars: gradeTotalStars,
      gradeStarPercent: gradeStarPercent
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

    // 已解锁：携带学段 + 关卡参数进入游戏页
    var grade = this.data.grades[this.data.currentGradeIndex];
    wx.navigateTo({
      url: '/pages/game/game?grade=' + grade.key + '&level=' + card.level
    });
  },

  // 触发卡片抖动动画（REQ-GAME-14）
  shakeCard: function (index) {
    var key = 'levels[' + index + '].shaking';
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

  // 游客横幅点击：登录解锁全部关卡（M5 REQ-GUEST-1）
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
