// 错题复习页（wrong-review · M6-G 多形态复习 + 2026-10-25 十题一关）
//
// 职责：
//   1. **一关 10 题**（LEVEL_SIZE）：取到期/待复习题里的前 10 题成一关，答完进本关结算
//   2. 关内**全自动推进**：答对答错都自动下一题，不再用模态弹窗打断（2026-10-25 用户反馈
//      「一道题完了应该直接下一道」——原来答对后要弹「是否移出错题本」的弹窗，必须点一下才继续）
//   3. 更新复习状态（艾宾浩斯算法，由服务端 /api/wrong/review 负责）
//   4. 三种复习形态切换：原题 / 听音选义 / 看中文选词（M6-G）
//
// ⚠️ 架构红线（改之前先读 docs/错题复习流程规划-待确认.md §四）：
//   · 这里的「一关」只是**本局的一段**，不是关卡体系的一员 ——
//     不写 storage.saveStars、不出现「第 N 关」的解锁概念；
//   · **不上报成绩、不产生星级**（不接 play-report、不调 /api/score），
//     否则会污染玩法进度榜 / 段位星 / 成就统计（它们都按 game_type 与
//     「玩法×学段×题型×关卡」聚合，错题复习没有这些维度）；
//   · 熟练度与间隔表由服务端负责，端上不自己算（utils/ebbinghaus.js 两端有 parity 单测）。

var request = require('../../utils/request');
var typeLabel = require('../../utils/type-label');
var audio = require('../../game/audio');

/** 一关题数：与「每日挑战 10 题」「字母射击 10 题」口径一致 */
var LEVEL_SIZE = 10;
/** 反馈停留时长：答对 800ms（够看清 ✓，又不拖节奏）、答错 1500ms（要看正确答案） */
var FEEDBACK_MS_CORRECT = 800;
var FEEDBACK_MS_WRONG = 1500;

var MODES = [
  { key: 'original', label: '原题' },
  { key: 'listen', label: '听音选义' },
  { key: 'meaning', label: '看中文选词' }
];
var READY_MODES = MODES.filter(function (m) {
  return m.key !== 'listen' || audio.isTTSReady();
});

// 英语型题型（speak 语言判断用）
var EN_TYPES = ['en', 'w1', 'w2', 'fill', 'trans'];
// 干扰兜底池（词库不足时保证凑足 4 项）
var EN_FALLBACK = ['apple', 'book', 'cat', 'dog', 'like', 'play', 'run', 'school', 'time', 'big'];
var CN_FALLBACK = ['大', '小', '天', '地', '人', '心', '学', '好', '上', '日'];

