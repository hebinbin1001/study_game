'use strict';

/**
 * verify-klotski.js —— 华容道端到端验证
 *
 * 覆盖断言：
 *   A. 选关页：30 关按 5 个档位分组渲染；第 1 关解锁、第 2 关锁着（未通关时点不进去）
 *   B. 开局：10 个棋子、步数 0、最少步数 = 关卡标注（第 1 关 8 步）
 *   C. 拖拽：**真实 touch 事件拖 2 格只算 1 步**（"一次连续滑动算 1 步" 的核心规则）
 *   D. 撤销：步数 -1 且棋子回到原位
 *   E. 提示：从当前局面算出下一步（高亮棋子 + 文案）
 *   F. 通关：按关卡自带最优解走完 → 结算 3★、进度写 `klotski@1`、第 2 关解锁
 *   G. 演示：用演示通关**不计星**（stars=0、starsText 为 👀），且不写进度
 *
 * 设计要点：
 *   · 走法用页面暴露的 `_moveAtCell(格子, dx, dy, 格数)` 驱动（确定性）；
 *   · 拖拽那一条走**页面真实的触摸处理器**（onTouchStart/Move/End），坐标由用例给定 ——
 *     为什么不直接用 automator 的 Element.touchstart({x,y})：实测开发者工具会把合成触摸的
 *     坐标固定成 (44,44)（元素相对坐标没生效），拖多远都判成"没动"，属于自动化侧限制；
 *     这里改成「真处理器 + 真坐标」既覆盖了拖拽换算逻辑（像素→格数），又不会假失败。
 *   · 关卡数据与期望值在 Node 侧用同一份 `data/klotski-levels.js` + `game/klotski.js` 独立复算。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-klotski.js
 */

const H = require('./lib/harness');
const K = require('../miniprogram/game/klotski');
const LEVELS = require('../miniprogram/data/klotski-levels');

const PAGE_URL = '/pages/klotski/klotski';
const L1 = LEVELS.levels[0];
const L2 = LEVELS.levels[1];

/** 依次走一串走法（走法格式 [格子, dx, dy, 格数]） */
async function playMoves(page, moves) {
  for (const mv of moves) {
    await page.callMethod('_moveAtCell', mv[0], mv[1], mv[2], mv[3]);
    await page.waitFor(120);
  }
}

