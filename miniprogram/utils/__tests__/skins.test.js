/**
 * skins.test.js —— utils/skins.js 皮肤渲染清单单测
 *
 * 覆盖：8 个内置形象映射、战士/怪兽皮肤查询、未知 id 回退、稀有度回退。
 *
 * 运行：node miniprogram/utils/__tests__/skins.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/skins.js');

const skins = require('../skins');

s.test('SKIN_RENDER：覆盖后端 8 个形象且均含 emoji/color', () => {
  const ids = [
    'warrior_01', 'warrior_02', 'warrior_03', 'warrior_04',
    'monster_01', 'monster_02', 'monster_03', 'monster_04'
  ];
  s.assert.equal(Object.keys(skins.SKIN_RENDER).length, 8);
  for (const id of ids) {
    const r = skins.SKIN_RENDER[id];
    s.assert.ok(r !== undefined, '缺少 ' + id);
    s.assert.ok(r.emoji.length > 0, id + ' 缺 emoji');
    s.assert.ok(/^#[0-9a-fA-F]{6}$/.test(r.color), id + ' 颜色非法');
  }
});

s.test('getWarriorSkin：正确返回战士皮肤', () => {
  const w = skins.getWarriorSkin('warrior_02');
  s.assert.equal(w.id, 'warrior_02');
  s.assert.equal(w.emoji, '🐱');
  s.assert.equal(w.color, '#ff6b9d');
});

s.test('getMonsterSkin：正确返回怪兽皮肤', () => {
  const m = skins.getMonsterSkin('monster_04');
  s.assert.equal(m.id, 'monster_04');
  s.assert.equal(m.emoji, '⚡');
  s.assert.equal(m.color, '#ffc24d');
});

s.test('getWarriorSkin：未知 id / 怪兽 id 回退默认战士', () => {
  s.assert.equal(skins.getWarriorSkin('nope').id, 'warrior_01');
  s.assert.equal(skins.getWarriorSkin('monster_02').id, 'warrior_01');
  s.assert.equal(skins.getWarriorSkin('').id, 'warrior_01');
});

s.test('getMonsterSkin：未知 id / 战士 id 回退默认怪兽', () => {
  s.assert.equal(skins.getMonsterSkin('nope').id, 'monster_01');
  s.assert.equal(skins.getMonsterSkin('warrior_03').id, 'monster_01');
  s.assert.equal(skins.getMonsterSkin(undefined).id, 'monster_01');
});

s.test('getSkinRender：未知 id 回退默认怪兽', () => {
  s.assert.equal(skins.getSkinRender('bad_id').emoji, '👾');
});

s.test('getRarity：已知/未知稀有度正确映射与回退', () => {
  s.assert.equal(skins.getRarity('common').label, '普通');
  s.assert.equal(skins.getRarity('legend').color, '#ffc24d');
  s.assert.equal(skins.getRarity('nope').label, '普通');
  s.assert.equal(skins.getRarity('nope').color, '#8a9bb5');
});

s.test('LOCAL_SKINS：8 条且与 SKIN_RENDER 的 avatarId 一一对应、字段齐全', () => {
  s.assert.equal(skins.LOCAL_SKINS.length, 8);
  const ids = skins.LOCAL_SKINS.map((x) => x.avatarId).sort();
  s.assert.deepEqual(ids, Object.keys(skins.SKIN_RENDER).sort());
  for (const sk of skins.LOCAL_SKINS) {
    s.assert.ok(sk.name.length > 0, sk.avatarId + ' 缺名称');
    s.assert.ok(sk.type === 'warrior' || sk.type === 'monster', sk.avatarId + ' type 非法');
    s.assert.ok(sk.emoji.length > 0, sk.avatarId + ' 缺 emoji');
    s.assert.ok(['free', 'stars', 'rank', 'level'].indexOf(sk.unlockType) >= 0, sk.avatarId + ' unlockType 非法');
    s.assert.equal(sk.emoji, skins.SKIN_RENDER[sk.avatarId].emoji);
    s.assert.equal(sk.color, skins.SKIN_RENDER[sk.avatarId].color);
  }
});

s.done();