/**
 * game/engine.js —— 词力战士游戏主循环引擎
 *
 * 职责：
 *   1. start(canvasNode, ctx, options) 启动主循环（挂在 canvasNode.requestAnimationFrame）；
 *   2. update(dt) 推进状态机与物理，render(ctx) 绘制；
 *   3. fire(opt) 处理玩家点选项，驱动 IDLE→FLYING→DYING / IDLE→APPROACHING 流转；
 *   4. 计分、连击、粒子、弹字、✓ 反馈编排；
 *   5. 通过回调通知页面层更新 HUD/选项/提示/连击/结算。
 *
 * 平移来源：prototype/index.html
 *   - loop() 第 727-735 行
 *   - update() 第 737-775 行
 *   - fire() 第 570-585 行
 *   - onBulletHit() 第 597-621 行
 *   - failQuestion() 第 656-682 行
 *   - nextQuestion() 第 649-653 行
 *   - endLevel() 第 713-724 行
 *   - burst/popup/spawnStars/showCombo 第 624-693 行
 *
 * 适配说明：
 *   - 原型用 window.requestAnimationFrame + setTimeout 推进状态；
 *   - 本模块改用 canvasNode.requestAnimationFrame + update(dt) 内状态计时器推进，
 *     避免 setTimeout 在页面卸载时的 timer 泄漏，且暂停（stop）后无残留回调。
 *
 * 关联需求：
 *   - REQ-NFR-1（60fps 主循环，dt 钳制）
 *   - REQ-GAME-6（答对：+100/combo+1/✓/爆炸/冒星星/DYING≈0.7s）
 *   - REQ-GAME-7（答错：逼近/抖动/红闪/扣命/combo归零/APPROACHING≈0.6s）
 *   - REQ-GAME-8（怪兽下沉至 dangerY 判负视同答错）
 *   - REQ-GAME-9（连击 2/3/5 触发提示）
 */

const { CONFIG, W, H, MON_W, MON_START_Y, DANGER_Y, CANNON_Y, MONSTER_COLORS } = require('./config');
const {
  IDLE, FLYING, APPROACHING, DYING, FAILED,
  createInitialState, resetGame
} = require('./state');
const {
  genQuestion, sourceWord, displayWord, displayAnswer, wordLevelFeedback,
  meaningText, wordLevelGuide, isWordLevel, titleCaseWord
} = require('./question');
const { render, blankCenter, clamp } = require('./renderer');
const { speakByItem, playCorrect, playWrong, playCombo, playWin } = require('./audio');
const { starsByRate } = require('../utils/constants');
const { getWarriorSkin, getMonsterSkin } = require('../utils/skins');

// ============ 工具 ============
const rand = (n) => Math.floor(Math.random() * n);

