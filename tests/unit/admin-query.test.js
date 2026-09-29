/**
 * admin-query.test.js —— 管理端查询规则（排序 / 搜索 / 采集率 / 热度聚合）
 *
 * 背景（2026-09-29）：用户要求「管理员界面还缺少什么，一起做了」。
 * 这批补的能力里最容易出错、又最难靠点页面发现的，就是下面这些规则：
 *   · 排序键传了脏参数 → 整页顺序乱掉（甚至 SQL 报错）
 *   · 搜索词里的 % 没转义 → 搜「100%」命中所有人，看起来像「搜索坏了」
 *   · 采集率除零 / 越界 → 管理端显示 NaN%
 *   · 热度同局数时顺序抖动 → 每次刷新榜单都在跳
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('管理端查询规则');

const q = require('../../server/admin-query');

s.test('排序：白名单外的值一律回退默认（防脏参数）', () => {
  s.assert.equal(q.resolveSort('active'), 'active');
  s.assert.equal(q.resolveSort('stars'), 'stars');
  s.assert.equal(q.resolveSort('created'), 'created');
  s.assert.equal(q.resolveSort('STARS'), 'stars');       // 容错大小写
  s.assert.equal(q.resolveSort(' stars '), 'stars');     // 容错空格
  s.assert.equal(q.resolveSort('drop table users'), q.DEFAULT_SORT);
  s.assert.equal(q.resolveSort(''), q.DEFAULT_SORT);
  s.assert.equal(q.resolveSort(null), q.DEFAULT_SORT);
  s.assert.equal(q.resolveSort(undefined), q.DEFAULT_SORT);
  s.assert.equal(q.DEFAULT_SORT, 'active');              // 默认 = 最近活跃
});

s.test('LIKE 转义：% 和 _ 不再是通配符', () => {
  s.assert.equal(q.escapeLike('100%'), '100\\%');
  s.assert.equal(q.escapeLike('a_b'), 'a\\_b');
  s.assert.equal(q.escapeLike('c:\\x'), 'c:\\\\x');      // 反斜杠自身也要转义
  s.assert.equal(q.escapeLike('普通词'), '普通词');       // 正常词不受影响
  s.assert.equal(q.escapeLike(null), '');
});

s.test('搜索模式：空词返回 null，非空返回 %词%', () => {
  s.assert.equal(q.searchPattern(''), null);
  s.assert.equal(q.searchPattern('   '), null);
  s.assert.equal(q.searchPattern(null), null);
  s.assert.equal(q.searchPattern(undefined), null);
  s.assert.deepEqual(q.searchPattern(' 小明 '), { term: '小明', pattern: '%小明%' });
  s.assert.deepEqual(q.searchPattern('100%'), { term: '100%', pattern: '%100\\%%' });
});

s.test('搜索覆盖昵称 / 微信名 / openid 三列（与页面提示文案一致）', () => {
  s.assert.deepEqual(q.SEARCH_FIELDS, ['nickname', 'wx_nickname', 'openid']);
});

s.test('微信名采集率：保留 1 位小数，除零与越界都安全', () => {
  s.assert.equal(q.collectRate(0, 0), 0);
  s.assert.equal(q.collectRate(5, 0), 0);
  s.assert.equal(q.collectRate(0, 20), 0);
  s.assert.equal(q.collectRate(1, 3), 33.3);
  s.assert.equal(q.collectRate(2, 3), 66.7);
  s.assert.equal(q.collectRate(20, 20), 100);
  s.assert.equal(q.collectRate('7', '40'), 17.5);        // SQL COUNT 返回的是字符串
  s.assert.equal(q.collectRate(99, 20), 100);            // 越界夹到 100
});

s.test('玩法热度：局数降序，未登记玩法用原 key 当名字，空数据安全', () => {
  const names = { math24: '算 24 点', snake: '单词贪吃蛇' };
  const list = q.gameHeat([
    { game_type: 'math24', cnt: '3' },
    { game_type: 'snake', cnt: 9 },
    { game_type: 'brand_new', cnt: 1 }
  ], names);
  s.assert.equal(list.length, 3);
  s.assert.equal(list[0].label, '单词贪吃蛇');
  s.assert.equal(list[0].count, 9);
  s.assert.equal(list[1].label, '算 24 点');
  s.assert.equal(list[2].label, 'brand_new');            // 未登记 → 原样显示，便于发现遗漏
  s.assert.deepEqual(q.gameHeat(null, names), []);
  s.assert.deepEqual(q.gameHeat([], names), []);
});

s.test('玩法热度：0 局与空 key 不进榜', () => {
  const list = q.gameHeat([{ game_type: 'snake', cnt: 0 }, { game_type: '', cnt: 5 }], {});
  s.assert.equal(list.length, 0);
});

s.test('玩法热度：同局数按名称稳定排序（避免刷新时顺序抖动）', () => {
  const a = q.gameHeat([{ game_type: 'x', cnt: 5 }, { game_type: 'y', cnt: 5 }], {});
  const b = q.gameHeat([{ game_type: 'y', cnt: 5 }, { game_type: 'x', cnt: 5 }], {});
  s.assert.deepEqual(a.map(function (r) { return r.label; }), b.map(function (r) { return r.label; }));
});

s.test('按 id 顺序重排：顺序按 ids 走，不按查询返回顺序', () => {
  const rows = [{ id: 3, n: 'c' }, { id: 1, n: 'a' }, { id: 2, n: 'b' }];
  const out = q.reorderById(rows, [1, 2, 3]);
  s.assert.deepEqual(out.map(function (r) { return r.n; }), ['a', 'b', 'c']);
});

s.test('按 id 顺序重排：id 类型不一致也要对上（2026-09-29 事故回归）', () => {
  // 原生 SQL 取顺序时 id 可能是字符串，模型返回的是数字 —— 曾有版本直接 Map.get 导致整页落空
  const rows = [{ id: 12, n: '数字' }, { id: 34, n: '另一个' }];
  const out = q.reorderById(rows, ['34', '12']);
  s.assert.equal(out.length, 2);
  s.assert.deepEqual(out.map(function (r) { return r.n; }), ['另一个', '数字']);
  // 反向：rows 里是字符串、ids 里是数字
  const out2 = q.reorderById([{ id: '7', n: 'x' }], [7]);
  s.assert.equal(out2.length, 1);
});

s.test('按 id 顺序重排：缺失的 id 跳过、脏数据不抛错', () => {
  const out = q.reorderById([{ id: 1 }], [1, 2, 3]);
  s.assert.equal(out.length, 1);
  s.assert.deepEqual(q.reorderById(null, [1]), []);
  s.assert.deepEqual(q.reorderById([{ id: 1 }], null), []);
  s.assert.deepEqual(q.reorderById([{ id: null }, { id: undefined }], [null]), []);
});

s.done();
