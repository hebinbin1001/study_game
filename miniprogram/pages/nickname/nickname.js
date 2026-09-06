// 昵称设置页逻辑（T17）
//
// 职责：
//   1. chooseAvatar 按钮回调获取头像（REQ-NICK-1）
//   2. nickname input 双通道输入（REQ-NICK-1）
//   3. 自定义昵称校验：去首尾空白、非空、长度 2~12（REQ-NICK-3）
//   4. 保存写入 storage.ww_nickname，退出重进可读取（REQ-NICK-2）
//   5. 可选调用 POST /api/nickname 同步云端，失败静默降级（REQ-API-3）
//
// 关联需求：REQ-NICK-1、REQ-NICK-2、REQ-NICK-3、REQ-API-3

var storage = require('../../utils/storage');
var request = require('../../utils/request');

// 昵称长度约束（REQ-NICK-3：可配置 2~12）
var NICKNAME_MIN_LEN = 2;
var NICKNAME_MAX_LEN = 12;

Page({
  data: {
    avatarUrl: '',    // 头像地址
    nickname: ''      // 昵称（输入框当前值）
  },

  onLoad: function () {
    // 读取已存昵称/头像填充（REQ-NICK-2：退出重进可读取并展示）
    this.setData({
      avatarUrl: storage.getAvatar(),
      nickname: storage.getNickname()
    });
  },

  // chooseAvatar 回调：获取微信头像地址（REQ-NICK-1）
  onChooseAvatar: function (e) {
    var avatarUrl = e.detail && e.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ avatarUrl: avatarUrl });
    // 头像立即持久化（REQ-NICK-2）
    storage.setAvatar(avatarUrl);
  },

  // nickname input 输入回调（REQ-NICK-1：双通道，授权填充或手动输入）
  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  // 保存昵称（REQ-NICK-2、REQ-NICK-3）
  onSave: function () {
    var raw = this.data.nickname || '';
    // 去首尾空白（REQ-NICK-3）
    var nick = String(raw).trim();

    // 校验：非空
    if (!nick) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    // 校验：长度 2~12（REQ-NICK-3）
    if (nick.length < NICKNAME_MIN_LEN || nick.length > NICKNAME_MAX_LEN) {
      wx.showToast({ title: '昵称长度需 2~12 个字符', icon: 'none' });
      return;
    }

    // 保存到本地存储（REQ-NICK-2）
    storage.setNickname(nick);

    // 同步云端，失败静默降级（REQ-API-3、REQ-NFR-2）
    this.syncNickname(nick);

    wx.showToast({ title: '保存成功', icon: 'success', duration: 1200 });

    // 延迟返回上一页（首页 onShow 会刷新昵称展示）
    setTimeout(function () {
      wx.navigateBack();
    }, 1200);
  },

  // 同步昵称到云端，失败静默降级（REQ-API-3、REQ-NFR-2）
  syncNickname: function (nick) {
    // utils/request.js v2 契约：失败一律 reject(err)，err 携带 code/message。
    // 云端失败不影响本地已保存的昵称，此处显式 catch 静默降级。
    request.post('/api/nickname', { nickname: nick }).then(function () {
      // 同步成功
    }).catch(function (err) {
      // 静默降级：本地已保存，云端失败不阻塞主流程（可在此打日志，不提示用户）
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[nickname] 云端同步失败，昵称仅保存在本地。code=' + (err && err.code));
      }
    });
  },

  // 返回上一页
  goBack: function () {
    wx.navigateBack();
  }
});
