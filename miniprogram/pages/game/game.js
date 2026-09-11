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
var auth = require('../../utils/auth');
var request = require('../../utils/request');
var review = require('../../utils/review');

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

    // ---- 声音开关（M6 增补） ----
    soundOn: true,              // 音效/朗读总开关（HUD 喇叭切换）

    // ---- 对局形态（M7：classic/boss/rush，仅表现层，不影响计分） ----
    // 一期改造：形态改由关卡页的模式栏选定并随 URL 传入，本页不再弹层
    mode: 'classic',           // 当前生效形态
    hpCells: [],               // boss 血条占位格 [1..totalQ]
    bossRemain: 0,             // boss 剩余血量格（= 总题数进度）
    bossFury: false,           // ≤25% 暴怒氛围
    bossHit: false,            // 受击顿帧（canvas 抖动）
    bossDefeat: false,         // BOSS 击破大闪层
    modeFxText: '',            // 形态飘字（命中/挥击/击破）
    modeFxKey: 0,              // 飘字重播 key
    rushShow: '',              // 竞速倒计时文本（如 '5.6'）
    rushPct: 100,              // 竞速倒计时条宽 %
    rushLow: false,            // ≤2s 变红
    penLock: false,            // 竞速惩罚锁（禁点）
    comboShow: 0,              // 竞速连击徽标（>1 显示 ×N）

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

    this.setData({
      grade: grade,
      level: level,
      type: type,
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

    // R2：错题回流池（异步拉取；未就绪时本局按纯随机出题，不阻塞对局）
    this._reviewPool = [];
    this._loadReviewPool(type);

    // 声音开关：恢复本地偏好（默认开）并同步到 audio 模块
    var soundOn = storage.get(constants.STORAGE_KEYS.sound) !== '0';
    audio.setSoundEnabled(soundOn);

    // 形态：优先取关卡页传入的 mode（一期改造），否则沿用本地记忆
    // （「再玩一次」、从结算页重进等入口不带 mode，走记忆值）
    var mode = this._resolveMode(options && options.mode);
    storage.setMode(mode);   // 与记忆保持一致（关卡页已写入，这里兜底）
    var hpCells = [];
    for (var h = 0; h < CONFIG.totalQ; h++) hpCells.push(h + 1);
    this.setData({
      soundOn: soundOn,
      mode: mode,
      bossRemain: CONFIG.totalQ,
      hpCells: hpCells
    });
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
      // 竞速：回到前台且当前题仍待答 → 从剩余时间续走倒计时
      this._rushResumeIfIdle();
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
    this._rushStop();
    this._clearFxTimer();
  },

  /**
   * 页面卸载：停止引擎主循环，释放资源。
   * 关联 REQ-NFR-1
   */
  onUnload() {
    engine.stop();
    this._clearComboTimer();
    this._rushStop();
    this._clearFxTimer();
    if (this._penTimer) { clearTimeout(this._penTimer); this._penTimer = null; }
    if (this._hitTimer) { clearTimeout(this._hitTimer); this._hitTimer = null; }
  },

  // ============ 引擎启动与回调注入 ============

  /**
   * 校验形态 key：命令行传入非法值时回退到本地记忆（ww_mode）。
   * 形态来源优先级：URL 参数（关卡页模式栏）> 本地记忆（再玩一次等入口）> classic。
   * @param {string} raw URL 上的 mode 参数
   * @returns {string} 合法形态 key
   */
  _resolveMode: function (raw) {
    var modes = CONFIG.modes || [];
    for (var i = 0; i < modes.length; i++) {
      if (modes[i].key === raw) return raw;
    }
    return storage.getMode();
  },

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

      // M7 对局形态（classic/boss/rush；仅表现层差异，判定/计分在引擎内共享）
      mode: this.data.mode,

      /**
       * 获取下一个词条（词库抽题，REQ-DICT-3）。
       * @returns {Object|null} WordItem，无可用题目返回 null（引擎会触发结算）
       */
      getNextItem: function () {
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
   * 形态阶段事件处理（M7，纯表现）：
   *   question → 新题（rush 启动倒计时 / 清飘字）
   *   correct  → 答对（boss 扣血格+命中特效；rush 停表并展示连击视觉）
   *   wrong    → 答错/超时（boss 挥击文案；rush 惩罚锁）
   *   over     → 结算（boss 胜出触发“击破”，由 _onGameOver 延迟跳转展示）
   */
  _onPhase: function (phase, payload) {
    var mode = this.data.mode;
    if (mode === 'classic') {
      // 经典形态无额外表现，但仍需在结束时清理（防御）
      if (phase === 'over') this._rushStop();
      return;
    }
    if (phase === 'question') {
      this._clearFxTimer();
      this.setData({ modeFxText: '', penLock: false });
      if (mode === 'rush') this._rushStart();
      return;
    }
    if (phase === 'correct') {
      this._rushStop();
      var combo = payload && payload.combo ? payload.combo : 0;
      if (mode === 'boss') {
        this._bossHit();
        this._showFx(combo > 1 ? '💥 ×' + combo + ' 连击！' : '💥 命中！');
      } else {
        this._showFx((combo > 1 ? '+10 ×' + combo : '+10') + ' ⚡');
      }
      return;
    }
    if (phase === 'wrong') {
      this._rushStop();
      if (mode === 'rush') this._penLock();
      this._showFx(mode === 'boss' ? '👹 Boss 挥击！' : '⏱ 答错/超时！');
      return;
    }
    if (phase === 'over') {
      this._rushStop();
      // Boss 胜出：over 事件在结算跳转前派发；击破文案由 _showFx 呈现、_onGameOver 延迟跳转
      if (mode === 'boss' && payload && payload.win) {
        this._showFx('💥 BOSS 击破！', 0); // life=0 不自动清除（由跳转前清除）
      }
    }
  },

  // Boss：答对扣 1 格血；≤3 格进入暴怒氛围；触发一次受击顿帧（canvas 抖动 class）
  _bossHit: function () {
    var remain = Math.max(0, this.data.bossRemain - 1);
    var fury = remain > 0 && remain <= 3;
    var self = this;
    this.setData({ bossRemain: remain, bossFury: fury, bossHit: true });
    if (this._hitTimer) clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(function () { self.setData({ bossHit: false }); }, 140);
  },

  // 形态飘字（生命期后可自动清除；life=0 表示保持，由调用方清除）
  _showFx: function (text, life) {
    this._clearFxTimer();
    var self = this;
    this.setData({ modeFxText: text, modeFxKey: (this.data.modeFxKey || 0) + 1 });
    if (life !== 0) {
      this._fxTimer = setTimeout(function () { self.setData({ modeFxText: '' }); }, life > 0 ? life : 900);
    }
  },
  _clearFxTimer: function () {
    if (this._fxTimer) { clearTimeout(this._fxTimer); this._fxTimer = null; }
  },

  // 竞速（rush）表现：每题倒计时 / 超时判错（复用引擎失败入口） ============
  _rushStart: function (fromMs) {
    this._rushStop();
    var self = this;
    this._rushRemain = (fromMs && fromMs > 0) ? fromMs : (CONFIG.rushSeconds || 8) * 1000;
    this.setData({ rushShow: (this._rushRemain / 1000).toFixed(1), rushPct: 100, rushLow: false });
    this._rushTimer = setInterval(function () { self._rushTick(); }, 200);
  },
  // 切回前台时若竞速计时已停（后台 onHide 停表）且当前题待答 → 用剩余时间续走
  _rushResumeIfIdle: function () {
    if (this.data.mode !== 'rush') return;
    if (this._rushTimer) return;
    var st = engine.getState ? engine.getState() : null;
    if (!st || st.over || st.state !== 'idle') return;
    this._rushStart(this._rushRemain > 0 ? this._rushRemain : (CONFIG.rushSeconds || 8) * 1000);
  },
  _rushTick: function () {
    var st = engine.getState ? engine.getState() : null;
    if (!st || st.over) { this._rushStop(); return; }
    // 非待答（作答/转场中）不计时；对局结束/不存在则停表
    if (st.state !== 'idle') return;
    this._rushRemain -= 200;
    if (this._rushRemain <= 0) {
      this._rushStop();
      this._penLock();
      // 超时判错：与玩家选错同入口（engine.forceFailCurrent → _failQuestion），计分/扣命零改动
      engine.forceFailCurrent();
      return;
    }
    var sec = this._rushRemain / 1000;
    var pct = (this._rushRemain / ((CONFIG.rushSeconds || 8) * 1000)) * 100;
    this.setData({ rushShow: sec.toFixed(1), rushPct: Math.max(0, Math.min(100, pct)), rushLow: sec <= 2 });
  },
  _rushStop: function () {
    if (this._rushTimer) { clearInterval(this._rushTimer); this._rushTimer = null; }
  },
  // 竞速答错/超时后的惩罚锁：0.8s 内禁点选项（视觉置灰由 class penLock 承担）
  _penLock: function () {
    var self = this;
    if (this._penTimer) clearTimeout(this._penTimer);
    this.setData({ penLock: true });
    this._penTimer = setTimeout(function () {
      self.setData({ penLock: false });
      self._penTimer = null;
    }, (CONFIG.rushPenalty || 0.8) * 1000);
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
    // 连击（rush 徽标展示用；classic 下不影响）
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
  },

  /**
   * 选项按钮点击：转发给 engine.fire(opt)。
   * catchtap 阻止冒泡，避免与父容器事件冲突。
   * 关联 REQ-GAME-6/7（点选项触发答对/答错流程）
   */
  onOptionTap(e) {
    if (this.data.penLock) return; // 竞速惩罚锁：0.8s 内禁点
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
    this._rushStop();
    this._clearFxTimer();

    // 拼接结算页查询参数（type 分类随参数传递，结算页据此写分类存档；
    // B4：自定义关卡带 custom=1，结算页不写系统星级存档、不入字词进度）
    var query =
      'grade=' + this.data.grade +
      '&level=' + this.data.level +
      '&type=' + (this.data.type || '') +
      '&custom=' + (this._customLevel ? '1' : '0') +
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
    // M7 Boss 胜出：先短暂展示“击破”大闪层再跳结算（仅表现，不改变上报数据）
    if (result.win && this.data.mode === 'boss' && this.data.bossRemain <= 0) {
      this.setData({ modeFxText: '', bossDefeat: true });
      setTimeout(go, 750);
      return;
    }
    go();
  }
});
