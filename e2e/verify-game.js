'use strict';

/**
 * verify-game.js —— 端到端验证「字母射击」页面与玩法（2026-09-18 改版后）
 *
 * 改版背景：字母射击从 canvas 引擎改为 WXML/CSS + game/shoot.js 纯逻辑。
 * 因此本用例也重写：不再依赖 canvas 帧步进（_testStep / _testRecoil / _testSkinImage），
 * 改为**真实点击 + 页面测试钩子**：
 *   _testNeeded()      当前题依次要填的字符
 *   _testWord()        当前题的完整词
 *   _testTapCorrect()  自动点下一个正确格子（等价用户点对）
 *   _testTapWrong()    自动点一个错误格子（等价用户点错）
 *
 * 断言覆盖：
 *   A. 进关不自动结算、结构渲染、新手引导、HUD（护盾/题号）
 *   B. 点对补空 → 血条下降；填满全空 → 零失误击破 +10 分、连击累积、题号推进
 *   C. 点错 → 扣 1 点护盾 + MISS 反馈；护盾耗尽 → 本局结束跳结算
 *   D. 暂停/继续
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-game.js
 */

const H = require('./lib/harness');
const C = require('../miniprogram/utils/constants');
const shoot = require('../miniprogram/game/shoot');

const GAME_URL = '/pages/game/game?grade=kindergarten&level=1';
const EXPECTED_TOTAL_Q = 10;
const INIT_LIVES = C.GAME_CONFIG.initLives;
const LIVES_TEXT = '❤'.repeat(INIT_LIVES);

/** 等页面出现「下一题已就绪」的信号：pad 渲染出来且不在动画态 */
async function waitIdle(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 8000);
  while (Date.now() < deadline) {
    const d = await page.data();
    if (d.pad && d.pad.length && d.phase === 'idle') return d;
    await page.waitFor(120);
  }
  return await page.data();
}

/** 把一个空全部填对：直到本空填满（返回是否需要继续下一题） */
async function fillCurrentPad(page) {
  const before = await page.data();
  for (let i = 0; i < 12; i++) {
    const ok = await page.callMethod('_testTapCorrect');
    if (!ok) break;
    await page.waitFor(360);          // 覆盖飞行 220ms + 余量
    const d = await page.data();
    if (d.qIndex !== before.qIndex) return true;   // 已经进入下一题
    if (d.pad && d.pad.every((c) => c.used)) break;
  }
  return false;
}

