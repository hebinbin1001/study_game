/**
 * progress.test.js —— 「继续挑战」目标关卡推导单测（一期改造）
 *
 * 覆盖 storage.findContinueLevel：首页卡片与关卡页的"继续"节点必须口径一致，
 * 否则会出现「首页说继续第 2 关、关卡页却把第 4 关点亮」这类自相矛盾。
 *
 * 规则来源（与 pages/level/level.js 的 refreshLevels 一致）：
 *   1. 前 DEFAULT_UNLOCKED_LEVELS 关默认解锁（游客同享）；
 *   2. 第 N 关需第 N-1 关 ≥1 星；
 *   3. 取第一个「已解锁但没拿到星」的关卡；
 *   4. 已解锁的都通关了 → 取最后一个已解锁关卡（可重玩刷星）。
 *
 * 运行：node miniprogram/utils/__tests__/progress.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('继续挑战目标推导');

const storage = require('../storage');
const constants = require('../constants');

/** 用不同的学段 key 隔离用例，避免内存兜底存储互相污染 */
function seed(grade, map, typeKey) {
  Object.keys(map).forEach(function (lv) {
    storage.saveStars(grade, parseInt(lv, 10), map[lv], typeKey);
  });
}

s.test('关卡规模常量：与关卡页口径一致且可用', () => {
  s.assert.ok(constants.LEVELS_PER_GRADE >= 1, '每学段关卡数应 ≥1');
  s.assert.equal(constants.DEFAULT_UNLOCKED_LEVELS, 3, '默认解锁应为前 3 关');
  s.assert.ok(constants.DEFAULT_UNLOCKED_LEVELS <= constants.LEVELS_PER_GRADE);
});

s.test('全新存档：目标是第 1 关', () => {
  const r = storage.findContinueLevel('t_new');
  s.assert.equal(r.level, 1);
  s.assert.equal(r.stars, 0);
  s.assert.equal(r.allPassed, false);
});

s.test('第 1 关已拿 2 星：目标是第 2 关', () => {
  seed('t_a', { 1: 2 });
  const r = storage.findContinueLevel('t_a');
  s.assert.equal(r.level, 2);
  s.assert.equal(r.stars, 0);
  s.assert.equal(r.allPassed, false);
});

s.test('第 1 关 0 星（默认解锁）：目标仍是第 1 关，不跳过', () => {
  seed('t_b', { 2: 3 });   // 异常数据：第 2 关有星但第 1 关没有
  const r = storage.findContinueLevel('t_b');
  s.assert.equal(r.level, 1, '第 1 关没星就是继续目标');
  s.assert.equal(r.stars, 0);
});

s.test('前 3 关都通关（默认解锁区）：目标推进到第 4 关', () => {
  seed('t_c', { 1: 3, 2: 1, 3: 2 });
  const r = storage.findContinueLevel('t_c');
  s.assert.equal(r.level, 4);
  s.assert.equal(r.allPassed, false);
});

s.test('第 4 关未解锁时不会被选为目标（需上一关 ≥1 星）', () => {
  seed('t_d', { 1: 3, 2: 3 });   // 第 3 关 0 星 → 第 4 关锁着
  const r = storage.findContinueLevel('t_d');
  s.assert.equal(r.level, 3, '应停在第一个未通关的已解锁关卡');
});

s.test('全部通关：allPassed 为真，目标回落到最后一关（可刷星）', () => {
  const all = {};
  for (let i = 1; i <= constants.LEVELS_PER_GRADE; i++) all[i] = 2;
  seed('t_e', all);
  const r = storage.findContinueLevel('t_e');
  s.assert.equal(r.allPassed, true);
  s.assert.equal(r.level, constants.LEVELS_PER_GRADE);
  s.assert.equal(r.stars, 2, '回落到该关历史星数');
});

s.test('分类关卡独立存档：综合进度不影响分类目标', () => {
  seed('t_f', { 1: 3, 2: 3 });        // 综合已通 2 关
  seed('t_f', { 1: 0 }, 'idiom');     // 成语分类无星
  s.assert.equal(storage.findContinueLevel('t_f').level, 3, '综合目标应为第 3 关');
  s.assert.equal(storage.findContinueLevel('t_f', 'idiom').level, 1, '成语分类应从第 1 关开始');
});

s.test('星级按历史最大值：低星不覆盖高星（继续目标随之推进）', () => {
  seed('t_g', { 1: 3 });
  storage.saveStars('t_g', 1, 1);     // 再拿 1 星不应降级
  s.assert.equal(storage.getStars('t_g', 1), 3);
  s.assert.equal(storage.findContinueLevel('t_g').level, 2);
});

s.done();
