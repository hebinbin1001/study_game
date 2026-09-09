// 首页 Tab（B1 UI 对齐 demo 首页；M5 登录态保留）
//
// 结构（自上而下）：
//   Header(词力战士+🔊) / Hero(头像+标题+副题) / 游客引导条 /
//   资产条(⭐累计星 / 🎖段位 / 🔥连续) / 排行榜行(我的名次) /
//   今日目标(报告聚合) / 每日一题·签到(→checkin, B2 改每日一题) /
//   继续挑战大卡(→level) / 推荐玩法 2 卡
// 关联：REQ-GAME-1、M5 REQ-GUEST、B2 每日一题=签到。

var storage = require('../../utils/storage');
var auth = require('../../utils/auth');

Page({
  data: {
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    // 资产条
    totalStars: 0,
    rankName: '',      // 段位名（登录后云端）
    streakDays: 0,     // 连续天数（checkin）
    // 排行榜行
    myRank: 0,         // 我的总榜名次（0=未上榜/游客）
    // 今日目标
    todayQ: 0,
    todayRate: 0,      // 百分比
    dailyDone: false,  // 每日一题/签到今日完成
    soundOn: true      // 声音开关（HUD 喇叭）
  },

  onShow: function () {
    var constants = require('../../utils/constants');
    var soundOn = storage.get(constants.STORAGE_KEYS.sound) !== '0';
    this.setData({ soundOn: soundOn });
    this.refresh();
    this._ensureAgreement();
  },

  // —— 数据刷新 ——
  refresh: function () {
    var self = this;
    var loggedIn = auth.isLoggedIn();
    var u = auth.getUser();
    var nickname = (loggedIn && u && u.nickname) ? u.nickname : '';
    var avatarUrl = (loggedIn && u && u.avatarUrl) ? u.avatarUrl : '';
    if (!nickname) nickname = storage.getNickname();
    if (!avatarUrl) avatarUrl = storage.getAvatar();

    // 本地星级汇总（资产条主值）
    var totalStars = 0;
    var allStars = storage.getAllStars();
    for (var k in allStars) {
      if (allStars.hasOwnProperty(k) && typeof allStars[k] === 'number') totalStars += allStars[k];
    }
    var rankName = storage.get('ww_rank_name') || '';
    var streakDays = storage.get('ww_streak') || 0;
    var dailyDone = false;
    var todayKey = this._todayKey();
    var records = storage.get('ww_checkin_cache') || [];
    records.forEach(function (r) { if (r.date === todayKey) dailyDone = true; });

    this.setData({
      loggedIn: loggedIn,
      nickname: nickname,
      avatarUrl: avatarUrl,
      totalStars: totalStars,
      rankName: rankName,
      streakDays: streakDays,
      dailyDone: dailyDone
    });

    if (loggedIn) this._fetchCloud();
  },

  _fetchCloud: function () {
    var self = this;
    var request = require('../../utils/request');
    // 段位信息
    request.get('/api/rank/info').then(function (d) {
      if (!d) return;
      self.setData({ rankName: d.rankName || '' });
      try { storage.set('ww_rank_name', d.rankName || ''); } catch (e) {}
    }).catch(function () {});
    // 我的排名（总榜）
    request.get('/api/rank/me').then(function (d) {
      if (!d) return;
      self.setData({ myRank: d.rank || 0 });
    }).catch(function () {});
    // 连续签到
    request.get('/api/checkin').then(function (d) {
      if (!d) return;
      var streak = d.currentStreak || 0;
      self.setData({ streakDays: streak });
      try { storage.set('ww_streak', streak); } catch (e) {}
      var records = d.records || [];
      try { storage.set('ww_checkin_cache', records); } catch (e) {}
      var dailyDone = false;
      var todayKey = self._todayKey();
      records.forEach(function (r) { if (r.date === todayKey) dailyDone = true; });
      self.setData({ dailyDone: dailyDone });
    }).catch(function () {});
    // 今日目标：report days=1
    request.get('/api/report/range?days=1').then(function (d) {
      if (!d || !d.trend || !d.trend.length) return;
      var t = d.trend[0];
      self.setData({ todayQ: t.questions || 0, todayRate: t.rate || 0 });
    }).catch(function () {});
  },

  _todayKey: function () {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  },

  // —— 协议（沿用 M5）——
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

  // —— 声音开关（与 game HUD 同一存储键 + audio 模块同步）——
  toggleSound: function () {
    var constants = require('../../utils/constants');
    var audio = require('../../game/audio');
    var next = storage.get(constants.STORAGE_KEYS.sound) === '0';
    storage.set(constants.STORAGE_KEYS.sound, next ? '1' : '0');
    audio.setSoundEnabled(next);
    this.setData({ soundOn: next });
    wx.showToast({ title: next ? '🔊 声音已开启' : '🔇 声音已关闭', icon: 'none' });
  },

  // —— 入口 ——
  // 登录条/资料入口：游客→登录；已登录→我的(tab)
  onProfileTap: function () {
    var self = this;
    if (auth.isLoggedIn()) { wx.switchTab({ url: '/pages/me/me' }); return; }
    auth.promptLogin().then(function (user) { if (user) self.refresh(); });
  },

  goRank: function () {
    var self = this;
    if (auth.isLoggedIn()) { wx.navigateTo({ url: '/pages/rank/rank' }); return; }
    auth.promptLogin('查看排行榜需登录').then(function (user) {
      self.refresh();
      if (user && !user.needProfile) wx.navigateTo({ url: '/pages/rank/rank' });
    });
  },

  // 每日一题·签到（答对即今日签到；里程碑皮肤在 daily-question 页展示）
  goDaily: function () {
    var self = this;
    if (auth.isLoggedIn()) { wx.navigateTo({ url: '/pages/daily-question/daily-question' }); return; }
    auth.promptLogin('每日一题签到需登录').then(function (user) {
      self.refresh();
      if (user && !user.needProfile) wx.navigateTo({ url: '/pages/daily-question/daily-question' });
    });
  },

  // 继续挑战 → 关卡选择
  goLevel: function () {
    wx.navigateTo({ url: '/pages/level/level' });
  },

  // 推荐玩法：字母射击→关卡选择
  goShoot: function () {
    wx.navigateTo({ url: '/pages/level/level' });
  },

  // 推荐玩法：数独（B6 实现前占位）
  goSudoku: function () {
    wx.showToast({ title: '数独 · 敬请期待', icon: 'none' });
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 打怪学字词，闯关赢星星', path: '/pages/index/index' };
  }
});
