// 每日挑战赛（2026-10-08 新增）
//
// 玩法：每天（东八区自然日）同一个学段所有人打**同一套题**（种子 = 日期 + 学段），
// 当天出榜，按「答对数降序 → 用时升序」排名。同一人当天可以重打，只留最好成绩。
//
// 为什么不发段位星：签到已经是「每天 +1 星」，再叠一层每日奖励会让段位曲线失控；
// 每日挑战的激励来自当天榜单本身。
var quickQuiz = require('../../utils/quick-quiz');
var constants = require('../../utils/constants');
var request = require('../../utils/request');
var auth = require('../../utils/auth');
var storage = require('../../utils/storage');
var dayKey = require('../../utils/day-key');

var TOTAL_Q = 10;

/** 学段 key → 展示名 */
function gradeLabel(key) {
  for (var i = 0; i < constants.GRADES.length; i++) {
    if (constants.GRADES[i].key === key) return constants.GRADES[i].label;
  }
  return key;
}

/** 毫秒 → 「12.3 秒」 */
function secText(ms) {
  var s = (parseInt(ms, 10) || 0) / 1000;
  return (Math.round(s * 10) / 10).toFixed(1) + ' 秒';
}

/** 给榜单行补展示字段 */
function shapeTop(list) {
  return (list || []).map(function (r) {
    return {
      rank: r.rank,
      nickname: r.nickname,
      avatarUrl: r.avatarUrl || '',
      initial: String(r.nickname || '战').slice(0, 1),
      correct: r.correct,
      total: r.total,
      secText: secText(r.durationMs),
      score: r.score,
      isMe: r.isMe,
      medal: r.rank === 1 ? '🥇' : (r.rank === 2 ? '🥈' : (r.rank === 3 ? '🥉' : ''))
    };
  });
}

