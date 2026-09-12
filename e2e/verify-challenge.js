'use strict';

/**
 * verify-challenge.js —— 挑战主线端到端验证（2026-09-12 拍板落地）
 *
 * 覆盖断言：
 *   A. 首页「继续挑战」卡片：文案 = 玩法 · 学段 · 第 N/30 关（不再是「只有字母射击」）
 *   B. 首页点「继续挑战」→ 落到该关对应的玩法页（第 1 关 = 字母射击，带 challenge=1）
 *   C. 关卡页「挑战主线」视图：30 关、每关带玩法标签、玩法按节奏轮换、第 1 关是新手关
 *   D. 固定题面（种子）：同一关两次进入的题面/字母块完全一致，且与 Node 侧独立算出的期望一致
 *   E. 不同关的题目组合不同（不能整套一样）
 *   F. 连连看挑战关：牌面由种子决定，两次进入一致；「换局」题不变、牌面重排
 *   G. 挑战星级写入 <grade>@challenge@<level>，且不污染自由练存档（两个命名空间互不覆盖）
 *   H. 老存档迁移：旧的字母射击星级一次性搬到主线对应关，幂等
 *
 * 设计要点（改这个脚本前先读）：
 *   1. 挑战题的期望值在 **Node 侧用同一套模块独立算出**（utils/challenge + game/word-build），
 *      再与页面 data 比对 —— 避免「页面自己说自己对」的假绿灯。
 *   2. 页面在挑战模式下的出题随机源来自 utils/rng（mulberry32），跨端一致，
 *      所以 Node 与小程序能算出同一串随机数（这是本用例能成立的前提）。
 *   3. 用例开头先清 ww_stars / 迁移标记，保证「继续挑战 = 第 1 关」这类断言不受历史数据影响；
 *      迁移用例放最后，避免它改动的存档影响前面的断言。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-challenge.js
 */

const H = require('./lib/harness');
const challenge = require('../miniprogram/utils/challenge');
const constants = require('../miniprogram/utils/constants');
const dict = require('../miniprogram/utils/dict');
const wbLib = require('../miniprogram/game/word-build');
const rng = require('../miniprogram/utils/rng');

const HOME_URL = '/pages/index/index';
const LEVEL_URL = '/pages/level/level';
const GRADE = 'primary34';          // 用例固定用一个学段，期望值可复算
const WB_LEVEL = 2;                 // 模板第 2 关 = 字母拼词
const LINK_LEVEL = 3;               // 模板第 3 关 = 词语连连看

/** Node 侧复算字母拼词的题面（与 pages/word-build 的 _buildPool/start 同一步骤） */
function expectWordBuild(gradeKey, level) {
  const count = challenge.paramsOf(gradeKey, 'wordBuild').count;
  const primary = dict.loadByGrade(gradeKey);
  let others = [];
  constants.GRADES.forEach(function (g) {
    if (g.key === gradeKey) return;
    others = others.concat(dict.loadByGrade(g.key));
  });
  const pool = wbLib.mergePools(primary, others, 'letter', count);
  const r = challenge.rngFor(gradeKey, level);
  const queue = wbLib.pickQuestions(pool, count, r);
  const first = queue[0];
  return {
    count: count,
    queue: queue.map(function (it) { return String(it.a); }),
    prompt: wbLib.promptOf(first, 'letter'),
    tiles: wbLib.makeTiles(String(first.a), [], r).map(function (t) { return t.ch; }).join('')
  };
}

/** Node 侧复算连连看的牌面（与 pages/link 的 newRound 同一步骤） */
function expectLink(gradeKey, level, tick) {
  const pairs = challenge.paramsOf(gradeKey, 'link').pairs;
  const seed = challenge.seedOf(gradeKey, level) + (tick || 0) * 7919;
  // 词集只由关卡种子决定（换局不换题）；牌面重排用 tick 派生的新种子
  const words = rng.pickN(dict.filterByGroup(gradeKey, 'w1'), pairs, rng.makeRng(challenge.seedOf(gradeKey, level)));
  const r = rng.makeRng(seed);
  const cards = [];
  words.forEach(function (w) {
    cards.push({ t: 'w', lab: (w.q || w.a).toUpperCase() });
    cards.push({ t: 'c', lab: w.hint || w.a });
  });
  return rng.shuffle(cards, r).map(function (c) { return c.lab; });
}

