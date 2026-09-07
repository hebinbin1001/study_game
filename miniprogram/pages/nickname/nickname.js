// 昵称设置页逻辑（T17 · M5 云端化）
//
// 职责：
//   1. chooseAvatar + nickname input 双通道（REQ-NICK-1）
//   2. 昵称校验：去首尾空白、非空、长度 2~12（REQ-NICK-3）
//   3. 已登录时保存到后端 PUT/POST /api/user/profile（云端为准，M5 REQ-PROFILE-1）
//   4. 本地镜像兜底：离线/后端不可用时仍可保存本机（REQ-NFR-2）
//   5. 退出登录入口（M5）
//
// 关联需求：REQ-NICK-1~3、REQ-API-3、M5 REQ-PROFILE-1/2

var storage = require('../../utils/storage');
var auth = require('../../utils/auth');
var request = require('../../utils/request');

// 昵称长度约束（REQ-NICK-3：可配置 2~12）
var NICKNAME_MIN_LEN = 2;
var NICKNAME_MAX_LEN = 12;

Page({
  data: {
    avatarUrl: '',    // 头像地址
    nickname: '',     // 昵称（输入框当前值）
    loggedIn: false   // 登录态（M5）
  },

  onLoad: function () {
    this.refreshProfile();
  },

  onShow: function () {
    this.refreshProfile();
  },

  // 填充云端/本地资料（登录后以云端 user 为准）
  refreshProfile: function () {
    var u = auth.getUser();
    this.setData({
      loggedIn: auth.isLoggedIn(),
      avatarUrl: (u && u.avatarUrl) || storage.getAvatar() || '',
      nickname: (u && u.nickname) || storage.getNickname() || ''
    });
  },

  // chooseAvatar 回调：获取微信头像地址（REQ-NICK-1）
  onChooseAvatar: function (e) {
    var avatarUrl = e.detail && e.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ avatarUrl: avatarUrl });
  },

  // nickname input 输入回调（REQ-NICK-1）
  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  // 保存昵称/头像（REQ-NICK-2/3；M5 登录后云端保存）
  onSave: function () {
    var raw = this.data.nickname || '';
    var nick = String(raw).trim();
    var self = this;

    if (!nick) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    if (nick.length < NICKNAME_MIN_LEN || nick.length > NICKNAME_MAX_LEN) {
      wx.showToast({ title: '昵称长度需 2~12 个字符', icon: 'none' });
      return;
    }

    var avatarUrl = this.data.avatarUrl || '';

    // 本地镜像先行（离线可保存，REQ-NFR-2）
    storage.setNickname(nick);
    if (avatarUrl) storage.setAvatar(avatarUrl);

    // 未登录：仅保存本机（游客也可暂存，登录后需重新保存上云）
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '已保存到本机', icon: 'none', duration: 1200 });
      setTimeout(function () { wx.navigateBack(); }, 1300);
      return;
    }

    // 已登录：云端保存（M5 REQ-PROFILE-1）
    request.post('/api/user/profile', { nickname: nick, avatarUrl: avatarUrl }).then(function () {
      auth.refreshMe(); // 拉取最新资料回写缓存（needProfile → false）
      wx.showToast({ title: '保存成功', icon: 'success', duration: 1200 });
      setTimeout(function () { wx.navigateBack(); }, 1300);
    }).catch(function (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[nickname] 云端同步失败，昵称仅保存在本机。code=' + (err && err.code));
      }
      wx.showToast({ title: '已保存到本机，联网后同步', icon: 'none', duration: 1200 });
      setTimeout(function () { wx.navigateBack(); }, 1300);
    });
  },

  // 退出登录（M5）
  goLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新登录才能解锁全部关卡',
      confirmText: '退出',
      success: function (r) {
        if (!r.confirm) return;
        auth.logout();
        // 清除本地昵称镜像，游客态不再展示云端昵称
        storage.setNickname('');
        storage.setAvatar('');
        wx.showToast({ title: '已退出', icon: 'none' });
        setTimeout(function () {
          wx.reLaunch({ url: '/pages/index/index' });
        }, 700);
      }
    });
  },

  // 返回上一页
  goBack: function () {
    wx.navigateBack();
  }
});
