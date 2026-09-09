// 自定义题库中心（B4）：
//   1.「我的题库」：草稿/待审核/已通过（可玩/编辑/复制分享码）
//   2.「公开广场」：全网 approved 关卡（可玩）
//   3. 新建关卡 → level-editor
//   4. 分享导入 → level-share（输 6 位码）
var request = require('../../utils/request');
var constants = require('../../utils/constants');

var STATUS = {
  draft: { label: '草稿', cls: '' },
  pending: { label: '审核中', cls: 'pending' },
  approved: { label: '已公开', cls: 'ok' },
  rejected: { label: '未通过', cls: 'no' }
};

Page({
  data: {
    tab: 'mine',          // 'mine' | 'public'
    mine: [],
    publicList: [],
    publicTotal: 0,
    loading: false,
    gradeLabelMap: {}
  },

  onLoad: function () {
    var m = {};
    (constants.GRADES || []).forEach(function (g) { m[g.key] = g.label; });
    this.setData({ gradeLabelMap: m });
  },

  onShow: function () {
    if (this.data.tab === 'mine') this.loadMine();
    else this.loadPublic();
  },

  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab: tab });
    if (tab === 'mine') this.loadMine();
    else this.loadPublic();
  },

  loadMine: function () {
    var self = this;
    self.setData({ loading: true });
    request.get('/api/level/list').then(function (levels) {
      var list = (levels || []).map(function (lv) {
        var s = STATUS[lv.status] || { label: lv.status, cls: '' };
        return {
          levelId: lv.levelId,
          title: lv.title,
          gradeLabel: self.data.gradeLabelMap[lv.grade] || lv.grade,
          totalQ: lv.totalQ || 0,
          statusLabel: s.label,
          statusCls: s.cls,
          shareCode: lv.shareCode || '',
          ready: lv.status === 'approved' && (lv.totalQ || 0) === 10
        };
      });
      self.setData({ mine: list, loading: false });
    }).catch(function () { self.setData({ loading: false }); });
  },

  loadPublic: function () {
    var self = this;
    self.setData({ loading: true });
    request.get('/api/level/public?page=1&pageSize=50').then(function (d) {
      var list = (d.list || []).map(function (lv) {
        return {
          levelId: lv.levelId,
          title: lv.title,
          authorName: lv.authorName || '匿名',
          gradeLabel: self.data.gradeLabelMap[lv.grade] || lv.grade,
          totalQ: lv.totalQ || 0,
          ready: (lv.totalQ || 0) === 10
        };
      });
      self.setData({ publicList: list, publicTotal: d.total || 0, loading: false });
    }).catch(function () { self.setData({ loading: false }); });
  },

  // 新建/编辑 → level-editor
  createNew: function () {
    wx.navigateTo({ url: '/pages/level-editor/level-editor' });
  },
  editLevel: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/level-editor/level-editor?levelId=' + id });
  },

  // 提交审核（需 10 个一组，后端强校验）
  submitLevel: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    request.post('/api/level/submit', { levelId: id }).then(function () {
      wx.showToast({ title: '已提交审核', icon: 'success' });
      self.loadMine();
    }).catch(function (err) {
      wx.showModal({ title: '无法提交', content: err.message || '提交失败', showCancel: false });
    });
  },

  // 生成分享码
  shareLevel: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    request.post('/api/level/share', { levelId: id }).then(function (d) {
      var code = d && d.shareCode ? d.shareCode : '';
      wx.showModal({
        title: '分享码',
        content: '分享码：' + code,
        confirmText: '复制',
        success: function (r) {
          if (!r.confirm || !code) return;
          wx.setClipboardData({ data: code });
        }
      });
      self.loadMine();
    }).catch(function () {});
  },

  // 玩（approved 10 题）→ game?customLevel=JSON
  playLevel: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    request.get('/api/level/import?code=' + e.currentTarget.dataset.code).then(function (data) {
      wx.navigateTo({
        url: '/pages/game/game?customLevel=' + encodeURIComponent(JSON.stringify(data))
      });
    }).catch(function () {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 输入分享码导入（复用 level-share 页）
  goImport: function () {
    wx.navigateTo({ url: '/pages/level-share/level-share' });
  },

  goBack: function () { wx.navigateBack(); }
});
