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
 * 判定规则（微信限制的是**整包体积**，所以这里按全部会打包的文件算）：
 *   · **单个图片/音频 > MAX_FILE_KB（200KB，用户 2026-09-12 明确的硬限）→ 失败**；
 *     这是平台侧的单文件上限，跟整包体积是两件事，必须单独守；
 *   · 单个图片 > SOFT_IMAGE_KB（60KB）→ 只提醒不失败（超出会让整包迅速膨胀，
 *     建议按展示尺寸压；原图放 assets-src/ 不参与打包）；
 *   · 整包（代码 + 模板 + 样式 + 词库 + 图片）> MAX_PACKAGE_MB（默认 1.8MB）→ 失败；
 *     留 0.2MB 余量给微信自己的注入内容，别贴着 2MB 上限跑。
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
// 用户 2026-09-12 明确要求：图片和音频单个文件都不能超过 200KB（平台硬限）
const MAX_FILE_KB = 200;
// 项目自留的更严目标：图片压到 60KB 以内，整包才留得住余量（只提醒，不阻断）
const SOFT_IMAGE_KB = 60;
const MAX_PACKAGE_MB = 1.8;
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.flac', '.amr'];
// 只跳过工具自己生成的依赖目录；其余一律按「会被打进包」来算。
// 单测已搬到仓库根 tests/unit（2026-09-12），打包目录里不该再有 __tests__ / assets-src，
// 真出现了会被下面的「打包目录纯净度」护栏直接判红，不再靠 ignore 规则掩盖。
const SKIP_DIRS = ['node_modules', 'miniprogram_npm'];
// 不参与打包的文件（与微信开发者工具的忽略规则对齐）
const SKIP_FILES = ['.gitignore', 'project.private.config.json', 'project.config.json'];
// 打包目录里不该出现的开发物（约定：测试/工具/原图一律放打包路径以外）
const FORBIDDEN_IN_PACKAGE = [
  { re: /(^|\/)__tests__(\/|$)/, why: '测试目录（单测已统一放在仓库根 tests/unit）' },
  { re: /\.test\.js$/, why: '测试文件' },
  { re: /(^|\/)assets-src(\/|$)/, why: '美术原图目录（应放仓库根 assets-src/，不参与打包）' },
  { re: /(^|\/)(e2e|demo|tools)(\/|$)/, why: '工具/演示目录（应放打包路径以外）' }
];

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.indexOf(ent.name) !== -1) return;
      walk(p, out);
      return;
    }
    const rel = path.relative(MINIPROGRAM, p).split(path.sep).join('/');
    if (SKIP_FILES.indexOf(ent.name) !== -1) return;
    out.push({
      file: rel,
      size: fs.statSync(p).size,
      isImage: IMG_EXT.indexOf(path.extname(ent.name).toLowerCase()) !== -1,
      isAudio: AUDIO_EXT.indexOf(path.extname(ent.name).toLowerCase()) !== -1,
    });
  });
}

function main() {
  const list = [];
  walk(MINIPROGRAM, list);
  list.sort((a, b) => b.size - a.size);

  const images = list.filter((f) => f.isImage);
  const audios = list.filter((f) => f.isAudio);
  const totalMB = list.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
  const imageMB = images.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
  const audioMB = audios.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
  // 硬限：图片 + 音频一起算（用户口径「图片和音频不超过 200K」）
  const oversized = list.filter((f) => (f.isImage || f.isAudio) && f.size / 1024 > MAX_FILE_KB)
    .sort((a, b) => b.size - a.size);
  // 软提醒：只有图片（音频没法"按展示尺寸压"，提示也没意义）
  const soft = images.filter((f) => f.size / 1024 > SOFT_IMAGE_KB).sort((a, b) => b.size - a.size);

  console.log('打包体积估算：' + list.length + ' 个文件 / ' + totalMB.toFixed(2) + ' MB'
    + '（其中图片 ' + images.length + ' 张 / ' + imageMB.toFixed(2) + ' MB'
    + '、音频 ' + audios.length + ' 个 / ' + audioMB.toFixed(2) + ' MB）');
  console.log('阈值：单个图片/音频 ≤ ' + MAX_FILE_KB + 'KB（硬限）、整包 ≤ ' + MAX_PACKAGE_MB + 'MB'
    + '（微信主包 2MB 硬限）、图片建议 ≤ ' + SOFT_IMAGE_KB + 'KB');

  if (process.argv.indexOf('--list') !== -1) {
    console.log('');
    console.log('最大的 20 个文件：');
    list.slice(0, 20).forEach((f) => {
      console.log('  ' + (f.size / 1024).toFixed(1).padStart(8) + ' KB  ' + f.file);
    });
  }

  const problems = [];
  if (totalMB > MAX_PACKAGE_MB) {
    problems.push('整包 ' + totalMB.toFixed(2) + ' MB，超过 ' + MAX_PACKAGE_MB + 'MB');
  }
  if (oversized.length) {
    problems.push('单个文件超过 ' + MAX_FILE_KB + 'KB 的有 ' + oversized.length + ' 个（图片/音频都不能超），例如：'
      + oversized.slice(0, 3).map((f) => f.file + '(' + (f.size / 1024).toFixed(0) + 'KB)').join('、'));
  }
  // 打包目录纯净度（2026-09-12 用户要求）：miniprogram/ 只放会被打进包的运行时代码，
  // 测试/工具/原图/演示一律放打包路径以外 —— 靠 ignore 规则「眼不见为净」不算数。
  const forbidden = list.filter(function (f) {
    return FORBIDDEN_IN_PACKAGE.some(function (r) { return r.re.test(f.file); });
  });
  if (forbidden.length) {
    problems.push('打包目录里混入了 ' + forbidden.length + ' 个开发文件（应放打包路径以外），例如：'
      + forbidden.slice(0, 4).map(function (f) { return f.file; }).join('、'));
  }

  if (soft.length) {
    console.log('');
    console.log('提示：有 ' + soft.length + ' 张图片超过建议值 ' + SOFT_IMAGE_KB + 'KB（不阻断，但会让整包迅速变大）：');
    soft.slice(0, 5).forEach((f) => {
      console.log('  ' + (f.size / 1024).toFixed(1).padStart(8) + ' KB  ' + f.file);
    });
  }

  if (problems.length) {
    console.log('');
    const warnOnly = process.argv.indexOf('--warn-only') !== -1;
    console.log((warnOnly ? 'WARN' : 'FAIL') + '  包体超限：');
    problems.forEach((p) => console.log('  ✗ ' + p));
    console.log('');
    console.log('怎么办（三选一，见 docs/美术素材需求与豆包提示词.md）：');
    console.log('  1) 压缩：python e2e/compress-assets.py（原图放 assets-src/ 不参与打包）；');
    console.log('  2) 云存储：图片传对象存储/CDN，端上按 URL 加载；');
    console.log('  3) 分包：把用到大图的页面拆成分包（单分包 ≤2MB、整包 ≤20MB）。');
    if (!warnOnly) process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('OK  包体在阈值内');
}

main();
