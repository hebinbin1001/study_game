// 成就列表页（achievement）
//
// 职责：
//   1. 展示成就列表 + 解锁状态
//   2. 检查并解锁新成就

var request = require('../../utils/request');

Page({
  data: {
    achievements: [],
    loading: false
  },

  onShow: function () {
    this.loadAchievements();
  },

  // 加载成就列表
  loadAchievements: function () {
    var self = this;
    self.setData({ loading: true });

    request.get('/api/achievement/list').then(function (data) {
      self.setData({
        achievements: data,
        loading: false
      });
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  // 检查解锁
  checkUnlock: function () {
    var self = this;
    request.post('/api/achievement/check', {}).then(function (data) {
      if (data.newlyUnlocked && data.newlyUnlocked.length > 0) {
        var names = data.newlyUnlocked.map(function (a) { return a.name; }).join('、');
        wx.showToast({ title: '解锁成就：' + names, icon: 'success' });
      }
      self.loadAchievements();
    }).catch(function () {
      // 检查解锁失败，静默忽略
    });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});