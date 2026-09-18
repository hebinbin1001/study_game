// 关卡编辑器页（level-editor）
//
// 职责：
//   1. 创建/编辑关卡（标题、描述、学段、题目列表）
//   2. 添加/删除题目
//   3. **从题库选题**（2026-09-18 方案 A）：从「题库」页维护的该学段词条里勾选，一键填进关卡
//   4. 保存草稿 / 提交审核
//
// 口径：自建关卡的题**不进闯关题源**（用户拍板）—— 题库是学段题池，关卡是独立作品，
//       两者只做「题库 → 关卡草稿」的单向搬运（见 utils/level-picker.js）。

var request = require('../../utils/request');
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var picker = require('../../utils/level-picker');

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
    saving: false,

    // ---- 从题库选题弹层（2026-09-18）----
    pickerShow: false,
    pickerGrades: constants.GRADES || [],
    pickerGradeIndex: 0,
    pickerKeyword: '',
    pickerOptions: [],      // 当前筛选后的可勾选列表
    pickerPicked: {},       // { key: true }
    pickerCount: 0,
    pickerTotal: 0
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

  // ============ 从题库选题（2026-09-18 方案 A） ============

  /** 打开选题弹层：默认落在当前关卡选的学段，列出该学段词条 */
  openPicker: function () {
    var idx = 0;
    var grades = this.data.pickerGrades;
    for (var i = 0; i < grades.length; i++) {
      if (grades[i].key === this.data.grade) { idx = i; break; }
    }
    this._pickerAll = picker.buildOptions(dict.loadByGrade(grades[idx].key));
    this.setData({
      pickerShow: true,
      pickerGradeIndex: idx,
      pickerKeyword: '',
      pickerPicked: {},
      pickerCount: 0,
      pickerTotal: this._pickerAll.length
    });
    this._applyPickerFilter();
  },

  closePicker: function () { this.setData({ pickerShow: false }); },
  noop: function () {},

  /** 切学段：重新拉该学段词条，清空已勾选 */
  pickerPickGrade: function (e) {
    var idx = parseInt(e.currentTarget.dataset.index, 10) || 0;
    var grades = this.data.pickerGrades;
    this._pickerAll = picker.buildOptions(dict.loadByGrade(grades[idx].key));
    this.setData({
      pickerGradeIndex: idx,
      pickerPicked: {},
      pickerCount: 0,
      pickerTotal: this._pickerAll.length
    });
    this._applyPickerFilter();
  },

  pickerSearch: function (e) {
    this.setData({ pickerKeyword: e.detail.value || '' });
    this._applyPickerFilter();
  },

  pickerClearSearch: function () {
    this.setData({ pickerKeyword: '' });
    this._applyPickerFilter();
  },

  _applyPickerFilter: function () {
    var kw = String(this.data.pickerKeyword || '').trim().toLowerCase();
    var all = this._pickerAll || [];
    var picked = this.data.pickerPicked || {};
    var list = all.filter(function (x) {
      if (!kw) return true;
      return (x.q + ' ' + x.a + ' ' + x.hint).toLowerCase().indexOf(kw) >= 0;
    }).map(function (x) {
      return Object.assign({}, x, { picked: !!picked[x.key] });
    });
    // 列表先给勾选的排前面，方便回顾已选
    list.sort(function (a, b) { return (b.picked ? 1 : 0) - (a.picked ? 1 : 0); });
    this.setData({ pickerOptions: list.slice(0, 200) });
  },

  /** 勾选/取消（上限 10 题：与关卡固定 10 题对齐，已勾满时不再接受新的） */
  pickerToggle: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    var picked = Object.assign({}, this.data.pickerPicked);
    if (picked[key]) {
      delete picked[key];
    } else {
      if (this.data.pickerCount >= picker.LEVEL_SIZE) {
        wx.showToast({ title: '一关固定 10 题，已选满', icon: 'none' });
        return;
      }
      picked[key] = true;
    }
    this.setData({ pickerPicked: picked, pickerCount: Object.keys(picked).length });
    this._applyPickerFilter();
  },

  /** 把勾选的词条追加进关卡题单（不覆盖已手输的题，重复题自动跳过） */
  pickerApply: function () {
    var picked = this.data.pickerPicked || {};
    var keys = Object.keys(picked);
    if (!keys.length) {
      wx.showToast({ title: '还没勾选题', icon: 'none' });
      return;
    }
    var chosen = (this._pickerAll || []).filter(function (x) { return picked[x.key]; });
    var r = picker.mergeInto(this.data.items, chosen);
    this.setData({ items: r.items, pickerShow: false });
    var msg = '已加入 ' + r.added + ' 题';
    if (r.skipped) msg += '（跳过 ' + r.skipped + ' 题重复/超量）';
    var left = picker.remaining(r.items);
    if (left) msg += ' · 还差 ' + left + ' 题满 10';
    wx.showToast({ title: msg, icon: 'none', duration: 2200 });
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

  // 提交审核（B4：必须 10 个一组且每题字段完整，前端先校验 + 后端强校验兜底）
  submitReview: function () {
    var items = this.data.items;
    if (items.length !== 10) {
      wx.showToast({ title: '提交审核需凑满 10 题一组（当前 ' + items.length + '/10）', icon: 'none' });
      return;
    }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.q || !it.a) {
        wx.showToast({ title: '第 ' + (i + 1) + ' 题缺题目/答案', icon: 'none' });
        return;
      }
    }
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
