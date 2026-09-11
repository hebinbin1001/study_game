'use strict';

/**
 * verify-snake.js —— 端到端验证「单词贪吃蛇」游戏逻辑
 *
 * 覆盖断言：
 *   A. 页面与初始态：根容器渲染、10×10=100 格、生命 3、目标词卡（英文+释义+拼写进度）
 *   B. 词库来源：目标词必须是可直接逐字母拼写的纯英文单词，进度每格都是字母
 *      —— 锁住「filterByGroup 传类型码 w1 静默放行全库」与「分组 word 混入 w2 挖空词」两类缺陷
 *   C. 食物生成规则：场上 4 个字母食物 = 1 个「应拼字母」(food-ok) + 3 个干扰字母(food-bad)，
 *      且 food-ok 的字母 === 进度条里下一个待拼字母（按序吃字母的核心规则）
 *   D. 移动与转向：冻结主循环后逐步推进，蛇头按当前方向前进 1 格；
 *      用真实触摸处理器注入下滑 → 方向变为「下」，推进后行号 +1；180° 反向被拒绝
 *   E. 吃食物规则：吃到干扰字母 → 生命 -1；吃到应拼字母 → 得分 +5 且拼写进度推进
 *
 * 设计要点（踩坑记录，改这个脚本前务必先读）：
 *   1. 本页 setInterval(_tick, 300)，蛇从 (5,3) 向右直行，约 1.8s 撞墙扣命。
 *      纯等待式断言必然竞态 → 统一 callMethod('_stopLoop') 冻结主循环，
 *      再用 callMethod('_tick') 手动步进，把游戏变成确定性状态机；
 *      转向仍走真实 onTouchStart/onTouchEnd（|位移| 需 ≥18px）。
 *   2. startGame 只设置内部 _dir = 1【不走 setData】，data.dir 会残留上一局的值。
 *      按 data.dir 推理朝向会错 → 归位后必须用一次「垂直转向」把方向同步成已知值。
 *   3. 不要用「反复重掷食物直到命中」的纯概率做法：蛇头位置越靠边，
 *      正前方可用格越少，蛇头到底行时可用格为 0，重掷多少次都不可能命中。
 *      正确做法是「归位到已知朝向 + 三个方向轮流瞄准」，把概率压到实际必然命中。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-snake.js
 */

const H = require('./lib/harness');

const PAGE_URL = '/pages/snake/snake';
const SIZE = 10;
const CELL_COUNT = SIZE * SIZE;
const LIVES = 3;
const FOOD_N = 4;
const SCORE_PER_LETTER = 5;

// 方向编号与 snake.js 一致：0=上 1=右 2=下 3=左
const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };

/** 冻结主循环，避免 300ms 定时器在断言期间改变状态 */
async function freeze(page) {
  await page.callMethod('_stopLoop');
  await page.waitFor(150);
}

/** 手动推进 n 步（每步 1 格） */
async function step(page, n) {
  for (let i = 0; i < n; i++) {
    await page.callMethod('_tick');
    await page.waitFor(90);
  }
}

/** 用真实触摸处理器注入一次滑动手势（|位移| 需 ≥18 才转向） */
async function swipe(page, dir) {
  const d = { 0: [0, -80], 1: [80, 0], 2: [0, 80], 3: [-80, 0] }[dir];
  await page.callMethod('onTouchStart', { touches: [{ clientX: 200, clientY: 200 }] });
  await page.callMethod('onTouchEnd', {
    changedTouches: [{ clientX: 200 + d[0], clientY: 200 + d[1] }]
  });
  await page.waitFor(120);
}

/**
 * 归位到确定状态并冻结：重开一局 → 冻结 → 用一次垂直转向把方向同步成已知的「下」。
 * 之所以要那一次转向：startGame 只设内部 _dir=1，不走 setData，
 * data.dir 会残留上一局的值，按它推理朝向会错。
 */
async function resetAndFreeze(page) {
  await page.callMethod('startGame');
  await page.waitFor(200);
  await freeze(page);
  await swipe(page, DIR.DOWN); // 从内部 _dir=1(右) 转到 2(下)：允许且会 setData
}

function headIndexOf(cells) {
  return (cells || []).findIndex(function (c) { return c.cls === 'head'; });
}

