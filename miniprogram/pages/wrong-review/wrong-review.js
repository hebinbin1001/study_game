// 错题复习页（wrong-review · M6-G 多形态复习）
//
// 职责：
//   1. 逐题展示待复习题目
//   2. 选择答案，反馈正误
//   3. 更新复习状态（艾宾浩斯算法）
// 4. 三种复习形态切换：原题 / 听音选义 / 看中文选词（M6-G）
//    - 原题：显示题面 q，从 4 个选项中选出答案 a；
//    - 听音：隐藏题面，朗读答案发音（audio.speakByItem），选出听到的内容；
//    - 看中文选词：英语/带释义词条，题干显示中文释义 hint，选出对应词。
//    选项由「正确项 a + 3 个干扰」构造（同批其它答案优先 + 语言兜底池），保证 4 项互异。
//    模式仅影响当前题展示与作答形态，不改变后端 /api/wrong/review 语义。

var request = require('../../utils/request');
var audio = require('../../game/audio');

var MODES = [
  { key: 'original', label: '原题' },
  { key: 'listen', label: '听音选义' },
  { key: 'meaning', label: '看中文选词' }
];

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
    correctCount: 0,
    totalCount: 0,
    // M6-G
    modes: MODES,
    currentMode: 'original',
    showQ: true,        // 是否显示题面 q
    showListen: false,  // 是否听音形态（隐藏题面）
    showHint: false,    // 是否显示释义行/作为题干（hint 且不剧透）
    hintText: ''        // 安全 hint 文本（hint !== a 时才有）
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
        self.setData({ completed: true, totalCount: 0, currentItem: null });
        return;
      }

      self.setData({
        items: pending,
        totalCount: pending.length,
        currentIndex: 0,
        currentItem: pending[0],
        correctCount: 0
      });
      self.applyQuestion(pending[0]);
    }).catch(function () {
      // 加载失败，标记为空完成态
      self.setData({ completed: true, totalCount: 0, currentItem: null });
    });
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

  // 切换复习形态（答题中锁定；仅影响当前题展示，不重排后端）
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
      currentItem: nextItem
    });
    this.applyQuestion(nextItem);
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
