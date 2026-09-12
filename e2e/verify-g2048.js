'use strict';

/**
 * verify-g2048.js —— 2048 挑战模式端到端验证（2026-09-12 新增）
 *
 * 覆盖：挑战入口渲染 → 进入挑战（目标 2048 / 不限步数）→ 滑动计步且不因步数判负
 *      → 通关只记「最少步数」且不写星级存档 → 回选关页显示最佳 → 再通一次不改差最佳值。
 *
 * 设计说明：2048 棋盘随机，靠"打"到 2048 不现实；这里用页面暴露的 `_win()` 模拟通关
 * （滑动、计步、失败判定都是真实逻辑，只有"凑到 2048"这一步是模拟），保证用例确定可复现。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-g2048.js
 */

const H = require('./lib/harness');

const PAGE_URL = '/pages/g2048/g2048';
const BEST_KEY = 'ww_g2048_challenge_best';

H.runSuite('verify-g2048（2048 挑战模式）', async function (miniProgram, ck) {
  await miniProgram.callWxMethod('removeStorageSync', 'ww_stars');
  await miniProgram.callWxMethod('removeStorageSync', BEST_KEY);
  await miniProgram.callWxMethod('removeStorageSync', 'ww_g2048_cur');

  console.log('[1/5] 选关页：挑战模式入口');
  const page = await H.goto(miniProgram, PAGE_URL, 1600);
  ck.check('进入 2048 页', (await miniProgram.currentPage()).path === 'pages/g2048/g2048');
  ck.check('根容器 .page-2048 已渲染', !!(await H.waitForSelector(page, '.page-2048', 8000)));
  // 页面默认直接进当前关卡；先点顶部「选关」胶囊切到关卡列表视图
  await (await page.$('.g-chip')).tap();
  await page.waitFor(700);
  ck.check('出现「挑战模式」入口卡', !!(await H.waitForSelector(page, '.challenge-card', 8000)));
  const sub = await H.textOf(page, '.cc-sub');
  ck.check('入口文案说明不限步数', /不限步数/.test(sub || ''), '实际 = ' + sub);

  console.log('[2/5] 进入挑战：目标 2048、不限步数');
  await (await page.$('.challenge-card')).tap();
  await page.waitFor(900);
  let d = await page.data();
  ck.check('进入对局态', d.playing === true, '实际 = ' + d.playing);
  ck.check('标记为挑战模式', d.challenge === true, '实际 = ' + d.challenge);
  ck.check('目标为 2048', d.target === 2048, '实际 = ' + d.target);
  ck.check('步数上限足够大（不限步数）', d.stepsLimit >= 99999, '实际 = ' + d.stepsLimit);
  ck.check('步数从 0 开始', d.usedSteps === 0, '实际 = ' + d.usedSteps);

  console.log('[3/5] 滑动：照常计步，且不会因步数上限判负');
  const dirs = [0, 1, 2, 3, 0, 1, 3, 2];
  for (const dir of dirs) {
    await page.callMethod('_move', dir);
    await page.waitFor(120);
  }
  d = await page.data();
  console.log('        走了 ' + dirs.length + ' 次滑动 · 计步 = ' + d.usedSteps + ' · over = ' + d.over);
  ck.check('有效滑动会计步', d.usedSteps > 0, '实际 = ' + d.usedSteps);
  ck.check('未因步数上限判负（挑战模式不限步数）', d.over === false || d.win === true,
    'over = ' + d.over + ', win = ' + d.win);

  console.log('[4/5] 通关：记最佳步数、不写星级存档');
  const usedBeforeWin = (await page.data()).usedSteps;
  await page.callMethod('_win');
  await page.waitFor(500);
  d = await page.data();
  ck.check('判定通关', d.win === true && d.over === true, 'win = ' + d.win);
  ck.check('结算文案给出步数与最佳', /最佳/.test(d.overMsg || ''), '实际 = ' + d.overMsg);
  ck.check('星级不参与（stars = 0，图标为 🏆）', d.stars === 0 && d.starsText === '🏆',
    'stars = ' + d.stars + ', text = ' + d.starsText);

  const best = await miniProgram.callWxMethod('getStorageSync', BEST_KEY);
  ck.check('写入最佳步数 ' + usedBeforeWin, best === usedBeforeWin, '实际 = ' + JSON.stringify(best));
  const stars = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  ck.check('不写星级存档（ww_stars 里没有 g2048_*）',
    !stars || !Object.keys(stars).some(function (k) { return k.indexOf('g2048_') === 0; }),
    '实际 = ' + JSON.stringify(stars));

  await page.callMethod('goLevels');
  await page.waitFor(600);
  d = await page.data();
  ck.check('回到选关页并显示最佳步数', d.challengeBest === usedBeforeWin && d.playing === false,
    'challengeBest = ' + d.challengeBest);

  console.log('[5/5] 再通一次用更多步：最佳步数取更小值');
  await (await page.$('.challenge-card')).tap();
  await page.waitFor(800);
  // 多滑几次，确保这一局步数 > 第一次（第一次 8 步），用于验证「最佳只取更小值」
  for (let i = 0; i < 14; i++) {
    await page.callMethod('_move', i % 4);
    await page.waitFor(60);
  }
  await page.waitFor(300);
  const usedSecond = (await page.data()).usedSteps;
  ck.check('第二局步数多于第一局', usedSecond > usedBeforeWin,
    usedBeforeWin + ' → ' + usedSecond);
  await page.callMethod('_win');
  await page.waitFor(400);
  const best2 = await miniProgram.callWxMethod('getStorageSync', BEST_KEY);
  ck.check('最佳步数不会被改差（取更小值）', best2 === usedBeforeWin,
    '第一次 ' + usedBeforeWin + ' → 第二次后 ' + best2);
  ck.check('全程未崩溃（仍在 2048 页）',
    (await miniProgram.currentPage()).path === 'pages/g2048/g2048');
});
