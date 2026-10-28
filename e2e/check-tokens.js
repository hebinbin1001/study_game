#!/usr/bin/env node
/**
 * check-tokens.js —— 设计令牌护栏（2026-10-28，D「黏土玩具」方向配套）
 *
 * 背景：这不是「多加一条 lint」，是补上从来没有过的那道闸。
 *   改版前实测：2115 条色值 / 580 种颜色 / 45 档字号 / 24 档圆角 / 6 种页面边距，
 *   而颜色 token 一次都没被引用过。2026-10-09 的设计文档定过「色值 330 → 24」，
 *   19 天后涨到 580 —— 没有护栏的规范等于不存在，设计稿再好也会漂回去。
 *
 * 所以这里采用「只许降不许升」的基线策略，而不是「一次全清」：
 *   · 存量违规记在 e2e/tokens-baseline.json 里，默认豁免；
 *   · 任何文件的任何一类计数超过基线 → 判红（退出码 1）；
 *   · 计数低于基线 → 提示可以把基线降下来（不判红）；
 *   · 每批次改完跑 `--update` 把基线压到新的实际值，基线只会越来越小。
 *
 * 检查五项：
 *   1) 裸色值      —— 属性值里出现 #rrggbb。自定义属性（--xxx: #hex）除外，那是令牌源头。
 *   2) font-size   —— 只准 48 / 38 / 32 / 28 / 24（另允许 0，用于隐藏文字）。
 *   3) border-radius —— 只准 16 / 28 / 999rpx（另允许 0 与 50%，这两个不是「圆角档」）。
 *   4) 外部硬底边  —— box-shadow 值里出现 `0 Nrpx 0` 且不含 inset。
 *                     这是 D 方向必须消灭的写法：硬边要从「外部」搬到「内侧」。
 *                     含 inset 的一律放行（--clay-* 配方本身就是 inset）。
 *   5) 引用了不存在的变量 —— var(--x) 必须有对应的 `--x:` 定义。
 *                     这条不进基线、直接判红：未定义 100% 是笔误，或者令牌被删了。
 *                     （2026-10-28 真踩过：整张色板被撤掉，268 处 var(--surface) 变空值，
 *                      四项检查全绿，真机上只是「底色变透明」，很难定位。）
 *
 * 用法：
 *   node e2e/check-tokens.js            # 判定（CI / run-all 用这个）
 *   node e2e/check-tokens.js --report   # 只打印统计，不判定
 *   node e2e/check-tokens.js --update   # 把基线压到当前实际值（只在违规变少时用）
 *
 * 退出码：0 通过；1 有文件变差。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const BASELINE_FILE = path.join(__dirname, 'tokens-baseline.json');

const FS_OK = new Set(['48', '38', '32', '28', '24', '0']);
const R_RPX_OK = new Set(['16', '28', '999', '0']);

const KINDS = ['hex', 'fs', 'radius', 'hard'];
const KIND_LABEL = {
  hex: '裸色值',
  fs: '字号档位',
  radius: '圆角档位',
  hard: '外部硬底边'
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.wxss')) out.push(p);
  }
  return out;
}

/** 去掉块注释，同时用换行占位以保持行号不变 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * 把 wxss 拆成声明列表：[{ prop, value, line }]
 * 只取 `prop: value` 形式，不关心它在哪个选择器里 —— 四项检查都不需要选择器上下文。
 */
function decls(src) {
  const out = [];
  const re = /([-\w]+)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ prop: m[1], value: m[2].trim(), line });
  }
  return out;
}

const files = walk(MP);

// 令牌定义：先整仓扫一遍（源头主要在本块所在的 app.wxss，但组件里也可能局部定义）
const definedVars = new Set();
for (const abs of files) {
  const re = /(--[a-zA-Z0-9-]+)\s*:/g;
  const src2 = stripComments(fs.readFileSync(abs, 'utf8'));
  let mm;
  while ((mm = re.exec(src2))) definedVars.add(mm[1]);
}

// 由 JS 用行内 style 注入的动画坐标（battle-fx / game 计量表）。
// 它们本来就不该在 wxss 里定义，所以进白名单；新增这类变量时记得登记。
const RUNTIME_VARS = new Set([
  '--target-x', '--target-y', '--player-x', '--player-y',
  '--boss-dx', '--boss-dy', '--hero-start-x', '--hero-start-y',
  '--counter-x', '--counter-y', '--strike-x', '--strike-y', '--skin-color'
]);
const missingVars = [];

const stat = {};        // rel -> {hex, fs, radius, hard, samples:{kind:[line,...]}}