function isEnglishType(t) {
  return EN_TYPES.indexOf(t) >= 0;
}
function isEnWord(s) {
  return /^[A-Za-z\s'\-]+$/.test(String(s || ''));
}

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
    // 2026-10-28：原来 currentItem 为空且 completed 为 false 时，题卡区整块空白 ——
    // 首屏加载中、请求失败都落在这个状态。这两个标记把它们区分出来。
    loading: true,
    loadError: false,
    noDue: false,          // 「继续复习」时若没有到期题 → 完成页给明确说明
    correctCount: 0,
    totalCount: 0,         // ⚠️ 现在是「本关题数」，不再是整池总数
    levelRate: 0,          // 本关正确率（结算页用）
    progressPct: 0,        // 进度条百分比（在 JS 里算好再绑定：
                           // WXML 表达式只支持简单运算，嵌套三元会静默渲染成空）
    hasMore: false,        // 本关之后还有没有可继续的题（决定「再来一关」是否显示）
    // M6-G
    modes: READY_MODES,
    currentMode: 'original',
    showQ: true,        // 是否显示题面 q
    showListen: false,  // 是否听音形态（隐藏题面）
    showHint: false,    // 是否显示释义行/作为题干（hint 且不剧透）
    hintText: ''        // 安全 hint 文本（hint !== a 时才有）
  },

  /**
   * 已答过的题目不会再出现在本会话后续的关里。
   *
   * 为什么需要：/api/wrong/list 的 pending 口径是「熟练度 < 100」，**不是**「已到期」。
   * 答对一次熟练度可能才 20/40/60，下次拉取它还在列表里 —— 不排重就会反复练同一道。
   */
  _doneIds: null,
  /** 本关答对的 recordId（结算页「一键移出」用） */
  _levelCorrectIds: null,
  /** 是否有一关正在进行（防止 onShow 把当前关重置掉） */
  _levelActive: false,

  onLoad: function (options) {
    var opt = options || {};
    this._only = opt.only ? String(opt.only) : '';
    this._dueOnly = String(opt.due || '') === '1';
    this._doneIds = {};
    this._levelCorrectIds = [];
  },

  onShow: function () {
    // 关卡进行中 / 已结算 → 不要因为页面重新显示就把进度重置掉。
    // （结算页让玩家自己点「再来一关」，不自动续关）
    if (this._levelActive || this.data.completed) return;
    this.loadLevel();
  },

  /**
   * 取一关：拉待复习题 → 排除本会话已答过的 → 取前 LEVEL_SIZE 题。
   *
   * 后端是全量返回、端上切片（server/routes/wrong.js:90 注明「将来量级变大再改 SQL limit」），
   * 所以这一轮**零后端改动**。
   */
  loadLevel: function () {
    var self = this;
    request.get('/api/wrong/list').then(function (data) {
      var pending = data.pending || [];
      if (self._dueOnly) {
        var now = Date.now();
        pending = pending.filter(function (it) {
          var t = new Date(it.nextReviewAt).getTime();
          return isFinite(t) && t <= now;
        });
      }
      // 单题练习：只留这一道
      if (self._only) {
        pending = pending.filter(function (it) {
          return String(it.recordId) === self._only;
        });
      }
      // 本会话已答过的排除掉（见 _doneIds 注释）
      pending = pending.filter(function (it) {
        return !self._doneIds[String(it.recordId)];
      });

      if (pending.length === 0) {
        // 用户点「继续复习」却已经没有题 → 明确提示，别让按钮看着像坏了
        if (self._restartRequested) {
          self._restartRequested = false;
          wx.showToast({ title: '暂时没有待复习的错题了', icon: 'none' });
        }
        self._levelActive = false;
        self.setData({
          completed: true, totalCount: 0, currentItem: null, noDue: true,
          hasMore: false, levelRate: 0, loading: false, loadError: false
        });
        return;
      }

      self._restartRequested = false;
      self._startLevel(pending);
    }).catch(function () {
      self._levelActive = false;
      // 2026-10-28：失败原来直接塞 completed: true —— 用户看到的是「复习完成 🎉」庆祝视图，
      // 会把「网络挂了」误认成「今天没题了」。改为独立失败态 + 重试入口。
      self.setData({
        loading: false, loadError: true,
        completed: false, currentItem: null, totalCount: 0, hasMore: false
      });
    });
  },

  /** 用候选池的前 LEVEL_SIZE 题开一关 */
  _startLevel: function (pool) {
    var level = pool.slice(0, LEVEL_SIZE);
    this._levelActive = true;
    this._levelCorrectIds = [];
    this.setData({
      items: level,
      totalCount: level.length,
      hasMore: pool.length > level.length,
      currentIndex: 0,
      currentItem: level[0],
      loading: false,
      loadError: false,
      correctCount: 0,
      levelRate: 0,
      progressPct: 0,
      noDue: false,
      completed: false,
      showFeedback: false,
      answered: false,
      correct: false,
      selectedOption: null
    });
    this.applyQuestion(level[0]);
  },

  // 根据当前 mode 构造「题干视图 + 选项」渲染当前题
  applyQuestion: function (item) {
    var self = this;
    var q = (item && item.question) || {};
    var mode = this.data.currentMode || 'original';

    // 释义是否可安全展示（hint 非空且 ≠ 答案，避免剧透）
    var rawHint = q.hint ? String(q.hint).trim() : '';
    var hintOk = !!rawHint && rawHint !== String(q.a || '').trim();

    // 「看中文选词」需要释义作题干；无释义的题回退为原题
    if (mode === 'meaning' && !hintOk) {
      mode = 'original';
    }

    this.setData({
      currentMode: mode,
      typeLabel: typeLabel.labelOf(q.type),
      displayOptions: this.buildChoicePool(q),
      selectedOption: null,
      answered: false,
      correct: false,
      showFeedback: false,
      showQ: mode === 'original',
      showListen: mode === 'listen',
      showHint: hintOk && (mode === 'original' || mode === 'meaning'),
      hintText: rawHint
    });

    // 听音形态：延时自动朗读一次（让玩家先听）
    if (mode === 'listen') {
      setTimeout(function () {
        self.playAudio();
      }, 350);
    }
  },

  // 构造 4 个选项（含答案 a，互异；干扰 = 同批其它答案（语言相近优先）+ 语言兜底池）
  buildChoicePool: function (question) {
    var answer = question.a;
    var en = isEnglishType(question.type) || isEnWord(answer);
    var seen = {};
    var distract = [];

    // 1) 同批其它错题答案（语言形态接近优先）
    var items = this.data.items || [];
    for (var i = 0; i < items.length && distract.length < 3; i++) {
      var other = items[i] && items[i].question;
      if (!other || !other.a) continue;
      var va = other.a;
      if (va === answer || seen[va]) continue;
      var en2 = isEnglishType(other.type) || isEnWord(va);
      if (en2 === en) {
        seen[va] = 1;
        distract.push(va);
      }
    }

    // 2) 语言兜底池
    var pool = en ? EN_FALLBACK : CN_FALLBACK;
    for (var j = 0; j < pool.length && distract.length < 3; j++) {
      var p = pool[j];
      if (p !== answer && !seen[p]) {
        seen[p] = 1;
        distract.push(p);
      }
    }

    // 3) 极端兜底（理论上不可达，保证 4 项）
    var guard = 0;
    while (distract.length < 3 && guard++ < 80) {
      var c = en
        ? String.fromCharCode(97 + Math.floor(Math.random() * 26))
        : CN_FALLBACK[Math.floor(Math.random() * CN_FALLBACK.length)];
      if (c !== answer && !seen[c]) {
        seen[c] = 1;
        distract.push(c);
      }
    }

    var options = [answer].concat(distract).sort(function () {
      return Math.random() - 0.5;
    });
    return options.map(function (value) {
      return { value: value, cls: '' };
    });
  },

  // 切换复习形态（答题中锁定；仅影响当前题展示，不重排题序）
  switchMode: function (e) {
    if (this.data.answered) {
      wx.showToast({ title: '本题已作答', icon: 'none' });
      return;
    }
    var mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.currentMode) return;
    this.setData({ currentMode: mode });
    if (this.data.currentItem) {
      this.applyQuestion(this.data.currentItem);
    }
  },

  // 听音形态：朗读答案词（audio.speakByItem 内部按 type 判断语言，插件不可用则静默）
  playAudio: function () {
    var item = this.data.currentItem;
    if (!item || !item.question) return;
    audio.speakByItem(item.question, item.question.a);
  },

  /**
   * 选择选项。
   *
   * 2026-10-25 改动：**答对也不再弹「是否移出错题本」的模态弹窗**，改成和答错一样
   * 展示反馈后自动进下一题。「移出错题本」挪到结算页批量处理（askBulkRemove）
   * 与错题本页的长按动作，功能没丢，只是不再打断连续作答。
   */
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
      displayOptions: displayOptions,
      // 进度条按「已答完的题数」走，答完最后一题就是 100%
      progressPct: this.data.totalCount
        ? Math.round((this.data.currentIndex + 1) / this.data.totalCount * 100)
        : 0
    });

    // 本会话内不再重复出这道题（答对答错都算练过）
    this._doneIds[String(currentItem.recordId)] = 1;
    if (correct) {
      this._levelCorrectIds.push(currentItem.recordId);
      this.setData({ correctCount: this.data.correctCount + 1 });
    }

    // 上报复习结果（艾宾浩斯熟练度由服务端算）
    request.post('/api/wrong/review', {
      recordId: currentItem.recordId,
      correct: correct
    }).catch(function () {
      // 上报失败静默降级，不影响本地作答流程
    });

    // 答对 / 答错都是「反馈一下 → 自动下一题」，不再有阻塞弹窗
    setTimeout(function () {
      self.nextQuestion();
    }, correct ? FEEDBACK_MS_CORRECT : FEEDBACK_MS_WRONG);
  },

  // 下一题；本关最后一题答完 → 结算
  nextQuestion: function () {
    var nextIndex = this.data.currentIndex + 1;
    if (nextIndex >= this.data.items.length) {
      // 本关结束。
      // ⚠️ 必须同时收起答题反馈层：否则反馈浮层会一直盖在结算页上
      //    （2026-09-13 用户反馈「答对后的弹窗一直都在」）。
      var total = this.data.totalCount || 0;
      var right = this.data.correctCount || 0;
      this._levelActive = false;
      this.setData({
        completed: true,
        showFeedback: false,
        answered: false,
        correct: false,
        levelRate: total ? Math.round(right / total * 100) : 0
      });
      return;
    }

    var nextItem = this.data.items[nextIndex];
    this.setData({
      currentIndex: nextIndex,
      currentItem: nextItem
    });
    this.applyQuestion(nextItem);
  },

  /** 再来一关：重新取关（已答过的会被 _doneIds 排除） */
  nextLevel: function () {
    this._restartRequested = true;
    this.loadLevel();
  },

  /** 兼容旧入口名（wxml / 外部调用可能还在用 restart） */
  restart: function () {
    this.nextLevel();
  },

  /**
   * 结算页「一键移出本关答对的题」。
   *
   * 原来这个入口是「答对后立刻弹窗问一次」，会打断节奏；现在收进结算页，
   * 一次批量处理。接口 /api/wrong/remove 是幂等的，逐条调用即可。
   */
  askBulkRemove: function () {
    var ids = (this._levelCorrectIds || []).slice();
    if (!ids.length) return;
    var self = this;

    wx.showModal({
      title: '移出错题本',
      content: '把本关答对的 ' + ids.length + ' 题移出错题本？移除后不再复习；也可以先保留，按间隔再练一次。',
      confirmText: '移出',
      cancelText: '先保留',
      success: function (res) {
        if (!res.confirm) return;
        var done = 0;
        var ok = 0;
        var finish = function () {
          done++;
          if (done < ids.length) return;
          wx.showToast({
            title: ok === ids.length ? ('已移出 ' + ok + ' 题') : ('已移出 ' + ok + '/' + ids.length + ' 题'),
            icon: 'none'
          });
          // 移除后这批题不会再出现（本来也进了 _doneIds），清空避免重复点
          self._levelCorrectIds = [];
        };
        ids.forEach(function (id) {
          request.post('/api/wrong/remove', { recordId: id }).then(function () {
            ok++;
            finish();
          }).catch(function () {
            finish();
          });
        });
      }
    });
  },

  // 返回错题本
  goBack: function () {
    wx.navigateBack();
  }
});
