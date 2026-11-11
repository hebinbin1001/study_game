'use strict';

/**
 * e2e/tab-icons.js —— tabBar 图标换图工具（D8）
 *
 * 背景：微信官方要求 tabBar 图标 **81×81**（3x 屏下按 81px 物理像素绘制）。
 * 2026-09-12 起包内 `miniprogram/assets/tab/*.png` 一直是 36×36，真机放大约 2.25 倍会糊；
 * 仓库里没有现版设计的高分辨率原图（assets-src 里是三套不同的设计，见 D8 记录），
 * 所以换图要等设计按现版重新导出。**图一到，跑这一条命令即可换掉全部 8 张**。
 *
 * 用法：
 *   node e2e/tab-icons.js --check                     # 只看包内 8 张当前尺寸/体积
 *   node e2e/tab-icons.js --src=<目录>                # 从目录导入并统一成 81×81 写回包内
 *   node e2e/tab-icons.js --src=<目录> --out=<目录>   # 写到别的目录（自测/预览用）
 *   node e2e/tab-icons.js --src=<目录> --dry          # 只校验不写盘
 *
 * 源文件命名（大小写与分隔符都宽松，只要含 tab + home/play/study/me|mine + 可选 on/off）：
 *   tab-home-on.png   tab-home-off.png
 *   tab-play-on.png   tab-play-off.png
 *   tab-study-on.png  tab-study-off.png
 *   tab-me-on.png     tab-me-off.png        （也接受 tab-mine-* / 不带 on/off 的写法）
 * 支持 png / jpg / webp；**非正方形会先居中裁剪成正方形**再缩到 81×81；
 * 原图小于 81×81 会直接报错（放大没有意义，等于没换）。
 *
 * 写回后自动跑一次 `node e2e/check-assets.js` 校验包体红线（图片+音频总量 ≤200KB）。
 */

const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_DIR = path.join(ROOT, 'miniprogram', 'assets', 'tab');
const TARGET = 81;

/** 包内 8 张的规范文件名（与 app.json tabBar 一一对应） */
const CANONICAL = [
  { out: 'tab-home.png', tab: 'home', state: 'on' },
  { out: 'tab-home-off.png', tab: 'home', state: 'off' },
  { out: 'tab-play.png', tab: 'play', state: 'on' },
  { out: 'tab-play-off.png', tab: 'play', state: 'off' },
  { out: 'tab-study.png', tab: 'study', state: 'on' },
  { out: 'tab-study-off.png', tab: 'study', state: 'off' },
  { out: 'tab-me.png', tab: 'me', state: 'on' },
  { out: 'tab-me-off.png', tab: 'me', state: 'off' }
];

function parseArgs(argv) {
  const opts = { src: null, out: PACKAGE_DIR, check: false, dry: false };
  argv.forEach((a) => {
    if (a === '--check') opts.check = true;
    else if (a === '--dry') opts.dry = true;
    else if (a.startsWith('--src=')) opts.src = a.slice('--src='.length);
    else if (a.startsWith('--out=')) opts.out = path.resolve(a.slice('--out='.length));
  });
  return opts;
}

/** 读 PNG 宽高（不依赖图片库；文件不是 PNG 返回 null） */
function pngSize(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length < 24) return null;
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch (e) {
    return null;
  }
}

function listByExt(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => exts.indexOf(path.extname(f).toLowerCase()) !== -1)
    .map((f) => path.join(dir, f));
}

/** --check：只看包内 8 张现状 */
function check() {
  console.log('包内 tabBar 图标（' + PACKAGE_DIR + '）：');
  let ok = 0;
  let bad = 0;
  CANONICAL.forEach((c) => {
    const file = path.join(PACKAGE_DIR, c.out);
    if (!fs.existsSync(file)) {
      console.log('  ✗ 缺文件 ' + c.out);
      bad++;
      return;
    }
    const size = pngSize(file);
    const kb = (fs.statSync(file).size / 1024).toFixed(1);
    const good = size && size.width === TARGET && size.height === TARGET;
    if (good) ok++; else bad++;
    console.log('  ' + (good ? '✓' : '✗') + ' ' + c.out.padEnd(18)
      + (size ? size.width + '×' + size.height : '非 PNG') + '  ' + kb + 'KB'
      + (good ? '' : '（官方要求 ' + TARGET + '×' + TARGET + '）'));
  });
  console.log('');
  console.log('合计：' + ok + ' 张合规 / ' + bad + ' 张待换');
  if (bad) {
    console.log('换图：node e2e/tab-icons.js --src=<81×81 源图目录>（源文件命名见文件头注释）');
    process.exitCode = 1;
  }
}

