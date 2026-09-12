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
 *   D. 移动与相对转向：冻结主循环后逐步推进，蛇头按当前方向前进 1 格；
 *      走真实 onCellTap —— 点轴线哪一侧就朝那一侧拐 90°、点正前方直行、
 *      点正后方不掉头、点蛇头自己忽略、只看方向不看距离
 *   E. 吃食物规则：吃到干扰字母 → 生命 -1；吃到应拼字母 → 得分 +5 且拼写进度推进
 *   F. 撞墙穿到对面（用户 2026-09-12 反馈「撞墙即死太挫败」→ 改为穿墙）：越过边界后蛇头从对面穿出且不扣命
 *
 * 设计要点（踩坑记录，改这个脚本前务必先读）：
 *   1. 本页 _tick 定时步进（450ms/步，另有 900ms 开局缓冲），蛇从 (5,3) 向右直行。
 *      纯等待式断言必然竞态 → 统一 callMethod('_stopLoop') 冻结主循环，
 *      再用 callMethod('_tick') 手动步进，把游戏变成确定性状态机；
 *      转向走真实 onCellTap（点蛇头四周的格子）。滑动转向已按用户反馈移除，
 *      本脚本不再注入任何 touchstart/touchend 手势。
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

/** 点某一格：走真实 onCellTap，data-i 为格子下标 */
async function tapCell(page, idx) {
  await page.callMethod('onCellTap', { currentTarget: { dataset: { i: idx } } });
  await page.waitFor(120);
}

/**
 * 点「从蛇头出发、朝 stepDir 的相邻格」= 相对转向里的一次「朝那一侧拐 90°」。
 * 相对转向下点击只看方向不看距离，所以取相邻格即可（也顺带证明「点近处远处一个样」）。
 */
async function tapStep(page, stepDir) {
  const data = await page.data();
  const head = headIndexOf(data.cells || []);
  if (head < 0) throw new Error('tapStep: 找不到蛇头');
  const hr = Math.floor(head / SIZE);
  const hc = head % SIZE;
  const v = { 0: [-1, 0], 1: [0, 1], 2: [1, 0], 3: [0, -1] }[stepDir];
  const tr = hr + v[0];
  const tc = hc + v[1];
  if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) {
    throw new Error('tapStep: 目标格越界，无法构造「' + stepDir + '」方向的点击');
  }
  await tapCell(page, tr * SIZE + tc);
}

/**
 * 把蛇头朝向转到 targetDir（供「归位 / 瞄准」这类流程使用）。
 * 相对转向下每次点击最多拐 90°，所以按差值拆成 1~2 次点击：
 * delta=1 右拐一次、delta=3 左拐一次、delta=2 连点同侧两次掉头。
 */
async function tapDir(page, targetDir) {
  const raw = (await page.data()).dir;
  // startGame 只设内部 _dir=1（右）而不走 setData，首帧 data.dir 可能是 undefined / 残留值；
  // 这里按「起始朝向 = 右」兜底（resetAndFreeze 用的是 tapStep，不依赖本函数）。
  const cur = (typeof raw === 'number' && raw >= 0 && raw <= 3) ? raw : DIR.RIGHT;
  const delta = (targetDir - cur + 4) % 4;
  if (delta === 0) return;                                  // 已在目标朝向
  if (delta === 1) { await tapStep(page, (cur + 1) % 4); return; }
  if (delta === 3) { await tapStep(page, (cur + 3) % 4); return; }
  await tapStep(page, (cur + 1) % 4);                       // 先右拐 90°
  await tapStep(page, (cur + 2) % 4);                       // 再右拐 90° = 掉头
}

/**
 * 反复重掷食物，直到「蛇头向右 n 格」的路径上没有食物。
 * 穿墙用例要断言「命数不变」，必须先把路径上的食物清掉，
 * 否则半路吃到干扰字母会扣命，断言被噪声污染。
 */
