// 成就列表页（achievement）
//
// 职责：
//   1. 展示成就列表 + 解锁状态 + **进度条**（2026-09-12 需求④：成就主页更丰富）
//   2. **分类筛选**（全部/答题/关卡/玩法/习惯/错题/段位/自定义）+ 「只看已解锁」
//   3. 检查并解锁新成就（服务端幂等）
//
// 视觉兜底：成就图标由美术产出（/assets/achievements/<id>.png，见 docs/美术素材需求与豆包提示词.md），
//   图未到位时 <image> 会触发 error → 该卡片改用分类 emoji 呈现，不出现裂图。
//   纯逻辑（分类推导/分组/进度文案/日期）在 utils/achievement-view.js，可单测。

var request = require('../../utils/request');
var auth = require('../../utils/auth');
var view = require('../../utils/achievement-view');

Page({
  data: {
    all: [],               // 全部成就卡片（装饰后）
    achievements: [],      // 当前筛选下要渲染的行（含分类分组标题）
    categories: [],        // 分类 tab（由数据推导）
    activeCategory: 'all',
    loading: false,
    unlockedCount: 0,      // 已解锁数量（页头总进度卡）
    totalCount: 0,         // 成就总数
    progressPercent: 0,    // 收集进度百分比（0-100，模板预处理字段）
    loadError: ''
  },

  onShow: function () {
    this.loadAchievements();
  },

  // 加载成就列表
  loadAchievements: function () {
    var self = this;
    self.setData({ loading: true });

    request.get('/api/achievement/list').then(function (data) {
      var all = view.decorate(data || []);
      var categories = view.buildCategories(all);
      var summary = view.summaryOf(all);
      var active = self.data.activeCategory || 'all';
      // 切学段/换数据后原分类可能不存在了 → 回退「全部」
      var exists = categories.some(function (c) { return c.key === active; });
      if (!exists) active = 'all';
      self.setData({
        all: all,
        categories: categories,
        activeCategory: active,
        achievements: view.buildRows(all, active, categories),
        unlockedCount: summary.unlocked,
        totalCount: summary.total,
        progressPercent: summary.percent,
        loading: false,
        loadError: ''
      });
    }).catch(function (err) {
      self.setData({
        loading: false,
        loadError: (err && err.message) || '加载失败，请重试'
      });
    });
  },

  // 切换分类 tab
  pickCategory: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeCategory) return;
    this.setData({
      activeCategory: key,
      achievements: view.buildRows(this.data.all, key, this.data.categories)
    });
  },

  // 成就图标加载失败（图还没做/没发到）→ 该卡片改用 emoji 兜底
  onIconError: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    var key = 'achievements[' + e.currentTarget.dataset.index + '].it.iconErr';
    var patch = {};
    patch[key] = true;
    this.setData(patch);
  },

  // 检查解锁
  checkUnlock: function () {
    var self = this;
    request.post('/api/achievement/check', {}).then(function (data) {
      if (data && data.newlyUnlocked && data.newlyUnlocked.length > 0) {
        var names = data.newlyUnlocked.map(function (a) { return a.name; }).join('、');
        wx.showModal({
          title: '🎉 解锁新成就',
          content: names,
          showCancel: false,
          confirmText: '太好了'
        });
      } else {
        wx.showToast({ title: '暂时没有新成就', icon: 'none' });
      }
      self.loadAchievements();
    }).catch(function () {
      // 检查解锁失败，静默忽略
    });
  },

  // 生成战绩分享卡（M6-K）：带昵称 + 段位 + 累计星 进入分享卡页
  goShareCard: function () {
    var self = this;
    var u = auth.getUser();
    var nickname = (u && u.nickname) || '';
    request.get('/api/rank/info').then(function (d) {
      self._openShareCard(nickname, (d && d.rankName) || '', (d && d.stars) || 0);
    }).catch(function () {
      self._openShareCard(nickname, '', 0);
    });
  },

  _openShareCard: function (nickname, rankName, stars) {
    var q =
      'nickname=' + encodeURIComponent(nickname || '') +
      '&rankName=' + encodeURIComponent(rankName || '') +
      '&stars=' + (parseInt(stars, 10) || 0);
    wx.navigateTo({ url: '/pages/share-card/share-card?' + q });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});
