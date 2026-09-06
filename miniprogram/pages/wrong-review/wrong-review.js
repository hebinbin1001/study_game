// 错题复习页（wrong-review）
//
// 职责：
//   1. 逐题展示待复习题目
//   2. 选择答案，反馈正误
//   3. 更新复习状态（艾宾浩斯算法）

var request = require('../../utils/request');

Page({
  data: {
    items: [],
    currentIndex: 0,
    currentItem: null,
    selectedOption: null,
    answered: false,
    correct: false,
    showFeedback: false,
    completed: false,
    correctCount: 0,
    totalCount: 0
  },

  onShow: function () {
    this.loadPendingItems();
  },

  // 加载待复习题目
  loadPendingItems: function () {
    var self = this;
    request.get('/api/wrong/list').then(function (data) {
      var pending = data.pending || [];
      if (pending.length === 0) {
        self.setData({ completed: true, totalCount: 0 });
        return;
      }

      self.setData({
        items: pending,
        totalCount: pending.length,
        currentIndex: 0,
        currentItem: pending[0],
        selectedOption: null,
        answered: false,
        correct: false,
        showFeedback: false,
        correctCount: 0
      });
    }).catch(function () {
      // 加载失败，标记为空完成态
      self.setData({ completed: true, totalCount: 0 });
    });
  },

  // 选择选项
  selectOption: function (e) {
    var self = this;
    if (this.data.answered) return;

    var option = e.currentTarget.dataset.option;
    var currentItem = this.data.currentItem;
    var correct = option === currentItem.question.a;

    this.setData({
      selectedOption: option,
      answered: true,
      correct: correct,
      showFeedback: true
    });

    // 上报复习结果
    request.post('/api/wrong/review', {
      recordId: currentItem.recordId,
      correct: correct
    }).then(function () {
      // 更新本地数据
      if (correct) {
        self.setData({ correctCount: self.data.correctCount + 1 });
      }
    }).catch(function () {
      // 上报失败静默降级，不影响本地作答流程
    });

    // 1.5 秒后进入下一题
    setTimeout(function () {
      self.nextQuestion();
    }, 1500);
  },

  // 下一题
  nextQuestion: function () {
    var nextIndex = this.data.currentIndex + 1;
    if (nextIndex >= this.data.items.length) {
      // 复习完成
      this.setData({ completed: true });
      return;
    }

    this.setData({
      currentIndex: nextIndex,
      currentItem: this.data.items[nextIndex],
      selectedOption: null,
      answered: false,
      correct: false,
      showFeedback: false
    });
  },

  // 返回错题本
  goBack: function () {
    wx.navigateBack();
  },

  // 重新开始
  restart: function () {
    this.loadPendingItems();
  }
});