/** 把文件名拆成小写 token（按非字母数字切分），避免用 substring 把 home 里的 "me" 认成 me */
function tokensOf(file) {
  const base = path.basename(file, path.extname(file)).toLowerCase();
  return base.split(/[^a-z0-9]+/).filter(Boolean);
}

/** 在源目录里找某个 tab + 状态的源文件（命名宽松，但按 token 匹配，不按子串） */
function findSource(files, tab, state) {
  const alias = { me: ['me', 'mine', 'user', 'profile'] }[tab] || [tab];
  const onWords = ['on', 'active', 'selected', 'open', 'yes'];
  const offWords = ['off', 'inactive', 'normal', 'closed', 'gray', 'grey', 'no', 'disabled'];
  const candidates = files.filter((f) => {
    const toks = tokensOf(f);
    if (!toks.includes('tab')) return false;
    return alias.some((a) => toks.includes(a));
  });
  if (!candidates.length) return null;
  if (state === 'off') {
    const hit = candidates.find((f) => tokensOf(f).some((t) => offWords.includes(t)));
    return hit || null;
  }
  // on：优先显式 on 词；其次「没有 off 词」的裸名（默认就是 on）
  const explicit = candidates.find((f) => tokensOf(f).some((t) => onWords.includes(t)));
  if (explicit) return explicit;
  return candidates.find((f) => !tokensOf(f).some((t) => offWords.includes(t))) || null;
}

async function importIcons(opts) {
  const srcDir = path.resolve(opts.src);
  if (!fs.existsSync(srcDir)) {
    throw new Error('源目录不存在：' + srcDir);
  }
  const files = listByExt(srcDir, ['.png', '.jpg', '.jpeg', '.webp']);
  console.log('源目录：' + srcDir + '（' + files.length + ' 个图片文件）');
  if (!files.length) throw new Error('源目录里没有图片文件');

  const plan = [];
  const problems = [];
  CANONICAL.forEach((c) => {
    const src = findSource(files, c.tab, c.state);
    if (!src) { problems.push('找不到 ' + c.out + ' 的源图（tab=' + c.tab + ', state=' + c.state + '）'); return; }
    plan.push({ src: src, out: c.out });
  });
  if (problems.length) {
    throw new Error('源图不全：\n  ' + problems.join('\n  '));
  }

  // 校验 + 处理
  const results = [];
  for (const item of plan) {
    const img = await Jimp.read(item.src);
    if (img.bitmap.width < TARGET || img.bitmap.height < TARGET) {
      throw new Error(item.src + ' 只有 ' + img.bitmap.width + '×' + img.bitmap.height
        + '，小于 ' + TARGET + '×' + TARGET + '（放大会糊，等于没换，请让设计导出更大尺寸）');
    }
    // 非正方形先居中裁剪成正方形，再缩到 81×81
    const side = Math.min(img.bitmap.width, img.bitmap.height);
    const x = Math.floor((img.bitmap.width - side) / 2);
    const y = Math.floor((img.bitmap.height - side) / 2);
    const square = img.clone().crop(x, y, side, side);
    const out = square.resize(TARGET, TARGET, Jimp.RESIZE_BICUBIC);
    results.push({ item: item, img: out });
  }

  if (opts.dry) {
    console.log('（--dry 干跑，不写盘）将写出的文件：');
    results.forEach((r) => console.log('  ' + r.item.src.split(path.sep).pop() + ' → ' + r.item.out));
    return;
  }

  const outDir = opts.out;
  fs.mkdirSync(outDir, { recursive: true });
  for (const r of results) {
    const dest = path.join(outDir, r.item.out);
    await r.img.writeAsync(dest);
    console.log('  ✓ ' + path.basename(r.item.src) + ' → ' + dest
      + '（' + (fs.statSync(dest).size / 1024).toFixed(1) + 'KB）');
  }
  console.log('已写入 ' + results.length + ' 张到 ' + outDir);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.check || !opts.src) {
    check();
    if (!opts.src) {
      console.log('');
      console.log('提示：要换图请传 --src=<目录>；只查看现状直接跑 --check。');
    }
    return;
  }
  await importIcons(opts);
}

main().catch((e) => {
  console.error('失败：' + (e && e.message));
  process.exitCode = 1;
});
