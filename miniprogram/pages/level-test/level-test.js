// 字词定级测（2026-10-28）
//
// 目的：新用户第一次进来不用再猜「我该选几年级」。10 道跨学段题（kg/g3/g5/g7/g9 各 2 题）
// 测完给一个推荐年级 + 一个可分享的「约 N 词」。纯本地，不联网、不落库，
// 结果只写 storage（ww_level_test）和全局年级设置（ww_last_grade）。
//
// 三个 stage：
//   intro  说明 + 「开始测试」（已测过则显示上次结果）
//   quiz   逐题作答，点选项即判，700ms 后自动下一题
//   result 推荐年级 + 估算词量 + 分学段小条 + 分享
var storage = require('../../utils/storage');
var levelTest = require('../../utils/level-test');

var STORE_KEY = 'ww_level_test';

Page({
  data: {
    stage: 'intro',
    total: 0,
    idx: 0,
    cur: null,
    // 选项状态 key → 'right' | 'wrong' | 'dim'（空对象 = 本题还没作答）
    states: {},
    progress: 0,
    res: null,
    last: null
  },

  // 作答记录与题目都是实例级（不参与渲染，避免 setData 白传一遍大数组）
  _answers: [],
  _qs: [],
  _timer: null,

  onLoad: function () {
    var last = null;
    try { last = storage.get(STORE_KEY); } catch (e) { last = null; }
    if (last && last.grade) this.setData({ last: last });
  },

  onUnload: function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  },

  // —— 开始 / 重测 ——
  start: function () {
    // 种子传空 → 每次测都是新题。同一套固定题会让第二次测变成「背答案」。
    var qs = levelTest.buildTest();
    if (!qs || !qs.length) {
      wx.showToast({ title: '题库加载失败，请重试', icon: 'none' });
      return;
    }
    this._answers = [];
    this._qs = qs;
    this.setData({
      stage: 'quiz',
      total: qs.length,
      idx: 0,
      cur: qs[0],
      states: {},
      progress: 0,
      res: null
    });
  },

  restart: function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this.start();
  },

  // —— 作答 ——
  pick: function (e) {
    // 已作答（states 非空）→ 忽略连点，否则会把同一题记两次
    var cur = this.data.cur;
    if (!cur) return;
    if (this.data.states && Object.keys(this.data.states).length) return;

    var key = String((e && e.currentTarget && e.currentTarget.dataset)
      ? e.currentTarget.dataset.key : '');
    if (!key) return;

    var answerKey = String(cur.answerKey);
    var ok = key === answerKey;
    var states = {};
    var opts = cur.options || [];
    for (var i = 0; i < opts.length; i++) {
      var k = String(opts[i].key);
      if (k === answerKey) states[k] = 'right';
      else if (k === key) states[k] = 'wrong';
      else states[k] = 'dim';
    }

    this._answers.push({ grade: cur.grade, ok: ok });
    this.setData({ states: states });

    var self = this;
    this._timer = setTimeout(function () { self._next(); }, 700);
  },

  _next: function () {
    this._timer = null;
    var idx = this.data.idx + 1;
    if (idx >= this._qs.length) { this._finish(); return; }
    this.setData({
      idx: idx,
      cur: this._qs[idx],
      states: {},
      progress: Math.round((idx / this._qs.length) * 100)
    });
  },

  _finish: function () {
    var res = levelTest.scoreOf(this._answers);
    // 「约 0 词」对一个刚起步的孩子是句难听话，但数字本身又确实是 0 ——
    // 页面上换成「刚起步」，分享卡则退回通用文案（见 onShareAppMessage）。
    res.wordsText = res.words >= 50 ? ('约 ' + res.words + ' 词') : '刚起步';
    try {
      storage.set(STORE_KEY, {
        grade: res.grade,
        gradeLabel: res.gradeLabel,
        words: res.words,
        wordsText: res.wordsText,
        rate: res.rate,
        at: Date.now()
      });
    } catch (e) { /* 存储满/不可用时不影响本次结果展示 */ }
    this.setData({ stage: 'result', res: res, progress: 100 });
  },

  // —— 采用结果 ——
  useGrade: function () {
    var res = this.data.res;
    if (!res) return;
    storage.setLastGrade(res.grade);
    wx.showToast({ title: '已切换到' + res.gradeLabel, icon: 'none' });
    var self = this;
    setTimeout(function () {
      wx.switchTab({
        url: '/pages/index/index',
        fail: function () { self.setData({ stage: 'intro', last: res }); }
      });
    }, 700);
  },

  // —— 分享 ——
  onShareAppMessage: function () {
    var res = this.data.res;
    if (res && res.words) {
      return {
        title: '我测出约 ' + res.words + ' 词 · ' + res.gradeLabel + '水平，你敢来比吗',
        path: '/pages/level-test/level-test?from=share'
      };
    }
    return {
      title: '10 道题测出你的字词水平，还顺手算词汇量',
      path: '/pages/level-test/level-test?from=share'
    };
  },

  onShareTimeline: function () {
    var res = this.data.res;
    if (res && res.words) {
      return {
        title: '我测出约 ' + res.words + ' 词 · ' + res.gradeLabel + '水平',
        query: 'from=timeline'
      };
    }
    return { title: '10 道题测出你的字词水平', query: 'from=timeline' };
  }
});
