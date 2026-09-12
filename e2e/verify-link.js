'use strict';

/**
 * verify-link.js —— 端到端验证「词语连连看」游戏逻辑
 *
 * 覆盖断言：
 *   A. 页面与初始态：根容器渲染、4×4=16 张牌、生命 3、剩余 16、未结算、8 个词对
 *   B. 错配逻辑：选一张「词」再选另一对的「义」→ 扣 1 条命、牌不清除、剩余不变
 *   C. 配对逻辑：同 key（词↔义）且路径 ≤2 转弯不被挡 → 两张一起消除、剩余 -2、不扣命
 *   D. 清空过关：消完全部 8 对 → 剩余 0、判定 win、结算层出现「全部连上！」
 *   E. 核心不变量（本次修复的缺陷回归点）：只要还有牌未消，就绝不能判过关
 *
 * 设计要点（踩坑记录）：
 *   1. 连连看不是「同 key 点了就消」——还要路径 ≤2 转弯不穿牌。脚本直接复用产品自身的
 *      game/link.js#canConnect，避免用错规则写出假绿测试。
 *   2. 同类牌（词-词 / 义-义）点击在 page 里是「换选」，不扣命；只有「不同 t 且不同 key」
 *      才落到错配分支扣命。早期版本只要求 key 不同，选出两张同类牌 → 变成反复换选、
 *      永不错配，且残留选中态会让后续每次点击错位一格、整条链路雪崩。
 *   3. 不能「贪心随手消」后要求必定消完：4×4 上贪心完全可能把最后几对互相堵死
 *      （真实玩家这时会点「换局」重排）。改为先用 DFS 求出完整可解顺序、再按序执行，
 *      既确定性又能断言最强的「消完 → 过关」路径；每步都用当前真实牌面重算，
 *      所以偶发丢 tap 也能自愈。
 *   4. 本页没有「取消选中」入口（tapCard 对已选中同一张直接 return），
 *      选中态只能靠「再点另一张」消费，因此每步都要感知当前选中态。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-link.js
 */

const H = require('./lib/harness');
const linkLib = require('../miniprogram/game/link');

const PAGE_URL = '/pages/link/link';
const COLS = 4;
const TILE_COUNT = COLS * COLS;
const PAIR_COUNT = TILE_COUNT / 2;
const INIT_LIVES = 3;

/** 用与页面 _buildGrid 相同的约定构建连通性网格：1=有牌（不可穿），0=空 */
function buildGrid(cards) {
  const grid = [];
  for (let r = 0; r < COLS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const card = cards[r * COLS + c];
      row.push(card && !card.gone ? 1 : 0);
    }
    grid.push(row);
  }
  return grid;
}

function connectible(cards, ia, ib) {
  const a = cards[ia];
  const b = cards[ib];
  if (!a || !b || a.gone || b.gone || a.key !== b.key) return false;
  const grid = buildGrid(cards);
  return linkLib.canConnect(
    grid,
    Math.floor(a.i / COLS), a.i % COLS,
    Math.floor(b.i / COLS), b.i % COLS
  );
}

function aliveIndexes(cards) {
  const out = [];
  (cards || []).forEach(function (c, i) { if (!c.gone) out.push(i); });
  return out;
}

function selectedIndex(cards) {
  return (cards || []).findIndex(function (c) { return c.sel; });
}

/** 当前牌面上所有可连通的同 key 牌对 */
function allConnectiblePairs(cards) {
  const alive = aliveIndexes(cards);
  const out = [];
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      if (connectible(cards, alive[i], alive[j])) out.push([alive[i], alive[j]]);
    }
  }
  return out;
}

/**
 * DFS 求一个「能把牌面全部消完」的消除顺序。
 * 返回 [[ia,ib], ...]（按执行顺序），无解返回 null。
 * 为什么需要：贪心选对可能把剩余牌对互相堵死，DFS 会回溯换序，保证有解就走得通。
 */
function solveOrder(cards) {
  const sim = cards.map(function (c) { return Object.assign({}, c); });
  const order = [];

  function dfs() {
    if (aliveIndexes(sim).length === 0) return true;
    const pairs = allConnectiblePairs(sim);
    for (let k = 0; k < pairs.length; k++) {
      const p = pairs[k];
      sim[p[0]].gone = true;
      sim[p[1]].gone = true;
      order.push(p);
      if (dfs()) return true;
      order.pop();
      sim[p[0]].gone = false;
      sim[p[1]].gone = false;
    }
    return false;
  }

  return dfs() ? order : null;
}

/**
 * 在剩余牌中找一对「必然触发错配扣命」的牌：必须【词 ↔ 义】且【不同词对】。
 * 同类牌只会「换选」，不扣命。
 */
function findMismatchedPair(cards) {
  const alive = aliveIndexes(cards);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = cards[alive[i]];
      const b = cards[alive[j]];
      if (a.t !== b.t && a.key !== b.key) return [alive[i], alive[j]];
    }
  }
  return null;
}

