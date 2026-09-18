'use strict';

// verify-rank.js —— 排行榜「玩法榜」改版验证（2026-09-18）
//
// 用户反馈：「排行榜的玩法进度向右超出边界了，这个玩法排行榜显示是不是不太友好呢，重新设计下」。
// 改版：原来一行平铺 14 个玩法 chips（把页面顶宽）→ 现在是「玩法卡片总览 → 详情榜」两层。
//
// 覆盖：
//   1. 玩法榜默认落在总览，渲染 14 张玩法卡片
//   2. 旧的一行玩法 chips（.gchip）已不存在（溢出根因）
//   3. 点卡片 → 进该玩法详情（出现详情头 + 榜单），再点左上角回总览
//   4. 字词类详情才有学段/题型筛选
//
// 运行：node e2e/verify-rank.js

const H = require('./lib/harness');
const catalog = require('../miniprogram/utils/game-catalog');

// 玩法榜只统计**已开放**的玩法（弹弹球是未解锁占位，没有成绩上报，不上榜）
const EXPECTED_GAMES = catalog.filter(function (g) { return g.unlocked; }).length;

H.runSuite('verify-rank（排行榜 · 玩法榜改版）', async function (miniProgram, ck) {
  // [0] 首页「完善昵称」引导条与「未注册不上榜」是同一件事的一体两面：
  //     已登录但没设昵称 = 未完成注册 → 首页必须给出入口（否则用户永远补不上）。
  console.log('[0/4] 首页：未完成注册时给出「完善昵称」引导');
  const home = await H.goto(miniProgram, '/pages/index/index', 1600);
  const hd = await home.data();
  if (hd.loggedIn) {
    const hasBar = !!(await home.$('.profilebar'));
    ck.check('引导条与 needProfile 状态一致', hasBar === !!hd.needProfile,
      'needProfile=' + hd.needProfile + ' 但 .profilebar ' + (hasBar ? '在' : '不在'));
    if (hd.needProfile) {
      const btn = await home.$('.pb-btn');
      ck.check('引导条带「去设置」按钮', !!btn);
    }
  } else {
    ck.check('未登录时首页显示游客引导条（不是完善资料条）',
      !!(await home.$('.guestbar')) && !(await home.$('.profilebar')));
  }

  console.log('[1/4] 进入排行榜并切到玩法榜');
  const page = await H.goto(miniProgram, '/pages/rank/rank', 1800);
  ck.check('排行榜根容器渲染', !!(await H.waitForSelector(page, '.page-rank', 8000)));

  const needLogin = (await page.data()).needLogin;
  if (needLogin) {
    ck.check('未登录时显示门禁条（受限页规范）', !!(await H.waitForSelector(page, '.gate-bar', 6000)));
    return;
  }

  const tabs = await page.$$('.rank-mode-tabs .tab');
  const gameTab = tabs && tabs[1];
  ck.check('存在「玩法 · 进度」切换页签', !!gameTab);
  if (!gameTab) return;
  await gameTab.tap();
  await page.waitFor(1200);

  console.log('[2/4] 总览：玩法卡片列表（14 款）+ 旧的平铺 chips 已删除');
  const cards = await H.waitForCount(page, '.gcard', EXPECTED_GAMES, 15000);
  ck.check('玩法卡片数量 = ' + EXPECTED_GAMES, !!cards, cards ? ('实际 ' + cards.length) : '超时');
  ck.check('旧的一行玩法 chips（.gchip）已不存在（溢出根因已消除）',
    (await page.$$('.gchip')).length === 0);
  const d0 = await page.data();
  ck.check('页面处于总览视图', d0.gameView === 'overview', '实际 = ' + d0.gameView);
  ck.check('总览数据条数 = ' + EXPECTED_GAMES, (d0.summaryList || []).length === EXPECTED_GAMES,
    '实际 = ' + (d0.summaryList || []).length);

  console.log('[3/4] 点第一张卡片 → 该玩法完整榜');
  const firstName = (d0.summaryList || [])[0] && d0.summaryList[0].label;
  ck.check('总览第一张是「字母射击」', firstName === '字母射击', '实际 = ' + firstName);
  if (!cards || !cards.length) return;
  await cards[0].tap();
  await page.waitFor(1400);
  const d1 = await page.data();
  ck.check('进入详情视图', d1.gameView === 'detail', '实际 = ' + d1.gameView);
  ck.check('详情头显示玩法名（与卡片一致）', d1.curGameLabel === firstName,
    '卡片 = ' + firstName + ' / 详情 = ' + d1.curGameLabel);
  ck.check('详情头 .detail-head 已渲染', !!(await H.waitForSelector(page, '.detail-head', 8000)));
  ck.check('总览卡片已让位（.gcard 数量为 0）', (await page.$$('.gcard')).length === 0);
  ck.check('字词类详情显示学段 + 题型筛选',
    d1.curGameNeedGrade === true && (await page.$$('.row-scroll')).length >= 2,
    'needGrade = ' + d1.curGameNeedGrade);

  console.log('[4/4] 左上角「全部玩法」→ 回总览');
  const back = await page.$('.back-pill');
  ck.check('左上角按钮存在', !!back);
  if (back) {
    await back.tap();
    await page.waitFor(1200);
    const d2 = await page.data();
    ck.check('回到总览视图', d2.gameView === 'overview', '实际 = ' + d2.gameView);
    ck.check('玩法卡片重新出现', (await page.$$('.gcard')).length === EXPECTED_GAMES,
      '实际 ' + (await page.$$('.gcard')).length);
  }
});
