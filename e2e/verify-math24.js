'use strict';

/**
 * verify-math24.js —— 端到端验证「算 24 点」游戏逻辑
 *
 * 覆盖断言：
 *   A. 页面与初始态：根容器渲染、4 张数字牌、生命 3、已试 0、提示文案
 *   B. 交互逻辑：点牌插入算式并把该牌置「已用」；重复点同一张不再插入；
 *      「清空」复位算式与用牌；「退格」删末字符并还原用牌
 *   C. 判定逻辑：用求解器算出本关的合法解 → 逐字符点牌/点运算符 → 校验 → 过关
 *
 * 说明：不测「答错」分支。答错会弹 wx.showModal 原生弹窗，自动化下无法可靠关闭，
 *   会让后续点击被遮挡；答错扣命/记次的逻辑已由单元测试覆盖（mn math24 模块）。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-math24.js
 */

const H = require('./lib/harness');

const PAGE_URL = '/pages/math24/math24';
const LIVES = 3;
const CARD_COUNT = 4;

// 运算符按钮在 .keys .key 中的固定顺序（与 math24.wxml 一致）
const SYM_KEY_INDEX = { '(': 0, ')': 1, '+': 2, '-': 3, '*': 4, '/': 5 };

/**
 * 24 点求解器：4 个数各用一次 + − × ÷ 与括号凑 24。
 * 返回 token 数组（数字为 number，运算符/括号为 string，全括号化），无解返回 null。
 * 用浮点 + 1e-9 容差即可：本页关卡均为整数四则，误差远小于容差。
 */
function solve24(nums) {
  const EPS = 1e-9;

  function combine(list) {
    if (list.length === 1) {
      return Math.abs(list[0].v - 24) < EPS ? list[0].toks : null;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i];
        const b = list[j];
        const rest = list.filter(function (_, k) { return k !== i && k !== j; });

        const cands = [
          { v: a.v + b.v, toks: ['('].concat(a.toks, ['+'], b.toks, [')']) },
          { v: a.v - b.v, toks: ['('].concat(a.toks, ['-'], b.toks, [')']) },
          { v: a.v * b.v, toks: ['('].concat(a.toks, ['*'], b.toks, [')']) }
        ];
        if (Math.abs(b.v) > EPS) {
          cands.push({ v: a.v / b.v, toks: ['('].concat(a.toks, ['/'], b.toks, [')']) });
        }

        for (let c = 0; c < cands.length; c++) {
          const found = combine(rest.concat([cands[c]]));
          if (found) return found;
        }
      }
    }
    return null;
  }

  return combine(nums.map(function (n) { return { v: n, toks: [n] }; }));
}

/** 把求解出的 token 序列敲进页面：数字→点对应牌，符号→点对应按键 */
async function typeSolution(page, cardEls, keyEls, tokens) {
  const usedSlots = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (typeof tk === 'number') {
      const cards = (await page.data()).cards;
      const idx = cards.findIndex(function (c, ci) {
        return c.num === tk && usedSlots.indexOf(ci) < 0;
      });
      if (idx < 0) throw new Error('找不到可用数字牌 ' + tk);
      usedSlots.push(idx);
      await cardEls[idx].tap();
    } else {
      const ki = SYM_KEY_INDEX[tk];
      if (ki == null) throw new Error('未知符号 ' + tk);
      await keyEls[ki].tap();
    }
    await page.waitFor(60);
  }
}

