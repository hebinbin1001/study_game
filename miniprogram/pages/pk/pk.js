// 好友 PK（异步战帖，2026-10-08 新增）
//
// 玩法：发起人先打 10 题 → 生成一张「战帖」（题目种子 + 发起人成绩）→ 分享给好友；
// 好友点开链接、用**同一套题**打一遍 → 服务端判胜负（先比正确率、再比用时）。
// 奖励：胜 +3 星、平 +1 星、负 0 星；每人每天最多靠 PK 拿 10 星。
//
// 为什么不做实时对战：云托管上做长连接 + 匹配 + 掉线处理成本高、故障率高，
// 而学生玩家同时在线概率低，实时匹配大概率空等（规划文档已拍板用异步战帖）。
var quickQuiz = require('../../utils/quick-quiz');
var constants = require('../../utils/constants');
var request = require('../../utils/request');
var auth = require('../../utils/auth');
var storage = require('../../utils/storage');

var TOTAL_Q = 10;

/** 本地生成 PK 种子（先定种子、后答题，保证双方同题） */
function localSeed() {
  var t = Date.now() % 2000000000;
  var r = Math.floor(Math.random() * 100000000);
  return (t + r) % 2147483647 || 1;
}

function secText(ms) {
  var s = (parseInt(ms, 10) || 0) / 1000;
  return (Math.round(s * 10) / 10).toFixed(1) + ' 秒';
}

function scoreText(p) {
  if (!p) return '';
  return '答对 ' + p.correct + '/' + p.total + ' · ' + secText(p.ms);
}

/** 服务端返回的玩家块 → 视图块 */
function shapePlayer(p) {
  if (!p) return null;
  return {
    nickname: p.nickname,
    initial: String(p.nickname || '战').slice(0, 1),
    correct: p.correct,
    total: p.total,
    secText: secText(p.ms),
    reward: p.reward || 0,
    isMe: !!p.isMe,
    scoreText: scoreText(p)
  };
}

/** 战帖详情 → 视图对象 */
function shapeMatch(m) {
  var me = null;
  var opp = null;
  if (m.role === 'challenger') { me = m.challenger; opp = m.opponent; }
  else if (m.role === 'opponent') { me = m.opponent; opp = m.challenger; }

  var outcomeText = '等待应战';
  var outcomeEmoji = '⏳';
  if (m.status === 'done') {
    if (m.winner === 'draw') { outcomeText = '平局'; outcomeEmoji = '🤝'; }
    else if ((m.role === 'challenger' && m.winner === 'challenger')
      || (m.role === 'opponent' && m.winner === 'opponent')) {
      outcomeText = '你赢了'; outcomeEmoji = '🎉';
    } else if (m.role === 'guest') {
      outcomeText = '已结束'; outcomeEmoji = '🏁';
    } else {
      outcomeText = '惜败'; outcomeEmoji = '💪';
    }
  } else if (m.expired) {
    outcomeText = '战帖已过期'; outcomeEmoji = '⌛';
  }

  return {
    code: m.code,
    seed: m.seed,
    modeLabel: m.modeLabel,
    grade: m.grade,
    level: m.level,
    status: m.status,
    winner: m.winner,
    expired: m.expired,
    role: m.role,
    canAccept: m.canAccept,
    sharePath: m.sharePath,
    challenger: shapePlayer(m.challenger),
    opponent: m.opponent ? shapePlayer(m.opponent) : null,
    me: me ? shapePlayer(me) : null,
    opp: opp ? shapePlayer(opp) : null,
    outcomeText: outcomeText,
    outcomeEmoji: outcomeEmoji,
    myReward: me ? (me.reward || 0) : 0
  };
}

