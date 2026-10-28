'use strict';

/**
 * verify-g2048.js —— 2048 挑战模式端到端验证（2026-09-12 新增）
 *
 * 覆盖：选关页（关卡卡显示 3★ 基准 + 挑战入口）→ 关卡模式走超 par 也不判负
 *      → 进入挑战（目标 2048 / 不限步数）→ 滑动计步且不判负
 *      → 挑战通关只记「最少步数」（关卡模式按步数评星）→ 回选关页显示最佳
 *      → 再通一次不改差最佳值。
 *
 * 设计说明：2048 棋盘随机，靠"打"到 2048 不现实；这里用页面暴露的 `_win()` 模拟通关
 * （滑动、计步、失败判定都是真实逻辑，只有"凑到 2048"这一步是模拟），保证用例确定可复现。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-g2048.js
 */

const H = require('./lib/harness');

const PAGE_URL = '/pkg-games/g2048/g2048';
const BEST_KEY = 'ww_g2048_challenge_best';

H.runSuite('verify-g2048（2048 关卡不限步数 + 挑战模式）', async function (miniProgram, ck) {
  // 2026-10-18：不能整份删 ww_stars —— 它是全站所有玩法共用的星级存档，
  // 清空会把开发者本机的华容道/24 点等进度一起抹掉（同类问题在 challenge 用例已修过）。
  // 这里只临时摘掉 g2048_1，跑完原样恢复。
  const backupStars = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  const backupBest = await miniProgram.callWxMethod('getStorageSync', BEST_KEY);
  const backupCur = await miniProgram.callWxMethod('getStorageSync', 'ww_g2048_cur');
  const seedStars = Object.assign({}, backupStars || {});
  delete seedStars.g2048_1;
  await miniProgram.callWxMethod('setStorageSync', 'ww_stars', seedStars);
  await miniProgram.callWxMethod('removeStorageSync', BEST_KEY);
  await miniProgram.callWxMethod('removeStorageSync', 'ww_g2048_cur');
  const restoreStorage = async function () {
    try {
      if (backupStars && typeof backupStars === 'object') {
        await miniProgram.callWxMethod('setStorageSync', 'ww_stars', backupStars);
      } else {
        await miniProgram.callWxMethod('removeStorageSync', 'ww_stars');
      }
      if (backupBest !== '' && backupBest != null) {
        await miniProgram.callWxMethod('setStorageSync', BEST_KEY, backupBest);
      } else {
        await miniProgram.callWxMethod('removeStorageSync', BEST_KEY);
      }
      if (backupCur !== '' && backupCur != null) {
        await miniProgram.callWxMethod('setStorageSync', 'ww_g2048_cur', backupCur);
      } else {
        await miniProgram.callWxMethod('removeStorageSync', 'ww_g2048_cur');
      }
    } catch (e) { /* 恢复失败不改变测试结论 */ }
  };

  try {
  console.log('[1/6] 选关页：关卡卡（3★ 基准）+ 挑战入口');
  const page = await H.goto(miniProgram, PAGE_URL, 1600);
  ck.check('进入 2048 页', (await miniProgram.currentPage()).path === 'pkg-games/g2048/g2048');
  ck.check('根容器 .page-2048 已渲染', !!(await H.waitForSelector(page, '.page-2048', 8000)));
  // onLoad 会自动开当前关；先切到选关视图（页内「选关」胶囊 2026-10-17 已下线）
  await page.callMethod('goLevels');
  await page.waitFor(600);
  ck.check('出现「挑战模式」入口卡', !!(await H.waitForSelector(page, '.challenge-card', 8000)));
  const sub = await H.textOf(page, '.cc-sub');
  ck.check('入口文案说明不设步数上限', /不限步数/.test(sub || ''), '实际 = ' + sub);
  const lvText = await H.textOf(page, '.lv-steps');
  ck.check('选关卡片显示该关 3★ 参考步数', /3★\s*\d+\s*步/.test(lvText || ''), '实际 = ' + lvText);

  console.log('[2/6] 关卡模式：已取消步数上限，par 只用于评星');
  await (await page.$('.lv')).tap();
  await page.waitFor(800);
  let d = await page.data();
  ck.check('进入关卡对局', d.playing === true && d.challenge === false,
    'playing = ' + d.playing + ', challenge = ' + d.challenge);
  ck.check('步数上限字段恒为 0（已取消）', d.stepsLimit === 0, '实际 = ' + d.stepsLimit);
  ck.check('带 3★ 参考步数 par', d.par > 0, '实际 = ' + d.par);
  ck.check('底部提示写明 3★ 步数', /3★/.test(d.tipText || ''), '实际 = ' + d.tipText);
  // 连走 30 步（第 1 关 par = 24）：越过 par 也不该出现「步数用尽」
  for (let i = 0; i < 30; i++) {
    await page.callMethod('_move', i % 4);
    await page.waitFor(60);
    if ((await page.data()).over) break;
  }
  d = await page.data();
  ck.check('走超 par 步数也不会判负', !(d.over === true && d.win === false),
    'over = ' + d.over + ', win = ' + d.win + ', usedSteps = ' + d.usedSteps);
  ck.check('星级在 0~3 之间', d.stars >= 0 && d.stars <= 3, 'stars = ' + d.stars);
  // 记下关卡局实际拿到的星：挑战局不写星级，这一步写进去的值会一直保留到 [5/6]。
  // 不能写死 3 星 —— 30 步超过 par(24) 时本来就只有 2 星（随机棋盘下两种都可能）。
  const levelStars = d.stars;
  ck.check('关卡模式已通关并产生星级（供存档断言）', d.win === true && levelStars > 0,
    'win = ' + d.win + ', stars = ' + levelStars);
  await page.callMethod('goLevels');
  await page.waitFor(500);

  console.log('[3/6] 进入挑战：目标 2048、不限步数');
  await (await page.$('.challenge-card')).tap();
  await page.waitFor(900);
  d = await page.data();
  ck.check('进入对局态', d.playing === true, '实际 = ' + d.playing);
  ck.check('标记为挑战模式', d.challenge === true, '实际 = ' + d.challenge);
  ck.check('目标为 2048', d.target === 2048, '实际 = ' + d.target);
  ck.check('步数上限字段恒为 0（不限步数）', d.stepsLimit === 0, '实际 = ' + d.stepsLimit);
  ck.check('步数从 0 开始', d.usedSteps === 0, '实际 = ' + d.usedSteps);

  console.log('[4/6] 滑动：照常计步，且不会因步数上限判负');
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

  console.log('[5/6] 通关：记最佳步数；挑战局本身不写星级');
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
  // 2026-10-18：2048 已接入星级存档（每关记最快用时 + 星级）。
  // 断言「存档值 = 关卡局实际星级」，而不是写死 3 星（步数随棋盘会变）。
  ck.check('关卡星级已写入 g2048_1 = ' + levelStars,
    !!(stars && stars['g2048_1'] === levelStars),
    '实际 = ' + JSON.stringify(stars));

  await page.callMethod('goLevels');
  await page.waitFor(600);
  d = await page.data();
  ck.check('回到选关页并显示最佳步数', d.challengeBest === usedBeforeWin && d.playing === false,
    'challengeBest = ' + d.challengeBest);

  console.log('[6/6] 再通一次用更多步：最佳步数取更小值');
  await (await page.$('.challenge-card')).tap();
  await page.waitFor(800);
  // 随机棋盘上不是每次滑动都有效，滑到确实超过第一局为止（最多 60 次，避免死循环）
  for (let i = 0; i < 60; i++) {
    if ((await page.data()).usedSteps > usedBeforeWin) break;
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
    (await miniProgram.currentPage()).path === 'pkg-games/g2048/g2048');
  } finally {
    await restoreStorage();
  }
});
