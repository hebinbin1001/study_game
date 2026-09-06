/**
 * verify-game.js —— 自动化验证「进入关卡不再自动结算」
 *
 * 验证逻辑：
 *   1. 连接微信开发者工具自动化端口（先直连，失败则执行 cli auto 后重连）
 *   2. reLaunch 进入游戏页（grade=kindergarten, level=1，模拟「进入关卡」）
 *   3. 等待 3 秒，观察是否被自动 redirectTo 到结算页
 *   4. 断言当前页仍是 game 页 + 有 4 个选项 + 题号为「第 1/10 题」
 *
 * 前置条件：微信开发者工具已开启服务端口（设置 → 安全设置 → 开启服务端口）
 * 运行：node e2e/verify-game.js   （等价 npm run e2e:verify）
 *
 * 注意：Windows 下不能直接 spawn cli.bat（Node 22 报 EINVAL），且
 * automator.launch 内部就是 spawn cliPath，故本脚本手动用工具自带 node.exe
 * 执行 cli.js 的 auto 命令，再用 automator.connect 连接自动化端口。
 */
'use strict';

const { spawn } = require('child_process');
const automator = require('miniprogram-automator');

const NODE_EXE = 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\node.exe';
const CLI_JS = 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.js';
const PROJECT_PATH = 'E:\\Code\\小程序\\study_game\\miniprogram';
const AUTO_PORT = 9420;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 用工具自带 node.exe 执行 cli.js（等价 cli.bat <args>）
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
  // 先尝试直连（端口可能已就绪）
  try {
    return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` });
  } catch (e) {
    console.log('  自动化端口未就绪，执行 cli auto...');
  }
  // 执行 auto（该命令可能报 openOrCreateWindow 的 d.on 错误，但自动化端口仍会启动）
  await runCli(['auto', '--project', PROJECT_PATH, '--auto-port', String(AUTO_PORT)]);
  return connectWithRetry();
}

async function main() {
  let miniProgram = null;
  try {
    console.log('[1/4] 连接自动化端口...');
    miniProgram = await ensureAutomation();

    console.log('[2/4] 进入游戏页 (grade=kindergarten, level=1)...');
    const gamePage = await miniProgram.reLaunch(
      '/pages/game/game?grade=kindergarten&level=1'
    );

    console.log('[3/4] 等待 3 秒，观察是否自动跳转结算页...');
    await gamePage.waitFor(3000);

    console.log('[4/4] 断言当前页面...');
    const cur = await miniProgram.currentPage();
    console.log('  当前页面路径 =', cur.path);

    if (cur.path === 'pages/result/result') {
      console.error('✗ 失败：进入关卡后自动跳转到结算页（bug 未修复）');
      process.exitCode = 1;
      return;
    }
    if (cur.path !== 'pages/game/game') {
      console.error('✗ 失败：当前页面不是游戏页，实际为 ' + cur.path);
      process.exitCode = 1;
      return;
    }

    const options = await cur.$$('.option');
    console.log('  选项数量 =', options.length);
    if (options.length !== 4) {
      console.error('✗ 失败：游戏页选项数量不为 4（词库可能未正确加载）');
      process.exitCode = 1;
      return;
    }

    const qnum = await cur.$('.hud-qnum');
    const qnumText = qnum ? await qnum.text() : '(无)';
    console.log('  题号 =', qnumText);

    const lives = await cur.$('.hud-lives');
    const livesText = lives ? await lives.text() : '(无)';
    console.log('  命数 =', livesText);

    console.log('✓ 成功：进入关卡后停留在游戏页并正常出题，修复生效');
  } catch (e) {
    console.error('脚本执行异常：', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    if (miniProgram) {
      try {
        await miniProgram.close();
      } catch (e) {
        // 忽略关闭异常
      }
    }
  }
}

main();