async function clearRightRunway(page, n, attempts) {
  for (let a = 0; a < attempts; a++) {
    const data = await page.data();
    const cells = data.cells || [];
    const head = headIndexOf(cells);
    if (head < 0) return false;
    const hr = Math.floor(head / SIZE);
    let hc = head % SIZE;
    let blocked = false;
    for (let k = 0; k < n; k++) {
      hc = (hc + 1) % SIZE;
      const cls = clsOf(cells, hr * SIZE + hc);
      if (cls === 'food-ok' || cls === 'food-bad') { blocked = true; break; }
    }
    if (!blocked) return true;
    await page.callMethod('_spawnFoods', true);
    await page.waitFor(60);
  }
  return false;
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
  // startGame 后内部朝向恒为 1(右)，点蛇头正下方一格 = 右拐 90° = 朝向 2(下)，
  // 且 _setDir 会 setData(dir)，把 data.dir 从「残留值 / undefined」同步成已知值。
  await tapStep(page, DIR.DOWN);
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
        await tapDir(page, perp[i]);
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
  console.log('[1/10] 进入 ' + PAGE_URL);
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
  console.log('[2/10] 校验初始态与目标词卡');
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
  console.log('[3/10] 校验目标词可逐字母拼写（B 词库来源）');
  ck.check('目标词是纯英文单词（可逐字母拼写）', /^[A-Za-z]+$/.test(word),
    '实际词 = ' + JSON.stringify(word)
    + '（汉字/成语说明分组 key 传成了类型码 w1；含 * 或空格说明混入了 w2 挖空词或 fill 整句）');
  ck.check('拼写进度每格均为英文字母',
    (data.progress || []).every(function (p) { return /^[A-Z]$/.test(p.ch); }),
    '实际 = ' + JSON.stringify((data.progress || []).map(function (p) { return p.ch; })));

  // C. 食物生成规则
  console.log('[4/10] 校验食物生成规则');
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

  // D. 移动与点方向（朝向已归位为「下」，蛇头固定在 (5,3)=下标 53）
  console.log('[5/10] 校验移动：沿当前朝向前进 1 格');
  const HEAD_START = 5 * SIZE + 3;                  // _newSnake 起点 (5,3)
  const at = function (r, c) { return r * SIZE + c; };
  let dMove = await page.data();
  ck.check('起点蛇头固定在 (5,3)（下标 ' + HEAD_START + '）',
    headIndexOf(dMove.cells) === HEAD_START, '实际 = ' + headIndexOf(dMove.cells));
  ck.check('起点朝向为「下」(2)', dMove.dir === DIR.DOWN, '实际 dir = ' + dMove.dir);
  await step(page, 1);
  dMove = await page.data();
  ck.check('推进 1 步蛇头沿当前朝向「下」前进 1 格（下标 +' + SIZE + '）',
    headIndexOf(dMove.cells) === HEAD_START + SIZE,
    HEAD_START + ' → ' + headIndexOf(dMove.cells));

  // 回到 (5,3)：下面的用例把格子下标写死，避免蛇头贴边时没有「正前方」格子
  await resetAndFreeze(page);
  ck.check('再次归位后蛇头回到 (5,3)（下标 ' + HEAD_START + '）',
    headIndexOf((await page.data()).cells) === HEAD_START,
    '实际 = ' + headIndexOf((await page.data()).cells));

  // D2. 相对转向（用户 2026-09-12 拍板：以蛇头为中心线，点左右 = 转 90°）
  //     起始：蛇头 (5,3)、朝向「下」(2)。滑动转向已移除，本段只用 onCellTap；
  //     下标全部写死，改 SIZE 或起点时需同步复核。
  console.log('[6/10] 校验相对转向（点轴线哪一侧就朝哪一侧拐 90°）');
  const dirOf = async function () { return (await page.data()).dir; };

  await tapCell(page, at(6, 3));                    // 正前方（蛇头正下方一格）
  ck.check('点正前方 → 直行，朝向仍「下」(2)', await dirOf() === DIR.DOWN,
    '实际 dir = ' + await dirOf());

  await tapCell(page, at(5, 4));                    // 蛇头轴线东侧（朝下时为左侧）
  ck.check('点轴线东侧 → 朝东拐 90°，朝向变「右」(1)', await dirOf() === DIR.RIGHT,
    '实际 dir = ' + await dirOf());

  await tapCell(page, at(5, 8));                    // 当前朝右：正前方（远格，验证只看方向不看距离）
  ck.check('点远处正前方 → 仍直行，朝向不变（只看方向不看距离）',
    await dirOf() === DIR.RIGHT, '实际 dir = ' + await dirOf());

  await tapCell(page, at(6, 3));                    // 朝右时轴线南侧
  ck.check('点轴线南侧 → 朝南拐 90°，朝向变「下」(2)', await dirOf() === DIR.DOWN,
    '实际 dir = ' + await dirOf());

  await tapCell(page, at(4, 3));                    // 正后方（蛇头正上方一格）
  ck.check('点正后方 → 不掉头，朝向仍「下」(2)', await dirOf() === DIR.DOWN,
    '实际 dir = ' + await dirOf());

  await tapCell(page, at(7, 0));                    // 斜着点前侧偏西（夹角约 -56°）
  ck.check('斜着点轴线西侧 → 仍按侧向判定，朝西拐 90°，朝向变「左」(3)',
    await dirOf() === DIR.LEFT, '实际 dir = ' + await dirOf());

  await tapCell(page, HEAD_START);                  // 点蛇头自己
  ck.check('点蛇头自己 → 朝向不变（忽略）', await dirOf() === DIR.LEFT,
    '实际 dir = ' + await dirOf());

  // 把朝向转回「下」再推进 1 步，确认「转向」和真实移动接得上
  // （不能朝西走：蛇身就在左边，会立刻撞到自己）
  await tapDir(page, DIR.DOWN);
  ck.check('连点可把朝向转回「下」(2)', await dirOf() === DIR.DOWN,
    '实际 dir = ' + await dirOf());
  const headBeforeTapMove = headIndexOf((await page.data()).cells);
  await step(page, 1);
  ck.check('按拐出来的朝向「下」推进 1 步，蛇头下标 +' + SIZE,
    headIndexOf((await page.data()).cells) === headBeforeTapMove + SIZE,
    headBeforeTapMove + ' → ' + headIndexOf((await page.data()).cells));

  // 再归位一次：吃食物用例需要「前方有跑道」的确定起点，避免蛇头贴边导致无格可吃
  console.log('        → 再次归位，保证吃食物用例从确定起点开始');
  await resetAndFreeze(page);
  ck.check('再次归位后生命为 ' + LIVES, (await page.data()).lives === LIVES,
    '实际 = ' + (await page.data()).lives);

  // E1. 吃到干扰字母 → 扣命
  console.log('[7/10] 校验吃到干扰字母扣命');
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
  console.log('[8/10] 校验吃到应拼字母得分与进度推进');
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

  // F. 撞墙穿到对面（用户反馈「撞墙即死太挫败」→ 2026-09-12 改为穿墙，撞自己仍扣命）
  console.log('[9/10] 校验撞墙穿到对面（穿墙不扣命）');
  await resetAndFreeze(page);
  await tapCell(page, at(5, 8)); // 先朝右
  ck.check('穿墙用例起点朝向为「右」(1)', (await page.data()).dir === DIR.RIGHT,
    '实际 dir = ' + (await page.data()).dir);

  const runwayOk = await clearRightRunway(page, 10, 40);
  ck.check('已清空蛇头向右 10 格的跑道（排除吃食物干扰）', runwayOk,
    runwayOk ? '' : '重掷 40 轮路径上仍有食物');
  if (runwayOk) {
    const beforeWrap = await page.data();
    const livesBeforeWrap = beforeWrap.lives;
    const headBeforeWrap = headIndexOf(beforeWrap.cells);
    // (5,3) 向右 6 步到 (5,9)，第 7 步越界列 10 → 应穿回同排最左侧 (5,0)=下标 50
    await step(page, 7);
    const afterWrap = await page.data();
    const headAfterWrap = headIndexOf(afterWrap.cells);
    console.log('        蛇头 ' + headBeforeWrap + ' → ' + headAfterWrap
      + ' · 生命 ' + livesBeforeWrap + ' → ' + afterWrap.lives);
    ck.check('越过右边界后蛇头从同排最左侧穿出（下标 ' + (5 * SIZE) + '）',
      headAfterWrap === 5 * SIZE, headBeforeWrap + ' → ' + headAfterWrap);
    ck.check('穿墙不扣命', afterWrap.lives === livesBeforeWrap,
      livesBeforeWrap + ' → ' + afterWrap.lives);
    ck.check('穿墙后未结算', afterWrap.over === false, '实际 over = ' + afterWrap.over);

    await step(page, 1);
    const afterWrap2 = await page.data();
    ck.check('穿墙后继续沿原朝向前进（下标 ' + (5 * SIZE + 1) + '）',
      headIndexOf(afterWrap2.cells) === 5 * SIZE + 1,
      headAfterWrap + ' → ' + headIndexOf(afterWrap2.cells));
  }

  // 收尾
  console.log('[10/10] 校验页面未跳转/未崩溃');
  const end = await miniProgram.currentPage();
  ck.check('流程结束后仍在贪吃蛇页', end.path === 'pages/snake/snake', '实际 = ' + end.path);
  const finalData = await page.data();
  ck.check('全程未意外结算', finalData.over === false,
    '实际 over = ' + finalData.over + ' · lives = ' + finalData.lives);
});
