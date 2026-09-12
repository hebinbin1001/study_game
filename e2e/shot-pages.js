'use strict';

/**
 * e2e/shot-pages.js —— 批量给页面截图（布局审查用）
 *
 * 为什么需要：布局问题（内容没填满、多余滚动、上下留白不均）用断言很难描述，看图最直观。
 * 开发者工具的截图接口在工具更新后可用了（此前多次超时）。
 *
 * 用法：
 *   node e2e/shot-pages.js                  # 截默认页（玩法 14 款 + 关键内容页）
 *   node e2e/shot-pages.js --only=math24    # 只截指定页面（逗号分隔）
 *   node e2e/shot-pages.js --prefix=after   # 文件名前缀（改前/改后对比）
 *
 * 产物：e2e/reports/shots/<前缀>-<页面>.png（gitignore，临时产物）
 */

const fs = require('fs');
const path = require('path');
const H = require('./lib/harness');

const OUT_DIR = path.join(__dirname, 'reports', 'shots');

// 玩法页（与 app.json / 玩法 tab 对齐）+ 典型内容页
const PAGES = [
  { id: 'game', url: '/pages/game/game?grade=kindergarten&level=1' },
  { id: 'math24', url: '/pages/math24/math24' },
  { id: 'math-balance', url: '/pages/math-balance/math-balance' },
  { id: 'math-sprint', url: '/pages/math-sprint/math-sprint' },
  { id: 'memory-grid', url: '/pages/memory-grid/memory-grid' },
  { id: 'word-build', url: '/pages/word-build/word-build' },
  { id: 'idiom-build', url: '/pages/idiom-build/idiom-build' },
  { id: 'match', url: '/pages/match/match' },
  { id: 'link', url: '/pages/link/link' },
  { id: 'snake', url: '/pages/snake/snake' },
  { id: 'sudoku', url: '/pages/sudoku/sudoku' },
  { id: 'g2048', url: '/pages/g2048/g2048' },
  { id: 'klotski', url: '/pages/klotski/klotski' },
  { id: 'bounce', url: '/pages/bounce/bounce' },
  { id: 'index', url: '/pages/index/index' },
  { id: 'playlist', url: '/pages/playlist/playlist' },
  { id: 'study', url: '/pages/study/study' },
  { id: 'me', url: '/pages/me/me' },
  { id: 'level', url: '/pages/level/level' },
  { id: 'rank', url: '/pages/rank/rank' },
  { id: 'achievement', url: '/pages/achievement/achievement' },
  { id: 'wrong-book', url: '/pages/wrong-book/wrong-book' },
  { id: 'avatar', url: '/pages/avatar/avatar' },
  { id: 'checkin', url: '/pages/checkin/checkin' },
  { id: 'daily-question', url: '/pages/daily-question/daily-question' },
  { id: 'result', url: '/pages/result/result?win=1&score=120&correctCount=8&totalQ=10&grade=kindergarten&level=1' }
];

function parseArgs(argv) {
  const opts = { only: null, prefix: 'page' };
  argv.forEach(function (a) {
    if (a.indexOf('--only=') === 0) opts.only = a.slice('--only='.length).split(',');
    else if (a.indexOf('--prefix=') === 0) opts.prefix = a.slice('--prefix='.length);
  });
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const targets = opts.only
    ? PAGES.filter(function (p) { return opts.only.indexOf(p.id) >= 0; })
    : PAGES;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let mp = null;
  let ok = 0;
  try {
    mp = await H.ensureAutomation({ quiet: false });
    for (const t of targets) {
      const file = path.join(OUT_DIR, opts.prefix + '-' + t.id + '.png');
      try {
        const page = await H.goto(mp, t.url, 1500);
        await page.waitFor(400);
        await H.withTimeout(mp.screenshot({ path: file }), 20000, 'screenshot ' + t.id);
        const kb = fs.existsSync(file) ? Math.round(fs.statSync(file).size / 1024) : 0;
        console.log('  OK  ' + t.id + '  ->  ' + path.basename(file) + ' (' + kb + 'KB)');
        ok++;
      } catch (e) {
        console.log('  ERR ' + t.id + '  ->  ' + (e && e.message));
      }
    }
  } finally {
    if (mp) { try { await mp.close(); } catch (e) { /* 忽略 */ } }
  }
  console.log('\n完成 ' + ok + '/' + targets.length + ' 张，产物目录：' + path.relative(process.cwd(), OUT_DIR));
  process.exitCode = ok === targets.length ? 0 : 1;
}

main();
