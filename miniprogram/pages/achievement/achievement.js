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

    request.get('/api/achievement/list').then(function (res) {
      if (res.code === 0 && res.data) {
        self.setData({
          achievements: res.data,
          loading: false
        });
      } else {
        self.setData({ loading: false });
      }
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  // 检查解锁
  checkUnlock: function () {
    var self = this;
    request.post('/api/achievement/check', {}).then(function (res) {
      if (res.code === 0 && res.data) {
        if (res.data.newlyUnlocked && res.data.newlyUnlocked.length > 0) {
          var names = res.data.newlyUnlocked.map(function (a) { return a.name; }).join('、');
          wx.showToast({ title: '解锁成就：' + names, icon: 'success' });
        }
        self.loadAchievements();
      }
    });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});