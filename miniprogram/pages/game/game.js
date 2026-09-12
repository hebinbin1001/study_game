/**
 * 游戏页逻辑：对接 game/engine.js 主循环
 *
 * 职责：
 *   1. onLoad 读取 grade/level 页面参数，初始化本局配置；
 *   2. onReady 获取 Canvas node + ctx，dpr 适配后调用 engine.start；
 *   3. 注入回调：getNextItem（词库抽题）/ onHudChange / onOptionsChange /
 *      onCombo / onTip / onGameOver；
 *   4. onOptionTap 转发 engine.fire(opt)；
 *   5. onUnload/onHide 调用 engine.stop() 停止 rAF。
 *
 * 关联 REQ：
 *   - REQ-GAME-2（Canvas+HUD 分层）、REQ-GAME-3（命数/题号）
 *   - REQ-GAME-6/7/8/9/10（答对/答错/下沉/连击/反馈）
 *   - REQ-GAME-11/12/15（结算跳转）
 *   - REQ-NFR-1（HUD 仅变化时 setData）、REQ-NFR-3（dpr 适配）
 *   - REQ-DICT-3（词库抽题）
 */

var engine = require('../../game/engine');
var config = require('../../game/config');
var question = require('../../game/question');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var constants = require('../../utils/constants');
var challenge = require('../../utils/challenge');
var rng = require('../../utils/rng');
var audio = require('../../game/audio');
var auth = require('../../utils/auth');
var request = require('../../utils/request');
var review = require('../../utils/review');
var renderer = require('../../game/renderer');

var CONFIG = config.CONFIG;

// 新手引导步骤文案（M6-L，首次游玩展示；ww_tutorial_done 持久化）
var TUTORIAL_STEPS = [
  { title: '欢迎，小战士！', desc: '怪兽身上是挖空的题目。点下方字母/词语，把它补全！' },
  { title: '答对打跑怪兽', desc: '答对 +10 分、涨连击，还有爆炸星星特效 ✨' },
  { title: '小心 ' + CONFIG.initLives + ' 条命', desc: '答错会扣命，' + CONFIG.initLives + ' 条命用完本局就输啦。准备好了吗？' }
];

