/**
 * data.test.js —— 内置词库 JSON 数据完整性单测
 *
 * 覆盖（7 个 data/*.json）：
 *  - JSON 可解析、结构 { grade, count, items } 合法
 *  - 条目数与 count 字段一致，7 文件合计 1250（100/150/200/200/200/200/200）
 *  - 每条 type ∈ 8 种类型码、q/a/hint 字段齐备
 *  - w2/c2 的 q 中 * 数量与答案 a 自洽（去星字符按序与 a 对齐，星位可还原出 a）
 *
 * 运行：node tests/unit/data.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { suite } = require('./_runner');
const s = suite('data/*.json 词库数据');

const constants = require('../../miniprogram/utils/constants');
const DATA_DIR = path.join(__dirname, '../../miniprogram/data');

// 期望条目数：kindergarten 100 / primary12 150 / 其余各 200
const EXPECTED = {
  kindergarten: 100, primary12: 150, primary34: 200,
  primary56: 200, junior: 200, senior: 200, college: 200
};

function readAll() {
  const result = {};
  for (const g of constants.GRADES) {
    // 词库为 JS 模块（module.exports = {...}），直接 require 装载
    const mod = require(path.join(DATA_DIR, g.file));
    result[g.key] = { file: g.file, obj: mod, items: Array.isArray(mod) ? mod : mod.items };
  }
  return result;
}

const all = readAll();

s.test('数据文件存在且 JSON 结构合法（grade/count/items）', () => {
  for (const key of Object.keys(all)) {
    const { obj } = all[key];
    s.assert.ok(obj !== null && typeof obj === 'object', key + ' 应为对象');
    s.assert.equal(obj.grade, key, key + ' grade 字段');
    s.assert.ok(Array.isArray(obj.items), key + ' items 应为数组');
    s.assert.equal(typeof obj.count, 'number', key + ' count 应为数字');
  }
});

s.test('条目数与 count 字段一致，7 文件合计 1250', () => {
  let total = 0;
  for (const key of Object.keys(all)) {
    const { obj, items } = all[key];
    s.assert.equal(items.length, obj.count, key + ' items.length 应等于 count');
    s.assert.equal(items.length, EXPECTED[key], key + ' 条目数应为 ' + EXPECTED[key]);
    total += items.length;
  }
  s.assert.equal(total, 1250);
  // 学段 key 与 constants.GRADES 一一对应
  s.assert.equal(Object.keys(all).length, 7);
});

s.test('词条结构：type∈8种，q/a/hint 齐备，d 为字符串数组', () => {
  for (const key of Object.keys(all)) {
    for (const it of all[key].items) {
      s.assert.ok(constants.TYPE_CODES.indexOf(it.type) !== -1,
        key + ' 非法类型码: ' + JSON.stringify(it.type));
      s.assert.equal(typeof it.q, 'string', key + ' q 缺失');
      s.assert.equal(typeof it.a, 'string', key + ' a 缺失');
      s.assert.equal(typeof it.hint, 'string', key + ' hint 缺失');
      s.assert.ok(String(it.q).length > 0 && String(it.a).length > 0);
      if (it.d !== undefined) {
        s.assert.ok(Array.isArray(it.d), key + ' d 应为数组');
        for (const dd of it.d) {
          s.assert.equal(typeof dd, 'string');
        }
      }
    }
  }
});

s.test('w2/c2：q 含 * 且 q 去星后与答案 a 星位自洽（无错乱）', () => {
  const issues = [];

  // 星位对齐：遍历 q，非 * 字符必须按序等于 a 中对应字符；遇 * 时 a 前进一位；
  // 结束时 a 必须正好走完。等价于：星位字符可还原出完整答案 a。
  function alignIssue(q, a) {
    let ptr = 0;
    for (const ch of String(q)) {
      if (ch === '*') { ptr++; continue; }
      if (ptr >= String(a).length || ch !== String(a)[ptr]) {
        return { q: q, a: a, at: ptr, expect: String(a)[ptr], got: ch };
      }
      ptr++;
    }
    return ptr === String(a).length ? null : { q: q, a: a, tail: ptr, aLen: String(a).length };
  }

  for (const key of Object.keys(all)) {
    for (const it of all[key].items) {
      if (it.type !== 'w2' && it.type !== 'c2') continue;
      const q = String(it.q);
      if (q.indexOf('*') === -1) {
        issues.push({ file: key, type: it.type, q: it.q, a: it.a, why: '缺少 * 标记' });
        continue;
      }
      const iss = alignIssue(q, it.a);
      if (iss) issues.push({ file: key, type: it.type, q: it.q, a: it.a, why: JSON.stringify(iss) });
    }
  }

  if (issues.length > 0) {
    const brief = issues.slice(0, 20).map((i) =>
      '[' + i.file + ' ' + i.type + '] q=' + JSON.stringify(i.q) + ' a=' + JSON.stringify(i.a) + ' => ' + i.why
    ).join('\n    ');
    s.assert.fail('存在 ' + issues.length + ' 条 w2/c2 星位错乱条目：\n    ' + brief);
  }
});

s.test('词库不存在跨文件类型码全集缺漏（抽查题型覆盖）', () => {
  const covered = new Set();
  for (const key of Object.keys(all)) {
    for (const it of all[key].items) covered.add(it.type);
  }
  // 8 种类型码在产品级词库中至少出现一次（题型覆盖面检查）
  for (const code of constants.TYPE_CODES) {
    s.assert.ok(covered.has(code), '词库缺少类型码 ' + code);
  }
});

s.done();