// 首页逻辑（T14 · M5 登录态）
//
// 职责：
//   1. onShow 时刷新登录态 + 昵称/头像（云端优先，本地兜底）
//   2. 「开始闯关」跳转关卡选择页（REQ-GAME-1）
//   3. 登录入口：未登录点击登录（promptLogin）；已登录进昵称页
//   4. 受限功能入口（形象/排行/错题/签到/成就）未登录时先引导登录（REQ-GUEST-2）
//
// 关联需求：REQ-GAME-1、REQ-NICK-4、M5 REQ-GUEST-2

var storage = require('../../utils/storage');
var auth = require('../../utils/auth');

Page({
  data: {
    loggedIn: false,       // 登录态（M5）
    nickname: '',          // 昵称（登录后取云端）
    avatarUrl: '',         // 头像地址
    nicknameDisplay: '',   // 概览卡展示用昵称（未设置回退「游客/去设昵称」）
    totalStars: 0,         // 概览卡：累计星星
    passedLevels: 0        // 概览卡：已过关卡数
  },

  // 每次显示页面时刷新登录态/昵称/头像/数据概览
  onShow: function () {
    this.refreshProfile();
    this._ensureAgreement();
    this._ensureReminderPrompt();
  },

  // 首次进入弹「用户协议与隐私政策」同意（M5 REQ-COMPLY-1，最小实现；完整协议页审核前补充）
  _ensureAgreement: function () {
    if (storage.get('ww_agreed')) return;
    wx.showModal({
      title: '用户协议与隐私政策',
      content: '欢迎使用「词力战士」。登录后，你的昵称、头像与游戏进度将用于排行榜展示；我们仅收集为你提供服务所必需的信息，不会向第三方泄露。点击「同意」即视为已阅读并同意《用户协议》与《隐私政策》。',
      confirmText: '同意',
      showCancel: false,
      success: function () {
        storage.set('ww_agreed', '1');
      }
    });
  },

  // 学习提醒引导（M6-I）：已同意协议 + 已登录 + 未提示过 → 订阅服务通知授权
  // 说明：模板 ID 需在小程序后台「订阅消息」申请后替换；真正的推送需后端定时任务（TODO）。
  _ensureReminderPrompt: function () {
    if (storage.get('ww_reminder_prompted')) return;
    if (!storage.get('ww_agreed')) return; // 等协议同意后再引导，避免弹窗叠加
    if (!auth.isLoggedIn()) return;
    // 先标记，避免用户反复被打扰
    storage.set('ww_reminder_prompted', '1');
    var self = this;
    wx.showModal({
      title: '开启学习提醒',
      content: '开启后，需要复习时我们会通过微信服务通知提醒你，帮你坚持每天进步一点点～',
      confirmText: '开启',
      cancelText: '暂不',
      success: function (r) {
        if (!r.confirm) return;
        if (typeof wx.requestSubscribeMessage !== 'function') return;
        // TODO：替换为在小程序后台申请的订阅消息模板 ID（一次性订阅）
        wx.requestSubscribeMessage({
          tmplIds: ['TEMPLATE_ID_PLACEHOLDER'],
          complete: function () {
            // 授权结果（accept/reject）静默处理；真正推送依赖后端发送（待申请模板后接入）
            self.refreshProfile();
          }
        });
      }
    });
  },

  // 分享引导（M6-J）：入口弹窗引导走微信分享菜单
  // 说明：微信分享无可靠「成功」回调，星星奖励需自定义邀请链路后端校验（本次仅引导，TODO）
  goShare: function () {
    wx.showModal({
      title: '分享给好友',
      content: '把「词力战士」分享给好友，一起打怪学字词、闯关赢星星！',
      confirmText: '去分享',
      cancelText: '取消',
      success: function (r) {
        if (!r.confirm) return;
        try {
          if (wx.showShareMenu) {
            wx.showShareMenu({ withShareTicket: false });
          }
        } catch (e) {
          // 低版本忽略
        }
        wx.showToast({
          title: '通过右上角「···」分享给好友即可（每日分享得更多星星）',
          icon: 'none',
          duration: 2200
        });
      }
    });
  },

  // 页面分享（M5 P4）
  onShareAppMessage: function () {
    return {
      title: '词力战士 - 打怪学字词，闯关赢星星',
      path: '/pages/index/index'
    };
  },

  refreshProfile: function () {
    // 统计星级存档（数据概览卡）
    var allStars = storage.getAllStars();
    var totalStars = 0;
    var passedLevels = 0;
    for (var k in allStars) {
      if (allStars.hasOwnProperty(k) && typeof allStars[k] === 'number' && allStars[k] > 0) {
        totalStars += allStars[k];
        passedLevels++;
      }
    }

    // 登录态与资料：登录后以云端 user 为准，未登录/缺失时用本地旧值兜底
    var loggedIn = auth.isLoggedIn();
    var u = auth.getUser();
    var nickname = (loggedIn && u && u.nickname) ? u.nickname : '';
    var avatarUrl = (loggedIn && u && u.avatarUrl) ? u.avatarUrl : '';
    if (!nickname) nickname = storage.getNickname();
    if (!avatarUrl) avatarUrl = storage.getAvatar();

    this.setData({
      loggedIn: loggedIn,
      nickname: nickname,
      avatarUrl: avatarUrl,
      nicknameDisplay: nickname || (loggedIn ? '去设昵称' : '游客'),
      totalStars: totalStars,
      passedLevels: passedLevels
    });
  },

  // 进入关卡选择页（REQ-GAME-1）
  goLevel: function () {
    wx.navigateTo({ url: '/pages/level/level' });
  },

  // 登录状态条点击：未登录 → 登录引导；已登录 → 昵称页
  onLoginTap: function () {
    var self = this;
    if (auth.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/nickname/nickname' });
      return;
    }
    auth.promptLogin().then(function (user) {
      if (user) self.refreshProfile();
    });
  },

  // 昵称入口（登录后才能设置，M5）
  goNickname: function () {
    var self = this;
    if (auth.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/nickname/nickname' });
      return;
    }
    auth.promptLogin('设置昵称需先登录').then(function (user) {
      if (user) self.refreshProfile();
    });
  },

  // 受限功能入口（未登录先引导登录，REQ-GUEST-2）
  goAvatar: function () { this._guardThenGo('/pages/avatar/avatar', '形象皮肤需登录使用'); },
  goRank: function () { this._guardThenGo('/pages/rank/rank', '查看排行榜需登录'); },
  goWrongBook: function () { this._guardThenGo('/pages/wrong-book/wrong-book', '错题本需登录同步'); },
  goCheckin: function () { this._guardThenGo('/pages/checkin/checkin', '每日签到需登录'); },
  goAchievement: function () { this._guardThenGo('/pages/achievement/achievement', '成就勋章需登录'); },
  goReport: function () { this._guardThenGo('/pages/report/report', '学习报告需登录'); },

  // 通用受限跳转：已登录直达；未登录引导登录后（资料完善）再跳
  _guardThenGo: function (url, desc) {
    var self = this;
    if (auth.isLoggedIn()) {
      wx.navigateTo({ url: url });
      return;
    }
    auth.promptLogin(desc).then(function (user) {
      self.refreshProfile();
      // needProfile 场景 promptLogin 已自动引导昵称页，此处不重复跳转
      if (user && !user.needProfile) {
        wx.navigateTo({ url: url });
      }
    });
  }
});
