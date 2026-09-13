/**
 * check-taps.js —— 「点击无响应」静态护栏
 *
 * 为什么要它（2026-09-13 用户反馈「错题在真机上点不进去学习」）：
 *   排查后发现**根本不是真机问题** —— 错题卡片刻意只绑了「移除」按钮，
 *   卡片本身压根没有点击事件，所以点题没有任何反应。
 *   这类「看着能点、点了没反应」的缺陷编译器不会报，只能靠静态检查。
 *
 * 检查项：
 *   1) bindtap / catchtap 指向的方法必须在页面 js（或该页引用的自定义组件 js）里存在 —— 缺失直接判失败；
 *   2) 提醒：带 data-id / data-key / data-i 且写了 hover-class 的元素却没有绑定点击 —— 打印出来人工确认，
 *      因为这类组合通常意味着「想做可点行但忘了绑事件」（不作为失败，避免误报模板用法）。
 *
 * 用法：node e2e/check-taps.js
 * 退出码：0 通过；1 有 bindtap 指向不存在的方法。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const PAGES_DIR = path.join(ROOT, 'pages');
const COMP_DIR = path.join(ROOT, 'components');

let fail = 0;
const warns = [];

/** 收集 wxml 里所有 static 的 bindtap/catchtap 方法名 */
function handlersIn(wxml) {
  const out = new Set();
  const re = /(?:bind|catch)tap\s*=\s*"([A-Za-z0-9_$]+)"/g;
  let m;
  while ((m = re.exec(wxml))) out.add(m[1]);
  return Array.from(out);
}

/** js 里是否存在该方法（`name: function` / `name(` / `name = function`） */
function hasMethod(js, name) {
  const pats = [
    new RegExp('\\b' + name + '\\s*:\\s*function'),
    new RegExp('\\b' + name + '\\s*\\('),
    new RegExp('\\b' + name + '\\s*=\\s*function'),
    new RegExp('\\b' + name + '\\s*=\\s*\\(')
  ];
  return pats.some(function (re) { return re.test(js); });
}

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

/** 页面 json 里 usingComponents 指向的自定义组件 js（用于跨文件找 handler） */
function usedComponentJs(pageDir, pageName) {
  const json = readIfExists(path.join(pageDir, pageName + '.json'));
  if (!json) return [];
  let cfg = null;
  try { cfg = JSON.parse(json); } catch (e) { return []; }
  const uc = (cfg && cfg.usingComponents) || {};
  const out = [];
  Object.keys(uc).forEach(function (tag) {
    const p = String(uc[tag] || '');
    // 支持 "/components/game-hud/game-hud" 与 "components/settle-pop/settle-pop"
    const rel = p.replace(/^\//, '');
    const js = path.join(ROOT, rel + '.js');
    const src = readIfExists(js);
    if (src) out.push({ tag: tag, js: src });
  });
  return out;
}

/** 检查一个 wxml（页面或组件） */
function checkOne(dir, name, kind) {
  const wxmlPath = path.join(dir, name + '.wxml');
  const wxml = readIfExists(wxmlPath);
  if (!wxml) return;
  const rel = path.relative(ROOT, wxmlPath).replace(/\\/g, '/');

  // 组件自己就是被引用的那个 js；页面则要找页面 js + 引用的组件 js
  const ownJs = readIfExists(path.join(dir, name + '.js'));
  const comps = (kind === 'page') ? usedComponentJs(dir, name) : [];

  handlersIn(wxml).forEach(function (h) {
    if (hasMethod(ownJs, h)) return;
    const hit = comps.some(function (c) { return hasMethod(c.js, h); });
    if (!hit) {
      console.log('[FAIL] ' + rel + ': bindtap/catchtap="' + h + '" 在 '
        + (kind === 'page' ? '页面 js 与引用的组件 js' : '组件 js') + ' 里都找不到 —— 点了不会有任何反应');
      fail++;
    }
  });

  // 提醒：像「可点行」但没绑事件
  const tagRe = /<([a-z-]+)\b([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(wxml))) {
    const attrs = m[2] || '';
    if (/(?:bind|catch)tap/.test(attrs)) continue;
    const hasDataId = /\bdata-(id|key|i|idx|no)\s*=/.test(attrs);
    const hasHover = /\bhover-class\s*=/.test(attrs);
    if (hasDataId && hasHover) {
      warns.push(rel + '  <' + m[1] + '> 带 data-*/hover-class 但没有 bindtap —— 确认是不是忘了绑事件');
    }
  }
}

// ---------- 页面 ----------
fs.readdirSync(PAGES_DIR).forEach(function (d) {
  const dir = path.join(PAGES_DIR, d);
  if (!fs.statSync(dir).isDirectory()) return;
  checkOne(dir, d, 'page');
});

// ---------- 自定义组件 ----------
if (fs.existsSync(COMP_DIR)) {
  fs.readdirSync(COMP_DIR).forEach(function (d) {
    const dir = path.join(COMP_DIR, d);
    if (!fs.statSync(dir).isDirectory()) return;
    checkOne(dir, d, 'component');
  });
}

console.log('');
if (warns.length) {
  console.log('提醒（' + warns.length + ' 条，不判失败，人工确认即可）：');
  warns.forEach(function (w) { console.log('  - ' + w); });
  console.log('');
}
console.log(fail === 0
  ? 'bindtap/catchtap 全部指向已存在的方法。'
  : '共发现 ' + fail + ' 处 bindtap/catchtap 指向不存在的方法。');
process.exit(fail === 0 ? 0 : 1);
