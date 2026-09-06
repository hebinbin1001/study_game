// 排行榜页（rank）
//
// 职责：
//   1. 展示世界排行榜（Top 100）
//   2. 展示我的排名
//   3. 分页加载

var request = require('../../utils/request');

Page({
  // 获取排名样式类
  getRankClass: function (rank) {
    if (rank === 1) return 'top1';
    if (rank === 2) return 'top2';
    if (rank === 3) return 'top3';
    return '';
  },

  // 获取排名 emoji
  getRankEmoji: function (rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  },
  data: {
    list: [],
    myRank: null,
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    tab: 'world' // 'world' | 'friends'
  },

  onShow: function () {
    this.loadRank();
  },

  // 加载排行榜
  loadRank: function () {
    var self = this;
    self.setData({ loading: true });

    var tab = self.data.tab;
    var api = tab === 'world' ? '/api/rank/world' : '/api/rank/friends';

    Promise.all([
      request.get(api + '?page=' + self.data.page + '&pageSize=' + self.data.pageSize),
      request.get('/api/rank/me')
    ]).then(function (results) {
      var rankRes = results[0];
      var myRes = results[1];

      if (rankRes.code === 0 && rankRes.data) {
        self.setData({
          list: rankRes.data.list || [],
          total: rankRes.data.total || 0,
          loading: false
        });
      }

      if (myRes.code === 0 && myRes.data) {
        self.setData({ myRank: myRes.data });
      }
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  // 切换标签
  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ tab: tab, page: 1 });
    this.loadRank();
  },

  // 上一页
  prevPage: function () {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 });
    this.loadRank();
  },

  // 下一页
  nextPage: function () {
    var totalPages = Math.ceil(this.data.total / this.data.pageSize);
    if (this.data.page >= totalPages) return;
    this.setData({ page: this.data.page + 1 });
    this.loadRank();
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});