Page({
  data: {
    // ---- 本局配置 ----
    grade: 'kindergarten',   // 学段 key
    level: 1,                // 关卡序号
    type: '',                // 题型分类 key（空串/'all' = 综合抽题）

    // ---- HUD 状态 ----
    livesText: '❤'.repeat(CONFIG.initLives),  // 命数渲染为 ❤ 字符串（初值随配置联动）
    score: 0,                 // 得分
    qIndex: 1,                // 当前题号（1 起，引擎 answered+1）
    totalQ: CONFIG.totalQ,    // 总题数（10）

    // ---- 提示与选项 ----
    tip: '点击下方字母，补全单词，打跑怪兽！',  // 提示文字
    options: [],              // 选项列表 [{ letter, correct, used, colorClass, display, wide }]

    // ---- 连击提示 ----
    comboText: '',             // 连击浮层文字（空串时不显示）

    // ---- 答错反馈高亮（R3） ----
    showAnswer: false,         // 答错后为真：选项区标绿正确项、标红误选项

    // ---- 暂停（R5） ----
    paused: false,             // 暂停遮罩是否显示

    // ---- 声音开关（M6 增补） ----
    soundOn: true,              // 音效/朗读总开关（HUD 喇叭切换）


    // ---- 新手引导（M6-L） ----
    tutorialStep: 0,           // 0=不显示；1..3 引导步骤
    tutorialTitle: '',         // 当前步骤标题
    tutorialDesc: '',          // 当前步骤文案

    // ---- 开火反馈（皮肤动态展示；仅 e2e 断言用，正常对局不读） ----
    lastRecoil: { dy: 0, t: 0 } // { dy: 战士下沉量, t: 炮口闪光强度 0~1 }
  },

  // ============ 本局运行时状态（不参与 setData） ============
  _canvasNode: null,          // Canvas 节点
  _ctx: null,                 // Canvas 2D 上下文
  _dpr: 1,                    // 设备像素比
  _usedItems: [],             // 已出题目（供 dict.randomItem 排重）
  _lastHud: null,             // 上次 HUD 快照（差值比较，仅变化时 setData）
  _comboTimer: null,          // 连击提示自动清除定时器
  _engineStarted: false,      // 引擎是否已 start（onShow 依据它决定是否 resume）

  // ============ 生命周期 ============

  /**
   * 页面加载：读取 grade/level 参数，初始化本局配置。
   * 关联 REQ-GAME-3（关卡参数化）
   */
  onLoad(options) {
    var grade = options && options.grade ? options.grade : 'kindergarten';
    var level = options && options.level ? parseInt(options.level, 10) : 1;
    var type = options && options.type ? options.type : '';

    // B4：自定义关卡（10 个一组）——由 level-share / 公开广场带完整题目 JSON 进入
    var custom = null;
    if (options && options.customLevel) {
      try {
        custom = JSON.parse(decodeURIComponent(options.customLevel));
      } catch (e) {
        custom = null;
      }
    }
    if (custom && Array.isArray(custom.items)) {
      // 自定义关卡：学段沿用其声明，题源=固定 10 题
      this._customLevel = custom;
      grade = custom.grade || grade;
    }

    // 挑战主线（2026-09-12）：按「学段 + 关卡」用固定种子出题 ——
    // 同一关每次进入题目、挖空位置、选项顺序都一致（重玩刷星公平、可分享复盘）。
    // 走的是与自定义关卡相同的「固定题源」通路，但计入挑战星级（见 result.js）。
    var isChallenge = !!(options && String(options.challenge) === '1');
    this._challenge = isChallenge;
    this._challengeItems = null;
    question.setRandom();                 // 先复位，避免上一局挑战的种子泄漏到本局
    if (isChallenge) {
      var lvInfo = challenge.levelAt(grade, level);
      var seed = (options && options.seed) ? parseInt(options.seed, 10) : challenge.seedOf(grade, level);
      if (!seed) seed = challenge.seedOf(grade, level);
      question.setRandom(rng.makeRng(seed));
      this._challengeItems = challenge.pickItems(
        grade, level, (lvInfo ? challenge.paramsOf(grade, lvInfo.mode).totalQ : CONFIG.totalQ) || CONFIG.totalQ, type
      );
    }

    this.setData({
      grade: grade,
      level: level,
      type: type,
      totalQ: (this._challengeItems && this._challengeItems.length) ? this._challengeItems.length : CONFIG.totalQ,
      challenge: isChallenge
    });

    // 读取本地皮肤选择（离线渲染，未选择时回退默认皮肤）
    this._skins = {
      warrior: storage.getWarriorSkin(),
      monster: storage.getBossSkin()
    };

    // 重置运行时状态
    this._usedItems = [];
    this._lastHud = null;
    this._engineStarted = false;

    // R2：错题回流池（异步拉取；未就绪时本局按纯随机出题，不阻塞对局）
    this._reviewPool = [];
    this._loadReviewPool(type);

    // R4：本局错题（引擎 onWrong 回调逐条累积，结算时交给结算页回顾）
    this._wrongItems = [];

    // 声音开关：恢复本地偏好（默认开）并同步到 audio 模块
    var soundOn = storage.get(constants.STORAGE_KEYS.sound) !== '0';
    audio.setSoundEnabled(soundOn);

    this.setData({ soundOn: soundOn });
  },

  // 切换声音（HUD 喇叭）：写入本地偏好并同步 audio（音效 + 朗读）
  onToggleSound: function () {
    var next = !this.data.soundOn;
    storage.set(constants.STORAGE_KEYS.sound, next ? '1' : '0');
    audio.setSoundEnabled(next);
    this.setData({ soundOn: next });
    if (next) {
      audio.playCorrect(); // 开启时给一个反馈音
    }
  },

  /**
   * 页面显示：从后台切回 / 首次进入时调用。
   * 若引擎已 start 且本局未结束，则恢复主循环（与 onHide 的 engine.stop() 配对，
   * 修复切后台后画面冻结不可恢复的缺陷）。
   * 防御：onShow 可能早于 onReady（引擎未 start）或本局已结束跳转结算页，
   * 此时 _engineStarted=false / G.over=true，resume 不会生效。
   */
  onShow() {
    if (!this._engineStarted) {
      return;
    }
    // 暂停中不自动恢复（否则从后台切回会绕过暂停遮罩继续计时）
    if (this.data.paused) return;
    var G = engine.getState();
    if (G && !G.over) {
      engine.resume();
    }
  },

  /**
   * 页面初次渲染完成：获取 Canvas 节点与逻辑尺寸，dpr 适配后启动引擎。
   * 关联 REQ-GAME-2、REQ-NFR-3
   */
  onReady() {
    var self = this;
    // 用 createSelectorQuery 获取 Canvas node + 逻辑尺寸（REQ-GAME-2）
    wx.createSelectorQuery().in(this)
      .select('#game-canvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          console.error('[game] Canvas 节点获取失败');
          return;
        }
        var canvasNode = res[0].node;
        var ctx = canvasNode.getContext('2d');
        var width = res[0].width;   // CSS 逻辑宽(px)
        var height = res[0].height; // CSS 逻辑高(px)

        // O1 自适应：画布 CSS 尺寸随视口伸缩（flex），渲染坐标系固定 390×500。
        // 等比缩放并居中：scale = min(宽比, 高比)，避免固定 900rpx 在矮屏放不下、
        // 也避免按宽等比导致高不足时裁切/超高留白。多余画布区域由画布背景色延伸。
        var dpr = wx.getSystemInfoSync().pixelRatio;
        canvasNode.width = width * dpr;
        canvasNode.height = height * dpr;
        var scale = Math.min(width / config.W, height / config.H);
        // 变换顺序（后调用者先作用于绘制点，后乘语义）：
        // 先 translate（设备像素偏移）再 scale → 点 p → T(S(p)) = scale·p + offset，
        // 实现「逻辑 390×500 等比缩放后居中」，画布为任意尺寸均不变形不裁切
        ctx.translate(
          (width - config.W * scale) * dpr / 2,
          (height - config.H * scale) * dpr / 2
        );
        ctx.scale(dpr * scale, dpr * scale);

        self._canvasNode = canvasNode;
        self._ctx = ctx;
        self._dpr = dpr;

        // canvas 就绪即开打：形态已在关卡页的模式栏选定（一期改造），本页不再有进关弹层
        if (!self._engineStarted) self._startEngine();
      });
  },

  /**
   * 页面隐藏：停止引擎主循环，避免后台空跑耗电。
   * 关联 REQ-NFR-1
   */
  onHide() {
    engine.stop();
    this._clearComboTimer();
  },

  /**
   * 页面卸载：停止引擎主循环，释放资源。
   * 关联 REQ-NFR-1
   */
  onUnload() {
    engine.stop();
    this._clearComboTimer();
    question.setRandom();   // 复位出题随机源，避免挑战种子泄漏到后续自由练
  },

  // ============ 引擎启动与回调注入 ============

  // 答错 → 上报错题本（登录用户；游客无账号不上报，静默失败不影响对局）
  _reportWrong: function (item) {
    if (!auth.isLoggedIn() || !item || !item.q) return;
    var questionId = (item.type || '') + '|' + (item.q || '') + '|' + (item.a || '');
    request.post('/api/wrong/add', {
      questionId: questionId,
      question: {
        type: item.type || '',
        q: item.q || '',
        a: item.a || '',
        hint: item.hint || ''
      }
    }).then(function () {
      // 诊断日志（真机 vConsole 可见）：便于确认错题是否上报成功
      if (typeof console !== 'undefined' && console.log) console.log('[wrong] 错题已上报 ' + questionId);
    }).catch(function (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[wrong] 错题上报失败 code=' + (err && err.code) + ' msg=' + (err && err.message));
      }
    });
  },

  /**
   * 拉取「待复习错题」构建本局错题池（R2）。
   *
   * 未登录 / 接口失败 / 离线 → 静默保持空池，本局照常纯随机出题（离线可玩是底线）。
   * 分类关卡只在同类题型里取错题，避免综合题混进「成语」这类分类关。
   *
   * @param {string} type 题型分类 key（空 或 'all' 表示不限）
   */
  _loadReviewPool: function (type) {
    var self = this;
    if (!auth.isLoggedIn()) return;
    request.get('/api/wrong/list').then(function (data) {
      var pending = (data && data.pending) || [];
      self._reviewPool = review.buildPool(pending, { typeKey: type });
      if (typeof console !== 'undefined' && console.log) {
        console.log('[review] 待复习错题池 ' + self._reviewPool.length + ' 条（pending ' + pending.length + ' 条）');
      }
    }).catch(function (err) {
      // 静默降级：错题拿不到不影响对局
      self._reviewPool = [];
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[review] 错题池拉取失败，本局走纯随机：code=' + (err && err.code));
      }
    });
  },

  /**
   * 启动引擎并注入页面层回调。
   * 回调签名以 game/engine.js 实际接口为准。
   */
  _startEngine() {
    var self = this;
    engine.start(this._canvasNode, this._ctx, {
      // 皮肤选择（战士/boss avatarId），引擎解析为 emoji+主色渲染
      skins: this._skins,

      /**
       * 获取下一个词条（词库抽题，REQ-DICT-3）。
       * @returns {Object|null} WordItem，无可用题目返回 null（引擎会触发结算）
       */
      getNextItem: function () {
        // 挑战主线：按关卡种子预先取好的固定题目，按序出题
        if (self._challengeItems && self._challengeItems.length) {
          var ci = self._usedItems.length;
          if (ci < self._challengeItems.length) {
            var chItem = self._challengeItems[ci];
            self._usedItems.push(chItem);
            return chItem;
          }
          return null;
        }
        // B4：自定义关卡 → 按序出固定 10 题（items 已由导入/公开广场带全）
        if (self._customLevel && Array.isArray(self._customLevel.items)) {
          var citems = self._customLevel.items;
          var idx = self._usedItems.length;
          if (idx < citems.length) {
            var citem = citems[idx];
            self._usedItems.push(citem);
            return citem;
          }
          return null;
        }
        var grade = self.data.grade;
        var type = self.data.type;

        // R2：以 reviewRate 概率优先出「待复习错题」，让主玩法承担自动复习。
        // 池为空（游客 / 未登录 / 拉取失败 / 本局已出完）时自然回退到下面的随机抽题。
        if (self._reviewPool && self._reviewPool.length &&
            review.shouldUseReview(CONFIG.reviewRate)) {
          var hit = review.pickFromPool(self._reviewPool, review.usedMapOf(self._usedItems));
          if (hit) {
            self._usedItems.push(hit.item);
            return hit.item;
          }
        }

        // 分类关卡：限该类题库抽题；综合走原逻辑
        var item = (type && type !== 'all')
          ? dict.randomItemByGroup(grade, type, self._usedItems)
          : dict.randomItem(grade, self._usedItems);
        if (item) {
          self._usedItems.push(item);
        }
        return item;
      },

      /**
       * 获取当前题库词条（词级题型干扰整词候选，H2-B）。
       * 分类时返回该分类过滤后的词条（与出题同源）。
       * @returns {Array} WordItem[]，学段不存在返回 []
       */
      getBank: function () {
        // 挑战主线：干扰项从本关固定题库里取（与出题同源，避免出现没学过的字）
        if (self._challengeItems && self._challengeItems.length) {
          return self._challengeItems;
        }
        // B4：自定义关卡 → 词库=本关固定 items（干扰项从同关内取）
        if (self._customLevel && Array.isArray(self._customLevel.items)) {
          return self._customLevel.items;
        }
        var type = self.data.type;
        if (type && type !== 'all') {
          return dict.filterByGroup(self.data.grade, type);
        }
        return dict.loadByGrade(self.data.grade);
      },

      /**
       * 答错回调（错题本上报，engine 在 _failQuestion 时触发）。
       * @param {Object} item 答错的词条 { type,q,a,hint }
       */
      onWrong: function (item) {
        self._wrongItems.push(item);   // R4：收集本局错题，供结算页回顾
        self._reportWrong(item);
      },

      /**
       * 形态阶段事件（M7，仅供表现层）：question/correct/wrong/over
       */
      onPhase: function (phase, payload) {
        self._onPhase(phase, payload);
      },

      /**
       * HUD 更新：仅在数值实际变化时 setData（REQ-NFR-1）。
       * @param {Object} data { score, lives, answered, totalQ, combo }
       */
      onHudChange: function (data) {
        self._onHudChange(data);
      },

      /**
       * 选项列表更新。
       * @param {Array} options [{ letter, correct, used, colorClass, display, wide }]
       *        display 为按钮展示文本（词级整词），wide 标记宽版按钮样式（H2-B）
       */
      onOptionsChange: function (options) {
        self.setData({ options: options });
      },

      /**
       * 连击提示（连对 2/3/5 题时触发，REQ-GAME-9）。
       * @param {number} combo 当前连击数
       */
      onCombo: function (combo) {
        self._onCombo(combo);
      },

      /**
       * 提示文字更新（答对/答错/逼近时触发）。
       * @param {string} text 提示文字
       */
      onTip: function (text) {
        self.setData({ tip: text });
      },

      /**
       * 游戏结束：携带结果跳转结算页（REQ-GAME-11/12/15）。
       * @param {Object} result { win, score, correctCount, totalQ, rate, stars }
       */
      onGameOver: function (result) {
        self._onGameOver(result);
      }
    });

    // 标记引擎已启动：onShow 依据该标记决定是否 resume（onShow 可能早于 onReady）
    this._engineStarted = true;

    // M6-L：引擎就绪后，首次进入展示新手引导（不阻塞主循环）
    this._maybeShowTutorial();
  },

  // ============ HUD 更新（差值比较，REQ-NFR-1） ============

  /**
   * 引擎阶段事件回调。
   *   question → 出新题：复位答案高亮（R3）
   *   wrong    → 答错：亮起答案高亮（正确项标绿、误选项标红，R3）
   *
   * 说明：原 M7 的三种对局形态（经典/Boss/极速）已删除 —— 三者判定与计分完全一致，
   * 属换皮表现；本回调现在只承担 R3 的高亮驱动。
   */
  _onPhase: function (phase) {
    if (phase === 'wrong') this.setData({ showAnswer: true });
    else if (phase === 'question') this.setData({ showAnswer: false });
  },

  // ============ HUD 更新（差值比较，REQ-NFR-1） ============

  /**
   * HUD 更新：比较 score/lives/answered 与上次快照，仅任一变化时 setData。
   * 避免引擎 _newQuestion 时冗余的全量 setData 触发渲染。
   * 关联 REQ-NFR-1
   */
  _onHudChange(data) {
    var last = this._lastHud;
    var diff = {};
    var changed = false;

    // 得分变化
    if (!last || last.score !== data.score) {
      diff.score = data.score;
      changed = true;
    }
    // 命数变化
    if (!last || last.lives !== data.lives) {
      diff.livesText = this._renderLives(data.lives);
      changed = true;
    }
    // 已答题数变化（当前题号 = answered + 1）
    if (!last || last.answered !== data.answered) {
      diff.qIndex = data.answered + 1;
      changed = true;
    }
    // 连击数镜像到 data：页面本身不展示，但它是「连击累积」的可观测值
    // （端到端用例用它断言连击，见 e2e/verify-game.js）
    if (!last || last.combo !== data.combo) {
      diff.comboShow = data.combo || 0;
      changed = true;
    }
    // 更新快照
    this._lastHud = {
      score: data.score,
      lives: data.lives,
      answered: data.answered,
      combo: data.combo
    };

    // 仅在数值实际变化时触发 setData
    if (changed) {
      this.setData(diff);
    }
  },

  /**
   * 命数渲染为 ❤ 字符串。
   * @param {number} lives 当前命数
   * @returns {string} 如 '❤❤❤❤❤'
   */
  _renderLives(lives) {
    var n = Math.max(0, lives);
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '❤';
    }
    return s;
  },

  // ============ 连击提示（REQ-GAME-9） ============

  /**
   * 连击提示：设置 comboText 触发浮层动画，800ms 后自动清除。
   * 关联 REQ-GAME-9
   */
  _onCombo(combo) {
    var text = combo + ' 连击!';
    if (combo >= 5) {
      text = combo + ' 连击!🎉';
    } else if (combo >= 3) {
      text = combo + ' 连击!🔥';
    }

    this.setData({ comboText: text });

    // 800ms 后自动清除（与 wxss comboPop 动画时长一致）
    this._clearComboTimer();
    var self = this;
    this._comboTimer = setTimeout(function () {
      self.setData({ comboText: '' });
      self._comboTimer = null;
    }, 800);
  },

  /**
   * 清除连击提示定时器。
   */
  _clearComboTimer() {
    if (this._comboTimer) {
      clearTimeout(this._comboTimer);
      this._comboTimer = null;
    }
  },

  // ============ 新手引导（M6-L） ============

  // 首次进入（ww_tutorial_done 无值）且引擎已启动后展示 3 步入场引导
  _maybeShowTutorial() {
    if (storage.get('ww_tutorial_done')) return;
    this._showTutorialStep(1);
  },

  _showTutorialStep(step) {
    var cfg = TUTORIAL_STEPS[step - 1];
    if (!cfg) return;
    this.setData({
      tutorialStep: step,
      tutorialTitle: cfg.title,
      tutorialDesc: cfg.desc
    });
  },

  // 引导蒙层点击：未到最后一步 → 下一步；最后一步 → 完成进入游戏
  onTutorialTap() {
    var step = this.data.tutorialStep;
    if (!step) return;
    if (step < 3) {
      this._showTutorialStep(step + 1);
    } else {
      this.finishTutorial();
    }
  },

  // 完成引导：标记 ww_tutorial_done 并关闭蒙层（不阻塞游戏主循环）
  finishTutorial() {
    storage.set('ww_tutorial_done', '1');
    this.setData({ tutorialStep: 0 });
  },

  // ============ 玩家操作 ============

  /**
   * 【仅供端到端测试】冻结真实主循环并确定性推进指定帧数。
   *
   * 为什么存在：开发者工具的模拟器在窗口不处于前台时，会对 canvas 的
   * requestAnimationFrame 做节流甚至停摆 —— 于是出现「选项点对了，但炮弹永远
   * 飞不到、得分永远不加」「答错后永远不进入逼近扣命」这类与代码无关的偶发假失败。
   *
   * e2e 用法：先真实点击选项（模拟用户操作），再调用本方法把游戏时钟按固定步长
   * 推进，把对局变成可复现的确定性状态机 —— 与 verify-snake「冻结 _stopLoop +
   * 手动 _tick」的做法一致。
   *
   * @param {number} frames 推进帧数（每帧 1/60 秒游戏时间）
   */
  _testStep(frames) {
    engine.stop();                                  // 冻结真实主循环，避免与手动步进叠加
    var n = Math.max(1, parseInt(frames, 10) || 1);
    for (var i = 0; i < n; i++) {
      if (engine.G && engine.G.over) break;
      engine._update(1 / 60);
    }
    engine.renderOnce();                            // 同步补一帧：让截图/断言看到与状态一致的画面
  },

  /**
   * 【仅供端到端测试】读开火反馈强度（后坐力/炮口闪光）。
   *
   * 为什么存在：这两个效果是 canvas 上画的，端到端拿不到像素做断言。
   * 这里把「状态 → 效果强度」的纯函数结果同步写进 data，测试即可对着
   * 真实点击之后的状态断言，而不是靠像素或时钟等待。
   *
   * @returns {{dy:number, t:number}} dy = 战士下沉量(px)；t = 闪光强度 0~1
   */
  _testRecoil() {
    var r = renderer.warriorRecoil(engine.getState());
    this.setData({ lastRecoil: r });
    return r;
  },

  // ============ 暂停 / 继续 / 退出（R5） ============

  /**
   * 暂停：停主循环 + 停竞速计时，并显示不透明遮罩（盖住题目与计时，防"暂停偷看"）。
   * 主循环停掉后不会再推进状态，故暂停期间怪兽不下沉、倒计时不走。
   */
  onPause: function () {
    if (this.data.paused) return;
    engine.stop();
    this.setData({ paused: true });
  },

  /** 继续：关掉遮罩并恢复主循环。 */
  onResume: function () {
    if (!this.data.paused) return;
    this.setData({ paused: false });
    var G = engine.getState();
    if (G && !G.over) {
      engine.resume();
    }
  },

  /** 暂停后返回：直接退出本局，不结算、不上报成绩。 */
  onQuit: function () {
    engine.stop();
    this.setData({ paused: false });
    wx.navigateBack();
  },

  /**
   * 选项按钮点击：转发给 engine.fire(opt)。
   * catchtap 阻止冒泡，避免与父容器事件冲突。
   * 关联 REQ-GAME-6/7（点选项触发答对/答错流程）
   */
  onOptionTap(e) {
    // M6-L：若引导蒙层仍显示（异常路径兜底），先关闭引导再继续作答
    if (this.data.tutorialStep > 0) {
      this.finishTutorial();
      return;
    }
    var index = e.currentTarget.dataset.index;
    var opt = this.data.options[index];
    if (!opt || opt.used) {
      // 已用（选错）的选项不再响应
      return;
    }
    engine.fire(opt);
  },

  // ============ 游戏结束（REQ-GAME-11/12/15） ============

  /**
   * 游戏结束：停止引擎，携带结果跳转结算页。
   * 用 redirectTo 避免回退回游戏页（本局已结束）。
   * 关联 REQ-GAME-11（失败态）、REQ-GAME-12（星级评定）、REQ-GAME-15（结算操作）
   */
  _onGameOver(result) {
    // 先停止引擎主循环
    engine.stop();
    this._clearComboTimer();

    // R4：把本局错题交给结算页回顾。
    // 经 storage 中转而不是塞进 URL —— 查询串长度有限，错题多时会截断。
    // 结算页读取后会立即清除该键（见 result.js），避免下次误显示上一局的题。
    storage.set('ww_last_wrong', (this._wrongItems || []).slice(0, 20));

    // 拼接结算页查询参数（type 分类随参数传递，结算页据此写分类存档；
    // B4：自定义关卡带 custom=1，结算页不写系统星级存档、不入字词进度）
    var query =
      'grade=' + this.data.grade +
      '&level=' + this.data.level +
      '&type=' + (this.data.type || '') +
      '&custom=' + (this._customLevel ? '1' : '0') +
      '&challenge=' + (this._challenge ? '1' : '0') +
      '&win=' + (result.win ? 1 : 0) +
      '&score=' + result.score +
      '&correctCount=' + result.correctCount +
      '&totalQ=' + result.totalQ +
      '&rate=' + result.rate +
      '&stars=' + result.stars +
      '&maxCombo=' + result.maxCombo;

    var self = this;
    var go = function () {
      // 跳转结算页（redirectTo 替换当前页，避免回退回已结束的本局）
      wx.redirectTo({ url: '/pages/result/result?' + query });
    };
    go();
  }
});