for (const abs of files) {
  const rel = path.relative(MP, abs).split(path.sep).join('/');
  const src = stripComments(fs.readFileSync(abs, 'utf8'));
  const s = { hex: 0, fs: 0, radius: 0, hard: 0, samples: {} };
  for (const k of KINDS) s.samples[k] = [];

  for (const d of decls(src)) {
    // 5) 引用是否有定义 —— 必须放在「跳过自定义属性」之前：
    //    --link-grad: linear-gradient(..., var(--link), ...) 这种令牌互引也要查
    const used = d.value.match(/var\(\s*--[a-zA-Z0-9-]+/g) || [];
    for (const u of used) {
      const name = /--[a-zA-Z0-9-]+/.exec(u)[0];
      if (!definedVars.has(name) && !RUNTIME_VARS.has(name)) {
        missingVars.push({ file: rel, line: d.line, name: name });
      }
    }

    // 自定义属性是令牌源头，跳过（--pri: #ff9a1f 这种是合法的）
    if (d.prop.startsWith('--')) continue;

    // 1) 裸色值
    if (/#[0-9a-fA-F]{3,8}\b/.test(d.value)) {
      s.hex++;
      if (s.samples.hex.length < 6) s.samples.hex.push(d.line);
    }

    // 2) 字号
    if (d.prop === 'font-size' || d.prop === 'font') {
      const nums = d.value.match(/(\d+(?:\.\d+)?)rpx/g) || [];
      for (const n of nums) {
        const v = n.replace('rpx', '');
        // 2026-10-28 批 5：> 48rpx 视为「图形尺寸」而不是文字档位。
        // 项目里 emoji / 大数字（.w-emoji 150、.empty-emoji 88、金币数 …）都用
        // font-size 表达图形大小，强行归到 48 会把 emoji 缩水、撑坏布局。
        // 文字（≤48rpx）仍然只准 5 档 —— 这条边界把两类混在一起的写法分开了。
        if (parseFloat(v) > 48) continue;
        if (!FS_OK.has(v)) {
          s.fs++;
          if (s.samples.fs.length < 6) s.samples.fs.push(d.line + ' (' + n + ')');
        }
      }
    }

    // 3) 圆角（可能多值：16rpx 16rpx 0 0）
    if (d.prop === 'border-radius') {
      const parts = d.value.split(/[\s/]+/).filter(Boolean);
      for (const p of parts) {
        if (p === '50%') continue;
        const mm = /^(\d+)rpx$/.exec(p);
        if (!mm) continue;               // em / % 等其它写法暂不判定
        if (!R_RPX_OK.has(mm[1])) {
          s.radius++;
          if (s.samples.radius.length < 6) s.samples.radius.push(d.line + ' (' + p + ')');
        }
      }
    }

    // 4) 外部硬底边
    // 注意：不能「值里含 inset 就整条放行」—— 像 .b-face 是
    //   `0 6rpx 0 rgba(...), inset 0 2rpx 0 rgba(...)`
    // 一条声明里同时有外部硬边和内侧高光，整条放行会漏掉真正要改的那一半。
    // 所以按逗号分段，逐段判断「这一段不含 inset 且形如 0 Nrpx 0」。
    if (d.prop === 'box-shadow') {
      const segs = d.value.split(',').map((x) => x.trim());
      const hasHard = segs.some(
        (seg) => !/inset/i.test(seg) && /(?:^|\s)0\s+\d+rpx\s+0(?![.\d])/.test(seg)
      );
      if (hasHard) {
        s.hard++;
        if (s.samples.hard.length < 6) s.samples.hard.push(d.line);
      }
    }
  }

  if (KINDS.some((k) => s[k] > 0)) stat[rel] = s;
}

const totals = {};
for (const k of KINDS) totals[k] = Object.values(stat).reduce((a, s) => a + s[k], 0);

// ============ --update：写基线 ============
if (process.argv.includes('--update')) {
  const out = {};
  for (const [rel, s] of Object.entries(stat).sort()) {
    const row = {};
    let any = false;
    for (const k of KINDS) { row[k] = s[k]; if (s[k]) any = true; }
    if (any) out[rel] = row;
  }
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    _note: '设计令牌基线：存量违规豁免额度。每次批改完用 `node e2e/check-tokens.js --update` 压到新的实际值，只许降不许升。',
    _generated: new Date().toISOString().slice(0, 10),
    totals,
    files: out
  }, null, 2) + '\n', 'utf8');
  console.log('已写入基线：' + path.relative(path.join(__dirname, '..'), BASELINE_FILE));
  console.log('  裸色值 ' + totals.hex + ' · 字号 ' + totals.fs
    + ' · 圆角 ' + totals.radius + ' · 硬底边 ' + totals.hard
    + '（共 ' + Object.keys(out).length + ' 个文件）');
  process.exit(0);
}

