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
  // [0] 2026-10-08「登录即有名」：首页原来的「完善昵称后即可上榜」引导条已删除 ——
  //     注册就发默认昵称（战士 XXXX），登录即上榜，没有需要「补」的东西了。
  //     这条从「必须有引导条」反过来验「不许再有引导条」，防止旧口径回潮。
  console.log('[0/4] 首页：不再需要「完善昵称」引导（登录即有名）');
  const home = await H.goto(miniProgram, '/pages/index/index', 1600);
  const hd = await home.data();
  ck.check('首页不再出现「完善昵称」引导条', !(await home.$('.profilebar')));
  ck.check('后端不再下发 needProfile=true（资料无需「完善」）', !hd.needProfile,
    'needProfile = ' + hd.needProfile);
  if (!hd.loggedIn) {
    ck.check('未登录时首页仍显示游客引导条', !!(await home.$('.guestbar')));
  }

  console.log('[1/4] 进入排行榜并切到玩法榜');
  const page = await H.goto(miniProgram, '/pages/rank/rank', 1800);
  ck.check('排行榜根容器渲染', !!(await H.waitForSelector(page, '.page-rank', 8000)));

  const needLogin = (await page.data()).needLogin;
  if (needLogin) {
    ck.check('未登录时显示门禁条（受限页规范）', !!(await H.waitForSelector(page, '.gate-bar', 6000)));
    return;
  }

  // 总榜（默认视图）：排名徽章必须有内容
  // 背景（2026-09-29）：模板里写了 {{getRankEmoji(item.rank)}} —— 小程序 WXML **不支持**
  // 在 {{}} 里调用方法，会静默渲染成空，整列排名徽章看不见（返回按钮那轮一起抓到的）。
  const rankCell = await H.textOf(page, '.rank-number');
  ck.check('总榜排名徽章有内容（不是空字符串）', !!(rankCell && rankCell.trim()),
    '实际 = ' + JSON.stringify(rankCell));
  ck.check('总榜第 1 名显示奖牌或名次', !!(rankCell && /\S/.test(rankCell)),
    '实际 = ' + JSON.stringify(rankCell));

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
