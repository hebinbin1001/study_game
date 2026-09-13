/**
 * checkin-rewards.test.js —— 签到奖励重标（2026-09-13）
 *
 * 背景：原口径每天 10 星 + 里程碑 30/100/200/500，导致一个月就签到 ≈ 1090 星，
 * 超过满级 947 星。重标为「每天 1 星 + 里程碑当天一次性额外 2/5/8/15 星」。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('签到奖励口径');

const { rewardForStreak, totalBonus, DAILY, MILESTONE } = require('../../server/checkin-rewards');

const ROOT = path.resolve(__dirname, '../..');

s.test('每天 1 星；里程碑当天额外一次性加成（不是按档取最大值）', () => {
  // 普通日：只拿每日基础
  s.assert.equal(rewardForStreak(1), 1);
  s.assert.equal(rewardForStreak(2), 1);
  s.assert.equal(rewardForStreak(4), 1);
  s.assert.equal(rewardForStreak(6), 1);
  s.assert.equal(rewardForStreak(13), 1);
  s.assert.equal(rewardForStreak(29), 1);
  s.assert.equal(rewardForStreak(31), 1, '过了 30 天仍只 +1（里程碑是一次性）');
  // 里程碑当天：每日基础 + 额外
  s.assert.equal(rewardForStreak(3), 1 + 2);
  s.assert.equal(rewardForStreak(7), 1 + 5);
  s.assert.equal(rewardForStreak(14), 1 + 8);
  s.assert.equal(rewardForStreak(30), 1 + 15);
  s.assert.equal(rewardForStreak(99), 1, '99 天不踩里程碑，只 +1');
});

s.test('兜底安全：0 / 负数 / 空值 按第 1 天算', () => {
  s.assert.equal(rewardForStreak(0), DAILY);
  s.assert.equal(rewardForStreak(-5), DAILY);
  s.assert.equal(rewardForStreak(null), DAILY);
  s.assert.equal(rewardForStreak(undefined), DAILY);
  s.assert.equal(rewardForStreak('abc'), DAILY);
});

s.test('里程碑值单调不减，且远小于旧口径', () => {
  const seq = [1, 3, 7, 14, 30].map(rewardForStreak);
  for (let i = 1; i < seq.length; i++) {
    s.assert.ok(seq[i] >= seq[i - 1], '里程碑应单调不减：' + seq.join(','));
  }
  s.assert.equal(MILESTONE[30], 15);
  s.assert.ok(MILESTONE[30] < 500, '30 天档奖励远小于旧的 500 星');
});

s.test('累计：一个月满勤 = 30 + (2+5+8+15) = 60 星', () => {
  // 模拟 30 天连续签到：streak 依次 1~30
  const records = [];
  for (let d = 1; d <= 30; d++) records.push({ streak: d });
  const total = totalBonus(records);
  s.assert.equal(total, 30 * 1 + 2 + 5 + 8 + 15, '一个月满勤应约 60 星，实际 ' + total);
  s.assert.equal(total, 60);
  s.assert.ok(total < 100, '一个月签到奖励必须远小于满级 947 星');
  s.assert.equal(totalBonus([]), 0);
  s.assert.equal(totalBonus(null), 0);
});

s.test('口径一致性护栏：签到页阶梯与后端 MILESTONE 对齐，服务端无旧奖励残留', () => {
  // 1) 前端签到页 starLadder 的星星数必须与后端一致（防两边各改一半）
  const pageSrc = fs.readFileSync(
    path.join(ROOT, 'miniprogram/pages/checkin/checkin.js'), 'utf8');
  const ladderBlock = pageSrc.slice(pageSrc.indexOf('starLadder:'),
    pageSrc.indexOf(']', pageSrc.indexOf('starLadder:')));
  [1, 3, 7, 14, 30].forEach((day) => {
    const expect = day === 1 ? DAILY : MILESTONE[day];
    const re = new RegExp('day:\\s*' + day + '[^}]*stars:\\s*' + expect + '\\b');
    s.assert.ok(re.test(ladderBlock),
      '签到页 ' + day + ' 天的星星数应为 ' + expect + '：' + ladderBlock.replace(/\s+/g, ' '));
  });

  // 2) 打卡入口（每日一题 daily.js）不得再出现旧口径的硬编码数值
  const dailySrc = fs.readFileSync(path.join(ROOT, 'server/routes/daily.js'), 'utf8');
  [30, 100, 200, 500].forEach((legacy) => {
    s.assert.ok(dailySrc.indexOf('rewardStars = ' + legacy) < 0,
      'daily.js 不应再硬编码旧奖励 ' + legacy);
  });
  s.assert.ok(dailySrc.indexOf('rewardForStreak') >= 0,
    'daily.js 应复用 checkin-rewards 的 rewardForStreak');
  s.assert.ok(dailySrc.indexOf('syncRankStars') >= 0,
    'daily.js 打卡后应重算段位星（而不是直接 stars +=）');

  // 3) 签到路由同样不得直接累加星星（会被重算覆盖）——先去掉行注释再检查，避免注释里的说明误伤
  const stripLineComments = (src) => src.split('\n')
    .map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  const checkinSrc = fs.readFileSync(path.join(ROOT, 'server/routes/checkin.js'), 'utf8');
  s.assert.ok(stripLineComments(checkinSrc).indexOf('stars +=') < 0,
    'checkin.js 不应直接 stars += 奖励');
  s.assert.ok(stripLineComments(checkinSrc).indexOf('stars:') < 0 ||
    checkinSrc.indexOf('syncRankStars') >= 0, 'checkin.js 应重算段位星');
  s.assert.ok(checkinSrc.indexOf('syncRankStars') >= 0, 'checkin.js 应重算段位星');
  s.assert.ok(stripLineComments(fs.readFileSync(path.join(ROOT, 'server/routes/daily.js'), 'utf8'))
    .indexOf('stars +=') < 0, 'daily.js 不应直接 stars += 奖励');
});