function clsOf(cells, i) {
  return cells && cells[i] ? cells[i].cls : '';
}

/** 沿指定方向扫描，返回最近的指定类型食物；没有则 null */
function aheadOfKind(data, dir, kind) {
  const cells = data.cells || [];
  const head = headIndexOf(cells);
  if (head < 0) return null;
  const hr = Math.floor(head / SIZE);
  const hc = head % SIZE;

  const scan = [];
  if (dir === DIR.RIGHT) {
    for (let c = hc + 1; c < SIZE; c++) scan.push(hr * SIZE + c);
  } else if (dir === DIR.LEFT) {
    for (let c = hc - 1; c >= 0; c--) scan.push(hr * SIZE + c);
  } else if (dir === DIR.DOWN) {
    for (let r = hr + 1; r < SIZE; r++) scan.push(r * SIZE + hc);
  } else {
    for (let r = hr - 1; r >= 0; r--) scan.push(r * SIZE + hc);
  }

  for (let k = 0; k < scan.length; k++) {
    const cls = clsOf(cells, scan[k]);
    if (cls === kind) return { idx: scan[k], kind: cls, steps: k + 1, headIdx: head, dir: dir };
  }
  return null;
}

/** 与 _setDir 的规则一致：同奇偶（含同向与 180° 反向）会被拒绝 */
function perpendicularOf(dir) {
  return (dir === DIR.LEFT || dir === DIR.RIGHT) ? [DIR.UP, DIR.DOWN] : [DIR.LEFT, DIR.RIGHT];
}

/**
 * 找到一个「当前朝向即可直达」的指定类型食物。
 * 每轮：先看保持当前朝向能否命中 → 再看两个垂直方向（能命中的话先转向再命中）
 *       → 都不行则重掷食物进入下一轮。
 * 这样在蛇头处于边角、可用格很少时，仍能靠换向把可命中区域扩到最大。
 */
async function aimFoodAhead(page, wantKind, maxAttempts) {
  for (let a = 0; a < maxAttempts; a++) {
    let data = await page.data();
    const cur = data.dir == null ? DIR.RIGHT : data.dir;

    let hit = aheadOfKind(data, cur, wantKind);
    if (hit) return hit;

    const perp = perpendicularOf(cur);
    for (let i = 0; i < perp.length; i++) {
      hit = aheadOfKind(data, perp[i], wantKind);
      if (hit) {
        await swipe(page, perp[i]);
        const after = await page.data();
        if (after.dir === perp[i]) {
          const h2 = aheadOfKind(after, perp[i], wantKind);
          if (h2) return h2;
        }
      }
    }

    await page.callMethod('_spawnFoods', true);
    await page.waitFor(60);
  }
  return null;
}

/** 读某格渲染出的字符（走真实 DOM，不依赖内部字段名） */
async function letterAt(page, idx) {
  const els = await page.$$('.grid .cell');
  if (!els[idx]) return null;
  return els[idx].text();
}

