'use strict';

/**
 * gen-math24-levels.js —— 生成「算 24 点」固定关卡库（开发期工具）
 *
 * 为什么用生成而不是去网上找素材：
 *   1. 版权干净：网上的题集大多没有明确授权，生成的不存在归属问题；
 *   2. 数量随意：要 60 关就 60 关，要 200 关也行；
 *   3. 难度可控：能按「是否需要分数中间结果」分档，比人工挑题更准；
 *   4. 离线内置：题库就是一个 JS 模块，体积只有几 KB。
 *
 * 生成策略：
 *   · 复用 game/math24.js 的精确有理数运算：hasSolution() 保证每关有解，
 *     hasIntegerSolution() 区分「整数中间结果可解」与「必须借助分数」；
 *   · 穷举 1~13 的全部四数组合（a≤b≤c≤d，共 1820 种）后分类挑选 ——
 *     随机采样在「必须用分数」这一档效率极低（实测 300 万次采样只凑出 16 组，
 *     而穷举证明这 16 组就是全部）；穷举只要 1 秒出头，结果还是完备的。
 *   · 三档难度：
 *       入门(1-20)：数字 1~9，整数中间结果可解（心算友好）
 *       中级(21-44)：用到 10~13，整数中间结果可解
 *       高级(45-60)：必须借助分数中间结果（如 3 3 8 8）—— 1~13 里只有 16 组，故该档 16 关
 *
 * 用法：node e2e/gen-math24-levels.js
 *      产物：miniprogram/data/math24-levels.js（覆盖写入，勿手改）
 *      校验：node miniprogram/utils/__tests__/math24-levels.test.js
 */

const fs = require('fs');
const path = require('path');

const m24 = require('../miniprogram/game/math24');

const OUT = path.resolve(__dirname, '..', 'miniprogram', 'data', 'math24-levels.js');

/**
 * 穷举 1~13 的全部四数组合并按难度分类。
 * @returns {{intsAll:Array, fracOnly:Array}}
 */
function classifyAll() {
  const intsAll = [];
  const fracOnly = [];
  for (let a = 1; a <= 13; a++) {
    for (let b = a; b <= 13; b++) {
      for (let c = b; c <= 13; c++) {
        for (let d = c; d <= 13; d++) {
          const nums = [a, b, c, d];
          if (!m24.hasSolution(nums, 24)) continue;
          const rec = { nums: nums, sum: a + b + c + d, max: d };
          if (m24.hasIntegerSolution(nums, 24)) intsAll.push(rec);
          else fracOnly.push(rec);
        }
      }
    }
  }
  return { intsAll: intsAll, fracOnly: fracOnly };
}

/** 难度排序：先看最大数字（越小越心算友好），再看数字和 */
function byMax(x, y) {
  return x.max - y.max || x.sum - y.sum;
}

const all = classifyAll();

const easyPool = all.intsAll.filter(function (r) { return r.max <= 9; });
const midPool = all.intsAll.filter(function (r) { return r.max >= 10; });
const hardPool = all.fracOnly;

// 档位大小：高级档受数学事实限制 —— 1~13 里「只能借助分数解」的组合总共只有 16 组，
// 所以把多出来的 4 关补给中级（中级候选池有 949 组，取之不尽）。
const TIERS = [
  { tier: '入门', size: 20, pool: easyPool },
  { tier: '中级', size: 24, pool: midPool },
  { tier: '高级', size: 16, pool: hardPool }
];

const levels = [];
let no = 1;
TIERS.forEach(function (t) {
  const picked = t.pool.slice().sort(byMax).slice(0, t.size);
  if (picked.length < t.size) {
    console.warn('[gen] 档位「' + t.tier + '」候选只有 ' + picked.length + ' 组（目标 ' + t.size + '）');
  }
  picked.forEach(function (rec) {
    levels.push({ no: no++, nums: rec.nums, tier: t.tier });
  });
});

// 逐关复核（生成器的产物也要验一遍，避免写出坏数据）
const seen = {};
let bad = 0;
levels.forEach(function (lv) {
  const key = lv.nums.slice().sort(function (a, b) { return a - b; }).join(',');
  if (seen[key]) {
    console.error('[gen] 第 ' + lv.no + ' 关与前面重复：' + key);
    bad++;
  }
  seen[key] = 1;
  if (!m24.hasSolution(lv.nums, 24)) {
    console.error('[gen] 第 ' + lv.no + ' 关无解：' + lv.nums.join(','));
    bad++;
  }
  if (lv.tier === '高级' && m24.hasIntegerSolution(lv.nums, 24)) {
    console.error('[gen] 第 ' + lv.no + ' 关标为高级但整数可解：' + lv.nums.join(','));
    bad++;
  }
  if (lv.tier !== '高级' && !m24.hasIntegerSolution(lv.nums, 24)) {
    console.error('[gen] 第 ' + lv.no + ' 关标为非高级但必须用分数：' + lv.nums.join(','));
    bad++;
  }
});
if (bad) {
  console.error('[gen] 存在 ' + bad + ' 条不合格数据，已终止（不写文件）');
  process.exit(1);
}

const lines = [];
lines.push('/**');
lines.push(' * data/math24-levels.js —— 算 24 点固定关卡库（' + levels.length + ' 关，自动生成，勿手改）');
lines.push(' *');
lines.push(' * 为什么固定而不是每次随机：固定关卡才能「同题复玩、比步数与星级」。');
lines.push(' * 生成与重新生成：node e2e/gen-math24-levels.js（穷举 1~13 全部四数组合并用精确求解器校验）');
lines.push(' * 关卡库校验：node miniprogram/utils/__tests__/math24-levels.test.js');
lines.push(' *');
lines.push(' * 难度分档：');
lines.push(' *   入门 —— 数字 1~9，整数中间结果即可解（心算友好）');
lines.push(' *   中级 —— 用到 10~13，整数中间结果可解');
lines.push(' *   高级 —— 必须借助分数中间结果（如 3 3 8 8）；1~13 里只有 16 组，故该档 16 关');
lines.push(' */');
lines.push('');
lines.push("'use strict';");
lines.push('');
lines.push('module.exports = {');
lines.push("  label: '算 24 点',");
lines.push('  total: ' + levels.length + ',');
lines.push('  levels: [');
levels.forEach(function (lv) {
  lines.push("    { no: " + lv.no + ", nums: [" + lv.nums.join(', ') + "], tier: '" + lv.tier + "' },");
});
lines.push('  ]');
lines.push('};');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('[gen] 候选池：整数可解 ' + all.intsAll.length + ' 组（其中 max≤9 的 ' + easyPool.length
  + ' 组）· 仅分数可解 ' + all.fracOnly.length + ' 组');
console.log('[gen] 已写出 ' + levels.length + ' 关 → ' + OUT);
const byTier = {};
levels.forEach(function (lv) { byTier[lv.tier] = (byTier[lv.tier] || 0) + 1; });
console.log('[gen] 分档统计：' + JSON.stringify(byTier));
