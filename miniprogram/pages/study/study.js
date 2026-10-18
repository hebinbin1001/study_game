// 学习 Tab（B1，UI 对齐 demo 学习页）
// 职责：周概览 + 学习报告 + 错题本 + 每日一题·签到 + 题库 + 自建关卡 + 签到日历
// 关联：B2 将把「每日一题·签到」改为真实每日一题逻辑；checkin 页改造为只读日历。
var storage = require('../../utils/storage');
var auth = require('../../utils/auth');
var constants = require('../../utils/constants');

Page({
  data: {
    loggedIn: false,
    streakDays: 0,      // 连续天数（本地兜底展示，后端以 checkin 接口为准）
    totalStars: 0,      // 累计星星
    wrongCount: 0,      // 待复习错题数（登录后从云端取，失败 0）
    checkedToday: false, // 今日是否已签（B2 后=每日一题完成）
    // 2026-10-17：报告正确率提到数据卡上。avgRate < 0 表示还没拿到数据（游客 / 接口失败），
    // 模板显示 "--"，避免把「0%」误当成真实正确率。
    avgRate: -1,
    weakList: []        // 本周薄弱题型 Top3（{ code, label, count }）
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
    // 退出登录后把云端数字清掉，别把上一个账号的正确率/薄弱题型留在页面上
    if (!loggedIn) { upd.avgRate = -1; upd.weakList = []; upd.wrongCount = 0; }
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
    // 近 7 天正确率 + 薄弱题型（2026-10-17）：数据卡与底部「本周薄弱」用它填满页面。
    // 口径与「学习报告」页同源（/api/report/range），避免两处数字打架。
    request.get('/api/report/range?days=7').then(function (d) {
      if (!d) return;
      var upd = {};
      if (typeof d.avgRate === 'number') upd.avgRate = d.avgRate;
      var byType = d.wrongByType || [];
      var list = [];
      for (var i = 0; i < byType.length && list.length < 3; i++) {
        var t = constants.TYPES[byType[i].type];
        if (!t) continue;
        list.push({ code: byType[i].type, label: t.name, count: byType[i].count || 0 });
      }
      upd.weakList = list;
      self.setData(upd);
    }).catch(function () {});
  },

  _todayKey: function () {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  },

  // —— 入口 ——
  goReport: function () { this._guard('/pages/report/report', '学习报告需登录查看'); },
  goWrongBook: function () { this._guard('/pages/wrong-book/wrong-book', '错题本需登录同步'); },

  // 每日一题·签到（答对即签到；B2 已接入每日一题页）
  goDaily: function () {
    this._guard('/pages/daily-question/daily-question', '每日一题签到需登录');
  },

  // 签到记录 / 里程碑日历（B2 后 checkin 改造为只读日历）
  goCheckin: function () {
    this._guard('/pages/checkin/checkin', '签到记录需登录查看');
  },

  // 题库（2026-09-18）：查看/编辑各学段词汇，闯关线题源
  goBank: function () {
    this._guard('/pages/bank/bank', '题库需登录（词条要存到云端才不丢）');
  },

  // 自建关卡（原「自定义题库」改名，2026-09-18：避免与新的「题库」页撞名）
  goCustom: function () {
    this._guard('/pages/custom-levels/custom-levels', '自建关卡需登录');
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
