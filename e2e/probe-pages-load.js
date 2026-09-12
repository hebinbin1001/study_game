'use strict';

/**
 * e2e/probe-pages-load.js —— 逐页加载探针（真机「点进去黑屏 / 进不去」根因回归）
 *
 * 为什么需要（2026-09-12 真机踩坑复盘）：
 *   真机日志显示 pages/rank、pages/wrong-book 打不开，控制台报
 *     Component is not found in path wx://not-found
 *     Page pages/rank/rank has not been registered yet
 *   补上缺失的 page.json 之前，去掉 app.json 的 lazyCodeLoading 反而让错误升级成
 *     Can't find variable: __wxAppCode__（整页崩、路由失败）
 *   共同点：出事的是「缺失 page.json」的页面。按需注入下框架靠
 *   __wxAppCode__[页面路径 + .json] 找页面/组件的 usingComponents，查不到就把
 *   页面解析成 wx://not-found 占位（表现=点进去黑屏）；而真机调试的运行时会强制
 *   走按需注入（开发者工具 toolkit 的 features.lazyCodeLoadingForDevTool），
 *   于是「开发者工具里正常、真机打不开」。
 *
 *   这类错误只打印在 console，不断言就发现不了（verify-all-pages 只断言元素渲染，
 *   页面崩掉会假通过）。本脚本把每页的 console / exception 全收上来做断言。
 *
 * 用法：
 *   node e2e/probe-pages-load.js                       全量页面
 *   node e2e/probe-pages-load.js --only=rank,wrong-book
 *   node e2e/probe-pages-load.js --settle=1500         每页停留时长（默认 1200ms）
 *
 * 退出码：0 全部干净；1 有页面报错。
 */

const fs = require('fs');
const path = require('path');
const H = require('./lib/harness');

const APP_JSON = path.join(H.PROJECT_PATH, 'app.json');

/** 真机黑屏那类错误的指纹 */
const BAD = /__wxAppCode__|wx:\/\/not-found|has not been registered|Component is not found/i;

/** 需要 query 参数才能正常进入的页面 */
const URL_OF = {
  'pages/game/game': '/pages/game/game?grade=kindergarten&level=1',
  'pages/result/result': '/pages/result/result?win=1&score=120&correctCount=8&totalQ=10&grade=kindergarten&level=1'
};

function parseArgs(argv) {
  const opts = { only: null, settle: 1200 };
  argv.forEach(function (a) {
    if (a.indexOf('--only=') === 0) opts.only = a.slice('--only='.length).split(',');
    else if (a.indexOf('--settle=') === 0) opts.settle = parseInt(a.slice('--settle='.length), 10) || 1200;
  });
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const app = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
  const pages = app.pages.filter(function (p) {
    return !opts.only || opts.only.indexOf(p.split('/')[1]) >= 0;
  });

  let mp = null;
  let current = '';
  const events = [];

  try {
    mp = await H.ensureAutomation({ quiet: false });
    mp.on('console', function (res) {
      const args = (res && res.args) || [];
      events.push({ page: current, kind: (res && res.type) || 'log', msg: args.join(' ') });
    });
    mp.on('exception', function (res) {
      events.push({
        page: current,
        kind: 'exception',
        msg: ((res && res.message) || '') + ' ' + ((res && res.stack) || '')
      });
    });

    await H.goto(mp, '/pages/index/index', 2000);

    let bad = 0;
    for (const p of pages) {
      current = p;
      const from = events.length;
      try {
        await H.goto(mp, URL_OF[p] || '/' + p, opts.settle);
      } catch (e) {
        events.push({ page: p, kind: 'exception', msg: '页面打不开：' + ((e && e.message) || e) });
      }
      const hits = events.slice(from).filter(function (ev) { return BAD.test(ev.msg); });
      if (hits.length) {
        bad++;
        console.log('  FAIL  ' + p);
        hits.forEach(function (h) {
          console.log('        [' + h.kind + '] ' + h.msg.replace(/\s+/g, ' ').slice(0, 220));
        });
      } else {
        console.log('  ok    ' + p);
      }
    }

    console.log('');
    console.log('=== 逐页加载探针 汇总 ===');
    console.log('  页面 ' + pages.length + ' 个 · 命中真机黑屏指纹 ' + bad + ' 个');
    console.log('  VERDICT: ' + (bad ? 'FAIL' : 'PASS'));
    process.exitCode = bad ? 1 : 0;
  } catch (e) {
    console.log('  脚本执行异常：' + ((e && e.message) || e));
    process.exitCode = 1;
  } finally {
    if (mp) { try { await mp.close(); } catch (e) { /* 关闭异常忽略 */ } }
  }
}

main();
