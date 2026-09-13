/**
 * play-counts.test.js —— 本机玩法计数（首页「推荐玩法」数据源，2026-09-13）
 *
 * 背景：首页推荐玩法原来写死两张卡（字母射击 + 消消乐），用户要求改成
 * 「展示本机玩得最多的两款」。计数口径：一局打完才 +1（游客也记）。
 *
 * 覆盖：
 *   1. 上报口径 gameType → 玩法目录 key 的换算（word_warrior→shoot、word_build→wordbuild …）；
 *   2. 不认识的 key 原样记账（不丢数据），空值安全；
 *   3. topKeys 按次数降序、只取前 n、忽略 0 次；
 *   4. clear 可清空（测试/调试用）。
 *
 * 运行：node tests/unit/play-counts.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('本机玩法计数（首页推荐玩法）');

const counts = require('../../miniprogram/utils/play-counts');
const catalog = require('../../miniprogram/utils/game-catalog');

s.test('gameType → 玩法目录 key：常见映射正确', () => {
  counts.clear();
  s.assert.equal(counts.bump('word_warrior'), 'shoot');
  s.assert.equal(counts.bump('word_build'), 'wordbuild');
  s.assert.equal(counts.bump('idiom'), 'idiombuild');
  s.assert.equal(counts.bump('memory_grid'), 'memory');
  s.assert.equal(counts.bump('math_sprint'), 'sprint');
  const all = counts.getAll();
  s.assert.equal(all.shoot, 1);
  s.assert.equal(all.wordbuild, 1);
  s.assert.equal(all.idiombuild, 1);
  s.assert.equal(all.memory, 1);
  s.assert.equal(all.sprint, 1);
});

s.test('映射表里的 key 必须在玩法目录里存在（防止计数记到不存在的玩法上）', () => {
  const keys = catalog.map(function (g) { return g.key; });
  Object.keys(counts.GAME_TYPE_TO_KEY).forEach(function (gt) {
    const key = counts.GAME_TYPE_TO_KEY[gt];
    s.assert.ok(keys.indexOf(key) >= 0, gt + ' → ' + key + ' 不在玩法目录里');
  });
});

s.test('不认识的 key 原样记账；空值安全', () => {
  counts.clear();
  s.assert.equal(counts.bump('some_new_game'), 'some_new_game');
  s.assert.equal(counts.getAll().some_new_game, 1);
  s.assert.equal(counts.bump(''), '');
  s.assert.equal(counts.bump(null), '');
  s.assert.equal(Object.keys(counts.getAll()).length, 1);
});

s.test('topKeys：按次数降序、只取前 n、忽略 0 次', () => {
  counts.clear();
  counts.bump('match');            // 1
  counts.bump('shoot'); counts.bump('shoot'); counts.bump('shoot');   // 3
  counts.bump('link'); counts.bump('link');                            // 2
  s.assert.deepEqual(counts.topKeys(2), ['shoot', 'link']);
  s.assert.deepEqual(counts.topKeys(1), ['shoot']);
  s.assert.deepEqual(counts.topKeys(10), ['shoot', 'link', 'match']);
  s.assert.deepEqual(counts.topKeys(0), []);
});

s.test('空数据 / clear', () => {
  counts.clear();
  s.assert.deepEqual(counts.topKeys(2), []);
  s.assert.deepEqual(counts.getAll(), {});
  counts.bump('shoot');
  counts.clear();
  s.assert.deepEqual(counts.topKeys(2), [], 'clear 后应回到空');
});
