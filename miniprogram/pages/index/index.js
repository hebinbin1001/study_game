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
var constants = require('../../utils/constants');

Page({
  // 实例级标志（不在 data，避免渲染）；登录/协议进行中置 true，防 nudge 弹窗互顶
  _loginBusy: false,
  _nudgeTimer: null,

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
    // 继续挑战（一期：显示真实进度并直达对局）
    continueGrade: 'kindergarten',  // 目标学段 key
    continueLevel: 1,               // 目标关卡
    continueStars: 0,               // 该关历史最佳星级
    continueHint: '',               // 副标题：玩法 · 学段 · 第 N 关
    continuePlayable: false,        // 是否可直接开打（游客第 4 关起走关卡页登录）
    // 今日目标
    todayQ: 0,
    todayRate: 0,      // 百分比
    dailyDone: false,  // 每日一题/签到今日完成
    soundOn: true      // 声音开关（HUD 喇叭）
  },

  onShow: function () {
    var soundOn = storage.get(constants.STORAGE_KEYS.sound) !== '0';
    this.setData({ soundOn: soundOn });
    // 游客首屏不再自动弹协议；协议在用户点「登录/注册」后展示（O2）
    this.refresh();
    // 温和登录提醒延后触发（避开用户主动登录的弹窗时序，防 modal 互顶）
    var self = this;
    if (this._nudgeTimer) clearTimeout(this._nudgeTimer);
    this._nudgeTimer = setTimeout(function () { self._maybeNudgeLogin(); }, 900);
  },

  onHide: function () {
    // 离开首页时取消挂起的 nudge 定时器，避免在其他页面意外弹窗
    if (this._nudgeTimer) { clearTimeout(this._nudgeTimer); this._nudgeTimer = null; }
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

    // 继续挑战：按「最近一次进入的学段/题型」推导下一关（与关卡页同一口径）
    var lastGrade = storage.get(constants.STORAGE_KEYS.lastGrade) || constants.GRADES[0].key;
    var lastType = storage.get(constants.STORAGE_KEYS.lastType) || '';
    var gradeLabel = lastGrade;
    for (var gi = 0; gi < constants.GRADES.length; gi++) {
      if (constants.GRADES[gi].key === lastGrade) { gradeLabel = constants.GRADES[gi].label; break; }
    }
    var cont = storage.findContinueLevel(lastGrade, lastType || undefined);
    // 游客第 4 关起需登录：卡片改为引导去关卡页（那里会弹登录引导）
    var continuePlayable = loggedIn || cont.level <= constants.DEFAULT_UNLOCKED_LEVELS;
    var continueHint = '字母射击 · ' + gradeLabel + ' · 第 ' + cont.level + ' 关'
      + (cont.allPassed ? '（已通关，可刷星）' : '');

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
      continueGrade: lastGrade,
      continueLevel: cont.level,
      continueStars: cont.stars,
      continueHint: continueHint,
      continuePlayable: continuePlayable,
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
    var step = function (s) {
      try { if (typeof console !== 'undefined') console.log('[login-step]', s); } catch (e) {}
    };
    // 1) 协议确认（未同意过才弹；已同意直接通过）
    step('1-ensureAgreement 开始');
    auth.ensureAgreement().then(function (agreed) {
      step('2-ensureAgreement 返回 agreed=' + agreed);
      if (!agreed) {
        step('2b-用户拒绝协议，保持游客');
        self._loginBusy = false;
        wx.showToast({ title: '已保持游客模式 · 需要时再登录', icon: 'none', duration: 1800 });
        return;
      }
      // 2) 显示 loading 并真正调微信登录
      wx.showLoading({ title: '登录中...', mask: false });
      step('3-调用 wx.login/loginSilently');
      return auth.loginSilently({ skipAgreement: true }).then(function (user) {
        wx.hideLoading();
        self._loginBusy = false;
        step('4-登录返回 user=' + !!(user));
        if (!user) return;
        try {
          step('4a-登录后 isLoggedIn=' + auth.isLoggedIn() + ' needProfile=' + (user && user.needProfile) +
            ' token=' + (storage.getToken ? (storage.getToken() ? '有' : '空') : '?'));
        } catch (e) { step('4a-诊断异常 ' + e); }
        self.refresh();
        try {
          step('4b-refresh后 data.loggedIn=' + self.data.loggedIn);
        } catch (e) {}
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
        self._loginBusy = false;
        step('5-登录失败 err=' + (err && (err.message || err.errMsg || JSON.stringify(err))));
        var msg = (err && (err.message || err.errMsg)) || '登录失败';
        var code = err && err.code;
        var detail = msg;
        try {
          var cloudOk = !!(wx.cloud && typeof wx.cloud.callContainer === 'function');
          detail = msg + '\n\n[诊断] 云能力:' + (cloudOk ? '可用' : '不可用') +
            (code !== undefined ? '; code=' + code : '') +
            '\n环境提示：开发者工具请绑定云托管服务并登录；也可用「真机预览」测试（openid 由网关注入）。';
        } catch (e) { /* 忽略 */ }
        wx.showModal({
          title: '登录失败',
          content: detail,
          showCancel: false,
          confirmText: '知道了'
        });
      });
    }).catch(function (e) {
      self._loginBusy = false;
      step('ensureAgreement 异常 ' + e);
    });
  },

  // 登录条/资料入口：游客→登录(协议前置)；已登录→我的(tab)
  onProfileTap: function () {
    // 登录流程进行中 → 取消可能撞窗的 nudge 弹窗，并置忙标志
    if (this._nudgeTimer) { clearTimeout(this._nudgeTimer); this._nudgeTimer = null; }
    this._loginBusy = true;
    // 注意：此处禁止在 showModal 前 wx.showToast —— toast 与 modal 共用原生弹窗层，
    // 真机上会导致协议弹窗直接 fail，即「首次进入点击登录没反应」的根因
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
    // 登录/协议流程进行中 → 本次不弹（也不标记，留待下次 onShow），避免 modal 互顶
    if (this._loginBusy) return;
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
        if (r.confirm) {
          self._loginBusy = true;
          if (self._nudgeTimer) { clearTimeout(self._nudgeTimer); self._nudgeTimer = null; }
          self._doLogin();
        }
      }
    });
  },

  // 继续挑战：可直接开打则直达对局（一期改造），否则去关卡页
  // （游客第 4 关起需登录，关卡页会弹登录引导；已通关则回到最后一关刷星）
  goContinue: function () {
    if (!this.data.continuePlayable) {
      wx.navigateTo({ url: '/pages/level/level' });
      return;
    }
    var url = '/pages/game/game?grade=' + this.data.continueGrade
      + '&level=' + this.data.continueLevel
      + '&mode=' + storage.getMode();
    var t = storage.get(constants.STORAGE_KEYS.lastType);
    if (t && t !== 'all') url += '&type=' + t;
    wx.navigateTo({ url: url });
  },

  // 换关卡 → 关卡选择页
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