/** 给「已被选中的牌」找一个同 key 且可连通的伙伴 */
function findConnectiblePartner(cards, sel) {
  const alive = aliveIndexes(cards);
  for (let k = 0; k < alive.length; k++) {
    if (alive[k] !== sel && connectible(cards, sel, alive[k])) return alive[k];
  }
  return null;
}

function selSignature(data) {
  return (data.cards || []).map(function (c) { return c.sel ? 1 : 0; }).join('');
}

/**
 * 点一张牌，并等到状态真的发生变化（选中态/生命/剩余/结算任一）才算成功。
 * 模拟器偶发丢 tap，故失败会重试；返回变化后的 page.data()。
 */
async function tapTile(page, idx, attempts, label) {
  const max = attempts || 3;
  for (let a = 0; a < max; a++) {
    const before = await page.data();
    const els = await page.$$('.board .tile');
    if (!els[idx]) return before;
    await page.waitFor(120);
    await els[idx].tap();

    for (let i = 0; i < 12; i++) {
      await page.waitFor(150);
      const now = await page.data();
      if (now.lives !== before.lives || now.left !== before.left ||
          now.over !== before.over || selSignature(now) !== selSignature(before)) {
        return now;
      }
    }
    console.log('        [retry] ' + (label || '') + ' 下标 ' + idx + ' 点击未生效，重试 ' + a + '/' + (max - 1));
  }
  return await page.data();
}

