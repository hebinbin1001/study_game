#!/usr/bin/env node
/**
 * tokenize-hex.js —— 把「与令牌值完全相同」的裸色值替换成 var(--token)
 *
 * 为什么单独做这一步（2026-10-28 · 批 5）：
 *   令牌护栏（check-tokens.js）只管「有没有写裸色值」，但一次性把 1710 处色值
 *   全部改成语义令牌是不现实的 —— 527 种颜色里有大量「近似但不等」的野值，
 *   逐个判断语义等于重做一遍设计。
 *
 *   所以先做零风险的那一半：**只替换与令牌完全等值的 hex**。
 *   颜色一个像素都不变，只是从「#fff」变成「var(--white)」，让后面的语义收口
 *   只剩真正的野值。这一步可以无脑跑，不需要 review 每一行。
 *
 * 不处理的部分（故意留给人工）：
 *   · 近似值（#ffb703 vs --pri #ff9a1f）—— 改了就变颜色，属设计决策；
 *   · 没有对应令牌的色值（#4285f4 / #2e8b57 …）—— 先决定它属于哪个角色；
 *   · 3/4 位简写的透明色（#fff0、#0008）—— 半透明，没有对应令牌。
 *
 * 用法：
 *   node e2e/tokenize-hex.js --dry    # 只报告会改多少处，不写文件
 *   node e2e/tokenize-hex.js          # 真改
 *
 * 跳过：注释行、自定义属性声明行（那是令牌源头）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');

/** 与 app.wxss 末尾令牌块严格等值 —— 加新令牌时这里要同步 */
const MAP = {
  '#ffffff': '--white',
  '#fff': '--white',
  '#3a3a5c': '--ink',
  '#5c7f9e': '--ink-sub',
  '#8a9bb5': '--ink-weak',
  '#2f4a6b': '--ink-deep',
  '#ff9a1f': '--pri',
  '#d97c00': '--pri-deep',
  '#a26a00': '--pri-ink',
  '#4a9fe8': '--sky-1',
  '#8fcbf7': '--sky-2',
  '#d8efff': '--sky-3',
  '#3b8bd6': '--sky-deep',
  '#4cc9f0': '--blue',
  '#3fbf5f': '--green',
  '#ff5d8f': '--pink',
  '#b388ff': '--purple',
  '#ffd166': '--gold',
  '#ff5a5a': '--danger'
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.wxss')) out.push(p);
  }
  return out;
}

const dry = process.argv.includes('--dry');
const files = walk(MP);
const perFile = {};
let total = 0;

for (const abs of files) {
  const rel = path.relative(MP, abs).split(path.sep).join('/');
  const src = fs.readFileSync(abs, 'utf8');
  let n = 0;

  const out = src.split('\n').map(function (line) {
    const t = line.trim();
    // 注释行 / 令牌声明行原样保留
    if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('--') || t.startsWith('//')) return line;

    return line.replace(/#[0-9a-fA-F]{3,8}\b/g, function (hex) {
      const token = MAP[hex.toLowerCase()];
      if (!token) return hex;
      n++;
      return 'var(' + token + ')';
    });
  }).join('\n');

  if (n) {
    perFile[rel] = n;
    total += n;
    if (!dry) fs.writeFileSync(abs, out, 'utf8');
  }
}

const rows = Object.entries(perFile).sort((a, b) => b[1] - a[1]);
console.log((dry ? '[DRY] 会替换 ' : '已替换 ') + total + ' 处裸色值，涉及 ' + rows.length + ' 个文件：');
for (const [rel, n] of rows.slice(0, 20)) console.log('  ' + String(n).padStart(4) + '  ' + rel);
if (rows.length > 20) console.log('  … 另有 ' + (rows.length - 20) + ' 个文件');

// 换完之后再扫一遍：还有多少处是「能映射但没映射」（脚本自身漏了）——
// 正常情况应该是 0，不为 0 说明 MAP 只覆盖了一部分写法。
if (!dry) {
  let left = 0;
  for (const abs of files) {
    fs.readFileSync(abs, 'utf8').split('\n').forEach(function (line) {
      const t = line.trim();
      if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('--')) return;
      (line.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(function (h) {
        if (MAP[h.toLowerCase()]) left++;
      });
    });
  }
  console.log('\n复查：仍有 ' + left + ' 处可映射未替换' + (left ? '（MAP 漏了写法，请检查）' : '（OK）'));
}
