/**
 * makeup-card.test.js —— 补签卡规则（2026-10-29）
 *
 * 为什么值得单独测：
 *   · `checkin_records.streak` 是冗余存储（写入时看昨天 +1），补签要**重算**它之后
 *     的所有记录。算错不是「显示不对」，是用户从那天起每天的连续天数都错、
 *     签到奖励星也跟着错，而且线上没有历史数据能对照着发现；
 *   · 「能不能补」有四种处境（昨天已签 / 没卡 / 前天没签 / 可以补），
 *     判断顺序写反会让用户看到「没卡」这种误导提示；
 *   · 发卡门槛是「严格连续 7 的倍数」，off-by-one 会让它变成每 6 天或 8 天发一张。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('补签卡');

const mc = require('../../server/makeup-card');

/** 造一条签到记录 */
function rec(date, streak) {
  return { date: date, streak: streak };
}

// ---------- 一、发卡门槛 ----------

s.test('shouldGrant：只在严格连续 7 的倍数发卡', () => {
  // 该发的
  [7, 14, 21, 28, 70].forEach((n) => {
    s.assert.true(mc.shouldGrant(n), n + ' 天应该发卡');
  });
  // 不该发的：6/8 是最容易写成 <= 或 >= 的两个边界
  [1, 2, 3, 6, 8, 13, 15, 20, 27].forEach((n) => {
    s.assert.false(mc.shouldGrant(n), n + ' 天不该发卡');
  });
});

s.test('shouldGrant：0 / 负数 / 非数字一律不发（脏数据不能白送卡）', () => {
  [0, -1, -7, null, undefined, '', 'abc', NaN, 1.5].forEach((v) => {
    s.assert.false(mc.shouldGrant(v), JSON.stringify(v) + ' 不该发卡');
  });
  // 字符串数字要能用（数据库读出来可能是字符串）
  s.assert.true(mc.shouldGrant('14'));
});

// ---------- 二、日期运算 ----------

s.test('shiftKey：跨月 / 跨年 / 闰年都对', () => {
  s.assert.equal(mc.shiftKey('2026-10-28', -1), '2026-10-27');
  s.assert.equal(mc.shiftKey('2026-11-01', -1), '2026-10-31');
  s.assert.equal(mc.shiftKey('2027-01-01', -1), '2026-12-31');
  s.assert.equal(mc.shiftKey('2024-02-28', 1), '2024-02-29');   // 闰年
  s.assert.equal(mc.shiftKey('2026-02-28', 1), '2026-03-01');   // 平年
  s.assert.equal(mc.shiftKey('2026-12-31', 1), '2027-01-01');
  s.assert.equal(mc.shiftKey('坏数据', -1), '');
});

// ---------- 三、能不能补（四种处境 + 判断顺序）----------

s.test('planMakeup：昨天已签 → already（不需要补）', () => {
  const records = [rec('2026-10-27', 1), rec('2026-10-28', 2), rec('2026-10-29', 3)];
  // today = 10-29，昨天 10-28 已签
  const p = mc.planMakeup(records, 3, '2026-10-29');
  s.assert.false(p.can);
  s.assert.equal(p.reason, 'already');
});

s.test('planMakeup：没有卡 → no_card', () => {
  const records = [rec('2026-10-26', 5), rec('2026-10-27', 6)];
  // 10-28 断了，today = 10-29
  const p = mc.planMakeup(records, 0, '2026-10-29');
  s.assert.false(p.can);
  s.assert.equal(p.reason, 'no_card');
  s.assert.equal(p.target, '2026-10-28');
});

s.test('planMakeup：前天也没签 → no_prev（补了接不上，不白花卡）', () => {
  // 只有 10-25 有记录，10-26/10-27/10-28 全断（today = 10-29）
  const records = [rec('2026-10-25', 3)];
  const p = mc.planMakeup(records, 2, '2026-10-29');
  s.assert.false(p.can);
  s.assert.equal(p.reason, 'no_prev');
});

s.test('planMakeup：昨天断、前天有签、有卡 → 可以补昨天', () => {
  const records = [rec('2026-10-26', 5), rec('2026-10-27', 6)];
  const p = mc.planMakeup(records, 1, '2026-10-29');
  s.assert.true(p.can);
  s.assert.equal(p.target, '2026-10-28', '只能补昨天，不能补更早的日子');
  s.assert.equal(p.reason, '');
});

