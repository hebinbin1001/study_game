/**
 * verify-all-pages.js —— 自动化验证全部 13 个页面可正常打开渲染、不崩溃
 *
 * 覆盖：M1（index/level/game/result/nickname）+ M2~M4（avatar/rank/
 *   wrong-book/wrong-review/level-editor/level-share/checkin/achievement）。
 *
 * 验证逻辑（复用 verify-m2m4.js 的自动化连接模式）：
 *   1. 连接微信开发者工具自动化端口（先直连，失败则执行 cli auto 后重连）
 *   2. 连接后等待项目编译完成（首次编译较慢）
 *   3. 对每个页面 reLaunch 进入，等待渲染
 *   4. 断言：当前页 path == 目标页路径（跳转成功、未因报错跳走/崩溃）
 *   5. 断言：至少一个关键元素可被 $() 取到非 null（页面结构已渲染）
 *
 * 重要前提：模拟器无微信登录态，openid 为空，后端返回 code=1001/匿名，
 *   页面大概率显示空态/提示/加载失败——这属于正常优雅降级，只要页面
 *   不崩溃、能渲染出结构（根容器/header/按钮等静态元素）即判 PASS。
 *
 * 注意：miniprogram-automator 的 Connection.send 无超时机制，若开发者工具
 *   不响应会永久挂起，故所有底层调用均用 withTimeout 包裹，避免整脚本卡死。
 *
 * 前置条件：微信开发者工具已开启服务端口（设置 → 安全设置 → 开启服务端口）
 * 运行：node e2e/verify-all-pages.js
 */
'use strict';

const { spawn } = require('child_process');
const automator = require('miniprogram-automator');

const NODE_EXE = 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\node.exe';
const CLI_JS = 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.js';
const PROJECT_PATH = 'E:\\Code\\小程序\\study_game\\miniprogram';
const AUTO_PORT = 3799;

// 每个页面的关键元素选择器：取第一个能被 $() 取到非 null 的即视为「已渲染」。
const PAGES = [
  { path: 'pages/index/index', name: 'index', query: '', selectors: ['.page-home', '.logo-area', '.logo-emoji'] },
  { path: 'pages/level/level', name: 'level', query: '', selectors: ['.page-level', '.grade-tabs'] },
  // game 页带参数进入（onLoad 缺省也有容错，带参数更接近真实路径）
  { path: 'pages/game/game', name: 'game', query: '?grade=kindergarten&level=1', selectors: ['.game-page', '.hud', '.hud-lives'] },
  { path: 'pages/result/result', name: 'result', query: '?win=1&score=120&correctCount=8&totalQ=10&grade=kindergarten&level=1', selectors: ['.page-result', '.big-stars'] },
  { path: 'pages/nickname/nickname', name: 'nickname', query: '', selectors: ['.page-nickname', '.section', '.avatar-btn'] },
  { path: 'pages/avatar/avatar', name: 'avatar', query: '', selectors: ['.page-avatar', '.rank-bar', '.section-title'] },
  { path: 'pages/rank/rank', name: 'rank', query: '', selectors: ['.page-rank', '.tabs', '.btn-back'] },
  { path: 'pages/wrong-book/wrong-book', name: 'wrong-book', query: '', selectors: ['.page-wrong-book', '.stats-bar', '.tabs'] },
  { path: 'pages/wrong-review/wrong-review', name: 'wrong-review', query: '', selectors: ['.page-wrong-review', '.progress-bar', '.completed'] },
  { path: 'pages/level-editor/level-editor', name: 'level-editor', query: '', selectors: ['.page-editor', '.editor-header', '.btn-save'] },
  { path: 'pages/level-share/level-share', name: 'level-share', query: '', selectors: ['.page-level-share', '.header', '.input-section'] },
  { path: 'pages/checkin/checkin', name: 'checkin', query: '', selectors: ['.page-checkin', '.checkin-card', '.btn-checkin'] },
  { path: 'pages/achievement/achievement', name: 'achievement', query: '', selectors: ['.page-achievement', '.header', '.achievement-list'] }
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 给底层调用加超时保护（Connection.send 无超时，可能永久挂起）
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout(' + label + ')')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(NODE_EXE, [CLI_JS, ...args], { stdio: 'ignore' });
    child.on('error', (e) => {
      console.error('spawn cli error:', e.message);
      resolve(-1);
    });
    child.on('exit', (code) => resolve(code));
  });
}

