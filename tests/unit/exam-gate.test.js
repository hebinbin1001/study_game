/**
 * exam-gate.test.js —— 段位晋级考试的星数封顶
 *
 * 规则（用户 2026-10-08 拍板）：每个大段升下一段前要考一次（当前学段题库随机 10 题全对），
 * 没过就**星星不再往上加**，卡在当前大段最高级，可立刻重考。
 *
 * 这个函数是「卡住」这件事的**唯一实现**：段位、星数、排行榜三处都走它。
 * 它一旦算错，要么该卡的不卡（考试形同虚设），要么把不该卡的人卡住（玩家白练）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('段位晋级考试（星数封顶）');

const gate = require('../../server/exam-gate');
const ladder = require('../../server/rank-ladder');

// 门槛全部从 ladder 取，别手算 —— 曲线改过好几次（每 3 级 +1 星），
// 写死数字会让这个用例变成「改曲线就红」的噪音。
const BRONZE9 = ladder.starsForCell(9);        // 青铜 9 的门槛
const SILVER1 = ladder.starsForCell(10);       // 白银 1 的门槛
const SILVER9 = ladder.starsForCell(18);
const PLATINUM1 = ladder.starsForCell(19);
/** 没考过任何一场 → 封在「青铜 9」这一级的区间上界（= 进白银 1 所需星数 - 1） */
const CAP_AT_BRONZE = SILVER1 - 1;
/** 考过青铜 → 封在「白银 9」区间上界 */
const CAP_AT_SILVER = PLATINUM1 - 1;

s.test('从没考过（NULL）→ 只能待在第一个大段', () => {
  s.assert.equal(gate.maxCellFrom(null), 9);
  s.assert.equal(gate.maxCellFrom(''), 9);
  s.assert.equal(gate.maxCellFrom(undefined), 9);
  s.assert.equal(gate.maxCellFrom('不存在的段'), 9);
  // 星再多也封在青铜 9
  s.assert.equal(gate.cappedStars(99999, null), CAP_AT_BRONZE);
});

s.test('考过青铜 → 允许进白银，最多到白银 9', () => {
  s.assert.equal(gate.maxCellFrom('bronze'), 18);
  s.assert.equal(gate.cappedStars(99999, 'bronze'), CAP_AT_SILVER);
});

s.test('考过白银 → 允许进铂金；一路考到荣耀王者 → 允许进学神', () => {
  s.assert.equal(gate.maxCellFrom('silver'), 27);
  s.assert.equal(gate.maxCellFrom('glory'), 81, '考过荣耀王者就能进学神（满级 81）');
  s.assert.equal(gate.maxCellFrom('sage'), 81, '已经到顶，不越界');
});

s.test('没到门槛的星数原样返回（不误伤正常玩家）', () => {
  s.assert.equal(gate.cappedStars(0, null), 0);
  s.assert.equal(gate.cappedStars(5, null), 5);
  s.assert.equal(gate.cappedStars(CAP_AT_BRONZE - 1, null), CAP_AT_BRONZE - 1, '还没到封顶值时不封');
  s.assert.equal(gate.cappedStars(CAP_AT_BRONZE, null), CAP_AT_BRONZE, '刚好等于封顶值时放行');
  s.assert.equal(gate.cappedStars(CAP_AT_BRONZE + 1, null), CAP_AT_BRONZE, '超出 1 颗就被卡住');
});

s.test('封顶值落在「当前大段满级」这一级的区间里（段位显示不会跳段）', () => {
  const capped = gate.cappedStars(99999, 'bronze');
  s.assert.equal(ladder.rankOf(capped).rankName, '白银 9');
  s.assert.equal(ladder.rankOf(gate.cappedStars(99999, null)).rankName, '青铜 9');
  s.assert.equal(ladder.rankOf(gate.cappedStars(99999, 'diamond')).rankName, '星耀 9');
});

s.test('needsExam：星数超过封顶值时才算「卡住待考」', () => {
  s.assert.equal(gate.needsExam(0, null), false);
  s.assert.equal(gate.needsExam(CAP_AT_BRONZE, null), false, '刚好等于封顶值不算卡住');
  s.assert.equal(gate.needsExam(CAP_AT_BRONZE + 1, null), true);
  s.assert.equal(gate.needsExam(99999, 'bronze'), true);
});

s.test('脏输入不炸：负数 / 字符串 / 小数都能兜住', () => {
  s.assert.equal(gate.cappedStars(-5, null), 0);
  s.assert.equal(gate.cappedStars('abc', null), 0);
  s.assert.equal(gate.cappedStars('12', null), 12, '字符串数字要认');
  s.assert.equal(gate.cappedStars(12.7, null), 12, '小数取整');
});

s.test('nextTierToExam：一档一档往上考，不能跳级', () => {
  s.assert.equal(gate.nextTierToExam(null), 'bronze', '没考过 → 先考青铜');
  s.assert.equal(gate.nextTierToExam('bronze'), 'silver');
  s.assert.equal(gate.nextTierToExam('silver'), 'gold');
  s.assert.equal(gate.nextTierToExam('glory'), 'sage', '考过荣耀王者 → 下一场是学神');
  s.assert.equal(gate.nextTierToExam('sage'), '', '已到顶 → 不用再考');
  s.assert.equal(gate.nextTierToExam('不存在'), 'bronze', '脏值按没考过处理');
});

s.done();
