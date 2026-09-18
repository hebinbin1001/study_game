/**
 * bank.test.js —— 题库覆盖层（2026-09-18）
 *
 * 需求：题库页可编辑/新增/删除，且这些词条就是闯关线的题源。
 * 本用例守住「合并规则」这层契约：停用 / 改写 / 新增 / 恢复，
 * 以及它与 utils/dict.js 的接线（改完立刻影响取题）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('题库覆盖层（utils/bank.js）');

const bank = require('../../miniprogram/utils/bank');
const dict = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');

const G = 'primary34';

/** 造一份最小的「内置词库」 */
function fakeBuiltin() {
  return [
    { type: 'c2', q: '*心*意', a: '一心一意', hint: '形容专心' },
    { type: 'c2', q: '三*二*', a: '三心二意', hint: '形容不专心' },
    { type: 'w1', q: 'cat', a: 'a', hint: '猫' }
  ];
}

s.test('指纹：学段 + 题型 + 题目，稳定且能区分', () => {
  s.assert.equal(bank.fingerprint(G, 'c2', '*心*意'), 'primary34|c2|*心*意');
  s.assert.equal(bank.fingerprint(G, 'c2', '*心*意'), bank.fingerprint(G, 'c2', '*心*意'));
  s.assert.notEqual(bank.fingerprint(G, 'c2', '*心*意'), bank.fingerprint(G, 'c2', '三*二*'));
  s.assert.notEqual(bank.fingerprint(G, 'c2', 'x'), bank.fingerprint('junior', 'c2', 'x'));
});

