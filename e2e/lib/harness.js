'use strict';

/**
 * e2e/lib/harness.js —— 端到端测试公共底座（流程固化）
 *
 * 为什么存在：verify-*.js 原先各自复制一份「连接自动化端口 / cli auto 兜底 /
 * 超时保护 / 报告」样板，新增一个游戏就要再抄一遍，改一处要改 N 处。
 * 这里把公共部分收敛成唯一实现，每个 verify-*.js 只写「本游戏自己的业务断言」。
 *
 * 关键设计（沿用项目既有约定，避免踩过的坑）：
 *   1. Windows 下不能直接 spawn cli.bat（Node 22 报 EINVAL），且
 *      automator.launch 内部就是 spawn cliPath —— 故统一用工具自带 node.exe
 *      执行 cli.js 的 auto 命令，再用 automator.connect 连自动化端口。
 *   2. miniprogram-automator 的 Connection.send 没有超时机制，开发者工具不响应
 *      会永久挂起 —— 所有底层调用一律走 withTimeout 包裹，避免整脚本卡死。
 *   3. 首次连接后项目要编译，需额外等待；由 compileWaitMs 控制。
 *
 * 前置条件：微信开发者工具已安装且已登录（服务端口由 cli auto 自行拉起）。
 */

const { spawn } = require('child_process');
const path = require('path');
const automator = require('miniprogram-automator');

const DEVTOOLS_DIR = 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具';
const NODE_EXE = path.join(DEVTOOLS_DIR, 'node.exe');
const CLI_JS = path.join(DEVTOOLS_DIR, 'cli.js');
const PROJECT_PATH = path.resolve(__dirname, '..', '..', 'miniprogram');
const AUTO_PORT = 3799;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/** 给无超时保护的 automator 调用加超时，防止永久挂起 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () { reject(new Error('timeout(' + label + ')')); }, ms);
  });
  return Promise.race([promise, timeout]).finally(function () { clearTimeout(timer); });
}

function runCli(args) {
  return new Promise(function (resolve) {
    const child = spawn(NODE_EXE, [CLI_JS].concat(args), { stdio: 'ignore' });
    child.on('error', function () { resolve(-1); });
    child.on('exit', function (code) { resolve(code); });
  });
}

async function connectWithRetry(retries) {
  const max = retries || 30;
  let lastErr = null;
  for (let i = 0; i < max; i++) {
    try {
      return await automator.connect({ wsEndpoint: 'ws://127.0.0.1:' + AUTO_PORT });
    } catch (e) {
      lastErr = e;
      await sleep(1000);
    }
  }
  throw lastErr || new Error('automation connect failed after ' + max + ' retries');
}

/** 连接自动化端口；未就绪则执行 cli auto 拉起后重连 */
async function ensureAutomation(options) {
  const opts = options || {};
  try {
    return await automator.connect({ wsEndpoint: 'ws://127.0.0.1:' + AUTO_PORT });
  } catch (e) {
    if (!opts.quiet) console.log('  [harness] 自动化端口未就绪，执行 cli auto ...');
  }
  await runCli(['auto', '--project', PROJECT_PATH, '--auto-port', String(AUTO_PORT)]);
  const miniProgram = await connectWithRetry();
  await sleep(opts.compileWaitMs == null ? 4000 : opts.compileWaitMs);
  return miniProgram;
}

/** reLaunch 到指定页面并等待渲染 */
async function goto(miniProgram, url, settleMs) {
  const page = await withTimeout(miniProgram.reLaunch(url), 30000, 'reLaunch ' + url);
  await page.waitFor(settleMs == null ? 1200 : settleMs);
  return page;
}

/**
 * 清掉「进关前遮罩」。
 *
 * 演变：游戏页历史上曾有 M7 形态选择层（.pick-mask/.pick-start）与 M6-L 新手引导
 * （.tutorial-mask）两层，不先过这两层引擎不启动、选项恒为 0（这是 verify-game
 * 早期失败的原因）。随后形态层先改为「关卡页模式栏」，一期改造又把三种形态整体删除，
 * 故正常情况下 .pick-start 不会再出现 —— 这里只保留兼容处理：出现就点掉，不出现即正常。
 *
 * 返回实际执行过的步骤，便于在断言里留证。
 */
async function clearGameGates(page, options) {
  const opts = options || {};
  const steps = [];

  const pickStart = await withTimeout(page.$('.pick-start'), 8000, 'query .pick-start');
  if (pickStart) {
    await withTimeout(pickStart.tap(), 8000, 'tap .pick-start');
    await page.waitFor(600);
    steps.push('形态选择层：已点 .pick-start');
  } else if (!opts.optionalPick) {
    steps.push('形态选择层：未出现（一期改造后该层已下线，属预期）');
  }

  for (let i = 0; i < 5; i++) {
    const mask = await withTimeout(page.$('.tutorial-mask'), 5000, 'query .tutorial-mask');
    if (!mask) break;
    await withTimeout(mask.tap(), 8000, 'tap .tutorial-mask');
    await page.waitFor(400);
    steps.push('新手引导：已点第 ' + (i + 1) + ' 步');
  }

  return steps;
}

