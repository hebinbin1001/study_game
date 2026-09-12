'use strict';

/**
 * e2e/run-all.js —— 全流程验证编排器（流程固化 · 唯一入口）
 *
 * 把「写代码 → 跑测试」的完整链路固化成一条命令，解决三件事：
 *   1. 顺序固定：静态检查 → 单元测试 → 端到端，先便宜后昂贵，失败即看得见层次
 *   2. 串行约束：所有 E2E 共用微信开发者工具的一个自动化端口（3799），
 *      并发跑会互相抢项目实例 —— 编排器强制串行，避免偶发假失败
 *   3. 唯一裁决：任一层失败则整体非 0 退出，可直接用于提交前置门禁
 *
 * 用法：
 *   node e2e/run-all.js              # 全量（静态 + 单元 + E2E）
 *   node e2e/run-all.js --no-e2e     # 只跑静态 + 单元（不需要开发者工具，秒级）
 *   node e2e/run-all.js --e2e-only   # 只跑 E2E
 *   node e2e/run-all.js --only=snake # 只跑指定阶段（便于单点排障）
 *   node e2e/run-all.js --no-reset   # 跳过「开跑前重启开发者工具」（默认会重启）
 *
 * 报告：每次运行都会写 e2e/reports/last-run.txt（全量输出）与 latest.json（摘要）。
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 开发者工具路径与 quit 收敛在 lib/devtools.js（harness.js 用同一份）
const devtools = require('./lib/devtools');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(__dirname, 'reports');

const STAGES = [
  { id: 'syntax', layer: '静态', title: '全量 JS 语法检查', script: 'e2e/syntax-check-all.js' },
  { id: 'structure', layer: '静态', title: '结构回归（app.json/组件/tabBar/玩法一致性）', script: 'e2e/structure-check.js' },
  { id: 'wxss', layer: '静态', title: 'WXSS 检查', script: 'e2e/check-wxss.js' },
  // 包体检查（微信主包 2MB 硬限）：素材已按展示尺寸压缩（原图移出包），这里恢复成**阻断**
  { id: 'assets', layer: '静态', title: '包体资源检查（整包 ≤1.8MB）', script: 'e2e/check-assets.js' },
  { id: 'unit', layer: '单元', title: '单元测试套件', script: 'miniprogram/utils/__tests__/run-all.js' },
  { id: 'game', layer: '端到端', title: '单词闯关（字母射击打怪）', script: 'e2e/verify-game.js' },
  { id: 'result', layer: '端到端', title: '结算页（本局错题回顾）', script: 'e2e/verify-result.js' },
  { id: 'math24', layer: '端到端', title: '算 24 点', script: 'e2e/verify-math24.js' },
  { id: 'link', layer: '端到端', title: '词语连连看', script: 'e2e/verify-link.js' },
  { id: 'snake', layer: '端到端', title: '单词贪吃蛇', script: 'e2e/verify-snake.js' },
  { id: 'klotski', layer: '端到端', title: '华容道（数字智力）', script: 'e2e/verify-klotski.js' },
  { id: 'g2048', layer: '端到端', title: '2048（挑战模式）', script: 'e2e/verify-g2048.js' },
  { id: 'challenge', layer: '端到端', title: '挑战主线（首页继续挑战/关卡页/三款玩法/存档）', script: 'e2e/verify-challenge.js' },
  { id: 'pages', layer: '端到端', title: '全页面渲染回归（18 页）', script: 'e2e/verify-all-pages.js' },
  { id: 'm2m4', layer: '端到端', title: 'M2~M4 页面回归（8 页）', script: 'e2e/verify-m2m4.js' }
];

function parseArgs(argv) {
  const opts = { noE2e: false, e2eOnly: false, only: null, noReset: false };
  argv.forEach(function (a) {
    if (a === '--no-e2e') opts.noE2e = true;
    else if (a === '--e2e-only') opts.e2eOnly = true;
    else if (a === '--no-reset') opts.noReset = true;
    else if (a.indexOf('--only=') === 0) opts.only = a.slice('--only='.length);
  });
  return opts;
}

function selectStages(opts) {
  return STAGES.filter(function (s) {
    if (opts.only) return s.id === opts.only;
    if (opts.noE2e && s.layer === '端到端') return false;
    if (opts.e2eOnly && s.layer !== '端到端') return false;
    return true;
  });
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stages = selectStages(opts);

  if (!stages.length) {
    console.error('没有匹配的阶段，请检查 --only=<id>。可选：' + STAGES.map(function (s) { return s.id; }).join(', '));
    process.exit(2);
  }

  const startedAt = new Date();
  const results = [];

  console.log('=========================================================');
  console.log(' 词力战士 · 全流程验证');
  console.log(' 开始时间 ' + startedAt.toLocaleString('zh-CN'));
  console.log(' 阶段 ' + stages.length + ' 个：' + stages.map(function (s) { return s.id; }).join(' → '));
  console.log('=========================================================');

  // 整轮 E2E 开跑前先关掉可能残留的开发者工具：
  // 上一轮被中断时工具会停在中途页面，cli auto 只是复用已开着的工具、
  // 不会重开项目，于是首个阶段读到遗留页面报假失败（详见 lib/devtools.js）。
  let devtoolsReset = false;

  stages.forEach(function (stage, i) {
    if (stage.layer === '端到端' && !opts.noReset && !devtoolsReset) {
      devtoolsReset = true;
      if (devtools.isAvailable()) {
        console.log('');
        console.log('  [reset] 关闭可能残留的开发者工具（本轮首个 E2E 阶段开跑前）...');
        devtools.quitSync();
        // quit 是异步落地的：IDE 进程与 14809 服务端口还要再退出几秒，
        // 立刻 cli auto 会撞上「上一个实例还在收尾」而拉不起来。
        devtools.sleepSync(opts.resetCoolDownMs == null ? 5000 : opts.resetCoolDownMs);
      } else {
        console.log('');
        console.log('  [reset] 未找到微信开发者工具，跳过重启（可用 WX_DEVTOOLS_DIR 指定安装路径）');
      }
    }
    const t0 = Date.now();
    console.log('');
    console.log('---------------------------------------------------------');
    console.log('[' + (i + 1) + '/' + stages.length + '] ' + stage.layer + ' · ' + stage.title);
    console.log('      node ' + stage.script);
    console.log('---------------------------------------------------------');

    const res = spawnSync(process.execPath, [stage.script].concat(stage.args || []), {
      cwd: ROOT,
      stdio: 'inherit'
    });

    const ms = Date.now() - t0;
    const ok = res.status === 0;
    results.push({
      id: stage.id,
      layer: stage.layer,
      title: stage.title,
      ok: ok,
      status: res.status,
      ms: ms
    });
    console.log('');
    console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + stage.id + '  (' + (ms / 1000).toFixed(1) + 's)');
  });

  // 摘要
  const failed = results.filter(function (r) { return !r.ok; });
  const totalMs = Date.now() - startedAt.getTime();

  console.log('');
  console.log('=========================================================');
  console.log(' 汇总');
  console.log('=========================================================');
  results.forEach(function (r) {
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + pad(r.id, 10) + pad(r.layer, 8)
      + pad((r.ms / 1000).toFixed(1) + 's', 8) + r.title);
  });
  console.log('---------------------------------------------------------');
  console.log('  通过 ' + (results.length - failed.length) + '/' + results.length
    + ' · 总耗时 ' + (totalMs / 1000).toFixed(1) + 's');
  if (failed.length) {
    console.log('  失败阶段：' + failed.map(function (r) { return r.id; }).join(', '));
  }
  console.log('  VERDICT: ' + (failed.length ? 'FAIL' : 'PASS'));
  console.log('=========================================================');

  // 报告落盘
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const summary = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totalMs: totalMs,
      verdict: failed.length ? 'FAIL' : 'PASS',
      passed: results.length - failed.length,
      total: results.length,
      stages: results
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'latest.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'last-run.txt'),
      results.map(function (r) {
        return (r.ok ? 'PASS' : 'FAIL') + '\t' + r.id + '\t' + (r.ms / 1000).toFixed(1) + 's\t' + r.title;
      }).join('\n') + '\n', 'utf8');
    console.log('报告：e2e/reports/latest.json');
  } catch (e) {
    console.log('报告写入失败（不影响结论）：' + (e && e.message));
  }

  process.exit(failed.length ? 1 : 0);
}

main();
