// 关卡编辑器页（level-editor）
//
// 职责：
//   1. 创建/编辑关卡（标题、描述、学段、题目列表）
//   2. 添加/删除题目
//   3. 保存草稿 / 提交审核

var request = require('../../utils/request');

Page({
  data: {
    levelId: '',
    title: '',
    description: '',
    grade: 'primary12',
    gradeLabel: '小学1-2',
    items: [],
    gradeOptions: [
      { value: 'kindergarten', label: '幼儿园' },
      { value: 'primary12', label: '小学1-2' },
      { value: 'primary34', label: '小学3-4' },
      { value: 'primary56', label: '小学5-6' },
      { value: 'junior', label: '初中' },
      { value: 'senior', label: '高中' },
      { value: 'college', label: '大学' }
    ],
    editing: false,
    saving: false
  },

  onLoad: function (options) {
    if (options.levelId) {
      this.loadLevel(options.levelId);
    }
  },

  // 加载关卡
  loadLevel: function (levelId) {
    var self = this;
    request.get('/api/level/list').then(function (data) {
      var level = data.find(function (l) { return l.levelId === levelId; });
      if (level) {
        self.setData({
          levelId: level.levelId,
          title: level.title,
          description: level.description,
          grade: level.grade,
          gradeLabel: self.getGradeLabel(level.grade),
          items: level.items || [],
          editing: true
        });
      }
    }).catch(function () {
      // 加载失败静默降级
    });
  },

  // 输入标题
  onTitleInput: function (e) {
    this.setData({ title: e.detail.value });
  },

  // 输入描述
  onDescriptionInput: function (e) {
    this.setData({ description: e.detail.value });
  },

  // 选择学段
  onGradeChange: function (e) {
    var grade = e.detail.value;
    this.setData({ grade: grade, gradeLabel: this.getGradeLabel(grade) });
  },

  // 根据学段值取展示文案
  getGradeLabel: function (grade) {
    var options = this.data.gradeOptions;
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === grade) {
        return options[i].label;
      }
    }
    return '请选择';
  },

  // 添加题目
  addItem: function () {
    var items = this.data.items;
    items.push({
      type: 'w1',
      q: '',
      a: '',
      hint: ''
    });
    this.setData({ items: items });
  },

  // 删除题目
  removeItem: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var items = this.data.items;
    items.splice(idx, 1);
    this.setData({ items: items });
  },

  // 题目输入
  onItemInput: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var field = e.currentTarget.dataset.field;
    var items = this.data.items;
    items[idx][field] = e.detail.value;
    this.setData({ items: items });
  },

  // 保存草稿
  saveDraft: function () {
    this.saveLevel('draft');
  },

  // 提交审核
  submitReview: function () {
    this.saveLevel('pending');
  },

  // 保存关卡
  saveLevel: function (status) {
    var self = this;
    var data = {
      title: this.data.title,
      description: this.data.description,
      grade: this.data.grade,
      items: this.data.items
    };

    if (!data.title) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }

    if (data.items.length === 0) {
      wx.showToast({ title: '请添加题目', icon: 'none' });
      return;
    }

    if (this.data.levelId) {
      data.levelId = this.data.levelId;
    }

    self.setData({ saving: true });

    request.post('/api/level', data).then(function (level) {
      self.setData({ saving: false });
      var levelId = level.levelId;

      if (status === 'pending') {
        // 提交审核
        request.post('/api/level/submit', { levelId: levelId }).then(function () {
          // 提交审核成功 → 生成分享码 → 跳转分享页展示
          request.post('/api/level/share', { levelId: levelId }).then(function (shareData) {
            wx.navigateTo({
              url: '/pages/level-share/level-share?shareCode=' + shareData.shareCode
            });
          }).catch(function (shareErr) {
            wx.showToast({ title: shareErr.message || '生成分享码失败', icon: 'none' });
            wx.navigateBack();
          });
        }).catch(function (submitErr) {
          wx.showToast({ title: submitErr.message || '保存成功，提交审核失败', icon: 'none' });
        });
      } else {
        wx.showToast({ title: '已保存草稿', icon: 'success' });
        wx.navigateBack();
      }
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    });
  },

  // 返回
  goBack: function () {
    wx.navigateBack();
  }
});