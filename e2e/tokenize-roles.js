/* 角色化令牌替换（批 6 第二部分）
 *
 * 和 tokenize-hex.js 的区别：
 *   · tokenize-hex 只做「与令牌值完全相等」的等值替换，零视觉风险；
 *   · 这个脚本做「按角色归并」—— 把同一件事写了七八种近似的值收进一个语义令牌，
 *     色值会有 2~8/255 的微小位移，肉眼不可辨，但代码里从此只有一个名字。
 *
 * 用法：
 *   node e2e/tokenize-roles.js --dry   # 只统计
 *   node e2e/tokenize-roles.js         # 写文件
 */
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');

// 角色归并表：左边是现存裸值（小写），右边是 app.wxss 里的令牌名
const MAP = {
  // ---- 深色文字：蓝调深（浅蓝天空/白卡上的标题）----
  '#2c4a6b': '--ink-deep',
  '#2f5470': '--ink-deep',
  '#2f4a7a': '--ink-deep',
  '#3a4a6b': '--ink-deep',
  // ---- 深色文字：紫调深（白卡片正文）----
  '#3b3b5f': '--ink',
  '#333a45': '--ink',
  '#3a3560': '--ink',
  // ---- 次要文字 ----
  '#4a6b8a': '--ink-sub',
  '#6d8aa5': '--ink-sub',
  '#6b87a3': '--ink-sub',
  '#40617c': '--ink-sub',
  '#3a5a80': '--ink-sub',
  // ---- 辅助文字 / 占位 / 未解锁 ----
  '#7b93ad': '--ink-weak',
  '#93a9bd': '--ink-weak',
  '#8a94a6': '--ink-weak',
  '#8899aa': '--ink-weak',
  '#a8b3c4': '--ink-weak',
  '#7d8fb0': '--ink-weak',
  '#6b7688': '--ink-weak',
  // ---- 描边 / 分隔线 ----
  '#c9d6e8': '--line',
  '#c3ccda': '--line',
  '#cfe0ee': '--line',
  '#b8c4d4': '--line',
  // ---- 卡内浅底 / 幽灵按钮底 ----
  '#eef2f8': '--surface',
  '#eef3fa': '--surface',
  '#eef5fb': '--surface',
  '#f4f8fd': '--surface',
  '#e8edf4': '--surface',
  '#eaf2ff': '--surface',
  '#f2f7fc': '--surface',
  '#f5f7fb': '--surface',
  '#e6f1fb': '--surface',
  '#f2f8fd': '--surface',
  '#f0f4fa': '--surface',
  '#eef3fd': '--surface',
  '#f7faff': '--surface',
  // ---- 语义浅底 ----
  '#fff0f0': '--soft-red',
  '#fdeef1': '--soft-red',
  '#e9fbef': '--soft-green',
  '#e6f6ea': '--soft-green',
  '#e6f7ee': '--soft-green',
  '#e7f7ec': '--soft-green',
  '#dcf6e4': '--soft-green',
  '#fff3d6': '--soft-gold',
  '#fff7e0': '--soft-gold',
  '#fff3e0': '--soft-gold',
  '#fff3e6': '--soft-gold',
  '#fff4c2': '--soft-gold',
  // ---- 蓝：操作色 / 文字 ----
  '#4285f4': '--link',
  '#3b82f6': '--link',
  '#2f80ed': '--link',
  '#2e6fd6': '--link-ink',
  '#4a90d9': '--link-ink',
  '#3f8fe0': '--sky-deep',
  '#7ec8ff': '--sky-2',
  '#b9e3ff': '--sky-3',
  '#e4f6ff': '--sky-3',
  // ---- 绿 ----
  '#2e8b57': '--green-ink',
  '#1b8f4b': '--green-ink',
  '#2f8b4d': '--green-ink',
  '#1e7a3c': '--green-ink',
  '#3f8f63': '--green-ink',
  '#2b7a4b': '--green-ink',
  '#34a853': '--green-ink',
  '#2fa96b': '--green',
  '#3fc26b': '--green',
  // ---- 橙 ----
  '#ff8f00': '--pri',
  '#ff9800': '--pri',
  '#ff8a00': '--pri',
  '#ff9f1c': '--pri',
  '#ffc53d': '--pri',
  '#e8722c': '--pri-deep',
  '#8a5a00': '--pri-ink',
  '#b07a00': '--pri-ink',
  '#b57900': '--pri-ink',
  '#b57f00': '--pri-ink',
  '#6b4e00': '--pri-ink',
  '#a96a00': '--pri-ink',
  '#b45309': '--pri-ink',
  '#a16207': '--pri-ink',
  '#fbbf24': '--gold',
  // ---- 红 ----
  '#d64545': '--danger-ink',
  '#e62e2e': '--danger-ink',
  '#b42318': '--danger-ink',
  '#a33517': '--danger-ink',
  '#ff5f6d': '--danger'
};