// ============ --report：只打印 ============
if (process.argv.includes('--report')) {
  console.log('文件数 ' + files.length + '，其中 ' + Object.keys(stat).length + ' 个有存量违规\n');
  const rows = Object.entries(stat).sort((a, b) => {
    const sa = a[1].hex + a[1].fs + a[1].radius + a[1].hard;
    const sb = b[1].hex + b[1].fs + b[1].radius + b[1].hard;
    return sb - sa;
  });
  console.log('文件'.padEnd(46) + '色值   字号  圆角  硬底边');
  for (const [rel, s] of rows.slice(0, 25)) {
    console.log(rel.padEnd(46)
      + String(s.hex).padStart(4) + String(s.fs).padStart(6)
      + String(s.radius).padStart(6) + String(s.hard).padStart(7));
  }
  if (rows.length > 25) console.log('… 另有 ' + (rows.length - 25) + ' 个文件');
  console.log('\n合计：裸色值 ' + totals.hex + ' · 字号 ' + totals.fs
    + ' · 圆角 ' + totals.radius + ' · 硬底边 ' + totals.hard);
  process.exit(0);
}

// ============ 5) 未定义变量：硬失败，不进基线 ============
// 为什么不进基线：这条不是「历史遗留待清理」，而是「现在就是坏的」。
// 未定义的自定义属性在 CSS 里会整条声明失效（不是回退成默认值），
// 表现成「底色没了 / 边框消失」，肉眼极难关联回令牌名。
if (missingVars.length) {
  console.log('[FAIL] 引用了不存在的设计令牌 ' + missingVars.length + ' 处：');
  missingVars.slice(0, 20).forEach((m) => {
    console.log('  ' + m.file + ':' + m.line + '  var(' + m.name + ')');
  });
  if (missingVars.length > 20) console.log('  … 另有 ' + (missingVars.length - 20) + ' 处');
  console.log('若是 JS 注入的动画坐标，请加进本文件的 RUNTIME_VARS 白名单。');
  process.exit(1);
}

// ============ 默认：与基线对比 ============
let baseline = { files: {} };
if (fs.existsSync(BASELINE_FILE)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
} else {
  console.log('[WARN] 还没有基线文件 ' + path.relative(path.join(__dirname, '..'), BASELINE_FILE)
    + '，先跑一次 `node e2e/check-tokens.js --update` 把存量记下来，之后护栏才开始生效。');
}

let bad = 0;
let improved = 0;

for (const [rel, s] of Object.entries(stat).sort()) {
  const base = baseline.files[rel] || {};
  const over = [];
  for (const k of KINDS) {
    const b = base[k] || 0;
    if (s[k] > b) over.push({ k, now: s[k], base: b, diff: s[k] - b });
  }
  if (over.length) {
    bad++;
    console.log('[FAIL] ' + rel);
    for (const o of over) {
      const where = s.samples[o.k].length ? ' · 行 ' + s.samples[o.k].join(', ') : '';
      console.log('        ' + KIND_LABEL[o.k] + '：基线 ' + o.base + ' → 现在 ' + o.now
        + '（多了 ' + o.diff + ' 处）' + where);
    }
    const hint = [];
    if (over.some((o) => o.k === 'hex')) hint.push('颜色改用 var(--ink/--pri/--ink-sub…)');
    if (over.some((o) => o.k === 'fs')) hint.push('字号只用 48/38/32/28/24');
    if (over.some((o) => o.k === 'radius')) hint.push('圆角只用 16/28/999rpx');
    if (over.some((o) => o.k === 'hard')) hint.push('阴影改用 var(--clay-1/2/3/card)');
    console.log('        → ' + hint.join('；'));
  }

  // 变少不判红，但提示可以压基线
  const lowered = KINDS.filter((k) => s[k] < (base[k] || 0));
  if (lowered.length && !over.length) improved++;
}

if (bad) {
  console.log('\n共 ' + bad + ' 个文件的设计令牌计数变差。'
    + '只许降不许升 —— 新增代码请直接用 app.wxss 里的 --clay-* / --fs-* / --r-* / 颜色变量。');
  process.exit(1);
}

console.log('设计令牌护栏通过：' + files.length + ' 个 wxss，'
  + '合计 裸色值 ' + totals.hex + ' · 字号 ' + totals.fs
  + ' · 圆角 ' + totals.radius + ' · 硬底边 ' + totals.hard
  + (improved ? '（有 ' + improved + ' 个文件比基线更干净，可以跑 --update 压基线）' : ''));
process.exit(0);
