'use strict';

// verify-quiz.js —— 限时抢答（2026-09-19 新增玩法，第 7 条玩法线）
//
// 覆盖：
//   1. 玩法 tab 里能看到「限时抢答」，且它是一条玩法线（有 lineMode）
//   2. 关卡页 ?mode=quiz 直达该线，30 关、副标题带「题量 · 秒数」
//   3. 对局：题干/4 选项渲染、答对加分、答错扣 2 秒并断连击
//   4. 题量答满 → 结算弹层；挑战局写星走 <学段>@mode_quiz@<关卡> 且带「下一关」
//
// 计时相关一律用页面钩子 _testStopTimer 冻结，避免用例等真实秒数（会假失败）。
//
// 运行：node e2e/verify-quiz.js

const H = require('./lib/harness');
const challenge = require('../miniprogram/utils/challenge');

const LINE_URL = '/pages/level/level?mode=quiz';
const QUIZ_PAGE = 'pages/quiz/quiz';

H.runSuite('verify-quiz（限时抢答）', async function (miniProgram, ck) {
  console.log('[1/5] 玩法 tab 里能看到「限时抢答」且是玩法线');
  const pl = await H.goto(miniProgram, '/pages/playlist/playlist', 1800);
  const plData = await pl.data();
  const quiz = (plData.games || []).find(function (g) { return g.key === 'quiz'; });
  ck.check('玩法目录里有「限时抢答」', !!quiz, '实际 = ' + JSON.stringify((plData.games || []).map((g) => g.key)));
  ck.check('它是一条玩法线（带 lineMode=quiz）', !!(quiz && quiz.lineMode === 'quiz'),
    '实际 = ' + (quiz && quiz.lineMode));

  console.log('[2/5] 关卡页 ?mode=quiz：30 关 + 副标题带秒数');
  const lv = await H.goto(miniProgram, LINE_URL, 1800);
  const rows = await H.waitForCount(lv, '.lvrow', 30, 15000);
  ck.check('关卡行 30 关', !!rows, rows ? ('实际 ' + rows.length) : '超时');
  const sub = await H.textOf(lv, '.lvrow .lvrow-sub') || await H.textOf(lv, '.lvrow');
  const lvData0 = await lv.data();
  const sub0 = (lvData0.levels && lvData0.levels[0] && lvData0.levels[0].sub) || '';
  ck.check('副标题带「题 · 秒」（难度用时间做）', /\d+\s*题\s*·\s*\d+\s*秒/.test(sub0),
    '实际 = ' + JSON.stringify(sub0) + ' / DOM = ' + JSON.stringify(sub));

  console.log('[3/5] 进对局：冻结计时 → 题干 + 4 个选项');
  const page = await H.goto(miniProgram, '/pages/quiz/quiz?challenge=1&line=mode_quiz&grade=kindergarten&level=1', 1600);
  ck.check('落到限时抢答页', page.path === QUIZ_PAGE, '实际 = ' + page.path);
  ck.check('根容器渲染', !!(await H.waitForSelector(page, '.page-quiz', 8000)));
  await page.callMethod('_testStopTimer');            // 冻结倒计时，避免用例等真实秒数
  await page.waitFor(300);
  const d0 = await page.data();
  ck.check('题干非空', !!d0.stem, '实际 = ' + JSON.stringify(d0.stem));
  ck.check('恰好 4 个选项', (d0.options || []).length === 4, '实际 = ' + (d0.options || []).length);
  ck.check('正确答案恰好一个', (d0.options || []).filter(function (o) { return o.ok; }).length === 1);
  // 注意：从进页到冻结计时之间会走掉几秒（用例 settle + 加载），所以断言「不超过参数秒数」而不是精确相等
  const wantSecs = challenge.lineLevelAt('kindergarten', 'quiz', 1).params.seconds;
  ck.check('倒计时不超过关卡参数的秒数（且仍在走）',
    d0.timeLeft <= wantSecs && d0.timeLeft > wantSecs - 20,
    '参数 = ' + wantSecs + ' / 实际 = ' + d0.timeLeft);

  console.log('[4/5] 答对加分；答错扣 2 秒 + 断连击');
  const before = await page.data();
  await page.callMethod('_testAnswer', true);
  await page.waitFor(900);
  const afterOk = await page.data();
  ck.check('答对后得分增加', (afterOk.score || 0) > (before.score || 0),
    before.score + ' → ' + afterOk.score);
  ck.check('答对后连击 +1', afterOk.combo === 1, '实际 = ' + afterOk.combo);

  const timeBefore = (await page.data()).timeLeft;
  await page.callMethod('_testStopTimer');
  const wrong = await page.callMethod('_testAnswer', false);
  ck.check('还能继续答题（题量未满）', wrong === true);
  await page.waitFor(1200);
  const afterBad = await page.data();
  ck.check('答错扣 2 秒', afterBad.timeLeft === timeBefore - 2,
    timeBefore + ' → ' + afterBad.timeLeft);
  ck.check('答错后连击归零', afterBad.combo === 0, '实际 = ' + afterBad.combo);

  console.log('[5/5] 答满题量 → 结算；挑战局写星 + 带「下一关」');
  // 先把本关星级与存档快照，确认只写 mode_quiz 命名空间
  const starsBefore = (await miniProgram.callWxMethod('getStorageSync', 'ww_stars')) || {};
  await page.callMethod('_testStopTimer');
  let guard = 0;
  while (guard++ < 20) {
    const d = await page.data();
    if (d.settle) break;
    const ok = await page.callMethod('_testAnswer', true);
    if (!ok) break;
    await page.waitFor(750);
    await page.callMethod('_testStopTimer');          // 每题后重新冻结（答对不扣时间，但保险）
  }
  const done = await page.data();
  ck.check('答满题量后弹出结算层', done.settle === true, '实际 = ' + done.settle);
  ck.check('通关时星级 ≥1（全对）', !!done.win, '实际 win = ' + done.win);

  const stars = (await miniProgram.callWxMethod('getStorageSync', 'ww_stars')) || {};
  ck.check('挑战星级写入 kindergarten@mode_quiz@1',
    stars['kindergarten@mode_quiz@1'] >= 1,
    '实际 = ' + JSON.stringify(stars['kindergarten@mode_quiz@1']));
  ck.check('主线 @challenge@ 存档未被本用例改动',
    stars['kindergarten@challenge@1'] === starsBefore['kindergarten@challenge@1']);

  // 「下一关」由页面 data.showNext 驱动（按钮在 settle-pop 组件内部，选择器跨组件取不稳）
  ck.check('结算层已备好「下一关」（第 1 关不是最后一关）', done.showNext === true,
    '实际 = ' + done.showNext);
});