s.test('planMakeup：优先级 already > no_card > no_prev', () => {
  // 昨天已签 + 没卡 → 应该是 already（用户根本不需要卡，别说「你没卡」）
  const signed = [rec('2026-10-27', 1), rec('2026-10-28', 2)];
  s.assert.equal(mc.planMakeup(signed, 0, '2026-10-29').reason, 'already');
  // 昨天没签 + 没卡 + 前天也没签 → 应该是 no_card（先告诉他缺什么）
  s.assert.equal(mc.planMakeup([], 0, '2026-10-29').reason, 'no_card');
});

s.test('planMakeup：空记录 / 无记录用户不崩', () => {
  const p = mc.planMakeup([], 1, '2026-10-29');
  s.assert.false(p.can);
  s.assert.equal(p.reason, 'no_prev', '从来没签过的人补昨天等于凭空送一天，应拒绝');
  s.assert.equal(mc.planMakeup(null, 1, '2026-10-29').can, false);
  s.assert.equal(mc.planMakeup([], 1, '').reason, 'bad_date');
});

// ---------- 四、重算连续天数（最容易出错的地方）----------

s.test('recomputeFrom：补中间一个洞，后面所有记录一起 +1', () => {
  // 10-20~10-25 连续 6 天 → 10-26 忘了 → 10-27/10-28 只能从 1 重新开始
  const records = [
    rec('2026-10-20', 1), rec('2026-10-21', 2), rec('2026-10-22', 3),
    rec('2026-10-23', 4), rec('2026-10-24', 5), rec('2026-10-25', 6),
    rec('2026-10-26', 1),   // ← 补签插进来的这条（先给个占位值）
    rec('2026-10-27', 1),
    rec('2026-10-28', 2)
  ];
  const changes = mc.recomputeFrom(records, '2026-10-26');
  s.assert.deepEqual(changes, [
    { date: '2026-10-26', streak: 7 },
    { date: '2026-10-27', streak: 8 },
    { date: '2026-10-28', streak: 9 }
  ], '补签后 26/27/28 应变成 7/8/9');
});

s.test('recomputeFrom：补最靠后的一天（昨天），只影响这一条', () => {
  const records = [rec('2026-10-26', 1), rec('2026-10-27', 2), rec('2026-10-28', 1)];
  const changes = mc.recomputeFrom(records, '2026-10-28');
  s.assert.deepEqual(changes, [{ date: '2026-10-28', streak: 3 }]);
});

s.test('recomputeFrom：补完后面仍有断档 → 断档之后重新从 1 开始', () => {
  // 补 10-22，10-23 有记录，10-24 缺，10-25 有
  const records = [
    rec('2026-10-21', 3),
    rec('2026-10-22', 1),
    rec('2026-10-23', 1),
    rec('2026-10-25', 1)
  ];
  const changes = mc.recomputeFrom(records, '2026-10-22');
  s.assert.deepEqual(changes, [
    { date: '2026-10-22', streak: 4 },
    { date: '2026-10-23', streak: 5 }
    // 10-25 不在结果里：它前面（10-24）仍然缺，重算后还是 1，值没变就不写库
  ]);
});

s.test('recomputeFrom：数据本来就对 → 返回空（不做无意义写库）', () => {
  const records = [rec('2026-10-26', 6), rec('2026-10-27', 7), rec('2026-10-28', 8)];
  s.assert.deepEqual(mc.recomputeFrom(records, '2026-10-27'), []);
});

s.test('recomputeFrom：日期不在记录里 / 空输入 → 返回空数组，不抛错', () => {
  s.assert.deepEqual(mc.recomputeFrom([rec('2026-10-27', 2)], '2026-10-28'), []);
  s.assert.deepEqual(mc.recomputeFrom([], '2026-10-28'), []);
  s.assert.deepEqual(mc.recomputeFrom(null, '2026-10-28'), []);
});

s.test('recomputeFrom：补第一天（前面没有任何记录）→ streak 从 1 起', () => {
  const records = [rec('2026-10-27', 99), rec('2026-10-28', 99)];
  const changes = mc.recomputeFrom(records, '2026-10-27');
  s.assert.deepEqual(changes, [
    { date: '2026-10-27', streak: 1 },
    { date: '2026-10-28', streak: 2 }
  ]);
});

s.done();
