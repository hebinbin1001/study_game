// 签到日历页（B2 改造：只读记录 + 里程碑日历）
// 职责：
//   1. 展示本月签到日历格（日期、已签高亮）与连续/累计天数
//   2. 轨道 A：签到奖励阶梯说明（每天 +1⭐；连续 3/7/14/30 天当天额外一次性送星，随每日一题自动发放）
//   3. 轨道 B：每日一题连续里程碑皮肤（30/60/100/250/365，领取态来自 /api/daily/status）
//   4. 今日未签 → 提供「去完成每日一题」入口（打卡唯一入口）
// 说明：不再提供独立打卡按钮；打卡 = 每日一题答对（pages/daily-question）。

var request = require('../../utils/request');
// M5 T2.3：受限页直入门禁（未登录不拉数据，页内引导登录）
var auth = require('../../utils/auth');

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
    // 签到记录请求失败（2026-10-28）：与「本月没签过」区分开，用于显示错误提示与重试
    loadError: false,
    // 日历格（当月 1~末尾）
    calCells: [],       // [{d, isToday, on, future}]
    // 里程碑（轨道 B，来自 /api/daily/status）
    milestones: [],
    // 轨道 A 阶梯说明（2026-09-13 重标：每天 +1⭐，连续踩到 3/7/14/30 天当天额外一次性送星）
    // 与 server/checkin-rewards.js 的 DAILY / MILESTONE 必须一致
    starLadder: [
      { day: 1, stars: 1, label: '每天 +1⭐' },
      { day: 3, stars: 2, label: '额外 +2⭐' },
      { day: 7, stars: 5, label: '额外 +5⭐' },
      { day: 14, stars: 8, label: '额外 +8⭐' },
      { day: 30, stars: 15, label: '额外 +15⭐' }
    ],
    // 补签卡（2026-10-29）：cards = 可用张数，can = 现在能不能补，target = 补哪天，
    // reason = 不能补的原因（no_card / already / no_prev）。口径见 server/makeup-card.js：
    // 严格连续满 7 天得 1 张，只能补「昨天」，且前天必须有签到记录。
    makeup: { cards: 0, can: false, target: '', reason: '' },
    // M5 T2.3 门禁：未登录（直接 URL 进来）时展示引导条，不发请求
    needLogin: false,
    gateText: ''
  },

  onShow: function () {
    if (!auth.requireLogin(this, '登录后签到记录才会保存到云端')) return;
    this.loadData();
  },

  /** 门禁引导条「去登录」：成功后重新加载签到数据 */
  onGateLogin: function () {
    var self = this;
    auth.loginFromGate(this, function () {
      self.loadData();
    }, '登录后签到记录才会保存到云端').then(function (user) {
      if (!user && typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '登录后才能查看签到日历', icon: 'none' });
      }
    });
  },

  loadData: function () {
    var self = this;
    var now = new Date();
    var month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // 并行拉签到记录 + 每日一题里程碑
    // 2026-10-28：原来两个请求都 `.catch(() => null)` 静默吞错，用户看到的是一片空日历，
    // 分不清「这个月没签过」和「请求失败了」。现在区分开：
    //   签到记录失败 → 记 loadError，页面上给明确提示 + 重试；
    //   里程碑只是次要信息，失败不阻断日历（保持原来的兜底）。
    var failed = false;
    var p1 = request.get('/api/checkin?month=' + month).catch(function () { failed = true; return null; });
    var p2 = request.get('/api/daily/status').catch(function () { return null; });

    Promise.all([p1, p2]).then(function (res) {
      var data = res[0] || null;
      var daily = res[1] || null;
      if (!data) {
        self.setData({ today: self._today(), loadError: failed, makeup: self._emptyMakeup() });
        return;
      }
      var today = self._today();
      var records = data.records || [];
      var signedDates = {};
      records.forEach(function (r) { signedDates[r.date] = 1; });

      self.setData({
        today: today,
        loadError: false,
        checkedIn: !!signedDates[today],
        currentStreak: data.currentStreak || 0,
        totalCheckins: data.totalCheckins || 0,
        calCells: self._buildCells(signedDates),
        milestones: self._buildMilestones(daily),
        makeup: data.makeup || self._emptyMakeup()
      });
    });
  },

  /** 补签卡的空态（老后端还没有这个字段时兜底，页面不会因为 undefined 报错） */
  _emptyMakeup: function () {
    return { cards: 0, can: false, target: '', reason: '' };
  },

  /**
   * 用一张补签卡补昨天。
   *
   * 不做二次确认弹窗：卡片上已经写清「昨天（10-28）断签了，用一张接上连续」，
   * 再弹一个 modal 只是重复一遍同样的话。用 wx.showLoading 顶住连点即可
   * （失败时服务端的条件更新也会挡住重复消费，前端这道锁是省一次无谓请求）。
   */
  useMakeup: function () {
    var self = this;
    if (this._mkBusy) return;
    this._mkBusy = true;
    wx.showLoading({ title: '补签中', mask: true });
    request.post('/api/checkin/makeup', {}).then(function (d) {
      wx.hideLoading();
      self._mkBusy = false;
      var r = d || {};
      wx.showToast({ title: '补上了，连续 ' + (r.streak || 1) + ' 天', icon: 'none' });
      self.loadData();
    }).catch(function (e) {
      wx.hideLoading();
      self._mkBusy = false;
      // 失败也刷新：可能是并发/状态过期（比如刚在别的设备上补过了）
      wx.showToast({ title: (e && e.message) || '补签失败，稍后再试', icon: 'none' });
      self.loadData();
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
  },

  // M5 T4.1：签到页分享
  onShareAppMessage: function () {
    var streak = this.data.currentStreak || 0;
    return {
      title: streak > 0
        ? ('词力战士 - 我已连续打卡 ' + streak + ' 天，一起坚持学字词！')
        : '词力战士 - 每天一题，坚持打卡攒星星换皮肤',
      path: '/pages/index/index'
    };
  }
});
