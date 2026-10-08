/**
 * 段位晋级考试（2026-10-08）
 *
 * 规则（用户拍板）：每个大段升下一段前要考一次，**当前学段题库随机 10 题、全对才算过**；
 * 没过就卡在当前大段最高级（星数封顶，见 server/exam-gate.js），可以立刻重考。
 *
 * 两个设计取舍：
 *   1. **不做成答题游戏**：这是「门槛」不是「玩法」，做成小游戏会喧宾夺主。
 *      所以就用最朴素的四选一，界面克制、节奏快（对了自动下一题）。
 *   2. **本地判题、服务端记账**：选择题判对错不必往返（省一次网络抖动）；
 *      但「通过」必须由服务端记（POST /api/rank/exam/pass），否则改包就能跳段。
 */
'use strict';

var storage = require('../../utils/storage');
var dict = require('../../utils/dict');
var constants = require('../../utils/constants');
var request = require('../../utils/request');

/** 每场考试的题量（用户拍板：10 题全对） */
var TOTAL_Q = 10;
/** 每题选项数 */
var OPTIONS = 4;

Page({
  data: {
    targetTierName: '',     // 要考的大段（如「白银」）
    targetTierKey: '',
    gradeLabel: '',
    qIndex: 1,
    totalQ: TOTAL_Q,
    stem: '',               // 当前题面
    options: [],            // [{ text, right }]
    picked: -1,             // 已选项下标（-1 = 还没选）
    phase: 'quiz',          // quiz / pass / fail
    rightCount: 0,
    failAt: 0,              // 第几题答错（失败页展示用）
    submitting: false
  },

  onLoad: function (opt) {
    var o = opt || {};
    this.setData({
      targetTierKey: o.tier || '',
      targetTierName: o.tierName || ''
    });
    this._buildRound();
  },

  /**
   * 抽题：从当前学段题库随机取词条做题干，每题再从**同一题库**捞 3 个干扰项。
   * 干扰项必须同源 —— 跨学段的假答案（幼儿园题里塞个高中词）一眼就被看穿，等于送分。
   */
  _buildRound: function () {
    var grade = storage.getLastGrade() || constants.GRADES[0].key;
    var gradeLabel = grade;
    for (var i = 0; i < constants.GRADES.length; i++) {
      if (constants.GRADES[i].key === grade) { gradeLabel = constants.GRADES[i].label; break; }
    }

    var pool = dict.randomItems(grade, TOTAL_Q + OPTIONS * TOTAL_Q);
    if (!pool || pool.length < OPTIONS) {
      wx.showToast({ title: '题库还没准备好', icon: 'none' });
      return;
    }

    var stems = pool.slice(0, Math.min(TOTAL_Q, pool.length));
    var rest = pool.slice(stems.length);
    if (!rest.length) rest = pool;   // 题库很小的时候兜一下，别让干扰项取空

    this._questions = stems.map(function (item, i) {
      var right = String(item.a || item.q || '');
      var wrongs = [];
      for (var k = 0; k < rest.length && wrongs.length < OPTIONS - 1; k++) {
        var pick = rest[(i * (OPTIONS - 1) + k) % rest.length];
        var cand = String((pick && (pick.a || pick.q)) || '');
        if (cand && cand !== right && wrongs.indexOf(cand) < 0) wrongs.push(cand);
      }
      var opts = wrongs.map(function (t) { return { text: t, right: false }; });
      // 正确答案的位置随题号散开，避免永远在第一个
      opts.splice(Math.min(i % OPTIONS, opts.length), 0, { text: right, right: true });
      return {
        // 优先用 hint：「大小的大」比单字「大」清楚得多
        stem: item.hint || item.q || '',
        options: opts
      };
    });

    this.setData({ gradeLabel: gradeLabel, phase: 'quiz', qIndex: 1, rightCount: 0, failAt: 0 });
    this._showQuestion(0);
  },

  _showQuestion: function (i) {
    var q = this._questions[i];
    if (!q) return;
    this.setData({ qIndex: i + 1, stem: q.stem, options: q.options, picked: -1 });
  },

  /** 选答案：对了自动下一题；错了当场结束（全对是硬要求，继续答没意义） */
  onPick: function (e) {
    if (this.data.picked >= 0) return;              // 已作答，防连点
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var q = this._questions[this.data.qIndex - 1];
    if (!q || !q.options[idx]) return;

    var right = !!q.options[idx].right;
    var self = this;
    this.setData({ picked: idx, rightCount: this.data.rightCount + (right ? 1 : 0) });

    if (!right) {
      setTimeout(function () {
        self.setData({ phase: 'fail', failAt: self.data.qIndex });
      }, 900);
      return;
    }

    setTimeout(function () {
      if (self.data.qIndex >= self._questions.length) {
        self._submitPass();
      } else {
        self._showQuestion(self.data.qIndex);        // qIndex 本身就是下一题的 0 基下标
      }
    }, 620);
  },

  /** 全对 → 请服务端记账（客户端说「我过了」不算数） */
  _submitPass: function () {
    var self = this;
    this.setData({ submitting: true });
    request.post('/api/rank/exam/pass', { tier: this.data.targetTierKey }).then(function () {
      self.setData({ phase: 'pass', submitting: false });
      wx.showToast({ title: '通过！', icon: 'success' });
    }).catch(function (err) {
      self.setData({ submitting: false });
      wx.showModal({
        title: '成绩没传上去',
        content: '你答对了，但服务端没能记下这次通过（' + ((err && err.message) || '网络异常')
          + '）。请再考一次。',
        showCancel: false
      });
      self.setData({ phase: 'fail', failAt: 0 });     // 退回失败态，允许重考
    });
  },

  /** 失败页：原地重考 */
  onRetry: function () {
    this._buildRound();
  },

  goBack: function () {
    wx.navigateBack();
  }
});
