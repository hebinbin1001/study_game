// 排行榜页（rank）—— B3 双榜：总榜(星星) / 按玩法·闯关进度
// 总榜：/api/ranklist/world（全服按累计星星）+ /api/ranklist/me
// 玩法榜：/api/ranklist/progress?game=&grade=&type=（进度优先；字词按学段+题型）
var request = require('../../utils/request');
var constants = require('../../utils/constants');

var PAGE_SIZE = 50;

Page({
  data: {
    mode: 'total',             // 'total' | 'game'
    // 总榜
    totalList: [],
    totalMe: null,
    totalCount: 0,
    // 玩法榜
    gameList: [],
    gameMe: null,
    gameCount: 0,
    gameLoading: false,
    totalLoading: false,
    // 玩法筛选 chips
    gameChips: [
      { key: 'word', label: '📚 字词', on: true, ready: true },
      { key: 'sudoku', label: '数独', on: false, ready: false },
      { key: 'g2048', label: '2048', on: false, ready: false },
      { key: 'g24', label: '24点', on: false, ready: false }
    ],
    curGame: 'word',
    // 字词榜的学段 + 题型筛选（玩法榜=word 时显示）
    grades: [],
    curGradeIndex: 0,
    curGradeKey: '',
    types: [],
    curType: 'all'
  },

  onLoad: function () {
    var grades = constants.GRADES || [];
    var types = [{ key: 'all', label: '综合' }].concat(
      (constants.TYPE_GROUPS || []).filter(function (t) { return t.key !== 'all'; }).map(function (t) {
        return { key: t.key, label: t.label };
      })
    );
    var curGradeKey = grades.length ? grades[0].key : '';
    this.setData({ grades: grades, curGradeKey: curGradeKey, types: types });
    this.loadTotal();
    this.loadGame();
  },

  onShow: function () {
    this.loadTotal();
    if (this.data.mode === 'game') this.loadGame();
  },

  switchMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode: mode });
    if (mode === 'total' && !this.data.totalList.length) this.loadTotal();
    if (mode === 'game' && !this.data.gameList.length) this.loadGame();
  },

  pickGame: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.curGame) return;
    var chip = this.data.gameChips.find(function (c) { return c.key === key; });
    if (!chip || !chip.ready) {
      wx.showToast({ title: key === 'sudoku' ? '数独榜上线中' : '该玩法即将上线', icon: 'none' });
      return;
    }
    this.setData({
      curGame: key,
      gameChips: this.data.gameChips.map(function (c) { return Object.assign({}, c, { on: c.key === key }); })
    });
    this.loadGame();
  },

  pickGrade: function (e) {
    var idx = e.currentTarget.dataset.index;
    if (idx === this.data.curGradeIndex) return;
    this.setData({ curGradeIndex: idx, curGradeKey: this.data.grades[idx].key });
    this.loadGame();
  },

  pickType: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.curType) return;
    this.setData({ curType: key });
    this.loadGame();
  },

  // ===== 总榜（星星）=====
  loadTotal: function () {
    var self = this;
    self.setData({ totalLoading: true });
    Promise.all([
      request.get('/api/ranklist/world?page=1&pageSize=' + PAGE_SIZE),
      request.get('/api/ranklist/me')
    ]).then(function (r) {
      var list = (r[0].list || []).map(function (it) { return self._decorate(it, it.stars, '⭐'); });
      self.setData({
        totalList: list,
        totalCount: r[0].total || 0,
        totalMe: r[1] ? Object.assign({}, r[1], { val: r[1].stars, unit: '⭐' }) : null,
        totalLoading: false
      });
    }).catch(function () { self.setData({ totalLoading: false }); });
  },

  // ===== 玩法进度榜 =====
  loadGame: function () {
    var self = this;
    self.setData({ gameLoading: true });
    var url = '/api/ranklist/progress?game=word_warrior&grade=' + this.data.curGradeKey +
      '&type=' + this.data.curType + '&pageSize=' + PAGE_SIZE;
    request.get(url).then(function (d) {
      if (!d) return;
      var list = (d.list || []).map(function (it) {
        return self._decorate(it, '第 ' + it.maxLevel + ' 关', '进度 · ' + it.passedLevels + ' 关');
      });
      self.setData({
        gameList: list,
        gameCount: d.total || 0,
        gameMe: d.me ? self._decorate(d.me, '第 ' + d.me.maxLevel + ' 关', '进度') : null,
        gameLoading: false
      });
    }).catch(function () { self.setData({ gameLoading: false }); });
  },

  _decorate: function (it, valText, subText) {
    return {
      rank: it.rank,
      openid: it.openid,
      nickname: it.nickname || '未命名',
      avatarUrl: it.avatarUrl || '',
      rankName: it.rankName || '',
      stars: it.stars || 0,
      valText: valText,
      subText: subText
    };
  },

  getRankClass: function (rank) {
    if (rank === 1) return 'top1';
    if (rank === 2) return 'top2';
    if (rank === 3) return 'top3';
    return '';
  },
  getRankEmoji: function (rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  },

  goBack: function () { wx.navigateBack(); }
});
