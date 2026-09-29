/**
 * game-names.test.js —— 玩法名称表（服务端）与端上目录的一致性护栏
 *
 * 背景（2026-09-29）：管理端新增「玩法热度」，后端要用 `scores.game_type`（机器可读的 key）
 * 显示中文名，于是把原先散落在 routes/ranklist.js 里的玩法清单抽成了 server/game-names.js。
 * 抽出来就有漂移风险：端上加了新玩法、忘了登记后端 → 管理端显示成 `brand_new` 这种 key。
 * 这个用例就是那道闸门。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('玩法名称表（前后端一致）');

const catalog = require('../../miniprogram/utils/game-catalog');
const names = require('../../server/game-names');

const unlocked = catalog.filter(function (g) { return g.unlocked; });

s.test('玩法数量一致：端上已开放玩法 = 后端登记玩法', () => {
  s.assert.equal(names.GAME_TYPES.length, unlocked.length);
});

s.test('每个 game_type 的中文名都能在端上目录里对上号', () => {
  const labels = new Set(catalog.map(function (g) { return g.name; }));
  names.GAME_TYPES.forEach(function (t) {
    s.assert.true(labels.has(names.GAME_NAMES[t]),
      t + ' → 「' + names.GAME_NAMES[t] + '」不在端上玩法目录里');
  });
});

s.test('未开放的占位玩法不进后端清单（没有成绩上报，进了只会显示 0 局）', () => {
  const locked = catalog.filter(function (g) { return !g.unlocked; });
  locked.forEach(function (g) {
    const hit = names.GAME_TYPES.some(function (t) { return names.GAME_NAMES[t] === g.name; });
    s.assert.equal(hit, false, '未开放玩法「' + g.name + '」不该出现在 game-names 里');
  });
});

s.test('game_type 都是小写 snake_case（与服务端上报正则一致）', () => {
  names.GAME_TYPES.forEach(function (t) {
    s.assert.match(t, /^[a-z0-9_]{1,24}$/);
  });
});

s.test('nameOf：未知 key 原样返回（便于后台一眼发现新玩法没登记）', () => {
  s.assert.equal(names.nameOf('brand_new'), 'brand_new');
  s.assert.equal(names.nameOf('  snake  '), '单词贪吃蛇');
  s.assert.equal(names.nameOf(''), '');
  s.assert.equal(names.nameOf(null), '');
});

s.done();
