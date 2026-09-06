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

    request.get('/api/checkin?month=' + month).then(function (res) {
      if (res.code === 0 && res.data) {
        var today = now.toISOString().split('T')[0];
        var checkedIn = res.data.records.some(function (r) { return r.date === today; });

        self.setData({
          today: today,
          currentStreak: res.data.currentStreak || 0,
          totalCheckins: res.data.totalCheckins || 0,
          checkedIn: checkedIn,
          loading: false
        });
      }
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

    request.post('/api/checkin', {}).then(function (res) {
      self.setData({ loading: false });
      if (res.code === 0 && res.data) {
        self.setData({
          checkedIn: true,
          currentStreak: res.data.streak,
          totalCheckins: self.data.totalCheckins + 1,
          rewardStars: res.data.rewardStars
        });
        wx.showToast({
          title: '签到成功 +' + res.data.rewardStars + '星',
          icon: 'success'
        });
      } else {
        wx.showToast({ title: res.message || '签到失败', icon: 'none' });
      }
    }).catch(function () {
      self.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});