// ============ 引擎单例 ============
const engine = {
  // ---- 注入资源 ----
  _canvasNode: null,
  _ctx: null,
  _rafId: null,
  _last: 0,
  _now: 0,

  // ---- 全局状态 ----
  G: null,

  // ---- 回调（由页面层注入） ----
  _callbacks: {},

  /**
   * 启动游戏主循环。
   *
   * @param {Object} canvasNode Canvas 节点（小程序 2D 新接口，提供 requestAnimationFrame）
   * @param {CanvasRenderingContext2D} ctx Canvas 2D 上下文
   * @param {Object} [options] 回调集合
   *   - getNextItem() → item：获取下一个词条（由页面层注入词库抽题逻辑）
   *   - getBank() → Array：获取当前学段全量词条（词级题型干扰整词候选，可选）
   *   - onHudChange(data)：HUD 更新 { score, lives, answered, totalQ }
   *   - onOptionsChange(options)：选项列表更新
   *   - onCombo(combo)：连击提示（连击 2/3/5 时触发）
   *   - onTip(text)：提示文字更新
   *   - onGameOver(result)：游戏结束 { win, score, correctCount, totalQ, rate, stars }
   */
  start(canvasNode, ctx, options) {
    this._canvasNode = canvasNode;
    this._ctx = ctx;
    this._callbacks = options || {};
    this.G = createInitialState();
    this._last = 0;
    this._now = 0;

    // 解析皮肤（options.skins = { warrior: avatarId, monster: avatarId }）：
    // 未选择 / 未知 id 回退默认皮肤，保证离线与异常场景可渲染。
    const skins = (options && options.skins) || {};
    this.G.warriorSkin = getWarriorSkin(skins.warrior);
    this.G.monsterSkin = getMonsterSkin(skins.monster);

    // 出第一题并启动主循环
    this._newQuestion();
    this._loop(canvasNode);
  },

  /**
   * 停止主循环（页面 onHide/onUnload 时调用，避免后台空跑耗电）。
   */
  stop() {
    if (this._canvasNode && this._rafId != null) {
      try {
        this._canvasNode.cancelAnimationFrame(this._rafId);
      } catch (e) {
        // 部分实现无 cancelAnimationFrame，忽略
      }
    }
    this._rafId = null;
  },

  /**
   * 恢复主循环（页面 onShow / 从后台切回时调用，与 stop() 配对）。
   *
   * 幂等：仅当引擎已 start、当前无挂起 rAF 帧且本局未结束时才重新注册；
   * 若主循环仍在跑（_rafId 非空）则直接忽略，避免重复注册造成多循环叠加。
   *
   * 防大帧跳变：恢复时把 _last 归零，使首帧 dt≈0，避免把切后台前的旧时间戳
   * 计入 dt 导致怪兽/炮弹瞬移（配合 _loop 内 dt 钳制 min(0.05, …) 双保险）。
   */
  resume() {
    if (!this._canvasNode) return;      // 从未 start（如 onShow 早于 onReady）
    if (this._rafId != null) return;    // 主循环仍在跑，幂等返回
    if (this.G && this.G.over) return;  // 本局已结束（已跳结算页），不恢复
    this._last = 0;
    this._loop(this._canvasNode);
  },

  /**
   * 复位一局状态（供"再玩一次"调用，需重新 start 或手动 _newQuestion）。
   */
  reset() {
    if (this.G) {
      resetGame(this.G);
    } else {
      this.G = createInitialState();
    }
  },

  /**
   * 获取当前状态（只读引用，页面层用于渲染 HUD 等）。
   */
  getState() {
    return this.G;
  },

  // ============ 玩家操作 ============

  /**
   * 玩家点击选项（平移原型 fire，第 570-585 行）。
   *
   * @param {Object} opt 选项对象 { letter, correct, used, colorClass }
   *        —— 来自页面 data 的深拷贝副本，used 仅作第一道拦截；
   *           引擎内部以 G.options 为权威状态，置灰在引擎侧同步。
   */
  fire(opt) {
    const G = this.G;
    if (!G || G.state !== IDLE || opt.used) return;

    const correct = opt.letter === G.question.correct;
    if (!correct) {
      // 选错：同步到引擎权威选项 G.options 并整表重建，保证页面置灰与引擎一致。
      // 仅修改传入副本会因 _emitOptions 深拷贝覆盖而失效（缺陷修复）。
      const gi = this._findOptionIndex(opt.letter);
      if (gi >= 0) G.options[gi].used = true;
      this._emitOptions();
      this._failQuestion();
      return;
    }
    // 选对：发射炮弹
    G.state = FLYING;
    this._lockOptions(true);
    const blank = blankCenter(G, this._ctx);
    G.bullet = {
      x: W / 2, y: CANNON_Y,
      tx: blank.x, ty: blank.y - 8,
      speed: CONFIG.bulletSpeed,
      correct: true,
      letter: opt.letter
    };
  },

  /**
   * 在引擎权威选项 G.options 中定位某 letter 对应的下标。
   * @param {string} letter 被点选项字母/字符
   * @returns {number} 下标，未找到返回 -1
   */
  _findOptionIndex(letter) {
    const G = this.G;
    if (!G || !G.options) return -1;
    for (let i = 0; i < G.options.length; i++) {
      if (G.options[i].letter === letter) return i;
    }
    return -1;
  },

  // ============ 主循环 ============

  _loop(canvasNode) {
    const self = this;
    const tick = (now) => {
      if (!self._canvasNode) return; // 已 stop
      // dt 钳制 min(0.05, (now-last)/1000)，与原型 loop() 一致（REQ-NFR-1）
      const last = self._last || now;
      const dt = Math.min(0.05, (now - last) / 1000);
      self._last = now;
      self._now = now;

      const G = self.G;
      if (G && !G.over) {
        self._update(dt);
        render(self._ctx, G, now);
      }
      self._rafId = canvasNode.requestAnimationFrame(tick);
    };
    self._rafId = canvasNode.requestAnimationFrame(tick);
  },

  // ============ update（平移原型 737-775 行） ============
  _update(dt) {
    const G = this.G;

    // ---- 怪兽逼近动画（答错时，approachTime 秒向下逼近一段） ----
    if (G.state === APPROACHING && G.monster) {
      G.monster.approachT = Math.min(1, G.monster.approachT + dt / CONFIG.approachTime);
      G.monster.y = G.monster.approachStart +
        (G.monster.approachTarget - G.monster.approachStart) * G.monster.approachT;
      // 逼近动画完成：扣命、combo 归零、进下一题或结算
      if (G.monster.approachT >= 1) {
        G.lives--;
        G.combo = 0;
        this._emitHud();
        if (G.lives <= 0) {
          this._endLevel(false);
          return;
        }
        this._nextQuestion();
        return;
      }
    }

    // ---- 怪兽自然下沉（IDLE 时，下沉到 dangerY 判负视同答错，REQ-GAME-8） ----
    if (G.state === IDLE && G.monster) {
      G.monster.y += CONFIG.sinkSpeed * dt;
      if (G.monster.y >= DANGER_Y) {
        G.monster.y = DANGER_Y;
        this._failQuestion();
      }
    }

    // ---- 怪兽抖动衰减 ----
    if (G.monster) {
      G.monster.shake = Math.max(0, G.monster.shake - dt * 30);
    }

    // ---- 炮弹飞行（FLYING 时，命中后 onBulletHit） ----
    if (G.bullet) {
      const b = G.bullet;
      const dx = b.tx - b.x, dy = b.ty - b.y;
      const dist = Math.hypot(dx, dy);
      const step = b.speed * dt;
      if (dist <= step) {
        G.bullet = null;
        this._onBulletHit();
      } else {
        b.x += dx / dist * step;
        b.y += dy / dist * step;
      }
    }

    // ---- DYING 计时（答对后怪兽死亡动画 ≈0.7s，然后下一题） ----
    if (G.state === DYING) {
      G.dyingT = (G.dyingT || 0) + dt;
      if (G.dyingT >= CONFIG.dyingTime) {
        this._nextQuestion();
        return;
      }
    }

    // ---- 粒子更新 ----
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // 星星粒子重力小一点（向上飘散感）
      p.vy += (p.star ? 30 : 120) * dt;
      if (p.life <= 0) G.particles.splice(i, 1);
    }

    // ---- 弹字更新 ----
    for (let i = G.popups.length - 1; i >= 0; i--) {
      const p = G.popups[i];
      p.life -= dt;
      p.y -= 40 * dt;
      if (p.life <= 0) G.popups.splice(i, 1);
    }

    // ---- ✓ 反馈计时 ----
    if (G.checkmark) {
      G.checkmark.t += dt;
      if (G.checkmark.t >= G.checkmark.life) G.checkmark = null;
    }
  },

  // ============ 炮弹命中（平移原型 onBulletHit，第 597-621 行） ============
  _onBulletHit() {
    const G = this.G;
    const blank = blankCenter(G, this._ctx);
    G.question.filled = true;
    G.question.filledColor = '#7bd389';
    G.correctCount++;
    G.score += CONFIG.scorePerCorrect;
    G.combo++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    this._emitHud();
    speakByItem(G.question.item, G.question.w);
    playCorrect(); // M6-H 答对音效

    // 爆炸粒子（绿色）
    this._burst(blank.x, blank.y, '#7bd389', CONFIG.burstCorrectN);
    // +100 弹字
    this._popup(blank.x, blank.y - 10, '+' + CONFIG.scorePerCorrect, '#4cae4c');
    // 大号 ✓ 反馈（绿色，放大淡出）
    G.checkmark = { x: blank.x, y: blank.y, t: 0, life: CONFIG.checkmarkLife };
    // 怪兽头顶冒星星（黄色 ★，向上飘散，REQ-GAME-6）
    this._spawnStars(blank.x, blank.y - 30);

    // 连击提示（连对 2/3/5 题时弹出，REQ-GAME-9）
    if (G.combo >= 2) {
      this._showCombo(G.combo);
      playCombo(); // M6-H 连击音效
    }

    G.state = DYING;
    G.dyingT = 0;
    // 回执文案：词级题展示整词/完整成果，避免把 q 模板（含 __）当展示词
    this._emitTip(this._answerFeedback() + ' ！太棒了！');
  },

  // ============ 答错（平移原型 failQuestion，第 656-682 行） ============
  _failQuestion() {
    const G = this.G;
    if (G.state === FAILED || G.state === APPROACHING) return;
    G.state = APPROACHING;
    this._lockOptions(true);

    const blank = blankCenter(G, this._ctx);
    G.question.filled = true;
    G.question.filledColor = '#ff5d8f';
    G.monster.anger = 1;
    G.monster.shake = 14;
    // 逼近动画参数（update 中推进，到 1 时扣命）
    G.monster.approachStart = G.monster.y;
    G.monster.approachTarget = G.monster.y + CONFIG.approach;
    G.monster.approachT = 0;

    this._burst(blank.x, blank.y, '#ff5d8f', CONFIG.burstWrongN);
    speakByItem(G.question.item, G.question.w);
    playWrong(); // M6-H 答错音效
    this._emitTip('怪兽逼近！正确答案是 ' + this._answerFeedback());
    this._popup(W / 2, H - 220, '-1 命', '#ff5d8f');
  },

  /**
   * 作答回执中的「正确答案」文案。
   * 词级题（H2-B）：使用 wordLevelFeedback（整词成果，如 zc 完整组词）；
   * 字符级题：沿用 displayWord = meaningText（H1 已防 zh→hint 剧透）。
   * @returns {string}
   */
  _answerFeedback() {
    const G = this.G;
    const item = G.question.item;
    if (isWordLevel(item)) {
      return wordLevelFeedback(item);
    }
    return displayWord(item) + ' = ' + meaningText(item);
  },

  // ============ 下一题（平移原型 nextQuestion，第 649-653 行） ============
  _nextQuestion() {
    const G = this.G;
    G.answered++;
    if (G.answered >= CONFIG.totalQ) {
      this._endLevel(true);
      return;
    }
    this._newQuestion();
  },

  // ============ 出新题（平移原型 newQuestion，第 445-480 行） ============
  _newQuestion() {
    const G = this.G;
    // 通过回调获取下一个词条（词库装载由页面层/dict.js 负责）
    const item = this._callbacks.getNextItem ? this._callbacks.getNextItem() : null;
    if (!item) {
      // 无词条可用：直接结算
      this._endLevel(true);
      return;
    }

    // 词级整词干扰候选：同段词库（fill/trans/xhy 用同类型 a；zc 用词库 d/补字）
    const bank = this._callbacks.getBank ? this._callbacks.getBank() : null;

    // 题面完整词：sourceWord 对含 '*' 的 w2/c2 返回完整答案 a，
    // 使渲染层展示的题面、blankIdx/correct 与作答判定三者一致（P0 缺陷 2）。
    const w = sourceWord(item);
    const qn = genQuestion(item, bank);
    const blankIdx = qn.blankIdx;
    const correct = qn.correct;
    const options = qn.options;
    const wl = !!qn.wordLevel;

    G.question = {
      item,
      w,
      blankIdx,
      correct,
      letters: options,
      filled: false,
      // 词级渲染/回执元数据（H2-B）：renderer 据此走词级分支
      wordLevel: wl,
      head: qn.head || '',
      tail: qn.tail || '',
      hasSlot: !!qn.hasSlot,
      answer: qn.answer || correct,
      // 防剧透提示（renderer 提示行 / 页面初始 tip）：hint 安全时展示 hint，
      // hint 缺失/剧透（null）时展示题型引导语
      hintText: qn.hintSafe || qn.guide
    };
    G.options = options.map((l, i) => ({
      letter: l,
      correct: (l === correct),
      used: false,
      colorClass: 'c' + (i % 5),
      // 词级整词按钮文本：trans/fill 等英文词大写展示更清晰；中文原样
      display: wl ? this._optionDisplay(item, l) : l,
      // 词级整词按钮采用宽版样式（允许自动宽度/换行）；字符级保持方形
      wide: wl
    }));
    G.monster = {
      x: (W - MON_W) / 2,
      y: MON_START_Y,
      // 怪兽皮肤：优先取当前 boss 皮肤主色；无皮肤时回退 6 色随机循环（保视觉变化）
      color: (G.monsterSkin && G.monsterSkin.color) || MONSTER_COLORS[rand(MONSTER_COLORS.length)],
      emoji: (G.monsterSkin && G.monsterSkin.emoji) || '',
      blinkSeed: Math.random() * 6.28,
      shake: 0
    };
    G.state = IDLE;

    // 通知页面层更新选项与 HUD
    this._emitOptions();
    this._emitHud();
    this._emitTip(wl ? (G.question.hintText || wordLevelGuide(item)) :
      '一次机会！点错字母怪兽就赢，小心选！');
  },

  // 词级选项按钮展示文本：trans 整词首字母大写；fill 保持原始（句子语境）；中文原样
  _optionDisplay(item, letter) {
    if (item.type === 'trans') return titleCaseWord(letter);
    return String(letter);
  },

  // ============ 结算（平移原型 endLevel，第 713-724 行） ============
  _endLevel(win) {
    const G = this.G;
    const rate = Math.round(G.correctCount / CONFIG.totalQ * 100);
    const stars = starsByRate(rate); // 用 constants.js 星级阈值 90/70/40
    G.over = true;
    if (win) playWin(); // M6-H 通关音效

    // 通知页面层结算
    if (this._callbacks.onGameOver) {
      this._callbacks.onGameOver({
        win,
        score: G.score,
        correctCount: G.correctCount,
        totalQ: CONFIG.totalQ,
        rate,
        stars,
        maxCombo: G.maxCombo
      });
    }
  },

  // ============ 粒子 / 弹字 / 冒星星 ============

  // 爆炸粒子（平移原型 burst，第 685-689 行）
  _burst(x, y, color, n) {
    const G = this.G;
    for (let i = 0; i < n; i++) {
      if (G.particles.length >= CONFIG.maxParticles) break; // 上限保护（REQ-NFR-1）
      const a = Math.random() * Math.PI * 2;
      const sp = rand(240 - 60 + 1) + 60; // randInt(60, 240)
      G.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.3,
        max: 0.8,
        color,
        size: 2 + Math.random() * 4
      });
    }
  },

  // 弹字（平移原型 popup，第 691-693 行）
  _popup(x, y, text, color) {
    this.G.popups.push({ x, y, text, color, life: CONFIG.popupLife, max: CONFIG.popupLife });
  },

  // 冒星星粒子（平移原型 spawnStars，第 624-639 行）
  _spawnStars(x, y) {
    const G = this.G;
    const n = CONFIG.starParticleMin + rand(CONFIG.starParticleMax - CONFIG.starParticleMin + 1);
    for (let i = 0; i < n; i++) {
      if (G.particles.length >= CONFIG.maxParticles) break; // 上限保护
      G.particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y,
        vx: (Math.random() - 0.5) * 60,
        vy: -80 - Math.random() * 60, // 向上飘
        life: 0.8 + Math.random() * 0.4,
        max: 1.2,
        color: '#ffd700',
        size: 8 + Math.random() * 4,
        star: true
      });
    }
  },

  // 连击提示（平移原型 showCombo，第 642-647 行）
  _showCombo(combo) {
    let text = combo + ' 连击!';
    if (combo >= 5) text = combo + ' 连击!🎉';
    else if (combo >= 3) text = combo + ' 连击!🔥';
    this._popup(W / 2, H / 2 - 40, text, '#ffb703');
    // 通过回调通知页面层显示连击提示（REQ-GAME-9）
    if (this._callbacks.onCombo) this._callbacks.onCombo(combo);
  },

  // ============ 选项锁定 ============
  _lockOptions(lock) {
    // 锁定时不改变 used 标记，仅由页面层根据 state 判断是否禁用点击
    // 此处保留接口供未来扩展（如逐个置灰）
    void lock;
  },

  // ============ 回调通知 ============
  _emitHud() {
    if (this._callbacks.onHudChange) {
      this._callbacks.onHudChange({
        score: this.G.score,
        lives: this.G.lives,
        answered: this.G.answered,
        totalQ: CONFIG.totalQ,
        combo: this.G.combo
      });
    }
  },
  _emitOptions() {
    if (this._callbacks.onOptionsChange) {
      // 深拷贝选项数组，避免页面层持有引擎内部引用
      this._callbacks.onOptionsChange(this.G.options.map((o) => ({
        letter: o.letter,
        correct: o.correct,
        used: o.used,
        colorClass: o.colorClass,
        // 按钮展示文本与宽版标记（词级整词，H2-B）
        display: o.display,
        wide: o.wide
      })));
    }
  },
  _emitTip(text) {
    if (this._callbacks.onTip) this._callbacks.onTip(text);
  }
};

module.exports = engine;