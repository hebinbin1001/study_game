/**
 * probe-callcontainer.js —— callContainer 连通性与登录链路探针
 *
 * 目的：验证前端迁移到 wx.cloud.callContainer 后：
 *   1. 后端接口可连通（envId / serviceName 配置正确）；
 *   2. 登录链路（POST /api/login）正常（网关注入 openid 或 dev_ 测试码）。
 *
 * 方法：miniprogram-automator 连接开发者工具 → evaluate 在小程序上下文里
 *   require('/utils/request.js') 直接发起请求并捕获结果。
 *   注意：evaluate 的函数体禁止 async/await（automator 序列化后 async 标记
 *   会丢失导致语法错误），一律用普通 function + Promise 链。
 *
 * 运行：node e2e/probe-callcontainer.js
 */
'use strict';

const { spawn } = require('child_process');
const automator = require('miniprogram-automator');

const NODE_EXE = 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\node.exe';
const CLI_JS = 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.js';
const PROJECT_PATH = 'E:\\Code\\小程序\\study_game\\miniprogram';
const AUTO_PORT = 3799;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function main() {
  let miniProgram = null;
  let exitCode = 1;
  try {
    console.log('=== [1] connecting automation port ===');
    miniProgram = await ensureAutomation();
    console.log('  connected ok, waiting project compile...');
    await sleep(8000);

    console.log('=== [2] probing callContainer connectivity ===');
    const probe = await miniProgram.evaluate(function () {
      var request = require('/utils/request.js');
      var out = {};

      // 1) 连通性：/api/health（无鉴权）
      var p1 = request.get('/api/health', { skipAuth: true }).then(
        function (data) { out.health = { ok: true, data: data }; },
        function (e) { out.health = { ok: false, message: (e && e.message) ? e.message : String(e) }; }
      );

      // 2) 登录链路：dev_ 测试码（后端来源②，无需 WX_SECRET / 网关注入）
      var p2 = request.post('/api/login', { code: 'dev_probe' }).then(
        function (data) {
          out.login = {
            ok: true,
            data: {
              hasToken: !!(data && data.token),
              isNew: !!(data && data.isNew),
              needProfile: !!(data && data.needProfile),
              openid: (data && data.openid) || ''
            }
          };
        },
        function (e) { out.login = { ok: false, message: (e && e.message) ? e.message : String(e) }; }
      );

      return Promise.all([p1, p2]).then(function () { return out; });
    });

    console.log('--- probe result ---');
    console.log(JSON.stringify(probe, null, 2));

    const healthOk = probe && probe.health && probe.health.ok;
    const loginOk = probe && probe.login && probe.login.ok;
    console.log('--- verdict ---');
    console.log('  callContainer 连通: ' + (healthOk ? 'PASS' : 'FAIL'));
    console.log('  登录链路: ' + (loginOk ? 'PASS' : 'FAIL'));

    if (healthOk && loginOk) {
      console.log('VERDICT: PASS');
      exitCode = 0;
    } else {
      console.log('VERDICT: FAIL');
      if (probe && probe.health && !probe.health.ok) {
        console.log('  health 失败信息: ' + probe.health.message);
        console.log('  常见排查：envId 是否为本小程序已关联的环境？serviceName 是否为 express-g0hk？');
      }
    }
  } catch (e) {
    console.error('fatal: ' + (e && e.message ? e.message : e));
  } finally {
    if (miniProgram) {
      try {
        await miniProgram.close();
      } catch (e) {
        // 忽略
      }
    }
  }
  process.exit(exitCode);
}

main();