Page({
  data: {
    loading: true,
    available: true,
    notReadyMsg: '',
    loggedIn: false,
    phase: 'home',       // home | playing | created | result
    code: '',
    match: null,
    myList: [],
    // 对局
    quiz: [],
    idx: 0,
    pickedKey: '',
    lastCorrect: false,
    correctCount: 0,
    progressText: '',
    result: null
  },

  onLoad: function (query) {
    var code = String((query && query.code) || '').toUpperCase();
    this.setData({ loggedIn: auth.isLoggedIn(), code: code });
    if (code) this.loadMatch(code);
    else this.loadMy();
  },

  onShow: function () {
    this.setData({ loggedIn: auth.isLoggedIn() });
  },

  /** 战帖详情 */
  loadMatch: function (code) {
    var self = this;
    request.get('/api/pk/' + code).then(function (m) {
      if (!m) return;
      if (m.available === false) {
        self.setData({ loading: false, available: false, notReadyMsg: m.message || '功能准备中' });
        return;
      }
      var view = shapeMatch(m);
      self.setData({
        loading: false,
        available: true,
        match: view,
        phase: m.status === 'done' ? 'result' : 'home'
      });
    }).catch(function (err) {
      self.setData({
        loading: false,
        available: false,
        notReadyMsg: (err && err.message) || '战帖不存在或已失效'
      });
    });
  },

  /** 我的战帖列表 */
  loadMy: function () {
    var self = this;
    if (!auth.isLoggedIn()) {
      self.setData({ loading: false, available: true, myList: [] });
      return;
    }
    request.get('/api/pk/my').then(function (d) {
      if (!d) return;
      if (d.available === false) {
        self.setData({ loading: false, available: false, notReadyMsg: d.message || '功能准备中' });
        return;
      }
      self.setData({
        loading: false,
        available: true,
        myList: (d.list || []).map(function (it) {
          var stateText = '等待应战';
          if (it.status === 'done') {
            if (it.winner === 'draw') stateText = '平局';
            else if (it.iWin) stateText = '胜';
            else stateText = '负';
          } else if (it.expired) stateText = '已过期';
          return {
            code: it.code,
            modeLabel: it.modeLabel,
            grade: it.grade,
            level: it.level,
            status: it.status,
            expired: it.expired,
            role: it.role,
            roleText: it.role === 'challenger' ? '我发起' : '我应战',
            opponentNickname: it.opponentNickname,
            myScore: it.myScore,
            oppScore: it.oppScore,
            stateText: stateText,
            win: it.status === 'done' && it.iWin,
            reward: it.myReward || 0
          };
        })
      });
    }).catch(function () {
      self.setData({ loading: false, myList: [] });
    });
  },

  /** 发起挑战：先定种子 → 答题 → 生成战帖 */
  startCreate: function () {
    if (!this._requireLogin()) return;
    var grade = storage.getLastGrade() || constants.GRADES[0].key;
    this._mode = 'create';
    this._seed = localSeed();
    this._grade = grade;
    this._lineMode = 'shoot';
    this._level = 1;
    this._startQuiz(this._grade, this._seed);
  },

  /** 应战：用战帖种子出同一套题 */
  startAccept: function () {
    var m = this.data.match;
    if (!m) return;
    if (!this._requireLogin()) return;
    this._mode = 'accept';
    this._grade = m.grade;
    this._lineMode = m.lineMode || 'shoot';
    this._level = m.level || 1;
    this._startQuiz(m.grade, m.seed);
  },

  _requireLogin: function () {
    if (auth.isLoggedIn()) return true;
    var self = this;
    auth.promptLogin('好友 PK 需要登录（成绩要记到你的账号）').then(function (u) {
      if (u) self.setData({ loggedIn: true });
    });
    return false;
  },

  _startQuiz: function (grade, seed) {
    var quiz = quickQuiz.buildQuiz(grade, seed, TOTAL_Q);
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
      progressText: '第 1 / ' + quiz.length + ' 题',
      result: null
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
    setTimeout(function () { self.next(); }, ok ? 300 : 850);
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
    var total = this.data.quiz.length;
    var self = this;
    if (this._mode === 'create') {
      request.post('/api/pk/create', {
        grade: this._grade,
        lineMode: this._lineMode,
        level: this._level,
        correct: correct,
        total: total,
        durationMs: durationMs,
        seed: this._seed
      }).then(function (d) {
        if (!d || d.available === false) {
          wx.showToast({ title: (d && d.message) || '创建失败', icon: 'none' });
          self.setData({ phase: 'home' });
          return;
        }
        self.setData({
          code: d.code,
          phase: 'created',
          result: {
            correct: correct,
            total: total,
            secText: secText(durationMs),
            scoreText: '答对 ' + correct + '/' + total + ' · ' + secText(durationMs)
          }
        });
      }).catch(function (err) {
        wx.showToast({ title: (err && err.message) || '创建失败', icon: 'none' });
        self.setData({ phase: 'home' });
      });
      return;
    }

    // 应战
    request.post('/api/pk/' + this.data.code + '/accept', {
      correct: correct,
      total: total,
      durationMs: durationMs
    }).then(function (d) {
      if (!d) return;
      self.setData({
        phase: 'result',
        result: {
          correct: correct,
          total: total,
          secText: secText(durationMs),
          outcome: d.outcome,
          myReward: d.myReward || 0,
          cappedDaily: !!d.cappedDaily
        },
        match: shapeMatch(d.match)
      });
      if (d.myReward > 0) {
        wx.showToast({ title: '+' + d.myReward + ' ⭐ 已到账', icon: 'none' });
      } else if (d.cappedDaily) {
        wx.showToast({ title: '今日 PK 星星已达上限', icon: 'none' });
      }
    }).catch(function (err) {
      wx.showModal({
        title: '提交失败',
        content: (err && err.message) || '请稍后再试',
        showCancel: false
      });
    });
  },

  /** 打开我的某张战帖 */
  openMatch: function (e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    this.setData({ loading: true, match: null, phase: 'home' });
    this.loadMatch(code);
  },

  /** 回到我的战帖列表 */
  backHome: function () {
    this.setData({ code: '', match: null, phase: 'home', result: null });
    this.loadMy();
  },

  /**
   * 测试钩子（E2E 专用）：判定当前题并立即推进，跳过 300/850ms 的动画等待。
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
    auth.promptLogin('登录后才能查看/发起好友 PK').then(function (u) {
      if (u) {
        self.setData({ loggedIn: true });
        self.loadMy();
      }
    });
  },

  goBack: function () {
    wx.navigateBack({
      fail: function () { wx.switchTab({ url: '/pages/index/index' }); }
    });
  },

  onShareAppMessage: function () {
    var code = this.data.code || (this.data.match && this.data.match.code) || '';
    if (code) {
      return {
        title: '我向你发起了词力战士挑战，敢不敢应战？',
        path: '/pages/pk/pk?code=' + code
      };
    }
    return {
      title: '词力战士 - 和好友 PK 单词，赢星星',
      path: '/pages/pk/pk'
    };
  }
});