H.runSuite('verify-klotski（华容道）', async function (miniProgram, ck) {
  // 清掉本玩法的历史存档，保证「第 1 关解锁、第 2 关锁着」这类断言稳定
  await miniProgram.callWxMethod('removeStorageSync', 'ww_stars');
  await miniProgram.callWxMethod('removeStorageSync', 'ww_klotski_cur');

  console.log('[1/7] 选关页：30 关分 5 档渲染');
  const page = await H.goto(miniProgram, PAGE_URL, 1800);
  ck.check('进入华容道页', (await miniProgram.currentPage()).path === 'pages/klotski/klotski');
  ck.check('根容器 .page-klotski 已渲染', !!(await H.waitForSelector(page, '.page-klotski', 8000)));

  const d0 = await page.data();
  ck.check('关卡总数 30', d0.totalLevels === 30, '实际 = ' + d0.totalLevels);
  ck.check('按 5 个档位分组', (d0.levelGroups || []).length === 5,
    '实际 = ' + (d0.levelGroups || []).map(function (g) { return g.tier; }).join('/'));
  const groups = d0.levelGroups || [];
  ck.check('档位顺序：入门→进阶→困难→经典→炼狱',
    groups.map(function (g) { return g.tier; }).join(',') === '入门,进阶,困难,经典,炼狱',
    '实际 = ' + groups.map(function (g) { return g.tier; }).join(','));
  const allLevels = groups.reduce(function (arr, g) { return arr.concat(g.levels); }, []);
  ck.check('分组内的关卡数合计 30', allLevels.length === 30, '实际 = ' + allLevels.length);
  ck.check('第 1 关解锁', allLevels[0].locked === false);
  ck.check('第 2 关未解锁（还没通关第 1 关）', allLevels[1].locked === true);
  ck.check('关卡列表渲染出 30 行', !!(await H.waitForCount(page, '.kg-item', 30, 8000)));

  console.log('[2/7] 未解锁关卡点不进去');
  const lockedEl = (await page.$$('.kg-item'))[1];
  await lockedEl.tap();
  await page.waitFor(600);
  ck.check('点未解锁关卡仍在选关页', (await page.data()).playing === false,
    '实际 playing = ' + (await page.data()).playing);

  console.log('[3/7] 开局：10 个棋子、步数 0、最少 8 步');
  const firstEl = (await page.$$('.kg-item'))[0];
  await firstEl.tap();
  await page.waitFor(900);
  let d = await page.data();
  ck.check('进入对局态', d.playing === true, '实际 = ' + d.playing);
  ck.check('关卡名与档位正确', d.levelName === L1.name && d.tier === L1.tier,
    '实际 = ' + d.levelName + '/' + d.tier);
  ck.check('最少步数 = 关卡标注（' + L1.minMoves + '）', d.minMoves === L1.minMoves,
    '实际 = ' + d.minMoves);
  ck.check('步数从 0 开始', d.moves === 0, '实际 = ' + d.moves);
  ck.check('渲染 10 个棋子', (d.pieces || []).length === 10 && !!(await H.waitForCount(page, '.k-piece', 10, 8000)),
    '实际 = ' + (d.pieces || []).length);
  ck.check('棋盘 20 格且底边中间 2×2 为出口',
    (d.cells || []).filter(function (c) { return c.gate; }).length === 4,
    '出口格数 = ' + (d.cells || []).filter(function (c) { return c.gate; }).length);

  console.log('[4/7] 按最优解走 6 步后，用真实拖拽滑 2 格（应只算 1 步）');
  await playMoves(page, L1.solution.slice(0, 6));
  d = await page.data();
  ck.check('先走 6 步：步数记 6', d.moves === 6, '实际 = ' + d.moves);

  const multi = L1.solution[6];                       // [13, 0, -1, 2] = 格位 13 的棋子向上滑 2 格
  ck.check('第 7 步是 2 格的连续滑动（用于验证"一次滑动算 1 步"）', multi[3] === 2,
    '实际 dist = ' + multi[3]);
  const idx = (d.pieces || []).findIndex(function (p) { return p.cell === multi[0]; });
  ck.check('找到待拖拽的棋子（格位 ' + multi[0] + '）', idx >= 0, '实际 index = ' + idx);
  if (idx >= 0) {
    const board = await page.$('.k-board');
    const bSize = await board.size();          // 注意：Element.offset() 只有 left/top，尺寸要单独取
    const cellH = bSize.height / K.ROWS;
    const cx = 100;
    const cy = 300;
    console.log('        cellH = ' + cellH.toFixed(1) + 'px（棋盘高 ' + bSize.height + 'px / 5 行）');
    // 走页面真实的触摸处理器：向下滑 2 格（起点→终点位移 = 2 个格高）
    await page.callMethod('onTouchStart', {
      currentTarget: { dataset: { i: idx } },
      touches: [{ clientX: cx, clientY: cy }]
    });
    await page.callMethod('onTouchMove', { touches: [{ clientX: cx, clientY: cy - cellH }] });
    await page.callMethod('onTouchEnd', { changedTouches: [{ clientX: cx, clientY: cy - cellH * 2 }] });
    await page.waitFor(500);
    const after = await page.data();
    console.log('        拖拽 2 格后步数 = ' + after.moves);
    ck.check('拖 2 格只加 1 步（一次连续滑动算 1 步）', after.moves === 7,
      '6 → ' + after.moves);
    const movedTo = multi[0] - 2 * K.COLS;             // 上移 2 格 = 格位减 2 行
    ck.check('被拖的棋子确实上移了 2 格（格位 ' + multi[0] + ' → ' + movedTo + '）',
      (after.pieces || []).some(function (p) { return p.cell === movedTo; }),
      '实际格位 = ' + (after.pieces || []).map(function (p) { return p.cell; }).join(','));
  }

  console.log('[5/7] 撤销一步');
  const beforeUndo = (await page.data()).moves;
  await page.callMethod('undo');
  await page.waitFor(400);
  d = await page.data();
  ck.check('撤销后步数 -1', d.moves === beforeUndo - 1, beforeUndo + ' → ' + d.moves);

  console.log('[6/7] 提示：给出下一步（高亮棋子）');
  await page.callMethod('hint');
  await page.waitFor(600);
  d = await page.data();
  ck.check('提示返回下一步走法', !!d.hint && typeof d.hint.dx === 'number',
    '实际 hint = ' + JSON.stringify(d.hint));
  ck.check('提示同时选中了该棋子', d.selected >= 0, '实际 selected = ' + d.selected);

  console.log('[7/7] 按最优解走完 → 3★ + 进度 + 解锁下一关');
  // 复位后按完整最优解走一遍（撤销/提示不影响最优解，这里重开确保步数 = 最少步数）
  await page.callMethod('restart');
  await page.waitFor(800);
  await playMoves(page, L1.solution);
  await page.waitFor(600);
  d = await page.data();
  ck.check('通关（win=true）', d.win === true && d.over === true,
    'win = ' + d.win + ', over = ' + d.over);
  ck.check('步数 = 理论最少步数 ' + L1.minMoves, d.moves === L1.minMoves, '实际 = ' + d.moves);
  ck.check('按最优解通关得 3★', d.stars === 3, '实际 = ' + d.stars);
  ck.check('结算文案带步数对比', /最少/.test(d.settleMsg || ''), '实际 = ' + d.settleMsg);
  // 说明：settle-pop 是自定义组件，组件内部的 .over-mask 在自动化里查不到（组件隔离），
  // 所以页面上包了一层页面级容器 .k-settle 用于断言「弹层已挂载」。
  ck.check('结算弹层已挂载（.k-settle）',
    !!(await H.waitForSelector(page, '.k-settle', 6000)));

  const stars = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  // 存档键沿用 A 类玩法的老约定：<玩法>_<关卡>（与 g2048_1 / math24_1 一致）
  ck.check('进度写入 klotski_1 = 3', stars && stars['klotski_1'] === 3,
    '实际 = ' + JSON.stringify(stars && stars['klotski_1']));

  await page.callMethod('goLevels');
  await page.waitFor(600);
  const d2 = await page.data();
  const flat = (d2.levelGroups || []).reduce(function (arr, g) { return arr.concat(g.levels); }, []);
  ck.check('通关后第 2 关解锁', flat[1].locked === false, '第 2 关 locked = ' + flat[1].locked);
  ck.check('第 1 关显示 3 星', flat[0].stars === 3, '实际 = ' + flat[0].stars);

  console.log('[7.5/7] 演示通关不计星');
  const secondEl = (await page.$$('.kg-item'))[1];
  await secondEl.tap();
  await page.waitFor(900);
  ck.check('进入第 ' + L2.no + ' 关（' + L2.name + '，最少 ' + L2.minMoves + ' 步）',
    (await page.data()).curLevel === L2.no, '实际 = ' + (await page.data()).curLevel);
  await page.callMethod('demo');
  // 演示每步 260ms；但开发者工具在窗口不在前台时会把定时器节流到 ~1s/步，
  // 所以这里**轮询等状态**而不是等固定时长（最多 60s，够最坏情况的节流）。
  const demoDone = await H.waitForData(page, function (d) { return d.win === true; }, 60000, 'klotski demo win');
  ck.check('演示在超时前跑完', !!demoDone, '60s 内未完成演示');
  const dd = await page.data();
  ck.check('演示走完并判定通关', dd.win === true, 'win = ' + dd.win + ', moves = ' + dd.moves);
  ck.check('演示通关不计星（stars = 0）', dd.stars === 0, '实际 stars = ' + dd.stars);
  ck.check('演示通关的星级文案是 👀 而不是星', dd.starsText === '👀', '实际 = ' + dd.starsText);
  const stars2 = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  ck.check('演示不写进度（klotski_' + L2.no + ' 仍为空）', !stars2['klotski_' + L2.no],
    '实际 = ' + JSON.stringify(stars2['klotski_' + L2.no]));

  const cur = await miniProgram.currentPage();
  ck.check('全程未崩溃（仍在华容道页）', cur.path === 'pages/klotski/klotski', '实际 = ' + cur.path);
});
