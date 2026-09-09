// 学习 Tab（B1，UI 对齐 demo 学习页）
// 职责：周概览 + 学习报告 + 错题本 + 每日一题·签到 + 自定义题库 + 签到日历
// 关联：B2 将把「每日一题·签到」改为真实每日一题逻辑；checkin 页改造为只读日历。
var storage = require('../../utils/storage');
var auth = require('../../utils/auth');

Page({
  data: {
    loggedIn: false,
    streakDays: 0,      // 连续天数（本地兜底展示，后端以 checkin 接口为准）
    totalStars: 0,      // 累计星星
    wrongCount: 0,      // 待复习错题数（登录后从云端取，失败 0）
    checkedToday: false // 今日是否已签（B2 后=每日一题完成）
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var loggedIn = auth.isLoggedIn();
    var self = this;
    var totalStars = 0;
    var allStars = storage.getAllStars();
    for (var k in allStars) {
      if (allStars.hasOwnProperty(k) && typeof allStars[k] === 'number') totalStars += allStars[k];
    }
    var checkedToday = false;
    var todayKey = this._todayKey();
    var records = storage.get('ww_checkin_cache') || [];
    records.forEach(function (r) { if (r.date === todayKey) checkedToday = true; });

    var upd = { loggedIn: loggedIn, totalStars: totalStars, checkedToday: checkedToday };
    this.setData(upd);

    if (!loggedIn) return;
    // 云端：连续天数 + 错题待复习数（失败静默降级本地）
    this._fetchCloud();
  },

  _fetchCloud: function () {
    var self = this;
    var request = require('../../utils/request');
    request.get('/api/checkin').then(function (d) {
      if (!d) return;
      var streak = d.currentStreak || 0;
      self.setData({ streakDays: streak });
      var records = d.records || [];
      try { storage.set('ww_checkin_cache', records); } catch (e) {}
    }).catch(function () {});
    request.get('/api/wrong/stats').then(function (d) {
      if (!d) return;
      self.setData({ wrongCount: d.pending || 0 });
    }).catch(function () {});
  },

  _todayKey: function () {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  },

  // —— 入口 ——
  goReport: function () { this._guard('/pages/report/report', '学习报告需登录查看'); },
  goWrongBook: function () { this._guard('/pages/wrong-book/wrong-book', '错题本需登录同步'); },

  // 每日一题·签到（B1 占位 → checkin；B2 改为真实每日一题轻量页）
  goDaily: function () {
    this._guard('/pages/checkin/checkin', '每日一题签到需登录');
  },

  // 签到记录 / 里程碑日历（B2 后 checkin 改造为只读日历）
  goCheckin: function () {
    this._guard('/pages/checkin/checkin', '签到记录需登录查看');
  },

  // 自定义题库（我的题库；B4 深化为列表+广场）
  goCustom: function () {
    this._guard('/pages/level-editor/level-editor', '自定义题库需登录');
  },

  _guard: function (url, desc) {
    var self = this;
    if (auth.isLoggedIn()) { wx.navigateTo({ url: url }); return; }
    auth.promptLogin(desc).then(function (user) {
      self.refresh();
      if (user && !user.needProfile) wx.navigateTo({ url: url });
    });
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 学习中心', path: '/pages/study/study' };
  }
});
