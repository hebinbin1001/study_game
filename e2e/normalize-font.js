/* 字号档位归一：只动 <=48rpx 的 font-size（>48 视为图形尺寸，护栏已放行）
 * 就近档位：18/19/20/21/22/23→24  25/26/27→28  30/34→32  36/40/42→38  44/46→48
 * 用法：node e2e/normalize-font.js [--dry]
 * 说明：用「等长屏蔽注释 + 按偏移回写」的方式，能处理单行多条声明（`{ font-size:22rpx; … }`）。
 */
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const OK = new Set(['48', '38', '32', '28', '24', '0']);

function pick(v) {
  if (v <= 23) return 24;
  if (v <= 27) return 28;
  if (v <= 34) return 32;
  if (v <= 42) return 38;
  if (v <= 48) return 48;
  return null; // >48 不动
}

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name.endsWith('.wxss')) o.push(p);
  }
  return o;
}

let total = 0;
const detail = {};
const perFile = {};
const odd = [];

for (const abs of walk('miniprogram')) {
  const rel = path.relative('miniprogram', abs).replace(/\\/g, '/');
  const src = fs.readFileSync(abs, 'utf8');
  // 注释等长屏蔽，保证偏移与原文一致
  const masked = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  const edits = [];
  const re = /(^|[;{}\n])(\s*)(-{0,1}[a-zA-Z][-\w]*)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(masked))) {
    const prop = m[3];
    if (prop.startsWith('--')) continue;
    if (prop !== 'font-size' && prop !== 'font') continue;
    const val = m[4];
    // 值的起点：用整条匹配长度倒推（m[0] 覆盖「分隔符+空白+属性名+冒号+值」），
    // 不这么算就会差 2 个字符 —— 2026-10-28 就是因为按「属性名之后」取起点，
    // 把 520 处 font-size 写成了 font-size24rpxpx（详见 check-wxss.js 第 7 条）。
    const valStart = m.index + m[0].length - val.length;
    const vre = /(\d+(?:\.\d+)?)rpx/g;
    let vm;
    while ((vm = vre.exec(val))) {
      const raw = vm[1];
      const v = parseFloat(raw);
      if (OK.has(String(v))) continue;
      if (v < 10) odd.push(rel + ' :: ' + src.slice(valStart, valStart + 40).replace(/\n/g, ' ⏎ '));
      const to = pick(v);
      if (to === null) continue;
      const at = valStart + vm.index;
      edits.push({ at: at, len: raw.length + 3, text: to + 'rpx' });
      detail[raw + '→' + to] = (detail[raw + '→' + to] || 0) + 1;
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

console.log((DRY ? '[DRY] 会改 ' : '已改 ') + total + ' 处，涉及 ' + Object.keys(perFile).length + ' 个文件');
console.log('\n映射明细：');
Object.entries(detail)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log('  ' + k.padEnd(10) + v));
if (odd.length) {
  console.log('\n可疑（<10rpx）：');
  odd.slice(0, 10).forEach(x => console.log('  ' + x));
}