async function connectWithRetry(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` });
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1000);
    }
  }
}

async function ensureAutomation() {
  try {
    return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` });
  } catch (e) {
    console.log('  automation port not ready, running cli auto...');
  }
  await runCli(['auto', '--project', PROJECT_PATH, '--auto-port', String(AUTO_PORT)]);
  return connectWithRetry();
}

// 单页面验证
async function verifyPage(miniProgram, pageCfg) {
  const result = {
    name: pageCfg.name,
    path: pageCfg.path,
    ok: false,
    matchedSelector: null,
    detail: ''
  };

  try {
    const fullUrl = '/' + pageCfg.path + (pageCfg.query || '');
    console.log('    [launch] ' + fullUrl);
    const launched = await withTimeout(
      miniProgram.reLaunch(fullUrl),
      30000,
      'reLaunch'
    );
    await launched.waitFor(2000);

    const cur = await withTimeout(miniProgram.currentPage(), 15000, 'currentPage');
    const actualPath = cur && cur.path;

    if (actualPath !== pageCfg.path) {
      result.detail = 'path mismatch: expected ' + pageCfg.path + ', got ' + (actualPath || '(null)');
      return result;
    }

    let matched = null;
    for (const sel of pageCfg.selectors) {
      try {
        const el = await withTimeout(cur.$(sel), 8000, 'query ' + sel);
        if (el) {
          matched = sel;
          break;
        }
      } catch (e) {
        // 单个选择器超时/失败继续下一个
      }
    }

    if (!matched) {
      result.detail = 'no key element rendered (tried: ' + pageCfg.selectors.join(', ') + ')';
      return result;
    }

    result.ok = true;
    result.matchedSelector = matched;
    result.detail = 'rendered, matched element "' + matched + '"';
    return result;
  } catch (e) {
    result.detail = 'exception: ' + (e && e.message ? e.message : String(e));
    return result;
  }
}

async function main() {
  let miniProgram = null;
  let failed = 0;
  const summary = [];

  try {
    console.log('=== [1] connecting automation port ===');
    miniProgram = await ensureAutomation();
    console.log('  connected ok, waiting project compile...');
    await sleep(6000);

    console.log('=== [2] verifying ' + PAGES.length + ' pages (ALL) ===');
    for (const pageCfg of PAGES) {
      const r = await verifyPage(miniProgram, pageCfg);
      summary.push(r);
      if (r.ok) {
        console.log('  [PASS] ' + r.path + '  (' + r.detail + ')');
      } else {
        failed++;
        console.log('  [FAIL] ' + r.path + '  (' + r.detail + ')');
      }
    }
    console.log('');
  } catch (e) {
    console.error('fatal: ' + (e && e.message ? e.message : e));
    failed = PAGES.length;
  } finally {
    if (miniProgram) {
      try {
        await miniProgram.close();
      } catch (e) {
        // 忽略关闭异常
      }
    }
  }

  console.log('=== summary ===');
  const passCount = summary.filter((r) => r.ok).length;
  console.log('  passed: ' + passCount + ' / ' + PAGES.length);
  if (failed > 0) {
    console.log('  FAILED pages:');
    summary.filter((r) => !r.ok).forEach((r) => console.log('    - ' + r.path + ': ' + r.detail));
    console.log('VERDICT: FAIL');
    process.exitCode = 1;
  } else {
    console.log('VERDICT: PASS');
    process.exitCode = 0;
  }
}

main();