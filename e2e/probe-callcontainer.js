/**
 * probe-callcontainer.js —— callContainer 连通性与登录链路探针
 *
 * 目的：验证 2026-09-08 前端从 wx.request 迁移到 wx.cloud.callContainer 后：
 *   1. 后端接口可连通（envId / serviceName 配置正确）；
 *   2. 登录链路（POST /api/login）正常（网关注入 openid 或 dev_ 测试码）。
 *
 * 方法：miniprogram-automator 连接开发者工具 → evaluate 在小程序上下文里
 *   require('/utils/request.js') 直接发起请求并捕获结果。
 *
 * 判定：
 *   - health.ok === true → envId 与服务名正确，域名白名单问题已根治；
 *   - login.ok === true → 登录/注册（登录即注册）链路正常；
 *   - 否则按 message 定位（云环境不存在 / 服务不存在 / 4004 等）。
 *
 * 运行：node e2e/probe-callcontainer.js
 */
'use strict';

const { spawn } = require('child_process');
const automator = require('miniprogram-automator');

// 工具路径与 cli 调用统一走 lib/devtools（2026-09 工具更新后 node.exe 没了，
// 改成 cli.bat + Electron；这里跟着换，别再硬编码）
const devtools = require('./lib/devtools');
const PROJECT_PATH = devtools.PROJECT_PATH;
const AUTO_PORT = devtools.AUTO_PORT;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runCli(args) {
  return devtools.runCli(args).then((code) => {
    if (code === -1) console.error('spawn cli error（检查 WX_DEVTOOLS_DIR / cli.bat）');
    return code;
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
    const probe = await miniProgram.evaluate(async () => {
      const request = require('/utils/request.js');
      const out = {};

      // 1) 连通性：/api/health（无鉴权）
      try {
        const data = await request.get('/api/health', { skipAuth: true });
        out.health = { ok: true, data: data };
      } catch (e) {
        out.health = { ok: false, message: e && e.message ? e.message : String(e) };
      }

      // 2) 登录链路：dev_ 测试码（后端来源②，无需 WX_SECRET / 网关注入）
      try {
        const data = await request.post('/api/login', { code: 'dev_probe' });
        out.login = {
          ok: true,
          data: {
            hasToken: !!(data && data.token),
            isNew: !!(data && data.isNew),
            needProfile: !!(data && data.needProfile),
            openid: (data && data.openid) || ''
          }
        };
      } catch (e) {
        out.login = { ok: false, message: e && e.message ? e.message : String(e) };
      }

      return out;
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
