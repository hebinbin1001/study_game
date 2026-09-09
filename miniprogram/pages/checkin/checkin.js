// 签到日历页（B2 改造：只读记录 + 里程碑日历）
// 职责：
//   1. 展示本月签到日历格（日期、已签高亮）与连续/累计天数
//   2. 轨道 A：签到日历奖励阶梯说明（1/3/7/14/30 天送星，随每日一题自动发放）
//   3. 轨道 B：每日一题连续里程碑皮肤（30/60/100/250/365，领取态来自 /api/daily/status）
//   4. 今日未签 → 提供「去完成每日一题」入口（打卡唯一入口）
// 说明：不再提供独立打卡按钮；打卡 = 每日一题答对（pages/daily-question）。

var request = require('../../utils/request');

var MILESTONE_META = [
  { day: 30, emoji: '🐲', name: '神龙', avatarId: 'milestone_30' },
  { day: 60, emoji: '🦄', name: '独角兽', avatarId: 'milestone_60' },
  { day: 100, emoji: '👑', name: '皇冠', avatarId: 'milestone_100' },
  { day: 250, emoji: '⚡', name: '闪电', avatarId: 'milestone_250' },
  { day: 365, emoji: '🎖', name: '年度之星', avatarId: 'milestone_365' }
];

Page({
  data: {
    today: '',
    monthLabel: '',
    currentStreak: 0,
    totalCheckins: 0,
    checkedIn: false,
    // 日历格（当月 1~末尾）
    calCells: [],       // [{d, isToday, on, future}]
    // 里程碑（轨道 B，来自 /api/daily/status）
    milestones: [],
    // 轨道 A 阶梯说明
    starLadder: [
      { day: 1, stars: 10 }, { day: 3, stars: 30 }, { day: 7, stars: 100 },
      { day: 14, stars: 200 }, { day: 30, stars: 500 }
    ]
  },

  onShow: function () {
    this.loadData();
  },

  loadData: function () {
    var self = this;
    var now = new Date();
    var month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // 并行拉签到记录 + 每日一题里程碑
    var p1 = request.get('/api/checkin?month=' + month).catch(function () { return null; });
    var p2 = request.get('/api/daily/status').catch(function () { return null; });

    Promise.all([p1, p2]).then(function (res) {
      var data = res[0] || null;
      var daily = res[1] || null;
      if (!data) {
        self.setData({ today: self._today() });
        return;
      }
      var today = self._today();
      var records = data.records || [];
      var signedDates = {};
      records.forEach(function (r) { signedDates[r.date] = 1; });

      self.setData({
        today: today,
        checkedIn: !!signedDates[today],
        currentStreak: data.currentStreak || 0,
        totalCheckins: data.totalCheckins || 0,
        calCells: self._buildCells(signedDates),
        milestones: self._buildMilestones(daily)
      });
    });
  },

  _today: function () {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  },

  // 当月日历格：从 1 号到 31（不足月末自动忽略 future 标记）
  _buildCells: function (signed) {
    var cells = [];
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var lastDay = new Date(y, m + 1, 0).getDate();
    var todayDay = now.getDate();
    for (var d = 1; d <= lastDay; d++) {
      var dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      cells.push({
        d: d,
        on: !!signed[dateStr],
        isToday: d === todayDay,
        future: d > todayDay
      });
    }
    return cells;
  },

  _buildMilestones: function (daily) {
    if (!daily) return MILESTONE_META.map(function (mm) { return { day: mm.day, emoji: mm.emoji, name: mm.name, reached: false, claimed: false }; });
    var reachedMap = {}, claimedMap = {};
    (daily.milestones || []).forEach(function (mm) {
      reachedMap[mm.day] = !!mm.reached;
      claimedMap[mm.day] = !!mm.claimed;
    });
    return MILESTONE_META.map(function (mm) {
      return { day: mm.day, emoji: mm.emoji, name: mm.name, reached: !!reachedMap[mm.day], claimed: !!claimedMap[mm.day] };
    });
  },

  goDaily: function () {
    wx.navigateTo({ url: '/pages/daily-question/daily-question' });
  },

  goBack: function () {
    wx.navigateBack();
  }
});