H.runSuite('verify-link（词语连连看）', async function (miniProgram, ck) {
  console.log('[1/6] 进入 ' + PAGE_URL);
  const page = await H.goto(miniProgram, PAGE_URL, 1800);

  const cur = await miniProgram.currentPage();
  ck.check('进入连连看页', cur.path === 'pages/link/link', '实际 = ' + cur.path);
  if (cur.path !== 'pages/link/link') return;

  ck.check('根容器 .page-link 已渲染', !!(await H.waitForSelector(page, '.page-link', 8000)));

  // A. 初始态
  console.log('[2/6] 校验初始对局态');
  const tiles = await H.waitForCount(page, '.board .tile', TILE_COUNT, 15000);
  ck.check('牌数为 ' + TILE_COUNT + '（4×4）', !!tiles, tiles ? ('实际 ' + tiles.length) : '超时');
  if (!tiles) return;

  let data = await page.data();
  ck.check('初始生命为 ' + INIT_LIVES, data.lives === INIT_LIVES, '实际 = ' + data.lives);
  ck.check('初始剩余牌为 ' + TILE_COUNT, data.left === TILE_COUNT, '实际 = ' + data.left);
  ck.check('初始未结算', data.over === false, '实际 over = ' + data.over);
  ck.check('初始无选中态', selectedIndex(data.cards) < 0);

  const keyCount = {};
  (data.cards || []).forEach(function (c) { keyCount[c.key] = (keyCount[c.key] || 0) + 1; });
  const pairKeys = Object.keys(keyCount);
  ck.check('恰好组成 ' + PAIR_COUNT + ' 个词对（每对 2 张）',
    pairKeys.length === PAIR_COUNT && pairKeys.every(function (k) { return keyCount[k] === 2; }),
    '对数 = ' + pairKeys.length);
  ck.check('牌面含词卡与义卡两类',
    (data.cards || []).some(function (c) { return c.t === 'w'; }) &&
    (data.cards || []).some(function (c) { return c.t === 'c'; }));

  // 核心不变量：只要还有牌未消，就绝不能判过关（本次修复的缺陷回归点）
  let winViolation = null;
  function noteInvariant(d) {
    if (!winViolation && d.left > 0 && d.win === true) {
      winViolation = '还剩 ' + d.left + ' 张牌却已判定 win=true';
    }
  }
  noteInvariant(data);

  // B. 错配扣命
  console.log('[3/6] 校验错配：扣 1 条命且不清除牌');
  const bad = findMismatchedPair(data.cards);
  ck.check('存在「词↔义且不同词对」的两张牌用于错配', !!bad);
  if (!bad) return;

  let st = await tapTile(page, bad[0], 3, '错配第一张');
  ck.check('错配：第一张已选中', st.cards[bad[0]].sel === true,
    '当前选中 = ' + selectedIndex(st.cards));

  const livesBeforeBad = st.lives;
  st = await tapTile(page, bad[1], 3, '错配第二张');
  console.log('        生命 ' + livesBeforeBad + ' → ' + st.lives + ' · 剩余 ' + st.left);
  ck.check('错配后生命 -1', st.lives === livesBeforeBad - 1, livesBeforeBad + ' → ' + st.lives);
  ck.check('错配后剩余牌数不变', st.left === TILE_COUNT, '实际 = ' + st.left);
  ck.check('错配后两张牌未被消除', !st.cards[bad[0]].gone && !st.cards[bad[1]].gone);
  ck.check('错配后清空选中态', selectedIndex(st.cards) < 0, '仍有选中下标 = ' + selectedIndex(st.cards));

  // C+D. 按 DFS 求出的完整可解顺序消完
  console.log('[4/6] 校验配对消除：DFS 求完整可解顺序后逐对执行');
  let firstClearChecked = false;
  let cleared = 0;
  let guard = 0;
  let reshuffles = 0;

  while (guard < 40) {
    guard++;
    data = await page.data();
    noteInvariant(data);
    if (data.over || data.left === 0) break;

    // 每步都基于当前真实牌面重算，丢 tap 造成错位时能自愈
    const plan = solveOrder(data.cards);
    if (!plan) {
      // 当前牌面无解（真实玩家会点「换局」重排）
      if (reshuffles >= 3) {
        console.log('        [info] 连续 3 次无解牌面，停止');
        break;
      }
      reshuffles++;
      console.log('        [info] 当前牌面无解 → 点「换局」重排（第 ' + reshuffles + ' 次）');
      // 注意：头部右侧的「换局」胶囊在 2026-09-12 视觉统一后类名由 .lk-grade 改为共享类 .g-chip；
      // 这里两个都试，避免以后换类名再让用例时好时坏（只在无解牌面时才走到这一步，很容易被忽略）。
      const reshuffle = (await page.$('.g-chip')) || (await page.$('.lk-grade'));
      if (!reshuffle) break;
      await reshuffle.tap();
      await page.waitFor(900);
      noteInvariant(await page.data());
      continue;
    }

    let pair = plan[0];
    const sel = selectedIndex(data.cards);

    if (sel >= 0 && sel !== pair[0]) {
      // 残留选中态：优先用它与它的可连通伙伴配对，否则同类转移（不扣命）
      const partner = findConnectiblePartner(data.cards, sel);
      if (partner != null) {
        pair = [sel, partner];
      } else {
        const cards = data.cards;
        const sameT = aliveIndexes(cards).filter(function (i) {
          return i !== sel && cards[i].t === cards[sel].t;
        });
        if (!sameT.length) break;
        await tapTile(page, sameT[0], 2, '转移选中态');
        continue;
      }
    }

    const beforeLeft = data.left;
    const beforeLives = data.lives;
    const alreadySelected = (sel >= 0 && sel === pair[0]);
    if (!alreadySelected) await tapTile(page, pair[0], 3, '配对第一张');
    const after = await tapTile(page, pair[1], 3, '配对第二张');
    noteInvariant(after);

    if (!firstClearChecked && after.left < beforeLeft) {
      firstClearChecked = true;
      console.log('        首对消除：剩余 ' + beforeLeft + ' → ' + after.left
        + ' · 生命 ' + beforeLives + ' → ' + after.lives + ' · 牌 [' + pair[0] + ',' + pair[1] + ']');
      ck.check('可连通词对消除后剩余 -2', after.left === beforeLeft - 2,
        beforeLeft + ' → ' + after.left);
      ck.check('可连通词对消除后两张牌标记 gone',
        after.cards[pair[0]].gone === true && after.cards[pair[1]].gone === true);
      ck.check('正确配对不扣命', after.lives === beforeLives, beforeLives + ' → ' + after.lives);
    }

    if (after.left < beforeLeft) cleared++;
  }

  data = await page.data();
  noteInvariant(data);
  console.log('        共消除 ' + cleared + '/' + PAIR_COUNT + ' 对 · 剩余 ' + data.left
    + ' · 生命 3 → ' + data.lives + (reshuffles ? (' · 换局 ' + reshuffles + ' 次') : ''));

  ck.check('至少消除 1 对（配对消除链路可用）', cleared >= 1, '实际消除 ' + cleared + ' 对');
  ck.check('还有牌未消时不得判定过关（本次修复缺陷的回归点）', !winViolation,
    winViolation || '全程未出现');

  // D. 清空过关
  console.log('[5/6] 校验清空过关');
  ck.check('已按可解顺序消完全部 ' + PAIR_COUNT + ' 对（剩余 0）', data.left === 0,
    '实际剩余 = ' + data.left + (reshuffles ? '（期间换局 ' + reshuffles + ' 次）' : ''));
  if (data.left === 0) {
    ck.check('清空后判定过关（data.win）', data.win === true,
      '实际 win = ' + data.win + ' over = ' + data.over);
    const overEl = await H.waitForSelector(page, '.over-mask', 8000);
    ck.check('结算层 .over-mask 出现', !!overEl);
    const title = await H.textOf(page, '.o-title');
    ck.check('结算标题为「全部连上！」', title === '全部连上！', '实际 = ' + title);
    const stars = await H.textOf(page, '.o-stars');
    ck.check('结算星级非空', !!stars, '实际 = ' + stars);
  }

  // 收尾
  console.log('[6/6] 校验页面未跳转/未崩溃');
  const end = await miniProgram.currentPage();
  ck.check('流程结束后仍在连连看页', end.path === 'pages/link/link', '实际 = ' + end.path);
});
