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
    // 微信名（不展示在界面上，仅随保存动作上报给服务端；见 onNicknameInput 的说明）
    wxNickname: '',
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
    this._loadWxNickname();
  },

  /**
   * 回填已保存的「微信名」（仅本人可见）。
   * 为什么单独取：users.wx_nickname 不在 User 模型里（避免生产库未加列时全表查询报错），
   * 所以要单独调一个只返回本人微信名的接口。
   */
  _loadWxNickname: function () {
    var self = this;
    if (!auth.isLoggedIn()) return;
    request.get('/api/user/wx-nickname').then(function (d) {
      if (d && d.wxNickname) self.setData({ wxNickname: d.wxNickname });
    }).catch(function () { /* 静默：拿不到就留空，不影响保存 */ });
  },

  // chooseAvatar 回调：获取微信头像地址（REQ-NICK-1）
  onChooseAvatar: function (e) {
    var avatarUrl = e.detail && e.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ avatarUrl: avatarUrl });
  },

  /**
   * 昵称输入回调（REQ-NICK-1）。
   *
   * 2026-09-19：昵称框本身也是「昵称填写」组件（type="nickname"）——
   * 用户点键盘上方的「使用微信昵称」时，这里拿到的**就是微信昵称**。
   * 于是「先到先得」地把它同时记成微信名：
   *   · 用户点一次建议 → 昵称默认=微信昵称（可继续修改），微信名也一并拿到；
   *   · 之后用户把昵称改成自定义 → 不会再覆盖已记下的微信名（管理员仍看得到）。
   * 已经存过微信名（服务端回填）时不覆盖，避免老数据被随手输入顶掉。
   */
  onNicknameInput: function (e) {
    var v = e.detail.value;
    var patch = { nickname: v };
    if (!String(this.data.wxNickname || '').trim() && String(v || '').trim()) {
      patch.wxNickname = v;
    }
    this.setData(patch);
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
    // wxNickname：**独立字段**，只取下面那个「微信名」输入框的值（2026-09-18 改）。
    // 原来是把游戏昵称同时当微信名存 —— 用户一旦改成自定义昵称，管理员就再也看不到微信名了。
    var wxNick = String(this.data.wxNickname || '').trim();
    request.post('/api/user/profile', {
      nickname: nick, avatarUrl: avatarUrl, wxNickname: wxNick
    }).then(function () {
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
  },

  // 注销账号（M6-A：双重确认 → 后端删全量数据 → 清本地态回首页）
  goDeleteAccount: function () {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    var self = this;
    wx.showModal({
      title: '注销账号',
      content: '注销将删除该账号的全部成绩、星级、错题、皮肤与成就数据，且不可恢复。确定注销吗？',
      confirmText: '注销',
      confirmColor: '#ff5a5a',
      success: function (r) {
        if (!r.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '删除后无法找回，是否继续？',
          confirmText: '确认注销',
          confirmColor: '#ff5a5a',
          success: function (r2) {
            if (r2.confirm) self._doDeleteAccount();
          }
        });
      }
    });
  },

  _doDeleteAccount: function () {
    wx.showLoading({ title: '注销中...' });
    request.post('/api/user/delete').then(function () {
      wx.hideLoading();
      // 先退登录（清 token/user），再清空本地全部存档（含游戏进度/协议标记）
      auth.logout();
      storage.setNickname('');
      storage.setAvatar('');
      try { wx.clearStorageSync(); } catch (e) { /* 忽略 */ }
      wx.showToast({ title: '账号已注销', icon: 'none' });
      setTimeout(function () {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 900);
    }).catch(function (err) {
      wx.hideLoading();
      wx.showModal({
        title: '注销失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      });
    });
  }
});
