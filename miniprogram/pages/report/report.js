// 学习报告页（M6-D）：近 7 天学习统计 + 错题掌握概览
var request = require('../../utils/request');

Page({
  data: {
    loading: true,
    error: false,
    empty: false,
    // 概览
    totalDays: 0,
    totalPlays: 0,
    totalQ: 0,
    avgRate: 0,
    totalStars: 0,
    // 错题掌握
    pending: 0,
    mastered: 0,
    totalWrong: 0,
    // 趋势与薄弱
    trend: [],
    wrongByType: []
  },

  onShow: function () {
    this.load();
  },

  load: function () {
    var self = this;
    this.setData({ loading: true, error: false });
    Promise.all([
      request.get('/api/report/range?days=7').catch(function () { return null; }),
      request.get('/api/wrong/stats').catch(function () { return null; })
    ]).then(function (rs) {
      var rep = rs[0];
      var st = rs[1] || {};
      if (!rep) {
        self.setData({ loading: false, error: true });
        return;
      }
      // 薄弱题型：按占比归一化（供条形宽度）
      var rawTypes = rep.wrongByType || [];
      var maxC = 1;
      for (var i = 0; i < rawTypes.length; i++) {
        if (rawTypes[i].count > maxC) maxC = rawTypes[i].count;
      }
      var wrongByType = rawTypes.map(function (t) {
        return { type: t.type, count: t.count, percent: Math.round((t.count / maxC) * 100) };
      });

      self.setData({
        loading: false,
        empty: !rep.totalQ && (rep.totalDays || 0) === 0,
        totalDays: rep.totalDays || 0,
        totalPlays: rep.totalPlays || 0,
        totalQ: rep.totalQ || 0,
        avgRate: rep.avgRate || 0,
        totalStars: rep.totalStars || 0,
        trend: rep.trend || [],
        wrongByType: wrongByType,
        pending: st.pending || 0,
        mastered: st.mastered || 0,
        totalWrong: st.total || 0
      });
    });
  },

  goWrongBook: function () {
    wx.navigateTo({ url: '/pages/wrong-book/wrong-book' });
  },

  goHome: function () {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