H.runSuite('verify-game（字母射击 · 2026-09-18 改版）', async function (miniProgram, ck) {
  console.log('[1/8] 进入游戏页 ' + GAME_URL);
  const page = await H.goto(miniProgram, GAME_URL, 2000);

  let cur = await miniProgram.currentPage();
  ck.check('进入关卡后停留在游戏页（未自动跳结算页）', cur.path === 'pages/game/game', '实际路径 = ' + cur.path);
  if (cur.path !== 'pages/game/game') return;

  ck.check('游戏页根容器 .gs-page 已渲染', !!(await H.waitForSelector(page, '.gs-page', 8000)));

  console.log('[2/8] 处理进关前置（新手引导）');
  const steps = await H.clearGameGates(page);
  steps.forEach(function (s) { console.log('        · ' + s); });
  const gateData = await page.data();
  ck.check('新手引导遮罩已处理（tutorialStep=0）', !gateData.tutorialStep,
    '实际 tutorialStep = ' + gateData.tutorialStep);

  console.log('[3/8] 等待出题（词槽 + 字母面板）');
  ck.check('词槽 .gs-slot 已渲染', !!(await H.waitForSelector(page, '.gs-slot', 15000)));
  const padEls = await H.waitForSelector(page, '.gs-bullet', 15000);
  ck.check('字母面板 .gs-bullet 已渲染', !!padEls);
  if (!padEls) return;

  const d0 = await page.data();
  ck.check('页面 data.totalQ = ' + EXPECTED_TOTAL_Q, d0.totalQ === EXPECTED_TOTAL_Q, '实际 = ' + d0.totalQ);
  ck.check('页面 data.shield = ' + INIT_LIVES + '（护盾=命数口径）', d0.shield === INIT_LIVES,
    '实际 = ' + d0.shield);
  ck.check('护盾文案为 ' + INIT_LIVES + ' 颗心', d0.livesText === LIVES_TEXT, '实际 = ' + d0.livesText);
  ck.check('面板格子数 ≥ 空位数', (d0.pad || []).length >= (d0.slots || []).filter(function (x) { return !x.on; }).length,
    '实际 pad=' + (d0.pad || []).length);
  const hudQ = await H.textOf(page, '.hud-qnum');
  ck.check('HUD 题号显示第 1/' + EXPECTED_TOTAL_Q + ' 题', /1\s*\/\s*10/.test(hudQ || ''), '实际 = ' + JSON.stringify(hudQ));
  const hudLives = await H.textOf(page, '.hud-lives');
  ck.check('HUD 护盾与 data 一致', hudLives === LIVES_TEXT, '实际 = ' + JSON.stringify(hudLives));

  // ---- B1. 点对：补空、血条下降 ----
  console.log('[4/8] 点对字母：补空 + 血条下降');
  const word0 = await page.callMethod('_testWord');
  const needed0 = await page.callMethod('_testNeeded');
  ck.check('能读到当前题的词与待填字符', !!word0 && needed0 && needed0.length > 0,
    'word=' + word0 + ' needed=' + JSON.stringify(needed0));
  const hpBefore = d0.bossHp;
  ck.check('开局 Boss 血条 100%', hpBefore === 100, '实际 = ' + hpBefore);

  await page.callMethod('_testTapCorrect');
  await page.waitFor(700);
  const d1 = await page.data();
  ck.check('点对后血条下降（< 100%）', d1.bossHp < 100, '实际 = ' + d1.bossHp);
  ck.check('点对后不扣护盾', d1.shield === INIT_LIVES, '实际 = ' + d1.shield);

  // ---- B2. 填满整题：击破 + 零失误 +10 分 + 连击 ----
  console.log('[5/8] 填满全空 → 击破本题（零失误 +' + shoot.scorePerCorrect() + ' 分）');
  await fillCurrentPad(page);
  await page.waitFor(1200);
  const d2 = await waitIdle(page, 8000);
  console.log('        得分 ' + (d0.score || 0) + ' → ' + (d2.score || 0)
    + ' · 连击 ' + (d0.combo || 0) + ' → ' + (d2.combo || 0)
    + ' · 题号 ' + d0.qIndex + ' → ' + d2.qIndex);

  ck.check('零失误击破后得分 +' + shoot.scorePerCorrect(),
    (d2.score || 0) - (d0.score || 0) === shoot.scorePerCorrect(),
    (d0.score || 0) + ' → ' + (d2.score || 0));
  ck.check('连击累积到 1', d2.combo === 1, '实际 combo = ' + d2.combo);
  ck.check('题号推进到第 2 题', d2.qIndex === 2, '实际 qIndex = ' + d2.qIndex);
  ck.check('击破后没有扣护盾', d2.shield === INIT_LIVES, '实际 = ' + d2.shield);

  // ---- C. 点错：扣护盾 + MISS ----
  console.log('[6/8] 点错字母 → Boss 反击扣 1 点护盾');
  const d3 = await waitIdle(page, 8000);
  const shieldBefore = d3.shield;
  const tapped = await page.callMethod('_testTapWrong');
  ck.check('面板中存在可用于答错的格子', !!tapped, '返回值 = ' + tapped);
  await page.waitFor(1500);                 // 覆盖蓄力 140 + 反击 300 + 命中反馈
  const d4 = await page.data();
  ck.check('点错后扣 1 点护盾', d4.shield === shieldBefore - 1, shieldBefore + ' → ' + d4.shield);
  ck.check('点错后护盾文案同步变短', d4.livesText === '❤'.repeat(Math.max(0, shieldBefore - 1)),
    '实际 = ' + JSON.stringify(d4.livesText));
  ck.check('点错后连击归零', d4.combo === 0, '实际 combo = ' + d4.combo);

  // 点错之后仍可把本题补完（新版允许继续补，只是该题不算零失误）
  console.log('[6.5/8] 失误后继续补完本题（该题不计入零失误）');
  const scoreBeforeMiss = (await page.data()).score;
  await fillCurrentPad(page);
  await page.waitFor(1200);
  const d5 = await waitIdle(page, 8000);
  ck.check('失误过的题击破后不加分（口径 = 零失误题数 × 10）',
    (d5.score || 0) === scoreBeforeMiss, scoreBeforeMiss + ' → ' + (d5.score || 0));
  ck.check('失误过的题击破后题号仍推进', d5.qIndex > d3.qIndex, d3.qIndex + ' → ' + d5.qIndex);

  // ---- A. 暂停 / 继续 ----
  console.log('[7/8] 暂停与继续');
  const pauseBtn = await page.$('.gs-icon-sound:last-child') || await page.$('.pause-mask');
  if (pauseBtn) { /* 存在性由下面的 class 断言覆盖 */ }
  // 直接点 HUD 上第 2 个 .gs-icon-sound（第一个是声音）——用 $$ 取更稳
  const icons = await page.$$('.gs-icon-sound');
  ck.check('HUD 存在暂停与声音按钮', !!icons && icons.length >= 2, '实际 ' + (icons ? icons.length : 0));
  if (icons && icons.length >= 2) {
    const beforePause = await page.data();
    await icons[1].tap();
    await page.waitFor(500);
    const paused = await page.data();
    ck.check('点击暂停后进入暂停态', paused.paused === true, '实际 = ' + paused.paused);
    ck.check('暂停遮罩 .pause-mask 已渲染', !!(await page.$('.pause-mask')));
    const resume = await page.$('.pause-btn');
    if (resume) {
      const btns = await page.$$('.pause-btn');
      await btns[btns.length - 1].tap();      // 最后一个 = 继续
      await page.waitFor(500);
      const resumed = await page.data();
      ck.check('点击继续后退出暂停态', resumed.paused === false, '实际 = ' + resumed.paused);
    } else {
      ck.check('找到「继续」按钮', false);
    }
  }

  // ---- D. 护盾耗尽 → 本局结束 ----
  console.log('[8/8] 护盾耗尽 → 结束本局并跳结算');
  let guard = 0;
  while (guard++ < 12) {
    const d = await page.data();
    if (d.paused) { await page.callMethod('onResume'); await page.waitFor(200); }
    if (!d.shield || d.shield <= 0) break;
    const ok = await page.callMethod('_testTapWrong');
    if (!ok) { await page.callMethod('_testTapCorrect'); }
    await page.waitFor(1600);
    const cur2 = await miniProgram.currentPage();
    if (cur2.path !== 'pages/game/game') break;
  }
  await page.waitFor(1500);
  const endPage = await miniProgram.currentPage();
  ck.check('护盾耗尽后离开游戏页（跳结算页）',
    endPage.path === 'pages/result/result', '实际 = ' + endPage.path);
  if (endPage.path === 'pages/result/result') {
    const rd = await endPage.data();
    ck.check('结算页进入失败态（data.failed = true）', rd.failed === true, '实际 failed = ' + rd.failed);
    ck.check('结算页标题为失败文案', rd.titleText === '再接再厉！', '实际 = ' + JSON.stringify(rd.titleText));
    ck.check('结算页星星为 0（未零失误通关）', rd.stars === 0, '实际 stars = ' + rd.stars);
  }
});
