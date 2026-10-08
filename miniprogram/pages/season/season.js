// 赛季页（2026-10-08 新增）
//
// 赛季 = 自然双月（1-2 月 … 11-12 月）。
// 赛季积分口径：**本赛季内获得的星星，按 (玩法×学段×题型×关卡) 去重求和** ——
// 与段位星同一套算法，区别只是多了时间窗，反复刷同一关不会重复计分。
// 赛季结束后可在本页领一次奖励（前三 +30 / 4~10 名 +15 / 活跃参与 +5）。
var request = require('../../utils/request');
var auth = require('../../utils/auth');

Page({
  data: {
    loading: true,
    loggedIn: false,
    available: true,
    notReadyMsg: '',
    season: null,
    me: { stars: 0, rank: 0 },
    ladder: [],
    prevSeason: null,
    tiers: [],
    claiming: false
  },

  onLoad: function () {
    this.setData({ loggedIn: auth.isLoggedIn() });
    this.loadInfo();
  },

  onShow: function () {
    this.setData({ loggedIn: auth.isLoggedIn() });
  },

  loadInfo: function () {
    var self = this;
    request.get('/api/season/info').then(function (d) {
      if (!d) return;
      if (d.available === false) {
        self.setData({ loading: false, available: false, notReadyMsg: d.message || '功能准备中' });
        return;
      }
      self.setData({
        loading: false,
        available: true,
        season: d.season,
        me: d.me || { stars: 0, rank: 0 },
        ladder: (d.ladder || []).map(function (r) {
          return {
            rank: r.rank,
            nickname: r.nickname,
            avatarUrl: r.avatarUrl || '',
            initial: String(r.nickname || '战').slice(0, 1),
            stars: r.stars,
            isMe: r.isMe,
            medal: r.rank === 1 ? '🥇' : (r.rank === 2 ? '🥈' : (r.rank === 3 ? '🥉' : ''))
          };
        }),
        prevSeason: d.prevSeason || null,
        tiers: d.tiers || []
      });
    }).catch(function () {
      self.setData({ loading: false, available: false, notReadyMsg: '服务暂时不可用，请稍后再试' });
    });
  },

  claim: function () {
    var self = this;
    if (this.data.claiming) return;
    var prev = this.data.prevSeason;
    if (!prev || !prev.claimable) return;
    this.setData({ claiming: true });
    request.post('/api/season/claim', { seasonKey: prev.key }).then(function (d) {
      self.setData({ claiming: false });
      if (!d) return;
      wx.showModal({
        title: '🎉 赛季奖励到账',
        content: (d.already ? '你已经领过了：' : '领取成功：') + '+' + d.stars + ' ⭐' + (d.tierLabel ? '（' + d.tierLabel + '）' : ''),
        showCancel: false,
        complete: function () { self.loadInfo(); }
      });
    }).catch(function (err) {
      self.setData({ claiming: false });
      wx.showModal({
        title: '暂时领不了',
        content: (err && err.message) || '请稍后再试',
        showCancel: false
      });
    });
  },

  goLogin: function () {
    var self = this;
    auth.promptLogin('登录后才能查看赛季榜').then(function (u) {
      if (u) {
        self.setData({ loggedIn: true });
        self.loadInfo();
      }
    });
  },

  goBack: function () {
    wx.navigateBack({
      fail: function () { wx.switchTab({ url: '/pages/index/index' }); }
    });
  },

  onShareAppMessage: function () {
    var name = (this.data.season && this.data.season.name) || '词力战士赛季';
    return {
      title: '词力战士 - ' + name + '，来冲榜拿奖励',
      path: '/pages/season/season'
    };
  }
});
