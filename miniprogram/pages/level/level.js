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

// 每学段关卡数
var LEVELS_PER_GRADE = 10;

Page({
  data: {
    grades: [],            // 学段列表（来自 GRADES，REQ-DICT-1）
    currentGradeIndex: 0,  // 当前选中的学段下标
    levels: []             // 当前学段的关卡卡片数据
  },

  onLoad: function () {
    // 初始化学段列表（7 个学段，REQ-DICT-1）
    this.setData({ grades: constants.GRADES });
    this.refreshLevels();
  },

  onShow: function () {
    // 从游戏页返回后刷新星级（REQ-GAME-13）
    this.refreshLevels();
  },

  // 切换学段 tab（REQ-DICT-1）
  pickGrade: function (e) {
    var index = e.currentTarget.dataset.index;
    if (index === this.data.currentGradeIndex) return;
    this.setData({ currentGradeIndex: index });
    this.refreshLevels();
  },

  // 刷新当前学段的关卡卡片数据（REQ-GAME-13、REQ-GAME-14）
  refreshLevels: function () {
    var grade = this.data.grades[this.data.currentGradeIndex];
    if (!grade) return;
    var key = grade.key;
    var levels = [];
    for (var i = 1; i <= LEVELS_PER_GRADE; i++) {
      var stars = storage.getStars(key, i);
      levels.push({
        level: i,
        stars: stars,
        starArr: [stars >= 1, stars >= 2, stars >= 3],  // 渲染用布尔数组
        unlocked: storage.isLevelUnlocked(key, i),       // 解锁状态（REQ-GAME-14）
        shaking: false                                    // 抖动动画标记
      });
    }
    this.setData({ levels: levels });
  },

  // 点击关卡卡片
  onLevelTap: function (e) {
    var index = e.currentTarget.dataset.index;
    var card = this.data.levels[index];
    if (!card) return;

    // 未解锁：触发抖动提示，不可进入（REQ-GAME-14）
    if (!card.unlocked) {
      this.shakeCard(index);
      wx.showToast({ title: '请先通关前一关', icon: 'none', duration: 1200 });
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

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});