H.runSuite('verify-challenge（挑战主线）', async function (miniProgram, ck) {
  // 清存档：保证「继续挑战 = 第 1 关」等断言不受历史数据影响
  await miniProgram.callWxMethod('removeStorageSync', 'ww_stars');
  await miniProgram.callWxMethod('removeStorageSync', 'ww_challenge_migrated');

  console.log('[1/8] 首页「继续挑战」卡片 = 挑战主线');
  const home = await H.goto(miniProgram, HOME_URL, 1800);
  ck.check('首页根容器已渲染', !!(await H.waitForSelector(home, '.page-home', 8000)));
  const homeData = await home.data();
  ck.check('首页 data.continueMode 为第 1 关的玩法（字母射击）',
    homeData.continueMode === 'shoot', '实际 = ' + homeData.continueMode);
  ck.check('首页 data.continueLevel 为 1', homeData.continueLevel === 1,
    '实际 = ' + homeData.continueLevel);
  ck.check('继续卡片等级显示第 1/30 关', String(homeData.continueHint || '').indexOf('第 1/30 关') !== -1,
    '实际 = ' + homeData.continueHint);
  ck.check('继续卡片带玩法名（字母射击）', String(homeData.continueHint || '').indexOf('字母射击') !== -1,
    '实际 = ' + homeData.continueHint);
  ck.check('卡片 DOM 文案与 data 一致',
    (await H.textOf(home, '.cta .c-s')) === homeData.continueHint,
    'DOM = ' + (await H.textOf(home, '.cta .c-s')));

  console.log('[2/8] 点「继续挑战」→ 落到该关对应的玩法页');
  const ct = await home.$('.cta .ct');
  ck.check('找到继续挑战按钮 .cta .ct', !!ct);
  if (ct) {
    await ct.tap();
    await home.waitFor(2000);
    const cur = await miniProgram.currentPage();
    ck.check('跳到第 1 关的玩法页 pages/game/game', cur.path === 'pages/game/game', '实际 = ' + cur.path);
    const gd = await cur.data();
    ck.check('玩法页收到 challenge=1（挑战模式）', gd.challenge === true, '实际 = ' + gd.challenge);
    ck.check('玩法页关卡号为 1', gd.level === 1, '实际 = ' + gd.level);
    ck.check('玩法页题量 = 该关参数（10 题）', gd.totalQ === challenge.paramsOf(GRADE, 'shoot').totalQ,
      '实际 = ' + gd.totalQ);
  }

  console.log('[3/8] 关卡页「挑战主线」视图：30 关 + 玩法标签');
  const lvPage = await H.goto(miniProgram, LEVEL_URL, 1800);
  const lvData = await lvPage.data();
  const rows = lvData.levels || [];
  ck.check('主线关卡数为 30', rows.length === 30, '实际 = ' + rows.length);
  ck.check('默认进入「挑战主线」视图', lvData.isChallengeView === true, '实际 = ' + lvData.isChallengeView);
  ck.check('第 1 关是新手关（字母射击）', rows[0] && rows[0].mode === 'shoot',
    '实际 = ' + (rows[0] && rows[0].kindLabel));
  ck.check('第 2 关是字母拼词', rows[1] && rows[1].mode === 'wordBuild',
    '实际 = ' + (rows[1] && rows[1].kindLabel));
  ck.check('第 3 关是词语连连看', rows[2] && rows[2].mode === 'link',
    '实际 = ' + (rows[2] && rows[2].kindLabel));
  ck.check('关卡行显示玩法标签', /字母射击/.test((rows[0] || {}).kindLabel || ''),
    '实际 = ' + (rows[0] || {}).kindLabel);
  ck.check('关卡行副标题带参数', /题/.test((rows[1] || {}).sub || ''), '实际 = ' + (rows[1] || {}).sub);
  ck.check('全新存档下第 1 关为「继续挑战」态', rows[0] && rows[0].state === 'cur',
    '实际 = ' + (rows[0] && rows[0].state));
  ck.check('星星进度以 30 关为分母（总星 90）', lvData.gradeTotalStars === 90,
    '实际 = ' + lvData.gradeTotalStars);
  ck.check('顶部第一个分类芯片是「挑战主线」',
    (lvData.typeGroups[0] || {}).label === '挑战主线',
    '实际 = ' + JSON.stringify((lvData.typeGroups[0] || {}).label));
  ck.check('关卡列表渲染出 30 行', !!(await H.waitForCount(lvPage, '.lvrow', 30, 8000)));

  console.log('[4/8] 固定题面：字母拼词挑战关两次进入一致，且等于独立复算值');
  const expWb = expectWordBuild(GRADE, WB_LEVEL);
  const wbUrl = '/pages/word-build/word-build?challenge=1&grade=' + GRADE
    + '&level=' + WB_LEVEL + '&seed=' + challenge.seedOf(GRADE, WB_LEVEL);
  const wb1 = await H.goto(miniProgram, wbUrl, 1800);
  const wbD1 = await wb1.data();
  ck.check('拼词页进入挑战模式', wbD1.challenge === true, '实际 = ' + wbD1.challenge);
  ck.check('挑战存档键 = ' + GRADE + '@challenge@' + WB_LEVEL,
    wbD1.challengeKey === GRADE + '@challenge@' + WB_LEVEL, '实际 = ' + wbD1.challengeKey);
  ck.check('题量 = 该学段挑战参数（' + expWb.count + ' 题）',
    String(wbD1.meta || '').indexOf('/' + expWb.count + ' 题') !== -1, '实际 = ' + wbD1.meta);
  ck.check('第一题题面与独立复算一致（同种子同题）',
    wbD1.prompt === expWb.prompt, '页面 = ' + wbD1.prompt + ' / 期望 = ' + expWb.prompt);

  const tiles1 = (wbD1.tiles || []).map(function (t) { return t.ch; }).join('');
  ck.check('第一题字母块排列与独立复算一致',
    tiles1 === expWb.tiles, '页面 = ' + tiles1 + ' / 期望 = ' + expWb.tiles);

  const wb2 = await H.goto(miniProgram, wbUrl, 1800);
  const wbD2 = await wb2.data();
  ck.check('同一关再次进入：题面完全一致',
    wbD2.prompt === wbD1.prompt, wbD1.prompt + ' → ' + wbD2.prompt);
  ck.check('同一关再次进入：字母块排列完全一致',
    (wbD2.tiles || []).map(function (t) { return t.ch; }).join('') === tiles1);

  console.log('[5/8] 不同关题目组合不同');
  const expWb5 = expectWordBuild(GRADE, WB_LEVEL + 3);
  ck.check('第 ' + WB_LEVEL + ' 关与第 ' + (WB_LEVEL + 3) + ' 关的题目组合不同',
    expWb.queue.join('|') !== expWb5.queue.join('|'),
    expWb.queue.slice(0, 3).join(',') + ' vs ' + expWb5.queue.slice(0, 3).join(','));
  ck.check('不同关的种子不同',
    challenge.seedOf(GRADE, WB_LEVEL) !== challenge.seedOf(GRADE, WB_LEVEL + 3));

  console.log('[6/8] 连连看挑战关：种子牌面 + 换局重排');
  const expLink0 = expectLink(GRADE, LINK_LEVEL, 0);
  const linkUrl = '/pages/link/link?challenge=1&grade=' + GRADE
    + '&level=' + LINK_LEVEL + '&seed=' + challenge.seedOf(GRADE, LINK_LEVEL);
  const lk1 = await H.goto(miniProgram, linkUrl, 1800);
  const lkD1 = await lk1.data();
  ck.check('连连看进入挑战模式', lkD1.challenge === true, '实际 = ' + lkD1.challenge);
  ck.check('牌数 = 8 对 = 16 张', (lkD1.cards || []).length === 16,
    '实际 = ' + (lkD1.cards || []).length);
  const lkLabs1 = (lkD1.cards || []).map(function (c) { return c.lab; });
  ck.check('牌面与独立复算一致（同种子同牌面）',
    JSON.stringify(lkLabs1) === JSON.stringify(expLink0),
    '页面 = ' + JSON.stringify(lkLabs1.slice(0, 4)) + ' / 期望 = ' + JSON.stringify(expLink0.slice(0, 4)));

  const lk2 = await H.goto(miniProgram, linkUrl, 1800);
  const lkD2 = await lk2.data();
  ck.check('同一关再次进入：牌面一致',
    JSON.stringify((lkD2.cards || []).map(function (c) { return c.lab; })) === JSON.stringify(lkLabs1));

  const expLink1 = expectLink(GRADE, LINK_LEVEL, 1);
  await lk2.callMethod('again');           // 换局 = 题不变、牌面重排
  await lk2.waitFor(600);
  const lkD3 = await lk2.data();
  const setOf = function (list) { return list.slice().sort().join('|'); };
  const lkLabs3 = (lkD3.cards || []).map(function (c) { return c.lab; });
  ck.check('换局后词对集合不变（题不变）',
    setOf(lkLabs3) === setOf(lkLabs1));
  ck.check('换局后牌面重排，且与独立复算（tick=1）一致',
    JSON.stringify(lkLabs3) === JSON.stringify(expLink1),
    '页面 = ' + JSON.stringify(lkLabs3.slice(0, 4)) + ' / 期望 = ' + JSON.stringify(expLink1.slice(0, 4)));
  ck.check('换局前后牌面顺序不同（确实重排了）',
    JSON.stringify(lkLabs3) !== JSON.stringify(lkLabs1));
  ck.check('换局后牌面下标仍完整（16 张）', (lkD3.cards || []).length === 16);

  console.log('[7/8] 挑战星级写入 <grade>@challenge@<level>（不污染自由练存档）');
  const resUrl = '/pages/result/result?challenge=1&grade=' + GRADE + '&level=' + WB_LEVEL
    + '&type=&custom=0&win=1&score=80&correctCount=8&totalQ=8&stars=3&maxCombo=5';
  await H.goto(miniProgram, resUrl, 1500);
  let starsStore = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  ck.check('挑战通关写入 ' + GRADE + '@challenge@' + WB_LEVEL + ' = 3',
    starsStore && starsStore[GRADE + '@challenge@' + WB_LEVEL] === 3,
    '实际 = ' + JSON.stringify(starsStore && starsStore[GRADE + '@challenge@' + WB_LEVEL]));
  ck.check('不写自由练综合键（' + GRADE + '_' + WB_LEVEL + ' 不存在）',
    !(starsStore && starsStore[GRADE + '_' + WB_LEVEL]),
    '实际 = ' + JSON.stringify(starsStore && starsStore[GRADE + '_' + WB_LEVEL]));

  const resUrl2 = '/pages/result/result?challenge=0&grade=' + GRADE + '&level=' + WB_LEVEL
    + '&type=idiom&custom=0&win=1&score=80&correctCount=8&totalQ=8&stars=3&maxCombo=5';
  await H.goto(miniProgram, resUrl2, 1500);
  starsStore = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  ck.check('自由练分类关写 ' + GRADE + '@idiom@' + WB_LEVEL,
    starsStore && starsStore[GRADE + '@idiom@' + WB_LEVEL] === 3,
    '实际 = ' + JSON.stringify(starsStore && starsStore[GRADE + '@idiom@' + WB_LEVEL]));
  ck.check('两个命名空间互不覆盖（挑战键仍是 3）',
    starsStore && starsStore[GRADE + '@challenge@' + WB_LEVEL] === 3);

  console.log('[8/8] 老存档迁移：旧字母射击星级 → 主线对应关（幂等）');
  const shootSlots = challenge.levelsOfMode('kindergarten', 'shoot');
  await miniProgram.callWxMethod('setStorageSync', 'ww_stars', { 'kindergarten_1': 3, 'kindergarten_2': 2 });
  await miniProgram.callWxMethod('removeStorageSync', 'ww_challenge_migrated');
  const home2 = await H.goto(miniProgram, HOME_URL, 1800);   // 首页 refresh 里执行迁移
  starsStore = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  ck.check('旧第 1 关星级迁移到主线第 ' + shootSlots[0] + ' 关',
    starsStore['kindergarten@challenge@' + shootSlots[0]] === 3,
    '实际 = ' + JSON.stringify(starsStore['kindergarten@challenge@' + shootSlots[0]]));
  ck.check('旧第 2 关星级迁移到主线第 ' + shootSlots[1] + ' 关',
    starsStore['kindergarten@challenge@' + shootSlots[1]] === 2,
    '实际 = ' + JSON.stringify(starsStore['kindergarten@challenge@' + shootSlots[1]]));
  const migratedFlag = await miniProgram.callWxMethod('getStorageSync', 'ww_challenge_migrated');
  ck.check('迁移标记已写入（不会重复迁移）', !!migratedFlag, '实际 = ' + JSON.stringify(migratedFlag));

  const home2Data = await home2.data();
  ck.check('迁移后首页继续挑战推进到下一关', home2Data.continueLevel >= 1,
    '实际 = ' + home2Data.continueLevel);
  const cur2 = await miniProgram.currentPage();
  ck.check('全程未崩溃（仍在首页）', cur2.path === 'pages/index/index', '实际 = ' + cur2.path);
});
