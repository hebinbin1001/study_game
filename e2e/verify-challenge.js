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
// P2 后模板（6 款轮换，每款 5 关）：1 字母射击 → 2 消消乐 → 3 字母拼词 → 4 连连看 → 5 成语 → 6 贪吃蛇
const WB_LEVEL = 3;                 // 字母拼词
const LINK_LEVEL = 4;               // 词语连连看
const MATCH_LEVEL = 2;              // 词义消消乐
const IDIOM_LEVEL = 5;              // 成语拼字
const SNAKE_LEVEL = 6;              // 单词贪吃蛇

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
/**
 * 连连看挑战词池：必须与 pages/link 的 _loadW1 完全一致。
 *
 * 为什么强调（2026-09-12）：原来这里用的是 dict.filterByGroup(gradeKey, 'w1')，而 'w1' 是
 * **类型码不是分组 key** —— isItemInGroup 找不到该分组就静默放行整库，成语/挖空词全混进来，
 * 牌面会出现「舍*忘*」这种带 * 的题面。页面侧已在 e6d2c34 修成「type === 'w1' 且纯英文」，
 * 测试侧同步口径，否则复算出来的词集与页面必然对不上（挑战用例会红）。
 */
function w1Pool(gradeKey) {
  return dict.loadByGrade(gradeKey).filter(function (w) {
    return w.type === 'w1' && /^[A-Za-z]+$/.test(String(w.q || ''));
  });
}

function expectLink(gradeKey, level, tick) {
  const pairs = challenge.paramsOf(gradeKey, 'link').pairs;
  const seed = challenge.seedOf(gradeKey, level) + (tick || 0) * 7919;
  // 词集只由关卡种子决定（换局不换题）；牌面重排用 tick 派生的新种子
  let words = rng.pickN(w1Pool(gradeKey), pairs, rng.makeRng(challenge.seedOf(gradeKey, level)));
  if (words.length < pairs) {
    // 本学段纯英文单词不够 → 并入其他学段补齐（与页面 _loadW1 的兜底一致，保证关卡可玩）
    let merged = [];
    constants.GRADES.forEach(function (g) { merged = merged.concat(w1Pool(g.key)); });
    words = rng.pickN(merged, pairs, rng.makeRng(challenge.seedOf(gradeKey, level)));
  }
  const r = rng.makeRng(seed);
  const cards = [];
  words.forEach(function (w) {
    cards.push({ t: 'w', lab: (w.q || w.a).toUpperCase() });
    cards.push({ t: 'c', lab: w.hint || w.a });
  });
  return rng.shuffle(cards, r).map(function (c) { return c.lab; });
}

/** Node 侧复算消消乐的牌面（与 pages/match 的 newRound 同一步骤） */
function expectMatch(gradeKey, level) {
  const pairs = challenge.paramsOf(gradeKey, 'match').pairs;
  const r = challenge.rngFor(gradeKey, level);
  const pickWords = (k) => dict.loadByGrade(k)
    .filter((w) => w.type === 'w1' && /^[A-Za-z]+$/.test(String(w.q || '')));
  let words = pickWords(gradeKey);
  if (words.length < pairs) words = pickWords('kindergarten');
  const pool = rng.shuffle(words, r).slice(0, pairs);
  const cards = [];
  pool.forEach((w) => {
    const key = w.q + '|' + w.a;
    cards.push({ t: 'w', key, lab: (w.q || w.a).toUpperCase() });
    cards.push({ t: 'c', key, lab: w.hint || w.a });
  });
  return rng.shuffle(cards, r).map((c) => c.lab);
}

/** Node 侧复算成语拼字的第一题与字块（与 pages/idiom-build 同一步骤） */
function expectIdiom(gradeKey, level) {
  const count = challenge.paramsOf(gradeKey, 'idiom').count;
  const primary = dict.loadByGrade(gradeKey);
  let others = [];
  constants.GRADES.forEach((g) => {
    if (g.key === gradeKey) return;
    others = others.concat(dict.loadByGrade(g.key));
  });
  const pool = wbLib.mergePools(primary, others, 'idiom', count);
  const r = challenge.rngFor(gradeKey, level);
  const queue = wbLib.pickQuestions(pool, count, r);
  const first = queue[0];
  const answer = String(first.a);
  return {
    count,
    prompt: wbLib.promptOf(first, 'idiom'),
    tiles: wbLib.makeTiles(answer, wbLib.noiseChars(pool, answer, wbLib.EXTRA_TILES, r), r)
      .map((t) => t.ch).join('')
  };
}