H.runSuite('verify-snake（单词贪吃蛇）', async function (miniProgram, ck) {
  console.log('[1/8] 进入 ' + PAGE_URL);
  const page = await H.goto(miniProgram, PAGE_URL, 400);

  const cur = await miniProgram.currentPage();
  ck.check('进入贪吃蛇页', cur.path === 'pages/snake/snake', '实际 = ' + cur.path);
  if (cur.path !== 'pages/snake/snake') return;

  await freeze(page);
  ck.check('已冻结主循环（_stopLoop）', true);

  ck.check('根容器 .page-snake 已渲染', !!(await H.waitForSelector(page, '.page-snake', 8000)));
  const cells = await H.waitForCount(page, '.grid .cell', CELL_COUNT, 15000);
  ck.check('网格为 ' + SIZE + '×' + SIZE + '=' + CELL_COUNT + ' 格', !!cells,
    cells ? ('实际 ' + cells.length) : '超时');
  if (!cells) return;

  // 无条件归位：冻结前蛇可能已撞墙扣命（300ms/tick，进页面约 1s 就可能掉命），
  // 且 startGame 只设内部 _dir=1 不走 setData，data.dir 会残留上一局的值。
  // 归位后 lives/score/word 与【朝向】都确定，后续断言才成立。
  console.log('        → 归位到确定起始态（重开一局 + 冻结 + 朝向同步为「下」）');
  await resetAndFreeze(page);
  let data = await page.data();
  ck.check('归位后生命恢复为 ' + LIVES, data.lives === LIVES, '实际 = ' + data.lives);
  ck.check('归位后朝向同步为已知值「下」(2)', data.dir === DIR.DOWN, '实际 dir = ' + data.dir);

  // A. 初始态与目标词卡
  console.log('[2/8] 校验初始态与目标词卡');
  ck.check('初始生命为 ' + LIVES, data.lives === LIVES, '实际 = ' + data.lives);
  ck.check('初始得分为 0', data.score === 0, '实际 = ' + data.score);
  ck.check('初始未结算', data.over === false, '实际 over = ' + data.over);

  const word = data.word || '';
  ck.check('开局给出目标词（非空）', word.length > 0, '实际 = ' + JSON.stringify(word));
  ck.check('词卡释义非空（给中文释义）', !!(data.meaning && data.meaning.length), '实际 = ' + JSON.stringify(data.meaning));
  ck.check('拼写进度长度 = 目标词长度', (data.progress || []).length === word.length,
    '进度 ' + (data.progress || []).length + ' vs 词长 ' + word.length);
  ck.check('拼写进度初始全部未完成', (data.progress || []).every(function (p) { return !p.done; }));
  ck.check('目标词标签为第 1 词', /^第 1\/\d+ 词$/.test(data.targetLabel || ''), '实际 = ' + data.targetLabel);

  ck.check('.wc-en 渲染出目标词',
    ((await H.textOf(page, '.wc-en')) || '').toUpperCase() === word.toUpperCase(),
    '实际 = ' + (await H.textOf(page, '.wc-en')));
  ck.check('.wc-zh 渲染出释义', !!(await H.textOf(page, '.wc-zh')), '实际 = ' + (await H.textOf(page, '.wc-zh')));

  // B. 词库来源：必须可直接逐字母拼写
  console.log('[3/8] 校验目标词可逐字母拼写（B 词库来源）');
  ck.check('目标词是纯英文单词（可逐字母拼写）', /^[A-Za-z]+$/.test(word),
    '实际词 = ' + JSON.stringify(word)
    + '（汉字/成语说明分组 key 传成了类型码 w1；含 * 或空格说明混入了 w2 挖空词或 fill 整句）');
  ck.check('拼写进度每格均为英文字母',
    (data.progress || []).every(function (p) { return /^[A-Z]$/.test(p.ch); }),
    '实际 = ' + JSON.stringify((data.progress || []).map(function (p) { return p.ch; })));

  // C. 食物生成规则
  console.log('[4/8] 校验食物生成规则');
  const okIdx = (data.cells || []).findIndex(function (c) { return c.cls === 'food-ok'; });
  const badCount = (data.cells || []).filter(function (c) { return c.cls === 'food-bad'; }).length;
  ck.check('恰好 1 个应拼字母食物（food-ok）', okIdx >= 0, '下标 = ' + okIdx);
  ck.check('干扰字母食物数为 ' + (FOOD_N - 1), badCount === FOOD_N - 1, '实际 = ' + badCount);
  ck.check('恰好 1 个蛇头（head）',
    (data.cells || []).filter(function (c) { return c.cls === 'head'; }).length === 1);
  ck.check('初始蛇身 2 节（body）',
    (data.cells || []).filter(function (c) { return c.cls === 'body'; }).length === 2);

  const needCh = ((data.progress || []).filter(function (p) { return !p.done; })[0] || {}).ch;
  const okLetter = await letterAt(page, okIdx);
  console.log('        应拼字母 = ' + needCh + ' · food-ok 渲染字母 = ' + okLetter);
  ck.check('food-ok 字母 === 进度条下一个待拼字母', (okLetter || '').toUpperCase() === needCh,
    '格子字母 ' + okLetter + ' vs 待拼 ' + needCh);

  // D. 移动与转向（朝向已归位为「下」，全程按已知朝向断言，不假设初始为右）
  console.log('[5/8] 校验移动与真实触摸转向');
  const headBefore = headIndexOf((await page.data()).cells);
  await step(page, 1);
  const headAfter = headIndexOf((await page.data()).cells);
  ck.check('推进 1 步蛇头沿当前朝向「下」前进 1 格（下标 +' + SIZE + '）',
    headAfter === headBefore + SIZE, headBefore + ' → ' + headAfter);

  await swipe(page, DIR.RIGHT); // 从「下」转「右」：允许
  let d2 = await page.data();
  ck.check('右滑手势后方向变为「右」(1)', d2.dir === DIR.RIGHT, '实际 dir = ' + d2.dir);

  const headBeforeRight = headIndexOf(d2.cells);
  await step(page, 1);
  d2 = await page.data();
  ck.check('沿「右」推进 1 步蛇头下标 +1',
    headIndexOf(d2.cells) === headBeforeRight + 1,
    headBeforeRight + ' → ' + headIndexOf(d2.cells));

  await swipe(page, DIR.LEFT); // 当前朝右，180° 反向应被拒绝
  ck.check('180° 反向（右→左）被拒绝，方向仍为右', (await page.data()).dir === DIR.RIGHT,
    '实际 dir = ' + (await page.data()).dir);

  // 再归位一次：吃食物用例需要「前方有跑道」的确定起点，避免蛇头贴边导致无格可吃
  console.log('        → 再次归位，保证吃食物用例从确定起点开始');
  await resetAndFreeze(page);
  ck.check('再次归位后生命为 ' + LIVES, (await page.data()).lives === LIVES,
    '实际 = ' + (await page.data()).lives);

  // E1. 吃到干扰字母 → 扣命
  console.log('[6/8] 校验吃到干扰字母扣命');
  const aBad = await aimFoodAhead(page, 'food-bad', 60);
  ck.check('已瞄准蛇头正前方的干扰字母食物', !!aBad,
    aBad ? ('朝向 ' + aBad.dir + ' · 前方 ' + aBad.steps + ' 格') : '瞄准 60 轮仍未命中');
  if (aBad) {
    const beforeLives = (await page.data()).lives;
    await step(page, aBad.steps);
    const afterBad = await page.data();
    console.log('        生命 ' + beforeLives + ' → ' + afterBad.lives);
    ck.check('吃到干扰字母生命 -1', afterBad.lives === beforeLives - 1,
      beforeLives + ' → ' + afterBad.lives);
    ck.check('吃错字母不加分', afterBad.score === 0, '实际 score = ' + afterBad.score);
  }

  // E2. 吃到应拼字母 → 加分 + 进度推进
  console.log('[7/8] 校验吃到应拼字母得分与进度推进');
  const aOk = await aimFoodAhead(page, 'food-ok', 90);
  ck.check('已瞄准蛇头正前方的应拼字母食物', !!aOk,
    aOk ? ('朝向 ' + aOk.dir + ' · 前方 ' + aOk.steps + ' 格') : '瞄准 90 轮仍未命中');
  if (aOk) {
    const before = await page.data();
    await step(page, aOk.steps);
    const afterOk = await page.data();
    const doneCount = (afterOk.progress || []).filter(function (p) { return p.done; }).length;
    console.log('        得分 ' + before.score + ' → ' + afterOk.score + ' · 已完成字母数 ' + doneCount);
    ck.check('吃到应拼字母得分 +' + SCORE_PER_LETTER,
      afterOk.score - before.score === SCORE_PER_LETTER,
      before.score + ' → ' + afterOk.score);
    ck.check('拼写进度推进 1 格', doneCount === 1, '实际已完成 = ' + doneCount);
    ck.check('得分同步到 HUD',
      (await H.textOf(page, '.hud .hud-chip:nth-child(2)')) === '分 ' + afterOk.score,
      '实际 = ' + (await H.textOf(page, '.hud .hud-chip:nth-child(2)')));
  }

  // 收尾
  console.log('[8/8] 校验页面未跳转/未崩溃');
  const end = await miniProgram.currentPage();
  ck.check('流程结束后仍在贪吃蛇页', end.path === 'pages/snake/snake', '实际 = ' + end.path);
  const finalData = await page.data();
  ck.check('全程未意外结算', finalData.over === false,
    '实际 over = ' + finalData.over + ' · lives = ' + finalData.lives);
});
