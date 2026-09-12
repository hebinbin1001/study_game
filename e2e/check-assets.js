'use strict';

/**
 * e2e/check-assets.js —— 小程序包体资源检查（静态层）
 *
 * 为什么需要它：
 *   微信小程序**主包上限 2MB**、整包（含分包）上限 20MB。美术素材（成就图标 / 段位徽章 / 皮肤）
 *   动辄每张几十上百 KB，一旦直接扔进 miniprogram/ 就会悄无声息地把包体撑爆 ——
 *   表现是「开发者工具能跑、真机预览/上传失败」，往往等到提审才发现。这个检查把包体
 *   变成流水线里的红绿灯，换素材时立刻能看见。
 *
 * 判定规则：
 *   · 单个图片 > MAX_FILE_KB（默认 60KB）→ 记一条问题；
 *   · 图片总量 > MAX_TOTAL_MB（默认 1.5MB）→ 失败；
 *   · 只统计会被打进包里的图片类型（png/jpg/jpeg/webp/gif）。
 *
 * 允许例外：miniprogram/assets-src/ 放原图（**不参与打包**），本脚本自动跳过。
 *
 * 用法：
 *   node e2e/check-assets.js          # 校验（超限非 0 退出）
 *   node e2e/check-assets.js --list   # 额外打印最大的 20 个文件
 *   node e2e/check-assets.js --warn-only  # 只警告不阻断（素材方案确认前，流水线用这个模式）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINIPROGRAM = path.join(ROOT, 'miniprogram');
const MAX_FILE_KB = 60;
const MAX_TOTAL_MB = 1.5;
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const SKIP_DIRS = ['assets-src', 'node_modules', 'miniprogram_npm'];

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.indexOf(ent.name) !== -1) return;
      walk(p, out);
      return;
    }
    if (IMG_EXT.indexOf(path.extname(ent.name).toLowerCase()) === -1) return;
    out.push({
      file: path.relative(MINIPROGRAM, p).split(path.sep).join('/'),
      size: fs.statSync(p).size,
    });
  });
}

function main() {
  const list = [];
  walk(MINIPROGRAM, list);
  list.sort((a, b) => b.size - a.size);

  const totalMB = list.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
  const oversize = list.filter((f) => f.size / 1024 > MAX_FILE_KB);

  console.log('小程序图片资源：' + list.length + ' 个文件 / ' + totalMB.toFixed(2) + ' MB');
  console.log('阈值：单张 ≤ ' + MAX_FILE_KB + 'KB、总量 ≤ ' + MAX_TOTAL_MB + 'MB（微信主包 2MB 硬限）');

  if (process.argv.indexOf('--list') !== -1) {
    console.log('');
    console.log('最大的 20 个文件：');
    list.slice(0, 20).forEach((f) => {
      console.log('  ' + (f.size / 1024).toFixed(1).padStart(8) + ' KB  ' + f.file);
    });
  }

  const problems = [];
  if (totalMB > MAX_TOTAL_MB) {
    problems.push('图片总量 ' + totalMB.toFixed(2) + ' MB，超过 ' + MAX_TOTAL_MB + 'MB');
  }
  if (oversize.length) {
    problems.push('单张超过 ' + MAX_FILE_KB + 'KB 的有 ' + oversize.length + ' 张，例如：'
      + oversize.slice(0, 3).map((f) => f.file + '(' + (f.size / 1024).toFixed(0) + 'KB)').join('、'));
  }

  if (problems.length) {
    console.log('');
    const warnOnly = process.argv.indexOf('--warn-only') !== -1;
    console.log((warnOnly ? 'WARN' : 'FAIL') + '  包体超限：');
    problems.forEach((p) => console.log('  ✗ ' + p));
    console.log('');
    console.log('怎么办（三选一，见 docs/美术素材需求与豆包提示词.md）：');
    console.log('  1) 压缩：展示尺寸导 ≤128px（单张约 10KB），原图放 assets-src/ 不参与打包；');
    console.log('  2) 云存储：图片传对象存储/CDN，端上按 URL 加载；');
    console.log('  3) 分包：把用到大图的页面拆成分包（单分包 ≤2MB、整包 ≤20MB）。');
    if (!warnOnly) process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('OK  包体在阈值内');
}

main();