/** Node 侧复算贪吃蛇的目标词（与 pages/snake 同一步骤） */
function expectSnake(gradeKey, level) {
  const need = challenge.paramsOf(gradeKey, 'snake').words;
  const pool = dict.loadByGrade(gradeKey).filter((w) => w.type === 'w1' && /^[A-Za-z]+$/.test(String(w.q || '')));
  const r = challenge.rngFor(gradeKey, level);
  const picked = rng.shuffle(pool, r).slice(0, Math.min(need, pool.length));
  return { count: need, first: picked[0], all: picked };
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

  console.log('[2/8] 关卡页「挑战主线」视图：30 关 + 玩法标签');
  const lvPage = await H.goto(miniProgram, LEVEL_URL, 1800);
  const lvData = await lvPage.data();
  const rows = lvData.levels || [];
  ck.check('主线关卡数为 30', rows.length === 30, '实际 = ' + rows.length);
  ck.check('默认进入「挑战主线」视图', lvData.isChallengeView === true, '实际 = ' + lvData.isChallengeView);
  ck.check('第 1 关是新手关（字母射击）', rows[0] && rows[0].mode === 'shoot',
    '实际 = ' + (rows[0] && rows[0].kindLabel));
  ck.check('第 2 关是词义消消乐', rows[1] && rows[1].mode === 'match',
    '实际 = ' + (rows[1] && rows[1].kindLabel));
  ck.check('第 3 关是字母拼词', rows[2] && rows[2].mode === 'wordBuild',
    '实际 = ' + (rows[2] && rows[2].kindLabel));
  ck.check('第 4 关是词语连连看', rows[3] && rows[3].mode === 'link',
    '实际 = ' + (rows[3] && rows[3].kindLabel));
  ck.check('第 5 关是成语拼字', rows[4] && rows[4].mode === 'idiom',
    '实际 = ' + (rows[4] && rows[4].kindLabel));
  ck.check('第 6 关是单词贪吃蛇', rows[5] && rows[5].mode === 'snake',
    '实际 = ' + (rows[5] && rows[5].kindLabel));
  ck.check('主线恰好 6 款玩法轮换', new Set(rows.map(function (r) { return r.mode; })).size === 6,
    '实际 = ' + Array.from(new Set(rows.map(function (r) { return r.mode; }))).join(','));
  ck.check('关卡行显示玩法标签', /字母射击/.test((rows[0] || {}).kindLabel || ''),
    '实际 = ' + (rows[0] || {}).kindLabel);
  ck.check('关卡行副标题带该关参数（每行都要有）',
    rows.every(function (r) { return r.sub && r.sub.length > 0; }),
    '空副标题的关 = ' + JSON.stringify(rows.filter(function (r) { return !r.sub; }).map(function (r) { return r.level; })));
  ck.check('字母拼词那关的副标题含题量', /题/.test((rows[2] || {}).sub || ''), '实际 = ' + (rows[2] || {}).sub);
  ck.check('消消乐那关的副标题含对数', /对/.test((rows[1] || {}).sub || ''), '实际 = ' + (rows[1] || {}).sub);
  ck.check('全新存档下第 1 关为「继续挑战」态', rows[0] && rows[0].state === 'cur',
    '实际 = ' + (rows[0] && rows[0].state));
  ck.check('星星进度以 30 关为分母（总星 90）', lvData.gradeTotalStars === 90,
    '实际 = ' + lvData.gradeTotalStars);
  ck.check('顶部第一个分类芯片是「挑战主线」',
    (lvData.typeGroups[0] || {}).label === '挑战主线',
    '实际 = ' + JSON.stringify((lvData.typeGroups[0] || {}).label));
  ck.check('关卡列表渲染出 30 行', !!(await H.waitForCount(lvPage, '.lvrow', 30, 8000)));

  // 终关 Boss（方案 A，2026-09-12）：第 30 关固定字母射击，题量 15 + 命数 7
  const bossRow = rows[challenge.BOSS_LEVEL - 1] || {};
  ck.check('第 30 关是终关 Boss（字母射击）', bossRow.mode === 'shoot' && bossRow.isBoss === true,
    '实际 = ' + JSON.stringify({ mode: bossRow.mode, isBoss: bossRow.isBoss }));
  ck.check('Boss 关副标题含 BOSS 与 15 题 7 命', bossRow.sub === 'BOSS · 15 题 · 7 命',
    '实际 = ' + bossRow.sub);
  ck.check('Boss 关在页面上有 BOSS 徽标（.lv-boss 恰好 1 个）',
    (await lvPage.$$('.lv-boss')).length === 1,
    '实际 = ' + (await lvPage.$$('.lv-boss')).length);
  ck.check('Boss 关整行带金色高亮类 .lvrow.boss',
    (await lvPage.$$('.lvrow.boss')).length === 1);
  ck.check('Boss 关参数来自 challenge.BOSS_PARAMS（题量 15 / 命数 7）',
    challenge.paramsOf(GRADE, 'shoot', challenge.BOSS_LEVEL).totalQ === 15 &&
    challenge.paramsOf(GRADE, 'shoot', challenge.BOSS_LEVEL).lives === 7);

  console.log('[3/8] 固定题面：字母拼词挑战关两次进入一致，且等于独立复算值');
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

  console.log('[4/8] 不同关题目组合不同');
  const expWb5 = expectWordBuild(GRADE, WB_LEVEL + 3);
  ck.check('第 ' + WB_LEVEL + ' 关与第 ' + (WB_LEVEL + 3) + ' 关的题目组合不同',
    expWb.queue.join('|') !== expWb5.queue.join('|'),
    expWb.queue.slice(0, 3).join(',') + ' vs ' + expWb5.queue.slice(0, 3).join(','));
  ck.check('不同关的种子不同',
    challenge.seedOf(GRADE, WB_LEVEL) !== challenge.seedOf(GRADE, WB_LEVEL + 3));

  console.log('[4.5/8] P2 新玩法接入：消消乐 / 成语拼字 / 单词贪吃蛇（种子可复现）');
  // 消消乐：牌面与 Node 侧复算一致，两次进入一致，且词卡都是纯英文
  const expMatch = expectMatch(GRADE, MATCH_LEVEL);
  const matchUrl = challenge.pageUrl(challenge.levelAt(GRADE, MATCH_LEVEL), GRADE);
  const m1 = await H.goto(miniProgram, matchUrl, 1800);
  const mD1 = await m1.data();
  ck.check('消消乐进入挑战模式', mD1.challenge === true, '实际 = ' + mD1.challenge);
  ck.check('消消乐牌数 = 关卡参数（' + expMatch.length + ' 张）',
    (mD1.cards || []).length === expMatch.length, '实际 = ' + (mD1.cards || []).length);
  ck.check('消消乐牌面与独立复算一致（同种子同牌面）',
    JSON.stringify((mD1.cards || []).map(function (c) { return c.lab; })) === JSON.stringify(expMatch),
    '页面 = ' + JSON.stringify((mD1.cards || []).slice(0, 3).map(function (c) { return c.lab; })));
  const m2 = await H.goto(miniProgram, matchUrl, 1500);
  ck.check('消消乐同一关再次进入：牌面一致',
    JSON.stringify(((await m2.data()).cards || []).map(function (c) { return c.lab; })) === JSON.stringify(expMatch));
  const badWordCards = (mD1.cards || []).filter(function (c) { return c.t === 'w' && !/^[A-Z]+$/.test(c.lab); });
  ck.check('消消乐词卡都是纯英文（修掉「分组 key 传成类型码」导致的带 * 词卡）',
    badWordCards.length === 0, '异常词卡 = ' + JSON.stringify(badWordCards.map(function (c) { return c.lab; })));

  // 成语拼字：题面与字块与 Node 侧复算一致
  const expIdiom = expectIdiom(GRADE, IDIOM_LEVEL);
  const idiomUrl = challenge.pageUrl(challenge.levelAt(GRADE, IDIOM_LEVEL), GRADE);
  const i1 = await H.goto(miniProgram, idiomUrl, 1800);
  const iD1 = await i1.data();
  ck.check('成语拼字进入挑战模式', iD1.challenge === true, '实际 = ' + iD1.challenge);
  ck.check('成语题量 = 该学段挑战参数（' + expIdiom.count + ' 题）',
    String(iD1.meta || '').indexOf('/' + expIdiom.count + ' 题') !== -1, '实际 = ' + iD1.meta);
  ck.check('成语第一题题面与独立复算一致',
    iD1.prompt === expIdiom.prompt, '页面 = ' + iD1.prompt + ' / 期望 = ' + expIdiom.prompt);
  ck.check('成语字块排列与独立复算一致',
    (iD1.tiles || []).map(function (t) { return t.ch; }).join('') === expIdiom.tiles,
    '页面 = ' + (iD1.tiles || []).map(function (t) { return t.ch; }).join('') + ' / 期望 = ' + expIdiom.tiles);

  // 贪吃蛇：目标词由关卡种子决定
  const expSnake = expectSnake(GRADE, SNAKE_LEVEL);
  const snakeUrl = challenge.pageUrl(challenge.levelAt(GRADE, SNAKE_LEVEL), GRADE);
  const s1 = await H.goto(miniProgram, snakeUrl, 1800);
  const sD1 = await s1.data();
  ck.check('贪吃蛇进入挑战模式', sD1.challenge === true, '实际 = ' + sD1.challenge);
  ck.check('贪吃蛇目标词与独立复算一致（同种子同词）', sD1.word === expSnake.first.q,
    '页面 = ' + sD1.word + ' / 期望 = ' + expSnake.first.q);
  const s2 = await H.goto(miniProgram, snakeUrl, 1500);
  ck.check('贪吃蛇同一关再次进入：目标词一致', (await s2.data()).word === sD1.word);

  console.log('[5/8] 连连看挑战关：种子牌面 + 换局重排');
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

  console.log('[6/8] 挑战星级写入 <grade>@challenge@<level>（不污染自由练存档）');
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

  console.log('[7.5/8] P3 里程碑宝箱：通 10 关可领 +10 星（幂等）');
  // 造「幼儿园已通 10 关」的存档（关卡页默认学段是幼儿园）
  const seedStars = {};
  for (let i = 1; i <= 10; i++) seedStars['kindergarten@challenge@' + i] = 1;
  await miniProgram.callWxMethod('setStorageSync', 'ww_stars', seedStars);
  await miniProgram.callWxMethod('removeStorageSync', 'ww_chest_claimed');
  const chestPage = await H.goto(miniProgram, LEVEL_URL, 1800);
  let chestData = await chestPage.data();
  ck.check('关卡页渲染 3 个里程碑宝箱', (chestData.chests || []).length === 3,
    '实际 = ' + (chestData.chests || []).length);
  ck.check('通 10 关后 10 关宝箱可领取', chestData.chests[0].claimable === true,
    '实际 = ' + JSON.stringify(chestData.chests[0]));
  ck.check('20 关宝箱仍锁着（只通了 10 关）', chestData.chests[1].claimable === false,
    '实际 = ' + JSON.stringify(chestData.chests[1]));
  ck.check('可领取的宝箱在页面上有高亮状态', !!(await chestPage.$('.chest.ready')));

  await chestPage.callMethod('claimChest', { currentTarget: { dataset: { at: 10 } } });
  await chestPage.waitFor(700);
  chestData = await chestPage.data();
  ck.check('领取后宝箱标记为已领取', chestData.chests[0].claimed === true && chestData.chests[0].claimable === false,
    '实际 = ' + JSON.stringify(chestData.chests[0]));
  const claimed = await miniProgram.callWxMethod('getStorageSync', 'ww_chest_claimed');
  ck.check('领取记录落本地（幂等键 学段:关数）', !!(claimed && claimed['kindergarten:10']),
    '实际 = ' + JSON.stringify(claimed));

  await chestPage.callMethod('claimChest', { currentTarget: { dataset: { at: 10 } } });
  await chestPage.waitFor(500);
  ck.check('重复领取不报错且状态不变（幂等）', (await chestPage.data()).chests[0].claimed === true);

  console.log('[7/8] 老存档迁移：旧字母射击星级 → 主线对应关（幂等）');
  const shootSlots = challenge.levelsOfMode('kindergarten', 'shoot');
  await miniProgram.callWxMethod('setStorageSync', 'ww_stars', { 'kindergarten_1': 3, 'kindergarten_2': 2 });
  await miniProgram.callWxMethod('removeStorageSync', 'ww_challenge_migrated');
  const home2 = await H.goto(miniProgram, HOME_URL, 1800);   // 首页 refresh 里执行迁移
  starsStore = await miniProgram.callWxMethod('getStorageSync', 'ww_stars');
  ck.check('旧第 1 关星级迁移到主线第 1 关', starsStore['kindergarten@challenge@1'] === 3,
    '实际 = ' + JSON.stringify(starsStore['kindergarten@challenge@1']));
  ck.check('旧第 2 关星级迁移到主线第 2 关（按序号平移）',
    starsStore['kindergarten@challenge@2'] === 2,
    '实际 = ' + JSON.stringify(starsStore['kindergarten@challenge@2']));
  const migratedFlag = await miniProgram.callWxMethod('getStorageSync', 'ww_challenge_migrated');
  ck.check('迁移标记已写入（不会重复迁移）', !!migratedFlag, '实际 = ' + JSON.stringify(migratedFlag));

  const home2Data = await home2.data();
  ck.check('迁移后首页继续挑战推进到下一关', home2Data.continueLevel >= 1,
    '实际 = ' + home2Data.continueLevel);

  // ===== 最后一段：继续挑战 → 终关 Boss 对局 =====
  // 编排约束（踩过两次）：开发者工具在「对局页 Canvas rAF 还开着时 reLaunch 走」会偶发挂死
  // （表现为 timeout / page destroyed）。所以整条用例**只允许加载一次对局页**，且必须是最后一步。
  // 这里用真实用户路径进入 Boss：把前 29 关点满 3 星（并模拟已登录，游客第 4 关起会被拦），
  // 首页「继续挑战」自然落到第 30 关 Boss。
  console.log('[8/9] 首页「继续挑战」在通关前 29 关后指向终关 Boss');
  await miniProgram.callWxMethod('setStorageSync', 'ww_token', 'e2e-token');
  await miniProgram.callWxMethod('setStorageSync', 'ww_user', { openid: 'e2e_openid', nickname: 'E2E' });
  const bossStars = {};
  for (let i = 1; i < challenge.BOSS_LEVEL; i++) bossStars['kindergarten@challenge@' + i] = 3;
  await miniProgram.callWxMethod('setStorageSync', 'ww_stars', bossStars);
  await miniProgram.callWxMethod('removeStorageSync', 'ww_challenge_migrated');
  const home3 = await H.goto(miniProgram, HOME_URL, 1800);
  const h3 = await home3.data();
  ck.check('前 29 关满星后「继续挑战」指向第 ' + challenge.BOSS_LEVEL + ' 关',
    h3.continueLevel === challenge.BOSS_LEVEL, '实际 = ' + h3.continueLevel);
  ck.check('继续挑战指向 Boss 关的玩法（字母射击）', h3.continueMode === 'shoot', '实际 = ' + h3.continueMode);
  ck.check('卡片文案带 BOSS 标记', /BOSS/.test(h3.continueHint || ''), '实际 = ' + h3.continueHint);
  ck.check('卡片文案带第 30/30 关', /第 30\/30 关/.test(h3.continueHint || ''), '实际 = ' + h3.continueHint);

  console.log('[9/9] 点「继续挑战」→ 终关 Boss 对局（15 题 + 7 命）');
  const ct = await home3.$('.cta .ct');
  ck.check('找到继续挑战按钮 .cta .ct', !!ct);
  if (ct) {
    await ct.tap();
    await home3.waitFor(2200);
    const cur4 = await miniProgram.currentPage();
    ck.check('落到 Boss 玩法页 pages/game/game', cur4.path === 'pages/game/game', '实际 = ' + cur4.path);
    const bossData = await cur4.data();
    ck.check('Boss 关玩法页收到 challenge=1（挑战模式）', bossData.challenge === true,
      '实际 = ' + bossData.challenge);
    ck.check('Boss 关关卡号为 ' + challenge.BOSS_LEVEL, bossData.level === challenge.BOSS_LEVEL,
      '实际 = ' + bossData.level);
    ck.check('Boss 关题量为 15（普通关是 10）', bossData.totalQ === challenge.BOSS_PARAMS.totalQ,
      '实际 = ' + bossData.totalQ);
    ck.check('Boss 关命数为 7（data.livesText 为 7 颗心）', bossData.livesText === '❤'.repeat(7),
      '实际 = ' + JSON.stringify(bossData.livesText) + '（长度 ' + String(bossData.livesText || '').length + '）');
    const bossHud = await H.textOf(cur4, '.hud-lives');
    ck.check('Boss 关 HUD 命数文案 = 7 颗心', bossHud === '❤'.repeat(7), '实际 = ' + JSON.stringify(bossHud));
    const bossQ = await H.textOf(cur4, '.hud-qnum');
    ck.check('Boss 关题号显示为第 1/15 题', /1\s*\/\s*15/.test(bossQ || ''), '实际 = ' + JSON.stringify(bossQ));
    ck.check('Boss 关出满 4 个选项（对局正常开始）',
      !!(await H.waitForCount(cur4, '.option', 4, 15000)));
    ck.check('全程未崩溃（停在 Boss 玩法页）',
      (await miniProgram.currentPage()).path === 'pages/game/game');
  }
});
