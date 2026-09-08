// 错题本列表页（wrong-book）
//
// 职责：
//   1. 展示待复习/已掌握错题，按到期时间分组（已到期/明天/更久）
//   2. 长列表分批展示（加载更多），避免错题多时一屏过载
//   3. 点击进入复习模式；显示统计

var request = require('../../utils/request');
var ebbinghaus = require('../../utils/ebbinghaus');

// 每次追加展示条数
var PAGE_N = 20;

Page({
  data: {
    pending: [],
    mastered: [],
    renderList: [],        // 待复习混合渲染列表（全量）：{t:'g',text} 分组行 | {t:'c',it:card}
    visible: [],           // 当前展示子集（分批加载，避免长列表一屏过载）
    visibleN: PAGE_N,      // 当前已展示条数
    hasMore: false,
    stats: { total: 0, pending: 0, mastered: 0 },
    loading: false,
    activeTab: 'pending',
    loadError: ''          // 加载失败原因（非空时展示错误条）
  },

  onShow: function () {
    this.loadWrongBook();
  },

  // 加载错题本
  loadWrongBook: function () {
    var self = this;
    self.setData({ loading: true });

    request.get('/api/wrong/list').then(function (data) {
      // 待复习：补展示字段并按到期文本分组（已到期 / 明天 / 后天 / N天后）
      var pending = (data.pending || []).map(function (item) {
        var nextText = ebbinghaus.getNextReviewText(item.nextReviewAt);
        return {
          recordId: item.recordId,
          questionId: item.questionId,
          question: item.question,
          wrongCount: item.wrongCount,
          mastery: item.mastery,
          nextReviewAt: item.nextReviewAt,
          reviewCount: item.reviewCount,
          dueLabel: nextText,
          reviewProgress: ebbinghaus.getReviewProgress(item.mastery),
          reviewStageText: ebbinghaus.getReviewStageText(item.reviewCount),
          nextReviewText: nextText
        };
      });

      // 分组标题：相同到期文本合并（后端已按 nextReviewAt 升序）
      var renderList = [];
      var last = '';
      pending.forEach(function (it) {
        if (it.dueLabel !== last) {
          renderList.push({ t: 'g', text: it.dueLabel });
          last = it.dueLabel;
        }
        renderList.push({ t: 'c', it: it });
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
        renderList: renderList,
        visibleN: PAGE_N,
        visible: renderList.slice(0, PAGE_N),
        hasMore: renderList.length > PAGE_N,
        stats: {
          total: pending.length + mastered.length,
          pending: pending.length,
          mastered: mastered.length
        },
        loadError: '',
        loading: false
      });
    }).catch(function (err) {
      // 诊断日志：失败不再静默
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[wrong-book] 加载失败 code=' + (err && err.code) + ' msg=' + (err && err.message));
      }
      self.setData({
        loading: false,
        loadError: (err && err.message) || '加载失败，请重试'
      });
    });
  },

  // 加载更多
  showMore: function () {
    var n = Math.min(this.data.renderList.length, this.data.visibleN + PAGE_N);
    this.setData({
      visibleN: n,
      visible: this.data.renderList.slice(0, n),
      hasMore: n < this.data.renderList.length
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
