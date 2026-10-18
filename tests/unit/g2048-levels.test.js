/**
 * g2048-levels.test.js —— 2048 关卡表 + 不限步数回归
 *
 * 背景（真实缺陷，两轮）：
 *   1. 原关卡表的步数预算是「线性 +6」增长（32/20 → 2048/64），而难度随目标翻倍
 *      增长 —— 1024/54、2048/64 数学上不可能通过。于是把预算改按「合并次数」模型算。
 *   2. 用户实测仍然会卡步数（2026-10-18：「留着有时候都过不了」）—— 最终拍板
 *      **取消步数硬上限**：只有棋盘无路可走才失败，步数改为评星基准 par。
 *
 * 本文件同时锁两件事：
 *   · 关卡表里不再有 steps（防回潮成「步数判负」的关卡表）；
 *   · 页面源码里不得再出现「usedSteps >= stepsLimit」这类判负，且星级必须用 par。
 *
 * 运行：node tests/unit/g2048-levels.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('2048 关卡表 / 不限步数');

const fs = require('fs');
const path = require('path');

const LEVELS = require('../../miniprogram/data/g2048-levels').levels;

/** 实战可达性下限：按「每步平均 1.5 次合并」估算需要多少步 */
function minBudget(target) {
  return Math.ceil((target / 2 - 1) / 1.5);
}

/** 理论硬下限：每步最多合并 8 次 */
function hardFloor(target) {
  return Math.ceil((target / 2 - 1) / 8);
}

s.test('关卡表可解析、14 关、每关都有 par 且不再有 steps', () => {
  s.assert.ok(LEVELS, '未能解析出 LEVELS');
  s.assert.equal(LEVELS.length, 14);
  LEVELS.forEach(function (lv, i) {
    s.assert.equal(lv.no, i + 1);
    s.assert.ok(typeof lv.par === 'number' && lv.par > 0,
      '第 ' + lv.no + ' 关缺少 3★ 参考步数 par');
    s.assert.ok(lv.steps === undefined,
      '第 ' + lv.no + ' 关还留着 steps 字段 —— 步数已取消上限，不该再有关卡步数门槛');
  });
});

s.test('par 高于「实战可达性下限」（否则 3★ 怎么玩都拿不到）', () => {
  LEVELS.forEach(function (lv) {
    const need = minBudget(lv.target);
    s.assert.ok(lv.par >= need,
      '第 ' + lv.no + ' 关（目标 ' + lv.target + '）的 3★ 基准只有 ' + lv.par
      + ' 步，低于可达性下限 ' + need + ' 步');
  });
});

s.test('par 也高于「理论硬下限」（双保险）', () => {
  LEVELS.forEach(function (lv) {
    s.assert.ok(lv.par > hardFloor(lv.target),
      '第 ' + lv.no + ' 关 3★ 基准 ' + lv.par + ' 步低于理论下限 ' + hardFloor(lv.target));
  });
});

s.test('回归：原关卡表的坏参数会被本规则拦住（说明规则有效）', () => {
  const broken = [
    { no: 5, target: 512, steps: 46 },
    { no: 6, target: 1024, steps: 54 },
    { no: 7, target: 2048, steps: 64 }
  ];
  broken.forEach(function (lv) {
    s.assert.ok(lv.steps < minBudget(lv.target),
      '目标 ' + lv.target + ' 给 ' + lv.steps + ' 步竟被认为可达？规则失效');
  });
  s.assert.ok(hardFloor(2048) > 64, '2048 的理论下限应大于 64 步');
});

s.test('难度分档：目标不降级、挑战档 par 少于同目标的入门档', () => {
  for (let i = 1; i < LEVELS.length; i++) {
    s.assert.ok(LEVELS[i].target >= LEVELS[i - 1].target, '目标数字不应回退');
  }
  const byTarget = {};
  LEVELS.forEach(function (lv) {
    (byTarget[lv.target] = byTarget[lv.target] || []).push(lv);
  });
  Object.keys(byTarget).forEach(function (t) {
    const list = byTarget[t];
    if (list.length < 2) return;
    s.assert.ok(list[0].tier === '入门' && list[1].tier === '挑战',
      '目标 ' + t + ' 的两档应依次为 入门/挑战');
    s.assert.ok(list[1].par < list[0].par,
      '目标 ' + t + ' 的挑战档 3★ 基准应低于入门档');
  });
});

s.test('页面：不再按步数判负，星级按 par 折算，HUD 显示已用步数', () => {
  const jsPath = path.join(__dirname, '../../miniprogram/pages/g2048/g2048.js');
  const src = fs.readFileSync(jsPath, 'utf8');
  // 去掉注释再查（注释里会写「不再使用 stepsLimit 判负」，直接查会误报）
  const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  s.assert.ok(!/usedSteps\s*>=\s*this\.data\.stepsLimit/.test(code),
    '页面仍在用步数上限判负 —— 用户明确要求取消步数限制');
  s.assert.ok(/this\.data\.par/.test(code), '星级应基于 3★ 参考步数 par');
  s.assert.ok(/ratio\s*<=\s*1\.5/.test(code), '星级档位应相对 par（≤1 倍 3★ / ≤1.5 倍 2★）');
  s.assert.ok(/r\.gameover/.test(code), '棋盘无路可走时仍应判负');

  const wxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/g2048/g2048.wxml'), 'utf8');
  s.assert.ok(!/剩余步/.test(wxml), 'HUD 不该再显示「剩余步」');
  s.assert.ok(/\{\{usedSteps\}\}/.test(wxml), 'HUD 应显示已用步数');
  s.assert.ok(/3★ \{\{item\.par\}\} 步/.test(wxml), '选关卡片应说明该关 3★ 步数');
});

s.done();
