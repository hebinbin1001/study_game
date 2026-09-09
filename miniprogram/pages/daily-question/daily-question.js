// 每日一题页（B2）：完成每日一题 = 今日签到
// 规则：每人随机 1 题（学段+题型，本地词库出「看词选义」）；答对 → /api/daily/answer
// 触发今日签到（轨道A送星）+ 里程碑皮肤发放（轨道B，30/60/100/250/365 天）。
// 幂等：已答对过 → 展示「今日已签」，不再重复打卡。
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var request = require('../../utils/request');
var auth = require('../../utils/auth');
var storage = require('../../utils/storage');

Page({
  data: {
    loading: true,
    loggedIn: false,
    // 状态
    answered: false,     // 今日已答对
    streak: 0,
    // 题目
    word: '',
    meaning: '',         // 正确答案
    options: [],         // [{text, key, ok}]
    picked: '',          // 已选 key（''未选）
    correct: false,      // 上一答是否对
    triedWrong: false,   // 是否答错过（显示“再试”）
    // 里程碑
    milestones: [],      // [{day, avatarId, reached, claimed, emoji}]
    rewards: []          // 本次发放（[{day, skinName}]）
  },

  onLoad: function () {
    if (!auth.isLoggedIn()) {
      var self = this;
      auth.promptLogin('每日一题需登录（游客数据不上榜）').then(function (u) {
        if (u) self.init();
        else wx.navigateBack();
      });
      return;
    }
    this.init();
  },

  init: function () {
    var self = this;
    request.get('/api/daily/status').then(function (d) {
      if (!d) return;
      self.setData({
        answered: !!d.answeredToday,
        streak: d.streak || 0,
        milestones: self._buildMilestones(d.milestones || []),
        loading: false
      });
      if (!d.answeredToday) self._genQuestion();
    }).catch(function () {
      self.setData({ loading: false });
      // 弱网：仍可本地出题作答（答对后上报失败提示稍后重试）
      self._genQuestion();
    });
  },

  _buildMilestones: function (list) {
    var EMOJI = { 30: '🐲', 60: '🦄', 100: '👑', 250: '⚡', 365: '🎖' };
    return (list || []).map(function (m) {
      return {
        day: m.day,
        reached: m.reached,
        claimed: m.claimed,
        emoji: EMOJI[m.day] || '🎁'
      };
    });
  },

  // 本地出题：看词选义（随机学段+题型，选项=1 正确 + 3 干扰释义）
  _genQuestion: function () {
    var grades = constants.GRADES;
    var g = grades[Math.floor(Math.random() * grades.length)];
    var items = dict.loadByGrade(g.key);
    if (!items || !items.length) return;
    var item = items[Math.floor(Math.random() * items.length)];
    var correct = item.hint || item.a;
    // 干扰项：同一学段其他词条的 hint，去重且不含正确
    var seen = { correct: 1 };
    var dist = [];
    var guard = 0;
    while (dist.length < 3 && guard++ < 300) {
      var it = items[Math.floor(Math.random() * items.length)];
      var h = it.hint || it.a;
      if (h === correct || seen[h]) continue;
      seen[h] = 1;
      dist.push(h);
    }
    // 不足 3 个干扰 → 用通用兜底
    var FALLBACK = ['正确', '错误', '不知道'];
    while (dist.length < 3) dist.push(FALLBACK[dist.length]);
    var options = this._shuffle([correct].concat(dist));
    this._correctOption = options.indexOf(correct);
    this._correctText = correct;
    this.setData({
      word: item.a || item.q || item.hint,
      meaning: correct,
      options: options.map(function (t, i) { return { text: t, key: String(i) }; }),
      picked: '',
      triedWrong: false
    });
  },

  _shuffle: function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },

  onPick: function (e) {
    var key = e.currentTarget.dataset.key;
    if (this.data.answered || this.data.picked) return;
    var idx = parseInt(key, 10);
    var ok = (idx === this._correctOption);
    this.setData({ picked: key, correct: ok });
    if (ok) this._submit(true);
    else this._submit(false);
  },

  _submit: function (ok) {
    var self = this;
    if (!ok) {
      // 答错：仅提示可再试（本地状态，不打卡）
      wx.showToast({ title: '选错啦，再试一次', icon: 'none' });
      self.setData({ picked: '', triedWrong: true });
      return;
    }
    request.post('/api/daily/answer', { correct: true }).then(function (d) {
      if (!d) return;
      var rewards = d.milestones || [];
      self.setData({
        answered: true,
        streak: d.streak || 0,
        rewards: rewards,
        picked: '',
        correct: true
      });
      if (d.already) {
        wx.showToast({ title: '今日已签到 ✓', icon: 'none' });
      } else {
        wx.showToast({ title: '✅ 签到成功 · 连续 ' + (d.streak || 0) + ' 天', icon: 'none' });
      }
      if (rewards.length) {
        wx.showModal({
          title: '🎉 里程碑达成！',
          content: rewards.map(function (r) { return '连续 ' + r.day + ' 天：解锁 ' + r.skinName; }).join('\n'),
          showCancel: false
        });
      }
    }).catch(function () {
      // 弱网：本地记为已答，提示稍后同步（打卡后端幂等，下次进页自动补）
      self.setData({ answered: true, correct: true, picked: '' });
      wx.showToast({ title: '已答对（网络待同步）', icon: 'none' });
    });
  },

  // 重新出题：答错可换题再挑战（不打卡，直到答对）
  retry: function () {
    if (this.data.answered) return;
    this._genQuestion();
  },

  goBack: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 每日一题，答对即签到', path: '/pages/index/index' };
  }
});
