/**
 * dict.test.js —— utils/dict.js 词库装载与随机抽题单测
 *
 * 覆盖：7 学段 JSON 装载、条目数正确、randomItem/randomItems 排重与空态、缓存清理。
 *
 * 运行：node tests/unit/dict.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/dict.js');

const d = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');

// 期望条目数：与任务描述一致
// 14 档的期望条目数（2026-10-08 按年级细分：旧的粗学段词库按「英语/汉字」分组各平分到各年级）
// 注：两组余数叠加，g1/g2 差 2 条是正常的（76 / 74）。
const EXPECTED = {
  kg: 100,
  g1: 76, g2: 74,
  g3: 100, g4: 100, g5: 100, g6: 100,
  g7: 67, g8: 67, g9: 66,
  g10: 67, g11: 67, g12: 66,
  college: 200
};

s.test('loadByGrade：14 档均可装载且条目数与期望一致', () => {
  for (const g of constants.GRADES) {
    d.clearCache(g.key);
    const items = d.loadByGrade(g.key);
    s.assert.equal(items.length, EXPECTED[g.key], g.key + ' 条目数应为 ' + EXPECTED[g.key]);
    s.assert.ok(Array.isArray(items));
  }
});

s.test('loadByGrade：词条结构合法（type/q/a/hint/d）', () => {
  const items = d.loadByGrade('g1');
  for (const it of items) {
    s.assert.ok(constants.TYPE_CODES.indexOf(it.type) !== -1, '非法类型码 ' + it.type);
    s.assert.equal(typeof it.q, 'string');
    s.assert.equal(typeof it.a, 'string');
    s.assert.equal(typeof it.hint, 'string');
    if (it.d !== undefined) {
      s.assert.ok(Array.isArray(it.d));
    }
  }
});

s.test('loadByGrade：未知学段与缺失文件返回空数组不抛错', () => {
  s.assert.equal(d.loadByGrade('nonexistent').length, 0);
});

s.test('findGradeConfig：命中返回配置、未命中返回 null', () => {
  const cfg = d.findGradeConfig('g10');
  s.assert.ok(cfg !== null);
  s.assert.equal(cfg.key, 'g10');
  s.assert.equal(d.findGradeConfig('nope'), null);
});

s.test('loadByGrade：结果缓存（重复装载为同一引用），clearCache 后重新装载可用', () => {
  d.clearCache('college');
  const a = d.loadByGrade('college');
  const b = d.loadByGrade('college');
  s.assert.strictEqual(a, b); // 命中 gradeCache
  d.clearCache('college');
  const c = d.loadByGrade('college');
  // 说明：Node require 对同一 JSON 路径本身有模块缓存，
  // 因此 dict.clearCache 后 loadByGrade 仍返回完整数据即可视为正常
  s.assert.equal(c.length, 200);
  s.assert.equal(typeof c[0].q, 'string');
  s.assert.equal(c[0].a.length > 0, true);
});

s.test('preloadAll：返回各学段条目数统计', () => {
  const stats = d.preloadAll();
  for (const key of Object.keys(EXPECTED)) {
    s.assert.equal(stats[key], EXPECTED[key]);
  }
});

s.test('randomItem：返回词条来自目标学段且不落入排除集', () => {
  const grade = 'kg';
  const items = d.loadByGrade(grade);
  const excludeQs = items.slice(0, 10).map((i) => i.q);
  for (let i = 0; i < 60; i++) {
    const it = d.randomItem(grade, excludeQs);
    s.assert.ok(it !== null && it !== undefined);
    s.assert.ok(excludeQs.indexOf(it.q) === -1, '抽到已排除题目 ' + it.q);
  }
});

s.test('randomItem：exclude 支持传 item 对象并按 q 匹配', () => {
  const grade = 'kg';
  const items = d.loadByGrade(grade);
  const excludeItems = items.slice(0, 5);
  for (let i = 0; i < 40; i++) {
    const it = d.randomItem(grade, excludeItems);
    s.assert.ok(excludeItems.every((x) => x.q !== it.q));
  }
});

s.test('randomItem：排除全部题目或无可用题目时返回 null', () => {
  const grade = 'kg';
  const allQs = d.loadByGrade(grade).map((i) => i.q);
  s.assert.equal(d.randomItem(grade, allQs), null);
  s.assert.equal(d.randomItem('nope', []), null);
  // 空学段（未知 key）返回 null
  d.clearCache('unknownGradeTest');
  s.assert.equal(d.randomItem('unknownGradeTest'), null);
});

s.test('randomItems：数量正确、题目互不重复、不超过词库总量', () => {
  const res = d.randomItems('g3', 7);
  s.assert.equal(res.length, 7);
  const qs = res.map((i) => i.q);
  s.assert.equal(new Set(qs).size, qs.length);
  // 请求量超过词库时返回全部条目（g1 一年级共 76 条）
  const all = d.randomItems('g1', 9999);
  s.assert.equal(all.length, 76);
  // 非法参数
  s.assert.equal(d.randomItems('g1', 0).length, 0);
  s.assert.equal(d.randomItems('nope', 5).length, 0);
});

s.done();
