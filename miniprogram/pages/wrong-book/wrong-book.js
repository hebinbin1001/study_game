// 错题本列表页（wrong-book）
//
// 职责：
//   1. 展示待复习/已掌握的错题分组
//   2. 点击进入复习模式
//   3. 显示错题统计

var request = require('../../utils/request');
var ebbinghaus = require('../../utils/ebbinghaus');

Page({
  data: {
    pending: [],
    mastered: [],
    stats: { total: 0, pending: 0, mastered: 0 },
    loading: false,
    activeTab: 'pending',
    loadError: ''   // 加载失败原因（非空时展示错误条）
  },

  onShow: function () {
    this.loadWrongBook();
  },

  // 加载错题本
  loadWrongBook: function () {
    var self = this;
    self.setData({ loading: true });

    request.get('/api/wrong/list').then(function (data) {
      // 处理待复习题目，计算复习进度
      var pending = (data.pending || []).map(function (item) {
        return {
          recordId: item.recordId,
          questionId: item.questionId,
          question: item.question,
          wrongCount: item.wrongCount,
          mastery: item.mastery,
          nextReviewAt: item.nextReviewAt,
          reviewCount: item.reviewCount,
          reviewProgress: ebbinghaus.getReviewProgress(item.mastery),
          reviewStageText: ebbinghaus.getReviewStageText(item.reviewCount),
          nextReviewText: ebbinghaus.getNextReviewText(item.nextReviewAt)
        };
      });

      // 已掌握题目
      var mastered = (data.mastered || []).map(function (item) {
        return {
          recordId: item.recordId,
          questionId: item.questionId,
          question: item.question,
          wrongCount: item.wrongCount,
          mastery: item.mastery
        };
      });

      // 诊断日志：确认列表请求成功与数量（vConsole 可见）
      if (typeof console !== 'undefined' && console.log) {
        console.log('[wrong-book] 加载成功 total=' + (data.total || 0) +
          ' pending=' + pending.length + ' mastered=' + mastered.length +
          ' first=' + (pending[0] ? pending[0].questionId : '-'));
      }

      self.setData({
        pending: pending,
        mastered: mastered,
        stats: {
          total: pending.length + mastered.length,
          pending: pending.length,
          mastered: mastered.length
        },
        loadError: '',
        loading: false
      });
    }).catch(function (err) {
      // 诊断日志：失败不再静默（此前静默导致“看起来为空”难排查）
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[wrong-book] 加载失败 code=' + (err && err.code) + ' msg=' + (err && err.message));
      }
      self.setData({
        loading: false,
        loadError: (err && err.message) || '加载失败，请重试'
      });
    });
  },

  // 切换标签
  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 开始复习
  startReview: function () {
    wx.navigateTo({ url: '/pages/wrong-review/wrong-review' });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});