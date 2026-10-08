'use strict';

// verify-daily-season-pk.js —— 每日挑战赛 / 赛季 / 好友 PK（2026-10-08 新增三件套）
//
// 覆盖：
//   1. 首页三件套入口（每日挑战 / 赛季 / 好友 PK）渲染
//   2. 每日挑战赛：今日日期 → 开始答题（10 题 · 4 选项）→ 答满出结算
//   3. 赛季：赛季名 / 剩余天数 / 三档奖励渲染
//   4. 好友 PK：页面渲染（未登录 = 登录引导；已登录 = 发起入口）
//
// ⚠️ 三个功能都要生产建表（docs/sql/2026-10-08-赛季与PK建表.sql）。
//    DDL 没执行时接口返回 available:false，页面必须降级成「功能准备中」而不是白屏 ——
//    用例对这种降级不判红（与 verify-admin 的「无口令降级」同一口径）。
//
// 运行：node e2e/verify-daily-season-pk.js

const H = require('./lib/harness');

H.runSuite('verify-daily-season-pk（每日挑战 / 赛季 / 好友 PK）', async function (miniProgram, ck) {
  console.log('[1/4] 首页三件套入口渲染');
  const home = await H.goto(miniProgram, '/pages/index/index', 1800);
  const tri = await H.waitForCount(home, '.tri', 3, 8000);
  ck.check('首页有 3 个新入口卡', !!tri, tri ? ('实际 ' + tri.length) : '超时');
  const triText = await H.textOf(home, '.trinity');
  ck.check('入口文案包含「每日挑战 / 赛季 / 好友 PK」',
    !!triText && triText.indexOf('每日挑战') >= 0 && triText.indexOf('赛季') >= 0 && triText.indexOf('好友 PK') >= 0,
    '实际 = ' + JSON.stringify(triText));

  console.log('[2/4] 每日挑战赛：开始 → 答满 10 题 → 结算');
  const dc = await H.goto(miniProgram, '/pages/daily-challenge/daily-challenge', 1500);
  ck.check('每日挑战页根容器渲染', !!(await H.waitForSelector(dc, '.dc-page', 8000)));
  const dcData = await dc.data();
  ck.check('拿到「今天」的日期（东八区）',
    /^\d{4}-\d{2}-\d{2}$/.test(String(dcData.dateKey || '')),
    '实际 = ' + JSON.stringify(dcData.dateKey));

  if (dcData.available === false) {
    ck.check('服务端未就绪时降级为「准备中」（不白屏）',
      !!(await H.waitForSelector(dc, '.dc-empty', 5000)));
  } else {
    await dc.callMethod('start');
    const okPlaying = await H.waitForData(dc, function (d) { return d.phase === 'playing'; }, 8000, '进入答题态');
    ck.check('点开始后进入答题态', !!okPlaying);
    const playing = await dc.data();
    ck.check('题目 10 道（与其它玩法口径一致）', (playing.quiz || []).length === 10,
      '实际 = ' + (playing.quiz || []).length);
    const q0 = (playing.quiz || [])[0] || {};
    ck.check('每题 4 个选项', (q0.options || []).length === 4, '实际 = ' + (q0.options || []).length);
    ck.check('题面非空', !!q0.word, '实际 = ' + JSON.stringify(q0.word));

    let guard = 0;
    while (guard++ < 15) {
      const cur = await dc.data();
      if (cur.phase !== 'playing') break;
      await dc.callMethod('_testAnswer', true);
      await dc.waitFor(60);
    }
    const done = await dc.data();
    ck.check('答满题量进入结算态', done.phase === 'done', '实际 = ' + done.phase);
    ck.check('全对时结算答对 10 题',
      !!(done.result && done.result.correct === 10),
      '实际 = ' + JSON.stringify(done.result));
    ck.check('结算后仍能看到今日榜容器', !!(await H.waitForSelector(dc, '.dc-rank', 5000)));
  }

  console.log('[3/4] 赛季页：赛季名 / 剩余天数 / 奖励档位');
  const season = await H.goto(miniProgram, '/pages/season/season', 1500);
  ck.check('赛季页根容器渲染', !!(await H.waitForSelector(season, '.se-page', 8000)));
  const sData = await season.data();
  if (sData.available === false) {
    ck.check('服务端未就绪时降级为「准备中」（不白屏）',
      !!(await H.waitForSelector(season, '.se-empty', 5000)));
  } else {
    ck.check('赛季名非空', !!(sData.season && sData.season.name),
      '实际 = ' + JSON.stringify(sData.season));
    ck.check('赛季 key 形如 2026-S5',
      /^\d{4}-S[1-6]$/.test(String((sData.season || {}).key || '')),
      '实际 = ' + JSON.stringify((sData.season || {}).key));
    ck.check('剩余天数在 1~62 之间（双月赛季）',
      (sData.season || {}).daysLeft >= 1 && (sData.season || {}).daysLeft <= 62,
      '实际 = ' + (sData.season || {}).daysLeft);
    ck.check('奖励说明 3 档', (sData.tiers || []).length === 3,
      '实际 = ' + (sData.tiers || []).length);
    ck.check('奖励档位卡渲染', (await H.waitForCount(season, '.se-tier', 3, 5000)) !== null);
  }

  console.log('[4/4] 好友 PK：页面渲染 + 未登录引导 / 已登录发起');
  const pk = await H.goto(miniProgram, '/pages/pk/pk', 1500);
  ck.check('PK 页根容器渲染', !!(await H.waitForSelector(pk, '.pk-page', 8000)));
  const pkData = await pk.data();
  if (pkData.available === false) {
    ck.check('服务端未就绪时降级为「准备中」（不白屏）',
      !!(await H.waitForSelector(pk, '.pk-empty', 5000)));
  } else if (!pkData.loggedIn) {
    ck.check('未登录时给登录引导（不直接弹窗打断）',
      !!(await H.waitForSelector(pk, '.pk-login-tip', 5000)));
  } else {
    ck.check('已登录时显示「发起挑战」入口',
      !!(await H.waitForSelector(pk, '.pk-start', 5000)));
    await pk.callMethod('startCreate');
    const okPkPlaying = await H.waitForData(pk, function (d) { return d.phase === 'playing'; }, 8000, 'PK 答题态');
    ck.check('发起挑战后进入答题态', !!okPkPlaying);
    const pkQ = await pk.data();
    ck.check('PK 同样是 10 题', (pkQ.quiz || []).length === 10, '实际 = ' + (pkQ.quiz || []).length);
  }
});
