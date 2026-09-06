// 签到页面（checkin）
//
// 职责：
//   1. 每日签到
//   2. 展示签到日历
//   3. 显示连续签到天数和奖励

var request = require('../../utils/request');

Page({
  data: {
    today: '',
    currentStreak: 0,
    totalCheckins: 0,
    checkedIn: false,
    rewardStars: 0,
    loading: false
  },

  onShow: function () {
    this.loadCheckin();
  },

  // 加载签到信息
  loadCheckin: function () {
    var self = this;
    var now = new Date();
    var month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    request.get('/api/checkin?month=' + month).then(function (data) {
      var today = now.toISOString().split('T')[0];
      var records = data.records || [];
      var checkedIn = records.some(function (r) { return r.date === today; });

      self.setData({
        today: today,
        currentStreak: data.currentStreak || 0,
        totalCheckins: data.totalCheckins || 0,
        checkedIn: checkedIn,
        loading: false
      });
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  // 签到
  doCheckin: function () {
    var self = this;
    if (this.data.checkedIn) {
      wx.showToast({ title: '今日已签到', icon: 'none' });
      return;
    }

    self.setData({ loading: true });

    request.post('/api/checkin', {}).then(function (data) {
      self.setData({
        loading: false,
        checkedIn: true,
        currentStreak: data.streak,
        totalCheckins: self.data.totalCheckins + 1,
        rewardStars: data.rewardStars
      });
      wx.showToast({
        title: '签到成功 +' + data.rewardStars + '星',
        icon: 'success'
      });
    }).catch(function (err) {
      self.setData({ loading: false });
      wx.showToast({ title: err.message || '签到失败', icon: 'none' });
    });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});