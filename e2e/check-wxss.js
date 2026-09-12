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

// ============ 护栏：不许出现「半成品深色模式」================
//
// 踩过的坑（2026-09-12 真机实测）：app.wxss 里曾有一段 @media (prefers-color-scheme: dark)，
// 只把 page 底色改成近黑、文字改浅色，而各页面的卡片/渐变/按钮全是浅色主题 ——
// 结果 18 个「没自带背景色、依赖 page 底」的页面在深色模式手机上整片发黑，内容看不清。
// 开发者工具默认浅色，本地完全复现不出来，只能靠真机发现。
//
// 规则：要么**不做**深色模式（当前选择：卡通教育游戏统一浅色主题），
//       要么**逐页做完整深色配色**并补深色截图回归 —— 不允许只改 page 底的半成品。
{
  for (const file of files) {
    // 先剥掉注释：说明文字里会出现这句话（比如 app.wxss 里解释「为什么移除」的那段），不能误判
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rel = path.relative(ROOT, file);
    if (/@media[^{]*prefers-color-scheme\s*:\s*dark/.test(src)) {
      console.log('[FAIL] ' + rel + ': 检测到 prefers-color-scheme: dark —— 不允许再出现「只改 page 底」的'
        + '半成品深色模式（真机上会让没有自带背景的页面整片发黑）。'
        + '要支持深色模式请逐页做完整配色 + 深色截图回归；否则请移除该媒体查询。');
      bad++;
    }
  }

  // app.json 的 darkmode/themeLocation 同样是大杀器：一旦打开，微信会把导航栏与页面底
  // 按系统深色模式切换（theme.json 的 dark 变体），而页面内容是浅色的 → 真机整片发黑。
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  if (appJson.darkmode) {
    console.log('[FAIL] app.json: 不允许开启 darkmode —— 本项目统一浅色主题，'
      + '开启后系统深色模式会让没有自带背景的页面整片发黑（2026-09-12 真机踩坑）。');
    bad++;
  }
  if (appJson.themeLocation) {
    console.log('[FAIL] app.json: themeLocation 仅用于深色主题，本项目不用；请一并移除。');
    bad++;
  }

  // lazyCodeLoading（按需注入）：真机上会出现「先路由、后注册」的竞态 ——
  // 页面被解析成 wx://not-found 占位（**黑屏**），报「Component is not found」+
  // 「Page ... has not been registered yet」；开发者工具启动快，几乎复现不出来。
  // 2026-09-12 真机踩坑，已移除。本项目 35 页 / 720KB，按需注入收益很小，不要重开。
  if (appJson.lazyCodeLoading) {
    console.log('[FAIL] app.json: 不要开启 lazyCodeLoading —— 真机上会出现「页面还没注册就路由」的竞态，'
      + '表现为点进页面整片黑屏（wx://not-found 占位），而开发者工具里正常。');
    bad++;
  }
}

console.log(bad === 0 ? '全部 ' + files.length + ' 个 wxss 检查通过。' : '共发现 ' + bad + ' 处问题。');
process.exit(bad === 0 ? 0 : 1);
