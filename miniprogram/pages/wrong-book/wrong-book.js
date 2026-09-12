// 错题本列表页（wrong-book）
//
// 职责：
//   1. 展示待复习/已掌握错题，按到期时间分组（已到期/明天/更久）
//   2. **分页展示**（2026-09-12 需求②）：翻页交给服务端（scope + page + pageSize），
//      不再把整本错题一次性拉到端上；「加载更多」取下一页并追加
//   3. 手动移除单条错题（已掌握但选择保留的题目，也需要能删掉，否则永远清不干净）
//   4. 点击进入复习模式；显示统计
//
// 兼容策略：客户端可能比云托管上的服务端新（前端发版快于后端部署），
//   因此拿到「老形状」（data.pending 是数组、没有 data.items）时自动退回全量渲染。
//   旧客户端 → 新服务端也兼容（服务端不传分页参数时仍返回老形状，见 server/wrong-book.js）。

var request = require('../../utils/request');
var view = require('../../utils/wrong-book-view');

// 每页条数（与后端 MAX_PAGE_SIZE=100 的上限对齐）
var PAGE_N = view.PAGE_SIZE;

Page({
  data: {
    pending: [],
    mastered: [],
    renderList: [],        // 待复习混合渲染列表（已加载页）：{t:'g',text} 分组行 | {t:'c',it:card}
    visible: [],           // 待复习当前展示行（与 renderList 同步；wxml 沿用）
    visibleN: 0,           // 待复习已加载条数（卡片数，不含分组行）
    page: 1,               // 当前已加载到第几页（针对 activeTab）
    moreCount: 0,          // 「加载更多」还可以加载多少条
    hasMore: false,
    stats: { total: 0, pending: 0, mastered: 0 },
    loading: false,
    loadingMore: false,
    activeTab: 'pending',
    loadError: ''          // 加载失败原因（非空时展示错误条）
  },

  onShow: function () {
    this.loadWrongBook(true);
  },

  /**
   * 加载错题本。
   * @param {boolean} reset true=从第一页重载（进页面 / 切 tab / 重试）；false=加载下一页
   */
  loadWrongBook: function (reset) {
    var self = this;
    // 三种入口：onShow/切 tab 传 true；「加载更多」不传参；错误条点击传的是事件对象（带 data-reset="1"）
    var isReset = (reset === true)
      || !!(reset && reset.currentTarget && reset.currentTarget.dataset && reset.currentTarget.dataset.reset === '1');
    var scope = this.data.activeTab;
    var page = isReset ? 1 : (this.data.page + 1);
    if (!isReset && (this.data.loadingMore || !this.data.hasMore)) return;

    if (isReset) self.setData({ loading: true, loadError: '' });
    else self.setData({ loadingMore: true });

    request.get(view.listUrl(scope, page, PAGE_N)).then(function (data) {
      // 老服务端兼容：没有 items 字段说明返回的是老的 { pending, mastered, total }
      if (!data || !data.items) {
        return self.setData(Object.assign(view.applyLegacy(data), {
          loading: false, loadingMore: false, loadError: ''
        }));
      }
      self.setData(Object.assign(view.applyPage(self.data, data, isReset), {
        loading: false, loadingMore: false, loadError: ''
      }));
    }).catch(function (err) {
      // 诊断日志：失败不再静默
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[wrong-book] 加载失败 code=' + (err && err.code) + ' msg=' + (err && err.message));
      }
      self.setData({
        loading: false,
        loadingMore: false,
        loadError: (err && err.message) || '加载失败，请重试'
      });
    });
  },

  // 加载更多（取下一页追加）
  showMore: function () {
    this.loadWrongBook(false);
  },

  // 切换标签：切换后重载该 tab 的第一页（两个 tab 各自分页）
  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab, page: 1, hasMore: false, moreCount: 0 });
    this.loadWrongBook(true);
  },

  /**
   * 手动移除一条错题（已掌握但选择保留的题目也能删掉，否则错题本永远清不干净）。
   * 幂等：接口对「已删除/不存在」返回 removed=0，这里都按成功处理。
   */
  removeItem: function (e) {
    var self = this;
    var recordId = e.currentTarget.dataset.id;
    if (!recordId) return;

    wx.showModal({
      title: '移出错题本',
      content: '移除后不再出现在错题本与复习里，确定吗？',
      confirmText: '移除',
      cancelText: '再想想',
      success: function (res) {
        if (!res.confirm) return;
        request.post('/api/wrong/remove', { recordId: recordId }).then(function () {
          self._dropLocal(recordId);
          wx.showToast({ title: '已移出错题本', icon: 'none' });
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '移除失败，请重试', icon: 'none' });
        });
      }
    });
  },

  /** 本地同步删除（不重新拉整页，避免多一次往返与列表跳动） */
  _dropLocal: function (recordId) {
    this.setData(view.removeRecord(this.data, recordId));
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
