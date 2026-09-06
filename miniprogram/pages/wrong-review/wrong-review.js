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
    displayOptions: [],
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
        displayOptions: self.toDisplayOptions(pending[0]),
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

  // 将题目选项转为带展示样式的对象数组
  toDisplayOptions: function (question) {
    var d = (question && question.d) || [];
    return d.map(function (value) {
      return { value: value, cls: '' };
    });
  },

  // 选择选项
  selectOption: function (e) {
    var self = this;
    if (this.data.answered) return;

    var option = e.currentTarget.dataset.option;
    var currentItem = this.data.currentItem;
    var correct = option === currentItem.question.a;
    var answer = currentItem.question.a;

    // 计算每个选项的展示样式
    var displayOptions = this.data.displayOptions.map(function (opt) {
      var cls = '';
      if (opt.value === option) {
        cls = correct ? 'correct' : 'wrong';
      }
      if (opt.value === answer) {
        cls = cls ? cls + ' answer' : 'answer';
      }
      return { value: opt.value, cls: cls };
    });

    this.setData({
      selectedOption: option,
      answered: true,
      correct: correct,
      showFeedback: true,
      displayOptions: displayOptions
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

    var nextItem = this.data.items[nextIndex];
    this.setData({
      currentIndex: nextIndex,
      currentItem: nextItem,
      displayOptions: this.toDisplayOptions(nextItem),
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