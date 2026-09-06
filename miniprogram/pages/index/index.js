// 首页逻辑（T14）
//
// 职责：
//   1. onShow 时读取本地昵称/头像更新展示（REQ-NICK-4）
//   2. 「开始游戏」跳转关卡选择页（REQ-GAME-1）
//   3. 昵称入口跳转昵称设置页（REQ-NICK-4）
//   4. 形象入口跳转形象选择页（M2）
//   5. 排行榜入口跳转排行榜页（M2）
//
// 关联需求：REQ-GAME-1、REQ-NICK-4、M2 形象/排行榜

var storage = require('../../utils/storage');

Page({
  data: {
    nickname: '',    // 本地昵称，未设置为空串（REQ-NICK-4）
    avatarUrl: ''    // 本地头像地址
  },

  // 每次显示页面时刷新昵称/头像（从昵称页返回后也能同步）
  onShow: function () {
    this.refreshProfile();
  },

  // 从本地存储读取昵称与头像并更新视图（REQ-NICK-4）
  refreshProfile: function () {
    this.setData({
      nickname: storage.getNickname(),
      avatarUrl: storage.getAvatar()
    });
  },

  // 进入关卡选择页（REQ-GAME-1）
  goLevel: function () {
    wx.navigateTo({ url: '/pages/level/level' });
  },

  // 进入昵称设置页（REQ-NICK-4）
  goNickname: function () {
    wx.navigateTo({ url: '/pages/nickname/nickname' });
  },

  // 进入形象选择页（M2）
  goAvatar: function () {
    wx.navigateTo({ url: '/pages/avatar/avatar' });
  },

  // 进入排行榜页（M2）
  goRank: function () {
    wx.navigateTo({ url: '/pages/rank/rank' });
  }
});