H.runSuite('verify-math24（算 24 点）', async function (miniProgram, ck) {
  console.log('[1/7] 进入 ' + PAGE_URL);
  const page = await H.goto(miniProgram, PAGE_URL, 1800);

  const cur = await miniProgram.currentPage();
  ck.check('进入算24页', cur.path === 'pages/math24/math24', '实际 = ' + cur.path);
  if (cur.path !== 'pages/math24/math24') return;

  ck.check('根容器 .page-24 已渲染', !!(await H.waitForSelector(page, '.page-24', 8000)));

  // A. 初始态
  console.log('[2/7] 校验初始对局态');
  const cards = await H.waitForCount(page, '.cards .card', CARD_COUNT, 15000);
  ck.check('数字牌数量为 ' + CARD_COUNT, !!cards, cards ? ('实际 ' + cards.length) : '超时');
  if (!cards) return;

  let data = await page.data();
  ck.check('初始生命为 ' + LIVES, data.lives === LIVES, '实际 = ' + data.lives);
  ck.check('初始已试次数为 0', data.tries === 0, '实际 = ' + data.tries);
  ck.check('初始算式为空', data.expr === '', '实际 = ' + JSON.stringify(data.expr));
  ck.check('对局中 playing 为真', data.playing === true, '实际 = ' + data.playing);

  const nums = (data.cards || []).map(function (c) { return c.num; });
  console.log('        本关数字 = [' + nums.join(', ') + ']');

  // B1. 点牌插入并把该牌置已用
  console.log('[3/7] 校验点牌插入 / 重复点 / 清空');
  await cards[0].tap();
  await page.waitFor(250);
  data = await page.data();
  ck.check('点牌后算式包含该数字', data.expr === String(nums[0]), '实际 expr = ' + JSON.stringify(data.expr));
  ck.check('点牌后该牌标记已用', data.cards[0].used === true, '实际 used = ' + data.cards[0].used);

  await cards[0].tap();
  await page.waitFor(250);
  data = await page.data();
  ck.check('重复点同一张牌不重复插入', data.expr === String(nums[0]), '实际 expr = ' + JSON.stringify(data.expr));

  const clearKey = (await page.$$('.keys .key'))[7];
  await clearKey.tap();
  await page.waitFor(250);
  data = await page.data();
  ck.check('「清空」复位算式', data.expr === '', '实际 expr = ' + JSON.stringify(data.expr));
  ck.check('「清空」复位用牌标记', data.cards.every(function (c) { return !c.used; }),
    '实际 used = ' + JSON.stringify(data.cards.map(function (c) { return c.used; })));

  // B2. 退格
  await cards[0].tap();
  await cards[1].tap();
  await page.waitFor(200);
  const keys = await page.$$('.keys .key');
  await keys[6].tap(); // ⌫
  await page.waitFor(250);
  data = await page.data();
  ck.check('「退格」删除算式末字符', data.expr === String(nums[0]), '实际 expr = ' + JSON.stringify(data.expr));
  ck.check('「退格」还原对应牌的已用标记', data.cards[1].used === false, '实际 used = ' + data.cards[1].used);

  await (await page.$$('.keys .key'))[7].tap(); // 清空，回到干净状态
  await page.waitFor(250);

  // C. 判定逻辑：敲入合法解 → 过关
  console.log('[4/7] 求解本关合法算式');
  const tokens = solve24(nums);
  ck.check('本关 4 个数字存在凑 24 的解', !!tokens, tokens ? tokens.join(' ') : '求解器未找到解');
  if (!tokens) return;
  console.log('        解 = ' + tokens.join(' '));

  console.log('[5/7] 逐字符敲入算式并校验');
  await typeSolution(page, await page.$$('.cards .card'), await page.$$('.keys .key'), tokens);
  await page.waitFor(400);

  data = await page.data();
  ck.check('四张牌全部用上且各用一次', data.cards.every(function (c) { return c.used; }),
    '实际 used = ' + JSON.stringify(data.cards.map(function (c) { return c.used; })));

  const exprText = await H.textOf(page, '.expr-box');
  console.log('        算式框显示 = ' + exprText);
  ck.check('算式框已显示构造内容', !!exprText && exprText.indexOf('点上面的牌') < 0, '实际 = ' + exprText);

  await (await page.$('.check-btn')).tap();
  await page.waitFor(1200);

  data = await page.data();
  ck.check('校验后判定过关（data.win）', data.win === true, '实际 win = ' + data.win + ' over = ' + data.over);

  // A/结算层
  console.log('[6/7] 校验结算层');
  const overEl = await H.waitForSelector(page, '.over-mask', 8000);
  ck.check('结算层 .over-mask 出现', !!overEl);

  const title = await H.textOf(page, '.o-title');
  ck.check('结算标题为「凑出 24！」', title === '凑出 24！', '实际 = ' + title);

  const starsText = await H.textOf(page, '.o-stars');
  ck.check('满命过关给 3 星', starsText === '⭐⭐⭐', '实际 = ' + starsText);

  console.log('[7/7] 校验页面未跳转/未崩溃');
  const end = await miniProgram.currentPage();
  ck.check('流程结束后仍在算24页', end.path === 'pages/math24/math24', '实际 = ' + end.path);
});
