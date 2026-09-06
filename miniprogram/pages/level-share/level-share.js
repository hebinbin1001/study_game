// 分享导入页（level-share）
//
// 职责：
//   1. 输入分享码导入关卡
//   2. 展示关卡信息
//   3. 开始游戏

var request = require('../../utils/request');

Page({
  data: {
    shareCode: '',
    levelInfo: null,
    loading: false,
    importing: false
  },

  // 输入分享码
  onInput: function (e) {
    this.setData({ shareCode: e.detail.value.toUpperCase() });
  },

  // 导入关卡
  importLevel: function () {
    var self = this;
    var code = this.data.shareCode.trim();

    if (!code || code.length !== 6) {
      wx.showToast({ title: '请输入 6 位分享码', icon: 'none' });
      return;
    }

    self.setData({ loading: true });

    request.get('/api/level/import?code=' + code).then(function (res) {
      self.setData({ loading: false });
      if (res.code === 0 && res.data) {
        self.setData({ levelInfo: res.data });
        wx.showToast({ title: '导入成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '导入失败', icon: 'none' });
      }
    }).catch(function () {
      self.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 开始游戏
  startGame: function () {
    var levelInfo = this.data.levelInfo;
    if (!levelInfo) return;

    // 跳转到游戏页，传入关卡信息
    wx.navigateTo({
      url: '/pages/game/game?customLevel=' + encodeURIComponent(JSON.stringify(levelInfo))
    });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});