// 排行榜页（rank）
//
// 职责：
//   1. 展示全服排行榜（Top 100）
//   2. 展示我的排名
//   3. 分页加载
//
// 注：好友榜已下线，只保留「全服榜」。

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
    loading: false
  },

  onShow: function () {
    this.loadRank();
  },

  // 加载排行榜（v2 契约：resolve 的是 data，失败走 catch）
  loadRank: function () {
    var self = this;
    self.setData({ loading: true });

    Promise.all([
      request.get('/api/ranklist/world?page=' + self.data.page + '&pageSize=' + self.data.pageSize),
      request.get('/api/ranklist/me')
    ]).then(function (results) {
      var rankData = results[0]; // 世界榜 data：{ list, total, ... }
      var myData = results[1];   // 我的排名 data：{ rank, nickname, ... }

      self.setData({
        list: rankData.list || [],
        total: rankData.total || 0,
        myRank: myData,
        loading: false
      });
    }).catch(function () {
      self.setData({ loading: false });
    });
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
