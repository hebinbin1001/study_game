'use strict';

/**
 * verify-math24.js —— 端到端验证「算 24 点」的**合并式**交互（2026-09-12 改版）
 *
 * 新交互：点两张牌 → 点一个运算符 → 立即合并成一张结果牌，且结果自动选中；
 *        最后只剩一张且等于 24 过关。不设命数，提供「撤销 / 重来 / 提示」。
 *
 * 求解方式：直接复用产品引擎 game/math24.js 的 findHint()（反推一次可行合并），
 *          逐步点击走到通关 —— 用例自己不再实现求解器，避免"测试的规则"和
 *          "产品的规则"两套实现各写一遍（这是之前踩过的假绿坑）。
 *
 * 运行：node e2e/verify-math24.js
 */

const H = require('./lib/harness');
const m24 = require('../miniprogram/game/math24');

const URL = '/pages/math24/math24';
const OP_INDEX = { '+': 0, '-': 1, '*': 2, '/': 3 };   // 与页面上四个运算符按钮的顺序一致

H.runSuite('verify-math24（算 24 点 · 合并式）', async function (miniProgram, ck) {
  console.log('[1/7] 进入算 24 点');
  const page = await H.goto(miniProgram, URL, 1800);
  ck.check('进入算 24 点页', (await miniProgram.currentPage()).path === 'pages/math24/math24');
  ck.check('根容器 .page-24 已渲染', !!(await H.waitForSelector(page, '.page-24', 8000)));

  console.log('[2/7] 初始态：4 张牌、无选中、无结算');
  let d = await page.data();
  ck.check('初始 4 张牌', (d.tiles || []).length === 4, '实际 ' + (d.tiles || []).length);
  ck.check('牌面为数字文本', (d.tiles || []).every(function (t) { return /^\d+$/.test(t.text); }),
    '实际 = ' + JSON.stringify((d.tiles || []).map(function (t) { return t.text; })));
  ck.check('初始无选中', d.picked === 0, '实际 picked = ' + d.picked);
  ck.check('初始未结算', !d.over, '实际 over = ' + d.over);
  ck.check('提供四个运算符', (d.ops || []).length === 4, '实际 ' + (d.ops || []).length);

  console.log('[3/7] 选牌：点两张进入选中态，再点一次取消');
  let cards = await page.$$('.card');
  await cards[0].tap();
  await page.waitFor(200);
  d = await page.data();
  ck.check('点第一张后选中数 = 1', d.picked === 1, '实际 = ' + d.picked);
  ck.check('牌上出现选中标记', d.tiles[0].sel === true);
  await cards[1].tap();
  await page.waitFor(200);
  d = await page.data();
  ck.check('点第二张后选中数 = 2', d.picked === 2, '实际 = ' + d.picked);
  await cards[1].tap();     // 再点一次取消
  await page.waitFor(200);
  d = await page.data();
  ck.check('再点同一张可取消选中', d.picked === 1, '实际 = ' + d.picked);

  console.log('[4/7] 合并：点运算符后牌数 -1，且结果自动选中');
  // 上一步结尾取消了第二张的选择，这里重新选满两张再合并
  cards = await page.$$('.card');
  await cards[1].tap();
  await page.waitFor(200);
  d = await page.data();
  ck.check('重新选中第二张后 picked=2', d.picked === 2, '实际 = ' + d.picked);
  const before = d.tiles.map(function (t) { return t.text; });
  await (await page.$('.key.k-op')).tap();      // 第一个运算符（＋）
  await page.waitFor(300);
  d = await page.data();
  ck.check('合并后牌数 -1（4 → 3）', d.tiles.length === 3, '实际 = ' + d.tiles.length);
  ck.check('合并后步数 +1', d.steps === 1, '实际 = ' + d.steps);
  ck.check('结果牌自动选中（picked=1）', d.picked === 1, '实际 = ' + d.picked);
  ck.check('结果牌带合并标记', d.tiles.some(function (t) { return t.justMerged; }));
  ck.check('结果 = 前两张之和',
    d.tiles.some(function (t) { return t.text === String(Number(before[0]) + Number(before[1])); }),
    before.slice(0, 2).join('+') + ' 应等于其中一张；实际 = ' + JSON.stringify(d.tiles.map(function (t) { return t.text; })));

  console.log('[5/7] 撤销 / 重来');
  await (await page.$('.k-del')).tap();          // 撤销
  await page.waitFor(300);
  d = await page.data();
  ck.check('撤销后恢复 4 张牌', d.tiles.length === 4, '实际 = ' + d.tiles.length);
  ck.check('撤销后步数归零', d.steps === 0, '实际 = ' + d.steps);
  await (await page.$$('.k-clr'))[0].tap();      // 重来（第二个按钮组的第一个）
  await page.waitFor(300);
  d = await page.data();
  ck.check('重来后仍为 4 张牌且无选中', d.tiles.length === 4 && d.picked === 0,
    'tiles=' + d.tiles.length + ' picked=' + d.picked);

  console.log('[6/7] 提示：自动选中该合并的两张');
  await (await page.$$('.k-clr'))[1].tap();      // 提示（第二个按钮组的第二个）
  await page.waitFor(300);
  d = await page.data();
  ck.check('提示后自动选中两张', d.picked === 2, '实际 = ' + d.picked);
  ck.check('提示文案给出可合并的两张', !!d.hint && d.hint.indexOf('提示') >= 0, '实际 = ' + d.hint);

  console.log('[7/7] 用引擎的 findHint 逐步合并到 24 并过关');
  let guard = 0;
  while (guard++ < 10) {
    d = await page.data();
    if (d.over || d.tiles.length <= 1) break;
    const hint = m24.findHint(d.tiles.map(function (t) { return t.frac; }), 24);
    if (!hint) break;
    cards = await page.$$('.card');
    // 先清掉可能的选中态：点已选中的牌取消
    for (let i = 0; i < d.tiles.length; i++) {
      if (d.tiles[i].sel) { await cards[i].tap(); await page.waitFor(120); }
    }
    cards = await page.$$('.card');
    await cards[hint.i].tap();
    await page.waitFor(150);
    cards = await page.$$('.card');
    await cards[hint.j].tap();
    await page.waitFor(150);
    const ops = await page.$$('.key.k-op');
    await ops[OP_INDEX[hint.op]].tap();
    await page.waitFor(320);
  }
  d = await page.data();
  ck.check('最终只剩一张牌', d.tiles.length === 1, '实际 = ' + d.tiles.length);
  ck.check('最后一张为 24', d.tiles[0] && d.tiles[0].text === '24', '实际 = ' + (d.tiles[0] && d.tiles[0].text));
  ck.check('触发结算 data.win', d.win === true && d.over === true, 'win=' + d.win + ' over=' + d.over);
  ck.check('结算层 .over-mask 出现', !!(await H.waitForSelector(page, '.over-mask', 8000)));
  ck.check('结算标题为「凑出 24！」', (await H.textOf(page, '.o-title')) === '凑出 24！',
    '实际 = ' + (await H.textOf(page, '.o-title')));
  ck.check('最少步通关给 3 星', (await H.textOf(page, '.o-stars')) === '⭐⭐⭐',
    '实际 = ' + (await H.textOf(page, '.o-stars')));
  ck.check('流程结束后仍在算 24 点页', (await miniProgram.currentPage()).path === 'pages/math24/math24');
});