Page({
  data: {
    loading: true,
    available: true,
    notReadyMsg: '',
    loggedIn: false,
    phase: 'idle',          // idle | playing | done
    dateKey: '',
    gradeKey: '',
    gradeLabel: '',
    totalQ: TOTAL_Q,
    // 对局
    quiz: [],
    idx: 0,
    pickedKey: '',
    lastCorrect: false,
    correctCount: 0,
    progressText: '',
    // 结果 & 榜单
    result: null,
    myRank: 0,
    improved: false,
    best: null,
    top: []
  },

  onLoad: function () {
    var grade = storage.getLastGrade() || constants.GRADES[0].key;
    this.setData({
      // 先本地算一份「今天」：服务端未就绪时页面顶部也要有日期（不能留空）
      dateKey: dayKey.todayKey(),
      gradeKey: grade,
      gradeLabel: gradeLabel(grade),
      loggedIn: auth.isLoggedIn()
    });
    this.loadInfo();
  },

  onShow: function () {
    this.setData({ loggedIn: auth.isLoggedIn() });
  },

  loadInfo: function () {
    var self = this;
    request.get('/api/dailychallenge/info?grade=' + this.data.gradeKey).then(function (d) {
      if (!d) return;
      if (d.available === false) {
        self.setData({ loading: false, available: false, notReadyMsg: d.message || '功能准备中' });
        return;
      }
      self._seed = d.seed;
      self.setData({
        loading: false,
        available: true,
        dateKey: d.dateKey,
        totalQ: d.totalQ || TOTAL_Q,
        best: d.best ? {
          correct: d.best.correct,
          total: d.best.total,
          secText: secText(d.best.durationMs),
          score: d.best.score,
          rank: d.best.rank
        } : null,
        top: shapeTop(d.top)
      });
    }).catch(function () {
      self.setData({ loading: false, available: false, notReadyMsg: '服务暂时不可用，请稍后再试' });
    });
  },

  start: function () {
    var quiz = quickQuiz.buildQuiz(this.data.gradeKey, this._seed || ('daily:' + this.data.dateKey + ':' + this.data.gradeKey), TOTAL_Q);
    if (!quiz.length) {
      wx.showToast({ title: '题库加载失败，稍后再试', icon: 'none' });
      return;
    }
    this._startTs = Date.now();
    this.setData({
      phase: 'playing',
      quiz: quiz,
      idx: 0,
      pickedKey: '',
      lastCorrect: false,
      correctCount: 0,
      result: null,
      myRank: 0,
      improved: false,
      progressText: '第 1 / ' + quiz.length + ' 题'
    });
  },

  pick: function (e) {
    if (this.data.pickedKey) return;
    var key = String(e.currentTarget.dataset.key);
    var q = this.data.quiz[this.data.idx];
    if (!q) return;
    var ok = key === q.answerKey;
    var count = this.data.correctCount + (ok ? 1 : 0);
    this.setData({ pickedKey: key, lastCorrect: ok, correctCount: count });
    var self = this;
    setTimeout(function () { self.next(); }, ok ? 320 : 900);
  },

  next: function () {
    var nextIdx = this.data.idx + 1;
    if (nextIdx >= this.data.quiz.length) {
      this.finish();
      return;
    }
    this.setData({
      idx: nextIdx,
      pickedKey: '',
      lastCorrect: false,
      progressText: '第 ' + (nextIdx + 1) + ' / ' + this.data.quiz.length + ' 题'
    });
  },

  finish: function () {
    var durationMs = Date.now() - (this._startTs || Date.now());
    var correct = this.data.correctCount;
    var self = this;
    this.setData({
      phase: 'done',
      result: {
        correct: correct,
        total: this.data.quiz.length,
        secText: secText(durationMs),
        rate: Math.round((correct / Math.max(1, this.data.quiz.length)) * 100)
      }
    });

    request.post('/api/dailychallenge/submit', {
      grade: this.data.gradeKey,
      correct: correct,
      total: this.data.quiz.length,
      durationMs: durationMs
    }).then(function (d) {
      if (!d || d.available === false) return;
      self.setData({
        improved: !!d.improved,
        myRank: (d.best && d.best.rank) || 0,
        best: d.best ? {
          correct: d.best.correct,
          total: d.best.total,
          secText: secText(d.best.durationMs),
          score: d.best.score,
          rank: d.best.rank
        } : null,
        top: shapeTop(d.top)
      });
      if (!auth.isLoggedIn()) {
        wx.showToast({ title: '登录后成绩才能上榜', icon: 'none' });
      } else if (d.improved) {
        wx.showToast({ title: '已记入今日最好成绩', icon: 'none' });
      }
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '成绩上报失败', icon: 'none' });
    });
  },

  again: function () {
    this.setData({ phase: 'idle' });
    this.loadInfo();
  },

  /**
   * 测试钩子（E2E 专用）：判定当前题并立即推进，跳过 320/900ms 的动画等待。
   * 与 pages/quiz 的 _testAnswer 同一思路 —— 用例不该被真实定时器拖慢或拖假。
   * @param {boolean} correct 是否答对
   * @returns {boolean} 是否成功推进了一题
   */
  _testAnswer: function (correct) {
    if (this.data.phase !== 'playing') return false;
    var q = this.data.quiz[this.data.idx];
    if (!q) return false;
    var key = correct
      ? q.answerKey
      : String((parseInt(q.answerKey, 10) + 1) % 4);
    var ok = key === q.answerKey;
    this.setData({
      pickedKey: key,
      lastCorrect: ok,
      correctCount: this.data.correctCount + (ok ? 1 : 0)
    });
    this.next();
    return true;
  },

  goLogin: function () {
    var self = this;
    auth.promptLogin('登录后才能进入排行榜').then(function (u) {
      if (u) self.setData({ loggedIn: true });
    });
  },

  goBack: function () {
    wx.navigateBack({
      fail: function () { wx.switchTab({ url: '/pages/index/index' }); }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '词力战士 - 每日挑战赛，来比比今天谁答得又快又准',
      path: '/pages/daily-challenge/daily-challenge'
    };
  }
});
