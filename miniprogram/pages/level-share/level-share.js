// 分享/导入页（level-share）
//
// 职责：
//   1. 展示分享码（从 level-editor 提交审核成功后跳转进入）
//   2. 输入分享码导入关卡
//   3. 开始游戏

var request = require('../../utils/request');

Page({
  data: {
    shareCode: '',
    levelInfo: null,
    loading: false,
    importing: false,
    mode: 'import' // 'import' | 'share'
  },

  onLoad: function (options) {
    // 携带 shareCode 进入 → 分享展示模式
    if (options && options.shareCode) {
      this.setData({
        mode: 'share',
        shareCode: options.shareCode.toUpperCase()
      });
    }
  },

  // 输入分享码
  onInput: function (e) {
    this.setData({ shareCode: e.detail.value.toUpperCase() });
  },

  // 复制分享码
  copyShareCode: function () {
    var code = this.data.shareCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
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

    request.get('/api/level/import?code=' + code).then(function (data) {
      self.setData({ loading: false, levelInfo: data });
      wx.showToast({ title: '导入成功', icon: 'success' });
    }).catch(function (err) {
      self.setData({ loading: false });
      wx.showToast({ title: err.message || '导入失败', icon: 'none' });
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