/** 轮询等待某选择器数量达到期望值；超时返回 null */
async function waitForCount(page, selector, expected, timeoutMs) {
  const deadline = Date.now() + (timeoutMs == null ? 15000 : timeoutMs);
  let last = -1;
  while (Date.now() < deadline) {
    const els = await withTimeout(page.$$(selector), 8000, 'query ' + selector);
    last = els ? els.length : 0;
    if (last === expected) return els;
    await page.waitFor(400);
  }
  if (last >= 0) {
    console.log('  [harness] waitForCount(' + selector + ') 超时，实际数量 = ' + last);
  }
  return null;
}

/** 轮询等待某选择器出现；超时返回 null */
async function waitForSelector(page, selector, timeoutMs) {
  const deadline = Date.now() + (timeoutMs == null ? 15000 : timeoutMs);
  while (Date.now() < deadline) {
    const el = await withTimeout(page.$(selector), 8000, 'query ' + selector);
    if (el) return el;
    await page.waitFor(400);
  }
  return null;
}

/**
 * 轮询页面 data，直到 predicate 返回真值。
 *
 * 为什么需要它（踩坑记录）：
 *   引擎主循环把 dt 钳制在 0.05s/帧（REQ-NFR-1 保帧率），因此当渲染帧率低于
 *   20fps 时，游戏内的"游戏时间"推进速度会慢于墙上时间 —— 0.7s 的死亡动画在
 *   开发者工具里可能耗时 2s 以上。用例若用固定 page.waitFor(2200) 再断言
 *   「题号已推进」，就会随机器负载偶发假失败；更糟的是随后立刻点下一题，
 *   此时引擎仍处于 DYING，fire() 直接 return，得分/连击/浮层断言会连片失败。
 *
 *   正确做法是等「状态信号」而不是等时间。引擎在 _newQuestion() 里先置
 *   G.state = IDLE，再 emitOptions/emitHud，因此「题号 qIndex 已推进」
 *   即可安全推断引擎已回到可作答状态。
 *
 * @param {Object} page 页面对象
 * @param {Function} predicate (data) => boolean
 * @param {number} [timeoutMs=20000] 超时毫秒
 * @param {string} [label] 超时日志用的标签
 * @returns {Object|null} 命中的 data 快照；超时返回 null（不抛错）
 */
async function waitForData(page, predicate, timeoutMs, label) {
  const deadline = Date.now() + (timeoutMs == null ? 20000 : timeoutMs);
  let last = null;
  while (Date.now() < deadline) {
    last = await withTimeout(page.data(), 8000, 'data');
    let hit = false;
    try {
      hit = !!predicate(last);
    } catch (e) {
      hit = false;   // predicate 自身抛错视为未命中，继续等
    }
    if (hit) return last;
    await page.waitFor(120);
  }
  console.log('  [harness] waitForData(' + (label || '') + ') 超时，最后一次 data.qIndex='
    + (last && last.qIndex) + ' data.score=' + (last && last.score));
  return null;
}

/** 读取元素文本（元素不存在返回 null，不抛错） */
async function textOf(page, selector) {
  const el = await withTimeout(page.$(selector), 8000, 'query ' + selector);
  if (!el) return null;
  return withTimeout(el.text(), 8000, 'text ' + selector);
}

/** 断言收集器：不中断执行，最后统一汇总 */
function createChecker() {
  const results = [];
  return {
    results: results,
    check: function (label, ok, detail) {
      results.push({ label: label, ok: !!ok, detail: detail || '' });
      console.log((ok ? '   PASS  ' : '   FAIL  ') + label + (detail ? '  —— ' + detail : ''));
      return !!ok;
    }
  };
}

function failedOf(checker) {
  return checker.results.filter(function (r) { return !r.ok; });
}

function summarize(name, checker) {
  const failed = failedOf(checker);
  console.log('');
  console.log('=== ' + name + ' 汇总 ===');
  console.log('  断言 ' + checker.results.length + ' 条 · 失败 ' + failed.length + ' 条');
  failed.forEach(function (f) {
    console.log('  ✗ ' + f.label + (f.detail ? '  —— ' + f.detail : ''));
  });
  console.log('VERDICT: ' + (failed.length ? 'FAIL' : 'PASS'));
  return failed.length ? 1 : 0;
}

/**
 * 统一套件出口：连接 → 跑业务体 → 兜底关闭 → 汇总 → 设置退出码。
 * @param {string} name 套件名（用于报告）
 * @param {Function} body async (miniProgram, checker) => void
 */
async function runSuite(name, body, options) {
  const checker = createChecker();
  let miniProgram = null;
  console.log('########## ' + name + ' ##########');
  try {
    miniProgram = await ensureAutomation(options);
    await body(miniProgram, checker);
  } catch (e) {
    checker.check('脚本执行无异常', false, (e && e.message) || String(e));
  } finally {
    if (miniProgram) {
      try { await miniProgram.close(); } catch (e) { /* 关闭异常忽略 */ }
    }
  }
  process.exitCode = summarize(name, checker);
}

module.exports = {
  NODE_EXE: NODE_EXE,
  CLI_JS: CLI_JS,
  PROJECT_PATH: PROJECT_PATH,
  AUTO_PORT: AUTO_PORT,
  sleep: sleep,
  withTimeout: withTimeout,
  ensureAutomation: ensureAutomation,
  goto: goto,
  clearGameGates: clearGameGates,
  waitForCount: waitForCount,
  waitForSelector: waitForSelector,
  waitForData: waitForData,
  textOf: textOf,
  createChecker: createChecker,
  summarize: summarize,
  runSuite: runSuite
};