// 整段渐变换成一个令牌（同一段渐变在 7+ 个文件里逐字重复）
const GRAD_MAP = [
  [/linear-gradient\(135deg,\s*#4285f4,\s*#6aa6f5\)/gi, 'var(--link-grad)'],
  [/linear-gradient\(180deg,\s*var\(--sky-1\)\s*0%,\s*#7dbdf2\s*32%,\s*#b9e0ff\s*64%,\s*var\(--sky-3\)\s*100%\)/gi, 'var(--sky-grad)'],
  [/linear-gradient\(180deg,\s*#8fd0ff\s*0%,\s*#c9ecff\s*(?:55|60)%,\s*#eaf8ff\s*100%\)/gi, 'var(--sky-grad-soft)']
];

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name.endsWith('.wxss')) o.push(p);
  }
  return o;
}

let gradHits = 0;
const detail = {};
const perFile = {};
let total = 0;

for (const abs of walk('miniprogram')) {
  const rel = path.relative('miniprogram', abs).replace(/\\/g, '/');
  const src = fs.readFileSync(abs, 'utf8');

  // 逐条声明替换（跳过自定义属性声明与注释）
  // 注意：渐变必须也在「非 -- 声明」里替换。2026-10-28 第一次跑的时候渐变是全局 replace 的，
  // 结果把 app.wxss 里 --sky-grad 的定义本身换成了 var(--sky-grad) 自引用（自引用 = 无效值）。
  const masked = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  const edits = [];
  const dre = /([-\w]+)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = dre.exec(masked))) {
    if (m[1].startsWith('--')) continue;
    const valueStart = m.index + m[0].length - m[2].length;
    let val = m[2];
    let valChanged = false;

    for (const [re, to] of GRAD_MAP) {
      const next = val.replace(re, () => { gradHits++; valChanged = true; return to; });
      val = next;
    }
    if (valChanged) {
      // 整段值已经被渐变令牌替换，偏移不再对应原文，直接跳过本条的 hex 映射
      edits.push({ at: valueStart, len: m[2].length, text: val });
      continue;
    }

    const hre = /#[0-9a-fA-F]{6}\b/g;
    let hm;
    while ((hm = hre.exec(val))) {
      const token = MAP[hm[0].toLowerCase()];
      if (!token) continue;
      edits.push({ at: valueStart + hm.index, len: hm[0].length, text: 'var(' + token + ')' });
      detail[hm[0].toLowerCase() + '→' + token] = (detail[hm[0].toLowerCase() + '→' + token] || 0) + 1;
      total++;
      perFile[rel] = (perFile[rel] || 0) + 1;
    }
  }

  if (!edits.length) continue;
  if (!DRY) {
    let out = '', last = 0;
    for (const e of edits) {
      out += src.slice(last, e.at) + e.text;
      last = e.at + e.len;
    }
    out += src.slice(last);
    fs.writeFileSync(abs, out, 'utf8');
  }
}

console.log((DRY ? '[DRY] 会替换 ' : '已替换 ') + total + ' 处色值 + ' + gradHits + ' 段渐变，涉及 ' + Object.keys(perFile).length + ' 个文件');
const rows = Object.entries(detail).sort((a, b) => b[1] - a[1]);
console.log('\n前 25 条映射：');
rows.slice(0, 25).forEach(([k, v]) => console.log('  ' + k.padEnd(26) + v));
