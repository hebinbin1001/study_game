/**
 * check-wxss.js —— WXSS 轻量静态检查（花括号/圆括号/注释配对）
 *
 * 背景：Node 单测不编译 WXSS，子代理写入截断导致的「缺闭合 }」只会在
 *   微信开发者工具编译时报错（如 unexpected EOF）；本脚本在本地提前发现。
 *
 * 检查范围：miniprogram/app.wxss 与 miniprogram/pages 下所有 wxss 文件
 * 检查项：1) 块注释开始与结束标记配对；2) 去注释后花括号与圆括号配对平衡（含行号）。
 *
 * 用法：node e2e/check-wxss.js
 * 退出码：0 全部通过；1 存在问题（逐条打印文件与行号）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const files = [path.join(ROOT, 'app.wxss')];

const pagesDir = path.join(ROOT, 'pages');
for (const d of fs.readdirSync(pagesDir)) {
  const full = path.join(pagesDir, d);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const f of fs.readdirSync(full)) {
    if (f.endsWith('.wxss')) files.push(path.join(full, f));
  }
}

let bad = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // 1) 注释配对（/* 数量与 */ 数量必须一致）
  const open = (src.match(/\/\*/g) || []).length;
  const close = (src.match(/\*\//g) || []).length;
  if (open !== close) {
    console.log('[FAIL] ' + rel + ': 注释不配对（/*=' + open + ', */=' + close + '）');
    bad++;
    continue; // 注释不配对会让括号检查误报，跳过该文件
  }

  // 2) 去注释后花括号/圆括号配对
  const noComment = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let line = 1;
  let ok = true;
  const closer = { '}': '{', ')': '(' };
  for (let i = 0; i < noComment.length; i++) {
    const ch = noComment[i];
    if (ch === '\n') line++;
    if (ch === '{' || ch === '(') {
      stack.push({ ch, line });
    } else if (ch === '}' || ch === ')') {
      const top = stack.pop();
      if (!top || top.ch !== closer[ch]) {
        console.log('[FAIL] ' + rel + ': 第 ' + line + ' 行附近括号不匹配（多余的 ' + ch + '）');
        ok = false;
        bad++;
        break;
      }
    }
  }
  if (ok && stack.length > 0) {
    const top = stack[stack.length - 1];
    console.log('[FAIL] ' + rel + ': 有 ' + stack.length + ' 个括号未闭合（首个在第 ' + top.line + ' 行的 ' + top.ch + '）');
    bad++;
  }
}

// ============ 3) 按钮文字垂直居中护栏（2026-09-12 用户反馈「按钮里的字靠上」） ============
//
// 根因：小程序原生 <button> 默认 line-height: 2.55555556（≈46px），而 app.wxss 里曾写
// `button.btn { line-height: inherit }` —— 父容器没设行高时会退化成 normal。
// 两者都会让「设了 height 但没写 line-height」的按钮文字贴顶。
// 这里守两条：① 不许再出现 line-height: inherit/normal 的 button 规则；
//            ② app.wxss 必须保留全局 button 居中规则（display:flex + align-items:center）。
{
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const globalRule = /(^|\n)\s*button\s*\{([^}]*)\}/.exec(appSrc);
  if (!globalRule) {
    console.log('[FAIL] app.wxss: 缺少全局 button 居中规则（button { display:flex; align-items:center; }）');
    bad++;
  } else {
    const body = globalRule[2];
    if (!/display:\s*flex/.test(body) || !/align-items:\s*center/.test(body)) {
      console.log('[FAIL] app.wxss: 全局 button 规则必须同时有 display:flex 与 align-items:center（否则按钮文字会贴顶）');
      bad++;
    }
  }

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rel = path.relative(ROOT, file);
    const re = /([^{}]*button[^{}]*)\{([^{}]*)\}/gi;
    let m;
    while ((m = re.exec(src))) {
      const body = m[2];
      if (/line-height:\s*(inherit|normal)/.test(body)) {
        console.log('[FAIL] ' + rel + ': button 规则里不能用 line-height: inherit/normal'
          + '（父级没设行高/正常行高会让按钮文字贴顶），请改用 display:flex + align-items:center 或 line-height 等于 height');
        bad++;
      }
    }
  }
}

console.log(bad === 0 ? '全部 ' + files.length + ' 个 wxss 检查通过。' : '共发现 ' + bad + ' 处问题。');
process.exit(bad === 0 ? 0 : 1);
