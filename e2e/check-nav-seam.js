/**
 * 导航栏接缝护栏
 *
 * 为什么需要它：navigationBarBackgroundColor 写在页面 .json 里，**不能写 var()**，
 * 所以设计令牌体系完全管不到它。结果是同一个「天空蓝」在 18 个 json 里被写成
 * #5aa9e6（废弃的第四套）、#4a9fe8（当前 --sky-1）、#4285F4（借来的链接色）……
 * 用户看到的是一条横向色带断层：导航栏比页面顶部浅或深，滚动时特别明显。
 *
 * 规则：navigationBarBackgroundColor 必须等于该页「页面根容器」背景的第一停止色。
 *   - 页面自己的 wxss 有根背景 → 取它的首色（支持 var() 嵌套一层层解到底）
 *   - 没有根背景 → 继承 app.wxss 的 page 背景
 *
 * 用法：node e2e/check-nav-seam.js [--report]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const REPORT = process.argv.includes('--report');

// ---------- 令牌表 ----------
const appWxss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
const TOK = {};
{
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(appWxss))) {
    const name = m[1];
    const val = m[2].trim();
    // 只收「值」类令牌（颜色 / 渐变），跳过尺寸与阴影
    if (/#[0-9a-fA-F]{3,8}|gradient|rgb/.test(val)) TOK[name] = val;
  }
}

/** 把 var(--x) 一层层解到真实色值，最多 8 层（令牌可以链式引用） */
function deref(v, depth = 0) {
  if (depth > 8) return v;
  const m = /var\((--[\w-]+)(?:\s*,[^)]*)?\)/.exec(v);
  if (!m) return v;
  const val = TOK[m[1]];
  if (!val) return v;
  return deref(v.replace(m[0], val), depth + 1);
}

/** 取出所有最内层 gradient(...) 的参数段（按括号深度配对，避免贪婪吃到下一层） */
function gradientArgs(s) {
  const out = [];
  const re = /(?:linear|radial)-gradient\(/g;
  let m;
  while ((m = re.exec(s))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < s.length && depth; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
    }
    out.push(s.slice(re.lastIndex, i - 1));
    re.lastIndex = i;
  }
  return out;
}

/** 取背景值里的第一停止色（渐变首色或纯色） */
function firstStop(raw) {
  const v = deref(raw);
  const layers = gradientArgs(v);
  // 多层背景时取「最后一层」——最上层往往是半透明高光，不是页面真正的底色
  const scope = layers.length ? layers[layers.length - 1] : v;
  // 逗号分段里，第一段通常是角度（180deg），第二段才是首色 ——
  // 所以按「第一个含色值的段」取，不能直接取 split(',')[0]。
  const seg = scope.split(',').find(s => /#[0-9a-fA-F]{3,8}|rgba?\(|var\(--/.test(s));
  if (!seg) return null;
  const c = /#[0-9a-fA-F]{3,8}\b/.exec(seg);
  if (c) return normHex(c[0]);
  const r = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(seg);
  if (r) return rgb2hex([+r[1], +r[2], +r[3]]);
  return null;
}
function normHex(h) {
  h = h.toLowerCase();
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}
function rgb2hex(a) {
  return '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---------- 找页面根容器背景 ----------
const ROOT_SEL = /^(page|\.\w*-?page|\.g-page|\.\w*-wrap|\.\w*-root|\.\w*-container)$/;
function rootBg(wxssPath) {
  if (!fs.existsSync(wxssPath)) return null;
  const src = fs.readFileSync(wxssPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const sels = m[1].trim().split(',').map(s => s.trim());
    if (!sels.some(s => ROOT_SEL.test(s))) continue;
    const body = m[2];
    if (!/(^|[;\s])background\s*:/.test(body)) continue;
    const bm = /(?:^|[;\s])background\s*:\s*([^;]+)/.exec(body);
    if (!bm) continue;
    // 跳过只写着「贴图/居中」这类不含色的 background 简写
    if (!/#|rgb|gradient|var\(--/.test(bm[1])) continue;
    return { sel: sels[0], val: bm[1].trim() };
  }
  return null;
}

// app.wxss 的默认 page 背景（没有自己根背景的页面就继承它）
const defaultBg = (rootBg(path.join(ROOT, 'app.wxss')) || {}).val || null;

// ---------- 遍历页面 ----------
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name.endsWith('.json') && e.name !== 'app.json') o.push(p);
  }
  return o;
}

const rows = [];
for (const jf of walk(ROOT)) {
  let j;
  try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { continue; }
  const base = jf.replace(/\.json$/, '');
  const bg = rootBg(base + '.wxss');
  const nav = j.navigationBarBackgroundColor ? normHex(j.navigationBarBackgroundColor) : null;
  const source = bg ? bg.val : defaultBg;
  const top = source ? firstStop(source) : null;

  let status;
  if (!nav) status = 'INHERIT';            // 没写颜色，继承 app.json，天然一致
  else if (!top) status = 'UNPARSED';      // 背景取不到色（多层背景 / 图片底），需人工
  else if (top === nav) status = 'OK';
  else status = 'SEAM';

  rows.push({
    name: path.basename(base),
    nav, top,
    sel: bg ? bg.sel : '(继承 page)',
    status
  });
}

const bad = rows.filter(r => r.status === 'SEAM');
const unparsed = rows.filter(r => r.status === 'UNPARSED');

if (REPORT || bad.length) {
  const mark = { SEAM: '✗ 接缝', UNPARSED: '? 未解析', OK: '✓', INHERIT: '– 继承' };
  for (const r of rows) {
    console.log(mark[r.status].padEnd(9) + r.name.padEnd(17) +
      'nav ' + String(r.nav || '-').padEnd(10) + 'top ' + String(r.top || '-').padEnd(10) + r.sel);
  }
  console.log('');
}

if (bad.length) {
  console.error('导航栏接缝失败：' + bad.length + ' 个页面的 navigationBarBackgroundColor 与页面背景首色不一致');
  console.error('（用户会看到一条横向色带断层。JSON 不能写 var()，只能两边写同一个值）');
  for (const r of bad) console.error('  ' + r.name + ': nav ' + r.nav + ' ≠ top ' + r.top);
  process.exit(1);
}

console.log('导航栏接缝通过：' + rows.length + ' 个页面，' +
  rows.filter(r => r.status === 'OK').length + ' 个显式对齐 · ' +
  rows.filter(r => r.status === 'INHERIT').length + ' 个继承全局' +
  (unparsed.length ? ' · ' + unparsed.length + ' 个未解析（' + unparsed.map(r => r.name).join(' / ') + '，多层背景需人工确认）' : ''));
