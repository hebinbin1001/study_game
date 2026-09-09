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
    // 游客首屏不再自动弹协议；协议在用户点「登录/注册」后展示（O2）
    this.refresh();
    var self = this;
    // 等 refresh 的 setData 落库后再判断本地成绩 → 温和登录提醒
    setTimeout(function () { self._maybeNudgeLogin(); }, 400);
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
  // 统一登录：游客点「登录/注册」→ 先弹《用户协议与隐私政策》，同意后才显示“登录中”
  // 并发被 loginSilently 的 _loggingIn 兜底；失败弹窗给具体错误，避免“点了没反应”。
  _doLogin: function () {
    var self = this;
    // 1) 协议确认（未同意过才弹；已同意直接通过）
    auth.ensureAgreement().then(function (agreed) {
      if (!agreed) return; // 暂不/拒绝 → 保持游客
      // 2) 协议通过后才显示 loading + 真正调微信登录
      wx.showLoading({ title: '登录中...', mask: false });
      return auth.loginSilently({ skipAgreement: true }).then(function (user) {
        wx.hideLoading();
        if (!user) return; // 理论上 skipAgreement 后必有 user；防御
        self.refresh();
        if (user.needProfile) {
          wx.showToast({ title: '登录成功 · 完善昵称后参与排行', icon: 'none', duration: 1500 });
          setTimeout(function () {
            wx.navigateTo({ url: '/pages/nickname/nickname' });
          }, 900);
        } else {
          wx.showToast({ title: '✅ 登录成功', icon: 'none' });
        }
      }).catch(function (err) {
        wx.hideLoading();
        var msg = (err && (err.message || err.errMsg)) || '登录失败';
        var code = err && err.code;
        var detail = msg;
        try {
          if (typeof console !== 'undefined') {
            console.error('[login] 失败 code=' + code, err);
          }
          // 附带环境诊断，便于定位（开发工具无云环境/未登录/后端未部署等）
          var cloudOk = !!(wx.cloud && typeof wx.cloud.callContainer === 'function');
          var diag = '前端云能力:' + (cloudOk ? '可用' : '不可用') + '; callContainer:' +
            (cloudOk ? '可调' : '不可用(非微信/未开通云开发/基础库过低)');
          detail = msg + '\n\n[诊断] ' + diag + (code !== undefined ? '; code=' + code : '');
        } catch (e) { /* 忽略诊断异常 */ }
        wx.showModal({
          title: '登录失败',
          content: detail + '\n\n若为环境问题：请在真机预览测试；开发者工具需绑定云托管服务并登录。',
          showCancel: false,
          confirmText: '知道了'
        });
      });
    }).catch(function () {
      // ensureAgreement 自身失败（wx 不可用等）：静默
    });
  },

  // 登录条/资料入口：游客→登录(协议前置)；已登录→我的(tab)
  onProfileTap: function () {
    // [探针] 点击立即反馈，用于定位“无反应”
    wx.showToast({ title: '准备登录…', icon: 'none', duration: 1200 });
    try {
      if (typeof console !== 'undefined') console.log('[login] onProfileTap 触发, loggedIn=' + auth.isLoggedIn());
    } catch (e) {}
    if (auth.isLoggedIn()) { wx.switchTab({ url: '/pages/me/me' }); return; }
    this._doLogin();
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

  // 协议全文页
  goAgreement: function () {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  // 游客温和登录提醒：已有本地进度（得过星）且未提示过 → 提醒一次「登录同步」
  _maybeNudgeLogin: function () {
    if (auth.isLoggedIn()) return;
    if (storage.get('ww_login_nudge')) return;
    var totalStars = this.data.totalStars || 0;
    if (totalStars <= 0) return; // 尚无本地成绩，不打扰
    storage.set('ww_login_nudge', '1');
    var self = this;
    wx.showModal({
      title: '登录同步进度',
      content: '你已有 ' + totalStars + ' ⭐ 本地进度。登录后可同步到云端、参与排行榜，且进度不怕换设备/清缓存。',
      confirmText: '去登录',
      cancelText: '暂不',
      success: function (r) {
        if (r.confirm) self._doLogin();
      }
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

  // 推荐玩法：数独（B6 已实现）
  goSudoku: function () {
    wx.navigateTo({ url: '/pages/sudoku/sudoku' });
  },

  // 推荐玩法：词义消消乐（B6 已实现）
  goMatch: function () {
    wx.navigateTo({ url: '/pages/match/match' });
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 打怪学字词，闯关赢星星', path: '/pages/index/index' };
  }
});
