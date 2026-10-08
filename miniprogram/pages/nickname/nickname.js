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
var avatarUpload = require('../../utils/avatar-upload');

// 昵称长度约束（REQ-NICK-3：可配置 2~12）
var NICKNAME_MIN_LEN = 2;
var NICKNAME_MAX_LEN = 12;

Page({
  data: {
    avatarUrl: '',    // 头像地址（上传成功后是稳定 URL；上传失败只是本机临时路径，仅用于预览）
    avatarUploading: false,  // 头像上传中（按钮禁用 + 文案提示）
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

  /**
   * chooseAvatar 回调（REQ-NICK-1）。
   *
   * 2026-09-19 修复「头像无法更换」：微信给的是**临时文件路径**，直接存云端会导致
   * 本机重启失效、别人手机裂图。所以这里立刻**压缩 + 上传**，拿回稳定地址再放进 avatarUrl；
   * 上传失败时只做本地预览、并明确提示，**不把临时路径当头像存上去**（保存时还有一道过滤）。
   */
  onChooseAvatar: function (e) {
    var self = this;
    var tempPath = e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    this.setData({ avatarUploading: true });
    avatarUpload.uploadAvatar(tempPath).then(function (url) {
      self.setData({ avatarUrl: url, avatarUploading: false });
      wx.showToast({ title: '头像已更新', icon: 'success' });
    }).catch(function (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[avatar] 上传失败：', err && err.message);
      }
      self.setData({ avatarUploading: false, avatarUrl: tempPath });   // 仅本地预览
      wx.showToast({ title: '头像没存上，请重试', icon: 'none', duration: 2000 });
    });
  },

  /**
   * 昵称输入回调（REQ-NICK-1）：只更新游戏昵称。
   *
   * ⚠️ 2026-09-29 修正（用户反馈「管理员界面拿到的微信名不对」）：
   *   旧实现是「先到先得」—— 只要这个框有输入，且还没存过微信名，就把当前值记成微信名。
   *   但绝大多数用户是**手打自定义昵称**（不会去点键盘上方的「使用微信昵称」），
   *   于是把**游戏昵称**存成了微信名 → 管理端看到的其实是游戏昵称，等于拿错了数据。
   *
   * 2026-10-08：微信昵称采集这条线**整体下线**（连带 onNicknameReview 回调、
   * users.wx_nickname 字段的读写、/api/user/wx-nickname 接口一起删）。原因：
   * 微信不给真名、用户又几乎不会去点「使用微信昵称」，采到的既不准、又只是「另一个展示名」。
   * 用户身份以 openid 为准，展示名走 nickname + 默认昵称兜底（server/nickname-util.js）。
   */
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

    // ⚠️ 只有「已上传成功」的稳定地址才允许多存云端：
    //    微信 chooseAvatar 给的是临时路径（wxfile://tmp_…），存上去会导致别人手机裂图、本机重启失效。
    //    上传失败时这里会过滤成空串 → 服务端保留原头像，不会被一行临时路径覆盖。
    var avatarUrl = /^https?:\/\//i.test(this.data.avatarUrl || '') ? this.data.avatarUrl : '';

    // 本地镜像先行（离线可保存，REQ-NFR-2）
    // 本地允许存临时路径（只在自己这台设备上用，重启后失效也无所谓）；
    // 云端才必须用稳定 URL —— 见上面的 avatarUrl 过滤。
    storage.setNickname(nick);
    if (this.data.avatarUrl) storage.setAvatar(this.data.avatarUrl);

    // 未登录：仅保存本机（游客也可暂存，登录后需重新保存上云）
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '已保存到本机', icon: 'none', duration: 1200 });
      setTimeout(function () { wx.navigateBack(); }, 1300);
      return;
    }

    // 已登录：云端保存（M5 REQ-PROFILE-1）
    // 2026-10-08：不再上报 wxNickname —— 微信昵称采集已整体下线
    request.post('/api/user/profile', {
      nickname: nick, avatarUrl: avatarUrl
    }).then(function () {
      auth.refreshMe(); // 拉取最新资料回写缓存
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
