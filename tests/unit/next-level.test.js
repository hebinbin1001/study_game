/**
 * next-level.test.js —— 「下一关」跳转口径（2026-09-18 用户要求）
 *
 * 用户原话：「关卡过完关后应该提示下一关」。这条需求落在 challenge.nextLevelUrl：
 *   · 挑战主线 → 第 level+1 关（同一学段的下一关）
 *   · 玩法线   → 同一条线的第 level+1 关（种子/命名空间都跟着线走）
 *   · 最后一关 / 自由玩 / 自定义关卡 → 没有下一关，返回空串（页面据此不显示按钮）
 *
 * 这里是纯函数断言；按钮是否真的渲染/可点由 e2e/verify-lines.js 覆盖。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('下一关跳转（challenge.nextLevelUrl）');

const challenge = require('../../miniprogram/utils/challenge');
const constants = require('../../miniprogram/utils/constants');

// 挑战主线/玩法线的关数是 CHALLENGE_LEVELS_PER_GRADE（30），
// 不是旧的 LEVELS_PER_GRADE（10，那是自由练的分级关数）
const TOTAL = constants.CHALLENGE_LEVELS_PER_GRADE;

s.test('挑战主线：给第 level+1 关的 URL（同一条主线）', () => {
  const url = challenge.nextLevelUrl({ challenge: '1', grade: 'primary34', level: '3' });
  s.assert.contains(url, 'level=4');
  s.assert.contains(url, 'grade=primary34');
  s.assert.contains(url, 'challenge=1');
  s.assert.contains(url, 'seed=');
  s.assert.ok(url.indexOf('line=challenge') >= 0 || url.indexOf('line=') < 0,
    '主线不带玩法线前缀：' + url);
});

s.test('挑战主线：第 30 关（最后一关）没有下一关', () => {
  s.assert.equal(challenge.nextLevelUrl({ challenge: '1', grade: 'primary34', level: String(TOTAL) }), '');
  s.assert.equal(challenge.nextLevelUrl({ challenge: '1', grade: 'primary34', level: String(TOTAL + 5) }), '',
    '越界关卡同样不给');
});

s.test('玩法线：推进同一条线的下一关（保留 line= 命名空间）', () => {
  const url = challenge.nextLevelUrl({ challenge: '1', line: 'mode_link', grade: 'junior', level: '7' });
  s.assert.contains(url, 'level=8');
  s.assert.contains(url, 'line=mode_link');
  s.assert.contains(url, 'grade=junior');
});

s.test('玩法线最后一关没有下一关', () => {
  s.assert.equal(
    challenge.nextLevelUrl({ challenge: '1', line: 'mode_link', grade: 'junior', level: String(TOTAL) }), '');
});

s.test('自由玩 / 自定义关卡 / 参数不全：一律没有下一关', () => {
  s.assert.equal(challenge.nextLevelUrl({ grade: 'primary34', level: '3' }), '', '非挑战局');
  s.assert.equal(challenge.nextLevelUrl({ challenge: '1', level: '3' }), '', '缺学段');
  s.assert.equal(challenge.nextLevelUrl({ challenge: '1', grade: 'primary34' }), '', '缺关卡');
  s.assert.equal(challenge.nextLevelUrl(null), '', '空参数不崩');
});

s.test('下一关口令与「再玩一次」一致：同一关用同一套题（种子可复现）', () => {
  const a = challenge.nextLevelUrl({ challenge: '1', grade: 'primary34', level: '3' });
  const b = challenge.nextLevelUrl({ challenge: '1', grade: 'primary34', level: '3' });
  s.assert.equal(a, b, '同一关的下一关 URL 必须稳定（否则重进换题）');
  const seed = challenge.seedOf('primary34', 4);
  s.assert.contains(a, 'seed=' + seed, 'nextLevelUrl 应带第 4 关的关卡种子');
});

s.test('全链路：每一关都能推到下一关，只有最后一关是终点', () => {
  for (let lv = 1; lv < TOTAL; lv++) {
    const url = challenge.nextLevelUrl({ challenge: '1', grade: 'kindergarten', level: String(lv) });
    s.assert.contains(url, 'level=' + (lv + 1), '第 ' + lv + ' 关的下一关应是第 ' + (lv + 1) + ' 关');
  }
  s.assert.equal(challenge.nextLevelUrl({ challenge: '1', grade: 'kindergarten', level: String(TOTAL) }), '');
});
