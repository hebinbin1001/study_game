/**
 * engine.test.js —— game/engine.js 主循环 maxCombo（历史最高连击）追踪单测
 *
 * 覆盖：
 *   1. 连对 3 题 → maxCombo 累积到 3；
 *   2. 答错 1 题 → combo 归 0 但 maxCombo 保持 3；
 *   3. 再连对 2 题 → maxCombo 仍 3（历史最高不变）；
 *   4. 全程 maxCombo ≤ correctCount；
 *   5. _endLevel 回调 result 含 maxCombo 且值正确。
 *
 * 驱动方式：mock canvas/ctx，手动推进 requestAnimationFrame 时间戳驱动主循环。
 * 每次 tick 递增 50ms，dt 被引擎钳制为 0.05s。
 *
 * 运行：node tests/unit/engine.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/engine.js');

const engine = require('../../miniprogram/game/engine');
// 命数从配置读取，避免用例把「答错后剩 2 命」写死（R1：命数 3 → 5）
const CONFIG = require('../../miniprogram/game/config').CONFIG;

// ---- mock canvas 2D context：Proxy 兜底，measureText 返回 {width: 长度×10} ----
function makeCtx() {
  const store = {};
  const noop = () => {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'measureText') {
        return (str) => ({ width: String(str).length * 10 });
      }
      if (!(prop in target)) {
        target[prop] = noop;
      }
      return target[prop];
    },
    set(target, prop, val) {
      target[prop] = val;
      return true;
    }
  });
}

// ---- mock canvasNode：requestAnimationFrame 收集 tick 回调，供手动 step 推进 ----
function makeCanvasNode() {
  return {
    _cb: null,
    requestAnimationFrame(fn) { this._cb = fn; return 1; },
    cancelAnimationFrame() { this._cb = null; }
  };
}

// ---- 启动引擎并注入固定 w1 词条，返回驱动句柄 ----
function startEngine() {
  let now = 0;
  const canvasNode = makeCanvasNode();
  const ctx = makeCtx();
  const item = { type: 'w1', q: 'cat', a: 'cat', hint: '猫' };
  let gameOverResult = null;

  engine.start(canvasNode, ctx, {
    getNextItem: function () { return item; },
    getBank: function () { return [item]; },
    onHudChange: function () {},
    onOptionsChange: function () {},
    onCombo: function () {},
    onTip: function () {},
    onGameOver: function (result) { gameOverResult = result; }
  });

  return {
    engine: engine,
    tickOnce: function () {
      now += 50;
      const cb = canvasNode._cb;
      if (cb) cb(now);
    },
    getResult: function () { return gameOverResult; }
  };
}

// 答对一题：fire 正确选项并驱动主循环直到进入下一题（answered 递增）或结算。
function answerCorrect(env) {
  const G = env.engine.G;
  const target = G.answered + 1;
  const opt = G.options.find((o) => o.correct);
  env.engine.fire(opt);
  let guard = 0;
  while (!G.over && G.answered < target && guard < 500) {
    env.tickOnce();
    guard++;
  }
  return guard < 500;
}

// 答错一题：fire 错误选项并驱动主循环直到进入下一题或结算。
function answerWrong(env) {
  const G = env.engine.G;
  const target = G.answered + 1;
  const opt = G.options.find((o) => !o.correct);
  env.engine.fire(opt);
  let guard = 0;
  while (!G.over && G.answered < target && guard < 500) {
    env.tickOnce();
    guard++;
  }
  return guard < 500;
}

s.test('maxCombo：连对 3 题累积到 3，答错 1 题 combo 归 0 但 maxCombo 保持 3', () => {
  const env = startEngine();
  const G = env.engine.G;

  s.assert.ok(answerCorrect(env), '第 1 题答对应在帧数限制内完成');
  s.assert.ok(answerCorrect(env), '第 2 题答对应在帧数限制内完成');
  s.assert.ok(answerCorrect(env), '第 3 题答对应在帧数限制内完成');

  s.assert.equal(G.combo, 3, '连对 3 题后 combo 应为 3');
  s.assert.equal(G.maxCombo, 3, '连对 3 题后 maxCombo 应为 3');
  s.assert.equal(G.correctCount, 3);

  s.assert.ok(answerWrong(env), '答错应在帧数限制内完成');
  s.assert.equal(G.combo, 0, '答错后 combo 应归 0');
  s.assert.equal(G.maxCombo, 3, '答错后 maxCombo 应保持历史最高 3');
  s.assert.equal(G.lives, CONFIG.initLives - 1, '答错后命数应减 1');

  s.assert.ok(answerCorrect(env), '第 4 题答对应在帧数限制内完成');
  s.assert.ok(answerCorrect(env), '第 5 题答对应在帧数限制内完成');
  s.assert.equal(G.combo, 2, '再连对 2 题后 combo 应为 2');
  s.assert.equal(G.maxCombo, 3, 'maxCombo 应保持历史最高 3（不因新连击下降）');
  s.assert.equal(G.correctCount, 5);

  s.assert.ok(G.maxCombo <= G.correctCount, 'maxCombo 应不超过 correctCount');
});

s.test('_endLevel：主循环走完全局，result 含 maxCombo 且为历史最高', () => {
  const env = startEngine();
  const G = env.engine.G;

  // 3 对 + 1 错 + 2 对 + 1 错 + 3 对 = 10 题，走完结算
  // 答错 2 次：命数逐次 -1（远未耗尽，不失败），combo 中途两次断到 0，历史最高稳定在 3
  for (let i = 0; i < 3; i++) s.assert.ok(answerCorrect(env), '答对 ' + (i + 1) + ' 题超时');
  s.assert.ok(answerWrong(env), '第 1 次答错超时');
  for (let i = 0; i < 2; i++) s.assert.ok(answerCorrect(env), '连对 2 题超时');
  s.assert.ok(answerWrong(env), '第 2 次答错超时');
  for (let i = 0; i < 3; i++) s.assert.ok(answerCorrect(env), '最后连对 3 题超时');

  s.assert.equal(G.over, true, '10 题后应触发结算');
  const result = env.getResult();
  s.assert.ok(result, 'onGameOver 应被调用');
  s.assert.equal(result.win, true, '答完 10 题应为通关');
  s.assert.equal(result.correctCount, 8);
  s.assert.equal(result.totalQ, 10);
  s.assert.equal(result.maxCombo, 3, 'result.maxCombo 应为历史最高 3');
  s.assert.equal(typeof result.score, 'number');
  s.assert.equal(typeof result.rate, 'number');
  s.assert.equal(typeof result.stars, 'number');
});

s.done();