s.test('停用：内置条目从结果里剔除，其余原样保留', () => {
  const ov = bank.setOverrides([
    bank.makeEntry('disable', G, 'c2', '*心*意')
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov);
  s.assert.equal(out.length, 2);
  s.assert.ok(!out.some((x) => x.q === '*心*意'), '被停用的条目不应出现');
  s.assert.ok(out.some((x) => x.q === '三*二*'), '其它条目不受影响');
});

s.test('改写：只覆盖有值的字段，题目与其它字段保持内置原样', () => {
  const ov = bank.setOverrides([
    bank.makeEntry('patch', G, 'c2', '三*二*', { a: '三心二意', hint: '我改的释义' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov);
  const hit = out.find((x) => x.q === '三*二*');
  s.assert.equal(hit.hint, '我改的释义', '释义应被改写');
  s.assert.equal(hit.a, '三心二意', '未提供的字段保持内置值');
  s.assert.equal(hit.q, '三*二*', '题目本身不变（指纹才稳定）');
  s.assert.equal(hit._edited, true, '应带「已修改」标记');
});

s.test('新增：追加到末尾并标记为「我的」', () => {
  const ov = bank.setOverrides([
    bank.makeEntry('create', G, 'c2', '*马*空', { a: '天马行空', hint: '比喻独到' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov);
  s.assert.equal(out.length, 4);
  const mine = out[out.length - 1];
  s.assert.equal(mine.a, '天马行空');
  s.assert.equal(mine._user, true);
});

s.test('新增与内置同题：不重复添加（应走改写）', () => {
  const ov = bank.setOverrides([
    bank.makeEntry('create', G, 'c2', '*心*意', { a: '一心一意', hint: '重复新增' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov);
  s.assert.equal(out.length, 3, '不应产生重复条目');
  s.assert.equal(out.filter((x) => x.q === '*心*意').length, 1);
});

s.test('残缺记录（缺答案/缺题目）被忽略，不影响其它条目', () => {
  const ov = bank.setOverrides([
    bank.makeEntry('create', G, 'c2', '', { a: '空题目' }),
    bank.makeEntry('create', G, 'c2', '无答案', { a: '' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov);
  s.assert.equal(out.length, 3);
});

s.test('其它学段的改动不串台', () => {
  const ov = bank.setOverrides([
    bank.makeEntry('disable', 'junior', 'c2', '*心*意')
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov);
  s.assert.equal(out.length, 3, '别的学段的停用不应影响本学段');
});

s.test('applyOverrides 不修改入参（内置词库只读）', () => {
  const builtin = fakeBuiltin();
  const before = JSON.stringify(builtin);
  const ov = bank.setOverrides([
    bank.makeEntry('patch', G, 'c2', '*心*意', { a: '一心一意', hint: '改了' }),
    bank.makeEntry('disable', G, 'w1', 'cat')
  ]);
  bank.applyOverrides(builtin, G, ov);
  s.assert.equal(JSON.stringify(builtin), before, '入参数组不应被改写');
});

s.test('makeEntry：形状与 /api/wordbank/entries 请求体一致', () => {
  const e = bank.makeEntry('patch', G, 'w1', 'cat', { a: 'a', hint: '猫', d: 'e,o' });
  s.assert.equal(e.action, 'patch');
  s.assert.equal(e.grade, G);
  s.assert.equal(e.type, 'w1');
  s.assert.equal(e.q, 'cat');
  s.assert.equal(e.a, 'a');
  s.assert.equal(e.hint, '猫');
  s.assert.equal(e.d, 'e,o');
  s.assert.equal(e.key, bank.fingerprint(G, 'w1', 'cat'));
});

s.test('接线：dict.setOverrides 后取题立刻跟着变，loadBuiltin 保持只读', () => {
  const raw = dict.loadBuiltin(G);
  s.assert.ok(raw.length > 0, '内置词库应能读到');
  const target = raw[0];

  dict.setOverrides([bank.makeEntry('disable', G, target.type, target.q)]);
  const merged = dict.loadByGrade(G);
  s.assert.equal(merged.length, raw.length - 1, '停用一条后合并结果应少一条');
  s.assert.ok(!merged.some((x) => x.q === target.q && x.a === target.a), '该条应已从题池移除');
  s.assert.ok(dict.loadBuiltin(G).some((x) => x.q === target.q), '内置原库不受影响');

  // 恢复：清掉覆盖层后回到内置全量
  dict.setOverrides([]);
  s.assert.equal(dict.loadByGrade(G).length, raw.length, '清空覆盖层后应回到内置总量');
});

s.test('全量冒烟：每个学段都能套用覆盖层且结果非空', () => {
  constants.GRADES.forEach((g) => {
    const raw = dict.loadBuiltin(g.key);
    s.assert.ok(raw.length > 0, g.label + ' 内置词库不应为空');
    const ov = bank.setOverrides([
      bank.makeEntry('create', g.key, raw[0].type || 'w1', '冒烟题', { a: '冒烟答案' })
    ]);
    const out = bank.applyOverrides(raw, g.key, ov);
    s.assert.equal(out.length, raw.length + 1, g.label + ' 新增一条后应 +1');
  });
  dict.setOverrides([]);
});

// ============ 自建题库（挂在学段下作为附加题源，2026-09-18 二次改版） ============

s.test('自建库：挂在本学段的库，词条并入题池', () => {
  const banks = bank.setBanks([
    { bankId: 'bkA', name: '我家错词本', grade: G, enabled: true }
  ]);
  const ov = bank.setOverrides([
    bank.makeEntry('create', G, 'c2', '*马*空', { a: '天马行空', bankId: 'bkA' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov, banks);
  s.assert.equal(out.length, 4, '内置 3 条 + 自建库 1 条');
  s.assert.ok(out.some((x) => x.a === '天马行空'), '自建库词条应并入');
});

s.test('自建库：库暂停后不参与出题（词条仍在本地，随时开回来）', () => {
  const banks = bank.setBanks([
    { bankId: 'bkA', name: '我家错词本', grade: G, enabled: false }
  ]);
  const ov = bank.setOverrides([
    bank.makeEntry('create', G, 'c2', '*马*空', { a: '天马行空', bankId: 'bkA' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov, banks);
  s.assert.equal(out.length, 3, '暂停的库不并入');
});

s.test('自建库：挂在别的学段的库，不影响本学段', () => {
  const banks = bank.setBanks([
    { bankId: 'bkB', name: '初中错词', grade: 'junior', enabled: true }
  ]);
  const ov = bank.setOverrides([
    bank.makeEntry('create', G, 'c2', '*马*空', { a: '天马行空', bankId: 'bkB' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov, banks);
  s.assert.equal(out.length, 3, '别的学段的库不应串进来');
});

s.test('自建库：与内置同题的词条不会在题池里重复（避免同一关出重复题）', () => {
  const banks = bank.setBanks([
    { bankId: 'bkC', name: '错词本', grade: G, enabled: true }
  ]);
  const ov = bank.setOverrides([
    bank.makeEntry('create', G, 'w1', 'cat', { a: 'a', hint: '学段级新增' }),
    bank.makeEntry('create', G, 'w1', 'cat', { a: 'a', hint: '自建库新增', bankId: 'bkC' })
  ]);
  const out = bank.applyOverrides(fakeBuiltin(), G, ov, banks);
  s.assert.equal(out.length, 3, '与内置同题时不重复并入题池');
  s.assert.equal(out.filter((x) => x.q === 'cat').length, 1, 'cat 只应出现一次');
});

s.test('作用域键：base 与自建库互不覆盖（本地增删改也按作用域隔离）', () => {
  s.assert.equal(bank.entryKey('', G, 'w1', 'cat'), 'base::' + bank.fingerprint(G, 'w1', 'cat'));
  s.assert.equal(bank.entryKey('bkZ', G, 'w1', 'cat'), 'bkZ::' + bank.fingerprint(G, 'w1', 'cat'));
  s.assert.notEqual(bank.entryKey('', G, 'w1', 'cat'), bank.entryKey('bkZ', G, 'w1', 'cat'));
});

s.test('删库：库和库内词条一起清掉，题池回到内置', () => {
  bank.setBanks([{ bankId: 'bkD', name: '临时库', grade: G, enabled: true }]);
  bank.upsertLocal(bank.makeEntry('create', G, 'c2', '*马*空', { a: '天马行空', bankId: 'bkD' }));
  dict.refreshOverrides();
  s.assert.ok(dict.loadByGrade(G).some((x) => x.a === '天马行空'), '挂上库后应能出题');
  bank.removeBankLocal('bkD');
  bank.removeLocal(G, 'c2', '*马*空', 'bkD');
  dict.refreshOverrides();
  s.assert.ok(!dict.loadByGrade(G).some((x) => x.a === '天马行空'), '删库后不应再出题');
  bank.removeLocal(G, 'c2', '*马*空');
  dict.refreshOverrides();
});
