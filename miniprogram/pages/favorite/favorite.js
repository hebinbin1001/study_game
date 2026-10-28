// 生词本（2026-10-28）
//
// 定位：**用户主动收藏**的词，用来「再看一眼 / 专门练一遍」。
//   与错题本的区别：错题本是被动收集（答错自动进）+ 艾宾浩斯排期；
//   生词本不排期、不算掌握度，只有「收藏」和「组一局」两件事。
//
// 练习模式**不上报分数、不记星**：
//   组局用的是用户自己的收藏，题量随收藏数变化（可能只有 3 题），
//   如果按普通闯关算星，就会出现「收藏 3 个词刷 3 星」的刷星口子。
//   练习就是练习，页面上也直说。
//
// 数据量级：一次拉 100 条（后端单页上限）。生词本是精挑细选的清单，
//   真到 100 条也需要用户自己清理了 —— 不做无限滚动，避免多一套分页状态。

var request = require('../../utils/request');
var auth = require('../../utils/auth');
var quickQuiz = require('../../utils/quick-quiz');
var dict = require('../../utils/dict');

var PAGE_SIZE = 100;
var QUIZ_N = 10;

Page({
  data: {
    needLogin: false,
    loading: true,
    items: [],
    total: 0,

    mode: 'list',      // list | quiz | done
    quiz: [],
    qi: 0,
    cur: null,
    picked: '',
    judged: false,
    correctCount: 0,
    rate: 0
  },

  onShow: function () {
    if (!auth.isLoggedIn()) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    this.setData({ needLogin: false });
    this.loadList();
  },

  loadList: function () {
    var self = this;
    this.setData({ loading: true });
    request
      .get('/api/favorite/list?page=1&pageSize=' + PAGE_SIZE)
      .then(function (res) {
        var data = (res && res.data) || {};
        self.setData({
          loading: false,
          items: data.items || [],
          total: data.total || 0
        });
      })
      .catch(function () {
        // 拉不到就展示空态：这是「复习工具」，不是主流程，失败不该弹窗打断
        self.setData({ loading: false });
      });
  },

  goBack: function () {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/me/me' });
      }
    });
  },

  onGateLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  /**
   * 移除一条。用 showModal 确认而不是「删了给后悔药」：
   * 生词本没有撤销入口，误删只能重新遇到那个词才收得回来。
   */
  remove: function (e) {
    var word = e.currentTarget.dataset.word;
    var self = this;
    wx.showModal({
      title: '移出生词本',
      content: '「' + word + '」移出后不再出现在这里。',
      confirmText: '移出',
      success: function (r) {
        if (!r.confirm) return;
        request
          .post('/api/favorite/remove', { word: word })
          .then(function () {
            var left = (self.data.items || []).filter(function (it) {
              return it.word !== word;
            });
            self.setData({ items: left, total: left.length });
            wx.showToast({ title: '已移出', icon: 'none' });
          })
          .catch(function () {
            wx.showToast({ title: '移出失败，稍后再试', icon: 'none' });
          });
      }
    });
  },

  /**
   * 用收藏的词组一局。
   * 干扰项池用**当前学段词库**而不是收藏列表：只收藏 3 个词的人，
   * 从收藏里取干扰项会凑出「以上都不是」这种废选项。
   */
  startQuiz: function () {
    var items = this.data.items || [];
    if (!items.length) {
      wx.showToast({ title: '先收藏几个词', icon: 'none' });
      return;
    }

    var grade = items[0].grade || 'g3';
    var pool = [];
    try {
      pool = dict.loadByGrade(grade) || [];
    } catch (e) {
      pool = [];
    }

    var quiz = quickQuiz.buildQuizFromItems(items, Date.now(), Math.min(QUIZ_N, items.length), pool);
    if (!quiz.length) {
      wx.showToast({ title: '组题失败，稍后再试', icon: 'none' });
      return;
    }

    this.setData({
      mode: 'quiz',
      quiz: quiz,
      qi: 0,
      cur: quiz[0],
      picked: '',
      judged: false,
      correctCount: 0,
      rate: 0
    });
  },

  pick: function (e) {
    if (this.data.judged) return;
    var key = String(e.currentTarget.dataset.key);
    var cur = this.data.cur;
    var ok = key === cur.answerKey;
    this.setData({
      picked: key,
      judged: true,
      correctCount: this.data.correctCount + (ok ? 1 : 0)
    });
  },

  next: function () {
    var i = this.data.qi + 1;
    if (i >= this.data.quiz.length) {
      var total = this.data.quiz.length;
      var rate = Math.round((this.data.correctCount / total) * 100);
      this.setData({ mode: 'done', rate: rate });
      return;
    }
    this.setData({
      qi: i,
      cur: this.data.quiz[i],
      picked: '',
      judged: false
    });
  },

  retry: function () {
    // 换种子重新抽题，避免「记住答案位置」式的假熟练
    this.startQuiz();
  },

  backToList: function () {
    this.setData({ mode: 'list', quiz: [], cur: null });
    this.loadList();
  }
});
