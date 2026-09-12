'use strict';

/**
 * e2e/lib/devtools.js —— 微信开发者工具定位与进程控制（唯一实现）
 *
 * 为什么存在：
 *   1. 开发者工具的安装路径原先散落在 harness.js 里，run-all.js 想「开跑前
 *      重启工具」就得再抄一份路径 —— 收敛到这里，全流程只有一处。
 *   2. 踩过的坑：上一轮 E2E 被中断（Ctrl+C / 超时被杀）后，工具会停在
 *      中断时那个页面；下一次 cli auto 只是「复用」已经开着的工具，不会
 *      重新打开项目，于是第一个阶段读到的还是上一轮遗留页面，报出
 *      「实际路径 = pages/link/link」这类假失败，后续阶段还会被带崩。
 *      解法：整轮 E2E 开跑前先 quit 一次，强迫下一个 cli auto 拉起干净的
 *      工具与新编译的项目。
 *
 * Windows 注意：不能直接 spawn cli.bat（Node 22 报 EINVAL），一律用工具
 * 自带的 node.exe 执行 cli.js（automator.launch 内部也是这么做的）。
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** 允许用环境变量覆盖安装路径（换机器 / 换盘符时不用改代码） */
const DEVTOOLS_DIR = process.env.WX_DEVTOOLS_DIR
  || 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具';
const NODE_EXE = path.join(DEVTOOLS_DIR, 'node.exe');
const CLI_JS = path.join(DEVTOOLS_DIR, 'cli.js');
// 2026-09 工具更新后：安装目录里不再自带 node.exe，改由 cli.bat 用 Electron 以 Node 模式跑 CLI。
// 两种布局都支持，老机器（有 node.exe + cli.js）继续走老路。
const CLI_BAT = path.join(DEVTOOLS_DIR, 'cli.bat');
const PROJECT_PATH = path.resolve(__dirname, '..', '..', 'miniprogram');
const AUTO_PORT = 3799;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/** 同步休眠（run-all.js 的编排是同步的，等工具退干净只能同步等） */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 老布局：node.exe + cli.js */
function hasLegacyCli() {
  return fs.existsSync(NODE_EXE) && fs.existsSync(CLI_JS);
}

/** 新布局：cli.bat（Electron 当 Node 跑） */
function hasBatCli() {
  return fs.existsSync(CLI_BAT);
}

/** 判断工具是否装在本机（缺了就让调用方自己决定报错还是跳过） */
function isAvailable() {
  return hasLegacyCli() || hasBatCli();
}

/**
 * 拼出执行 CLI 的命令行。
 *
 * 为什么不直接 spawn cli.bat：Windows 上 Node 22 spawn .bat 会报 EINVAL（踩过），
 * 走 `cmd.exe /c cli.bat` 最稳；老布局则继续用自带 node.exe 直接跑 cli.js。
 */
function cliCommand(args) {
  if (hasLegacyCli()) return { cmd: NODE_EXE, argv: [CLI_JS].concat(args) };
  if (hasBatCli()) return { cmd: process.env.ComSpec || 'cmd.exe', argv: ['/c', CLI_BAT].concat(args) };
  return null;
}

/** 执行 cli 子命令（异步，返回退出码；工具缺失/异常一律返回 -1） */
function runCli(args) {
  return new Promise(function (resolve) {
    const c = cliCommand(args);
    if (!c) return resolve(-1);
    const child = spawn(c.cmd, c.argv, { stdio: 'ignore' });
    child.on('error', function () { resolve(-1); });
    child.on('exit', function (code) { resolve(code); });
  });
}

/** 关闭开发者工具（同步、尽力而为：没开着也算成功） */
function quitSync(timeoutMs) {
  const c = cliCommand(['quit']);
  if (!c) return false;
  try {
    spawnSync(c.cmd, c.argv, {
      stdio: 'ignore',
      timeout: timeoutMs == null ? 60000 : timeoutMs
    });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  DEVTOOLS_DIR: DEVTOOLS_DIR,
  NODE_EXE: NODE_EXE,
  CLI_JS: CLI_JS,
  CLI_BAT: CLI_BAT,
  PROJECT_PATH: PROJECT_PATH,
  AUTO_PORT: AUTO_PORT,
  isAvailable: isAvailable,
  hasLegacyCli: hasLegacyCli,
  hasBatCli: hasBatCli,
  cliCommand: cliCommand,
  runCli: runCli,
  quitSync: quitSync,
  sleep: sleep,
  sleepSync: sleepSync
};
