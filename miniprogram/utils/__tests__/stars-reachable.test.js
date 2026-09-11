/**
 * stars-reachable.test.js —— 星级可达性回归（R1）
 *
 * 背景（真实缺陷）：
 *   旧参数 initLives=3 + 星级阈值 90/70/40 下，通关最多只能错 2 题
 *   （错第 3 题命就耗尽、直接判负），因此通关时的正确率恒 ≥ 80% ——
 *   结算只可能出 3 星或 2 星，**1 星档（40%~69%）在数学上永远拿不到**；
 *   连带「上一关 ≥1 星解锁下一关」也等价于「通关过」，形同虚设。
 *
 * 本文件把「结局规则」独立复算一遍，作为该缺陷的回归护栏：
 *   - 不变量断言：三档星级必须全部可达、通关至少 1 星、判负不计星、
 *     最低阈值不得高于「通关可达的最低正确率」；
 *   - 参数表断言：把当前采用的参数钉死，改数值却不改预期会立即报错；
 *   - 一致性断言：前端与服务端的阈值必须完全相同（否则结算展示与云端统计会打架）。
 *
 * 结局规则来源（与产品实现一致）：
 *   - game/engine.js _update：答错逼近动画结束 → G.lives--，lives<=0 立即 _endLevel(false)
 *   - game/engine.js _nextQuestion：答满 totalQ 题 → _endLevel(true)
 *   - pages/result/result.js：失败态（win=false）不计星、不写星级档
 *
 * 运行：node miniprogram/utils/__tests__/stars-reachable.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('星级可达性（R1 回归）');

const c = require('../constants');

const TOTAL_Q = c.GAME_CONFIG.totalQ;
const LIVES = c.GAME_CONFIG.initLives;

/**
 * 按产品规则推导「本局答错 wrong 题」的结局。
 * @returns {{win:boolean, stars:number|null, rate:number|null}} 判负时 stars/rate 为 null
 */
function outcome(wrong) {
  if (wrong >= LIVES) {
    // 第 LIVES 次答错时命耗尽 → 判负，不计星、不写档
    return { win: false, stars: null, rate: null };
  }
  const correct = TOTAL_Q - wrong;
  const rate = Math.round((correct / TOTAL_Q) * 100);
  return { win: true, stars: c.starsByRate(rate), rate: rate };
}

/** 通关（win=true）时所有可能出现的星级，升序去重 */
function reachableWinStars() {
  const set = [];
  for (let w = 0; w <= TOTAL_Q; w++) {
    const o = outcome(w);
    if (o.win && set.indexOf(o.stars) === -1) set.push(o.stars);
  }
  return set.sort(function (a, b) { return a - b; });
}

/** 通关可达的最高/最低正确率 */
function winRate(value) {
  return Math.round(((TOTAL_Q - value) / TOTAL_Q) * 100);
}

s.test('不变量：通关可达星级必须覆盖 1/2/3 三档', () => {
  s.assert.deepEqual(reachableWinStars(), [1, 2, 3],
    '通关可达星级 = ' + JSON.stringify(reachableWinStars()) + '，三档必须全部可达');
});

s.test('不变量：1 星可达（旧缺陷回归点）', () => {
  const stars = reachableWinStars();
  s.assert.ok(stars.indexOf(1) !== -1, '1 星不可达 —— 星级档位又出现死区');
  // 找出能拿到 1 星的错题数，作为可读证据
  let evidence = null;
  for (let w = 0; w < LIVES; w++) {
    if (outcome(w).stars === 1) { evidence = '错 ' + w + ' 题 → ' + outcome(w).rate + '% → 1 星'; break; }
  }
  s.assert.ok(evidence !== null, '未找到任何可得 1 星的错题数');
});

s.test('不变量：通关至少 1 星（保证「上一关 ≥1 星解锁下一关」有效）', () => {
  for (let w = 0; w < LIVES; w++) {
    const o = outcome(w);
    s.assert.ok(o.stars >= 1,
      '错 ' + w + ' 题通关却只得 ' + o.stars + ' 星 → 解锁条件会失效');
  }
});

s.test('不变量：命耗尽（判负）不计星', () => {
  const over = outcome(LIVES);
  s.assert.equal(over.win, false, '答错 ' + LIVES + ' 题应判负');
  s.assert.equal(over.stars, null, '判负不应产生星级');
  s.assert.equal(over.rate, null);
});

s.test('不变量：最低阈值不高于「通关可达的最低正确率」', () => {
  const thresholds = c.STAR_THRESHOLDS;
  const lowestThreshold = thresholds[thresholds.length - 1].minRate;
  const lowestWinRate = winRate(LIVES - 1);
  s.assert.ok(lowestThreshold <= lowestWinRate,
    '最低阈值 ' + lowestThreshold + '% 高于通关可达的最低正确率 ' + lowestWinRate
    + '% → 该档位永远拿不到');
});

s.test('参数表：当前参数（5 命 + 90/70/60）逐档映射', () => {
  const table = [
    { wrong: 0, rate: 100, stars: 3 },
    { wrong: 1, rate: 90, stars: 3 },
    { wrong: 2, rate: 80, stars: 2 },
    { wrong: 3, rate: 70, stars: 2 },
    { wrong: 4, rate: 60, stars: 1 }
  ];
  table.forEach(function (row) {
    const o = outcome(row.wrong);
    s.assert.equal(o.win, true, '错 ' + row.wrong + ' 题应能通关');
    s.assert.equal(o.rate, row.rate, '错 ' + row.wrong + ' 题正确率应为 ' + row.rate + '%');
    s.assert.equal(o.stars, row.stars, '错 ' + row.wrong + ' 题应得 ' + row.stars + ' 星');
  });
  s.assert.equal(outcome(LIVES).win, false, '错 ' + LIVES + ' 题应判负');
});

s.test('一致性：前端与服务端星级阈值完全相同', () => {
  // 服务端阈值用于落库与排行榜统计，必须与前端展示口径一致
  const server = require('../../../server/constants');
  s.assert.deepEqual(server.STAR_THRESHOLDS, c.STAR_THRESHOLDS,
    '前端与 server/constants.js 的 STAR_THRESHOLDS 必须一致');
  // 计分口径交叉校验：前端每题得分（game/config.js）必须等于服务端推导用的每题得分，
  // 否则服务端「按答对数推导分数」的防伪结果会与前端展示的得分对不上。
  const gameConfig = require('../../game/config');
  s.assert.equal(server.SCORE_PER_QUESTION, gameConfig.CONFIG.scorePerCorrect,
    '前端每题得分应与服务端 SCORE_PER_QUESTION 一致');
  s.assert.equal(c.GAME_CONFIG.totalQ * server.SCORE_PER_QUESTION, 100,
    '每关满分应为 100（10 题 × 10 分）');
  // 同一正确率下两端算出的星级必须相同
  [0, 39.9, 40, 59.9, 60, 79.9, 80, 89.9, 90, 100].forEach(function (rate) {
    s.assert.equal(server.starsByRate(rate), c.starsByRate(rate),
      '正确率 ' + rate + '% 时两端星级应一致');
  });
});

s.done();
