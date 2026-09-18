/**
 * level-picker.test.js —— 「从题库选题」纯逻辑（2026-09-18 方案 A）
 *
 * 用户确认的方案：自建关卡 = 「我的作品」（10 题一关、可分享），
 * 题库 = 「我的素材」（挂学段、闯关题源）。编辑器接题库，把重复打字干掉。
 * 本用例钉住三件最容易写错的事：排序（我的排前面）、去重（别加重复题）、上限（固定 10 题）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('从题库选题（level-picker）');

const picker = require('../../miniprogram/utils/level-picker');

function w(type, q, a, extra) {
  return Object.assign({ type: type, q: q, a: a, hint: '释义' }, extra || {});
}

s.test('选项整理：缺题目/答案的条目被过滤掉', () => {
  const list = picker.buildOptions([
    w('w1', 'cat', 'a'),
    w('w1', '', 'a'),        // 缺题目
    w('w1', 'dog', ''),      // 缺答案
    null
  ]);
  s.assert.equal(list.length, 1);
  s.assert.equal(list[0].q, 'cat');
});

s.test('排序：我的新增 → 我改过的 → 内置', () => {
  const list = picker.buildOptions([
    w('w1', 'aaa', 'a', {}),                       // 内置
    w('w1', 'bbb', 'b', { _user: true }),          // 我的新增
    w('w1', 'ccc', 'c', { _edited: true })         // 已修改
  ]);
  s.assert.equal(list.map((x) => x.q).join(','), 'bbb,ccc,aaa');
  s.assert.equal(list[0].src, '我的');
  s.assert.equal(list[1].src, '已修改');
  s.assert.equal(list[2].src, '内置');
});

s.test('排序稳定：同样输入两次结果一致（便于复现与断言）', () => {
  const input = [w('c2', '守*待兔', '守株待兔'), w('w1', 'cat', 'a'), w('w1', 'dog', 'o')];
  const a = picker.buildOptions(input).map((x) => x.key).join('|');
  const b = picker.buildOptions(input).map((x) => x.key).join('|');
  s.assert.equal(a, b);
});

s.test('同题去重：题型+题目+答案相同只留一条', () => {
  const list = picker.buildOptions([
    w('w1', 'cat', 'a', { _user: true }),
    w('w1', 'cat', 'a')                              // 与上一条同题（内置里也有）
  ]);
  s.assert.equal(list.length, 1, '同题应只保留排序靠前的那条');
  s.assert.equal(list[0].src, '我的');
});

s.test('追加：不覆盖用户已手输的内容，且跳过重复题', () => {
  const current = [{ type: 'w1', q: 'cat', a: 'a', hint: '手输的' }];
  const r = picker.mergeInto(current, [w('w1', 'cat', 'a'), w('w1', 'dog', 'o')]);
  s.assert.equal(r.items.length, 2);
  s.assert.equal(r.items[0].hint, '手输的', '已有题不能被覆盖');
  s.assert.equal(r.added, 1);
  s.assert.equal(r.skipped, 1, '重复的那条应被跳过');
});

s.test('上限：一关固定 10 题，加满就停', () => {
  const current = [];
  const picked = [];
  for (let i = 0; i < 15; i++) picked.push(w('w1', 'w' + i, 'a'));
  const r = picker.mergeInto(current, picked);
  s.assert.equal(r.items.length, 10);
  s.assert.equal(r.added, 10);
  s.assert.equal(r.skipped, 5);
  s.assert.equal(r.full, true);
});

s.test('已满 10 题时再追加：一条都不加，全部计入 skipped', () => {
  const current = [];
  for (let i = 0; i < 10; i++) current.push(w('w1', 'x' + i, 'a'));
  const r = picker.mergeInto(current, [w('w1', 'new', 'n')]);
  s.assert.equal(r.items.length, 10);
  s.assert.equal(r.added, 0);
  s.assert.equal(r.skipped, 1);
});

s.test('搬运只带关卡需要的字段，不把题库内部标记写进关卡数据', () => {
  const it = picker.toLevelItem(w('w2', '*l*ph*nt', 'elephant', { _user: true, _edited: true, d: ['a', 'e'] }));
  s.assert.equal(it.type, 'w2');
  s.assert.equal(it.q, '*l*ph*nt');
  s.assert.equal(it.a, 'elephant');
  s.assert.deepEqual(it.d, ['a', 'e']);
  s.assert.equal(it._user, undefined, '内部标记不能进关卡');
  s.assert.equal(it._edited, undefined, '内部标记不能进关卡');
});

s.test('mergeInto 不修改入参（原题单保持原样）', () => {
  const current = [w('w1', 'cat', 'a')];
  const snapshot = JSON.stringify(current);
  picker.mergeInto(current, [w('w1', 'dog', 'o')]);
  s.assert.equal(JSON.stringify(current), snapshot);
});

s.test('remaining：还差几题到 10（满 10 返回 0）', () => {
  s.assert.equal(picker.remaining([]), 10);
  s.assert.equal(picker.remaining([1, 2, 3]), 7);
  s.assert.equal(picker.remaining(new Array(10).fill(0)), 0);
  s.assert.equal(picker.remaining(new Array(12).fill(0)), 0, '超出也返回 0，不返回负数');
});
