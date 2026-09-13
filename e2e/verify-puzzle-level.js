'use strict';

/**
 * verify-puzzle-level.js —— 数字智力「关卡选择页」端到端（第三批 · 第 4 条 a）
 *
 * 覆盖：
 *   A. ?mode=math24 → 渲染 60 关、前 3 关可玩、第 4 关起锁定、进度显示 0/60；
 *   B. 点第 1 关 → 落到 24 点页且从第 1 关开局（?level=N 生效）；
 *   C. ?mode=g2048 → 列出 14 关、副标题带「步内」（步数预算）；
 *   D. 非法 mode → 重定向回玩法 tab，而不是白屏。
 *
 * 运行：node e2e/verify-puzzle-level.js
 */

const H = require('./lib/harness');

const LEVEL_PAGE = 'pages/puzzle-level/puzzle-level';

async function main() {
  const ck = H.createChecker();
  let mp = null;
  try {
    mp = await H.ensureAutomation({ quiet: false });

    console.log('[1/4] 24 点关卡页');
    const p = await H.goto(mp, '/pages/puzzle-level/puzzle-level?mode=math24', 1800);
    const d = await p.data();
    ck.check('页面是数字智力关卡页', (await mp.currentPage()).path === LEVEL_PAGE);
    ck.check('列出 60 关', (d.levels || []).length === 60, '实际 = ' + (d.levels || []).length);
    ck.check('前 3 关解锁、第 4 关锁定',
      d.levels[0].locked === false && d.levels[2].locked === false && d.levels[3].locked === true,
      '实际 = ' + d.levels.slice(0, 4).map(function (r) { return r.locked; }).join(','));
    ck.check('当前关指向第 ' + d.nextNo + ' 关', d.nextNo >= 1, '实际 nextNo = ' + d.nextNo);

    console.log('[2/4] 点第 1 关 → 24 点从第 1 关开局');
    const rows = await H.withTimeout(p.$$('.pl-row'), 10000, 'query .pl-row');
    ck.check('关卡行渲染出来了', (rows || []).length === 60, '实际 = ' + (rows || []).length);
    await H.withTimeout(rows[0].tap(), 10000, 'tap first row');
    await p.waitFor(1500);
    const cur = await mp.currentPage();
    ck.check('落到 24 点页', cur.path === 'pages/math24/math24', '实际 = ' + cur.path);
    const md = await cur.data();
    ck.check('从第 1 关开局（?level=1 生效）', md.curLevel === 1, '实际 = ' + md.curLevel);

    console.log('[3/4] 2048 关卡页（14 关 + 步数预算）');
    const g = await H.goto(mp, '/pages/puzzle-level/puzzle-level?mode=g2048', 1800);
    const gd = await g.data();
    ck.check('2048 列出 14 关', (gd.levels || []).length === 14, '实际 = ' + (gd.levels || []).length);
    ck.check('副标题带步数预算', String(gd.levels[0].sub).indexOf('步内') >= 0,
      '实际 = ' + gd.levels[0].sub);

    console.log('[4/4] 非法 mode：重定向而不是白屏');
    await H.goto(mp, '/pages/puzzle-level/puzzle-level?mode=not-a-game', 1500);
    const after = await mp.currentPage();
    ck.check('重定向到玩法 tab', after.path === 'pages/playlist/playlist', '实际 = ' + after.path);

    console.log('[5] 各玩法页 ?level=N 生效（直接进指定关）');
    const os = await H.goto(mp, '/pages/one-stroke/one-stroke?level=7', 1600);
    const osd = await os.data();
    ck.check('一笔画从第 7 关开局', String(osd.levelText || '').indexOf('7/') === 0,
      '实际 = ' + osd.levelText);
    const kl = await H.goto(mp, '/pages/klotski/klotski?level=5', 1600);
    const kld = await kl.data();
    ck.check('华容道从第 5 关开局', kld.curLevel === 5, '实际 = ' + kld.curLevel);
    const mg = await H.goto(mp, '/pages/memory-grid/memory-grid?level=4', 1600);
    const mgd = await mg.data();
    ck.check('记忆矩阵从第 4 关开局', String(mgd.hudText || '').indexOf('4') >= 0,
      '实际 = ' + mgd.hudText);
  } catch (e) {
    ck.check('脚本执行无异常', false, (e && e.message) || String(e));
  } finally {
    if (mp) { try { await mp.close(); } catch (e) { /* 关闭异常忽略 */ } }
  }
  process.exitCode = H.summarize('verify-puzzle-level（数字智力关卡页）', ck);
}

main();
