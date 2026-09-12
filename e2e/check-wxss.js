/**
 * check-wxss.js —— WXSS 与 app.json 的轻量静态护栏
 *
 * 背景：Node 单测不编译 WXSS，子代理写入截断导致的「缺闭合大括号」只会在微信开发者
 * 工具编译时报错（如 unexpected EOF）；本脚本在本地提前发现。
 *
 * 检查范围：miniprogram/app.wxss 与 miniprogram/pages 下所有 wxss 文件 + app.json
 * 检查项：
 *   1) 块注释的开始与结束标记是否配对；
 *   2) 去注释后花括号与圆括号是否配对；
 *   3) button 文字垂直居中（原生 button 默认 line-height 2.55555556 约 46px，
 *      写死 height 却不写 line-height 会让文字贴顶）；
 *   4) 半成品深色模式（只改 page 底色的 prefers-color-scheme: dark 媒体查询）；
 *   5) 组件按需注入必须开启（lazyCodeLoading: "requiredComponents"）。
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

// ============ 1 与 2）注释、括号配对 ============
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  const open = (src.match(/\/\*/g) || []).length;
  const close = (src.match(/\*\//g) || []).length;
  if (open !== close) {
    console.log('[FAIL] ' + rel + ': 注释不配对（' + open + ' 个开始标记 / ' + close + ' 个结束标记）');
    bad++;
    continue; // 注释不配对会让括号检查误报，跳过该文件
  }

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

// ============ 3）按钮文字垂直居中护栏（2026-09-12 用户反馈「按钮里的字靠上」）============
//
// 根因：小程序原生 button 默认 line-height 2.55555556（约 46px），而 app.wxss 里若写
// 「button.btn { line-height: inherit }」，父容器没设行高时会退化成 normal。
// 两者都会让「设了 height 但没写 line-height」的按钮文字贴顶。这里守两条：
//   ① 不允许出现 line-height: inherit/normal 的 button 规则；
//   ② app.wxss 必须保留全局 button 居中规则（display:flex + align-items:center）。
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
          + '（父级没设行高、正常行高都会让按钮文字贴顶），请改用 display:flex + align-items:center，或让 line-height 等于 height');
        bad++;
      }
    }
  }
}

// ============ 4 与 5）app.json 的两条硬要求 ============
//
// ① 深色模式：2026-09-12 真机实测，app.wxss 里曾有一段 prefers-color-scheme: dark
//    媒体查询，只把 page 底色改成近黑、文字改浅色，而各页面的卡牌 / 渐变 / 按钮全是浅色
//    主题 —— 结果「没自带背景色、依赖 page 底色」的页面在深色模式手机上整片发黑（21 个页面）。
//    这里要求：要就逐页做完整深色配色（并补深色截图回归），要就完全不做，不允许只改 page 底色。
//
// ② 按需注入：必须开启 lazyCodeLoading: "requiredComponents"。
//    · 微信官方推荐开启（文档《按需注入和用时注入》，基础库 2.11.1 起支持）；
//    · 真机调试的运行时是强制走按需注入的（开发者工具 toolkit 里的
//      features.lazyCodeLoadingForDevTool）——app.json 不开的话，编译产物里没有
//      __wxAppCode__ 映射，真机直接报 Can't find variable: __wxAppCode__，整页崩、路由失败；
//    · 开启的前提是每个页面都有 page.json：框架靠 __wxAppCode__["页面路径.json"] 找
//      usingComponents，缺 json 的页面会被解析成 wx://not-found 占位，表现就是点进去黑屏。
//      这条底线由 structure-check.js 的「页面四件套齐全」硬校验守住。
//
// 历史更正：2026-09-12 曾把真机黑屏归因于 lazyCodeLoading 并把它删掉，属误判。真正原因是
// 「页面缺 page.json」与「深色媒体查询」，两者已各自修掉；删掉按需注入反而让真机从
// 「部分页面点不进去」升级成「__wxAppCode__ 未定义、整页崩」。
{
  for (const file of files) {
    // 先剥掉注释：说明文字里会出现这句话，不能误判
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rel = path.relative(ROOT, file);
    if (/@media[^{]*prefers-color-scheme\s*:\s*dark/.test(src)) {
      console.log('[FAIL] ' + rel + ': 检测到 prefers-color-scheme: dark —— 不允许再出现「只改 page 底色」的'
        + '半成品深色模式（真机上会让没有自带背景的页面整片发黑）。'
        + '要支持深色模式请逐页做完整配色并补深色截图回归；否则请移除该媒体查询。');
      bad++;
    }
  }

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
  if (appJson.lazyCodeLoading !== 'requiredComponents') {
    console.log('[FAIL] app.json: 必须开启 lazyCodeLoading: "requiredComponents"（组件按需注入）——'
      + '关闭后真机 / 真机调试会报 Can\'t find variable: __wxAppCode__（整页崩、路由失败）；'
      + '开启前提是每个页面都有 page.json（structure-check.js 已加硬校验）。');
    bad++;
  }
}

console.log(bad === 0
  ? '全部 ' + files.length + ' 个 wxss 与 app.json 检查通过。'
  : '共发现 ' + bad + ' 处问题。');
process.exit(bad === 0 ? 0 : 1);
