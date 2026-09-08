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
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var constants = require('../../utils/constants');
var audio = require('../../game/audio');

var CONFIG = config.CONFIG;

// 新手引导步骤文案（M6-L，首次游玩展示；ww_tutorial_done 持久化）
var TUTORIAL_STEPS = [
  { title: '欢迎，小战士！', desc: '怪兽身上是挖空的题目。点下方字母/词语，把它补全！' },
  { title: '答对打跑怪兽', desc: '答对 +100 分、涨连击，还有爆炸星星特效 ✨' },
  { title: '小心 3 条命', desc: '答错会扣命，3 条命用完本局就输啦。准备好了吗？' }
];

Page({
  data: {
    // ---- 本局配置 ----
    grade: 'kindergarten',   // 学段 key
    level: 1,                // 关卡序号

    // ---- HUD 状态 ----
    livesText: '❤❤❤',       // 命数渲染为 ❤ 字符串
    score: 0,                 // 得分
    qIndex: 1,                // 当前题号（1 起，引擎 answered+1）
    totalQ: CONFIG.totalQ,    // 总题数（10）

    // ---- 提示与选项 ----
    tip: '点击下方字母，补全单词，打跑怪兽！',  // 提示文字
    options: [],              // 选项列表 [{ letter, correct, used, colorClass, display, wide }]

    // ---- 连击提示 ----
    comboText: '',             // 连击浮层文字（空串时不显示）

    // ---- 声音开关（M6 增补） ----
    soundOn: true,              // 音效/朗读总开关（HUD 喇叭切换）

    // ---- 新手引导（M6-L） ----
    tutorialStep: 0,           // 0=不显示；1..3 引导步骤
    tutorialTitle: '',         // 当前步骤标题
    tutorialDesc: ''           // 当前步骤文案
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

    this.setData({
      grade: grade,
      level: level,
      totalQ: CONFIG.totalQ
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
        var width = res[0].width;
        var height = res[0].height;

        // dpr + 尺寸适配：物理像素 = 逻辑像素 × dpr；
        // 渲染坐标系固定 390×500（config.W/H），画布为响应式（CSS width:100%，
        // height:900rpx），故按实际 CSS 宽度等比缩放 ctx，使画面填满画布且不变形（REQ-NFR-3）
        var dpr = wx.getSystemInfoSync().pixelRatio;
        canvasNode.width = width * dpr;
        canvasNode.height = height * dpr;
        var scale = width / config.W;
        ctx.scale(dpr * scale, dpr * scale);

        self._canvasNode = canvasNode;
        self._ctx = ctx;
        self._dpr = dpr;

        // 启动引擎主循环
        self._startEngine();
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
  },

  // ============ 引擎启动与回调注入 ============

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
        var grade = self.data.grade;
        var item = dict.randomItem(grade, self._usedItems);
        if (item) {
          self._usedItems.push(item);
        }
        return item;
      },

      /**
       * 获取当前学段全量词条（词级题型干扰整词候选，H2-B）。
       * @returns {Array} WordItem[]，学段不存在返回 []
       */
      getBank: function () {
        return dict.loadByGrade(self.data.grade);
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

    // 更新快照
    this._lastHud = {
      score: data.score,
      lives: data.lives,
      answered: data.answered
    };

    // 仅在数值实际变化时触发 setData
    if (changed) {
      this.setData(diff);
    }
  },

  /**
   * 命数渲染为 ❤ 字符串。
   * @param {number} lives 当前命数
   * @returns {string} 如 '❤❤❤'
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

    // 拼接结算页查询参数
    var query =
      'grade=' + this.data.grade +
      '&level=' + this.data.level +
      '&win=' + (result.win ? 1 : 0) +
      '&score=' + result.score +
      '&correctCount=' + result.correctCount +
      '&totalQ=' + result.totalQ +
      '&rate=' + result.rate +
      '&stars=' + result.stars +
      '&maxCombo=' + result.maxCombo;

    // 跳转结算页（redirectTo 替换当前页，避免回退回已结束的本局）
    wx.redirectTo({ url: '/pages/result/result?' + query });
  }
});
