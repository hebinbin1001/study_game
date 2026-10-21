'use strict';

/**
 * verify-bounce.js —— 单词弹弹球可玩性回归
 *
 * 重点验证：
 *   · 页面能进入并生成纯英文目标词与三条释义球；
 *   · 篮子左右移动、边界夹取正常；
 *   · 结算弹层能出现，重开能恢复对局；
 *   · 正确/错误球同色（静态护栏在单测中）。
 */

const H = require('./lib/harness');

H.runSuite('verify-bounce（单词弹弹球）', async function (miniProgram, ck) {
  // 进入后立刻冻结，避免自动化工具握手期间已有球落底。
  const page = await H.goto(miniProgram, '/pages/bounce/bounce', 0);
  ck.check('玩法根容器渲染', !!(await H.waitForSelector(page, '.court', 8000)));

  await page.callMethod('_stopLoops');
  await page.waitFor(150);
  const d0 = await page.data();
  ck.check('目标词非空且为英文', /^[A-Za-z]+$/.test(String(d0.word || '')),
    '实际 = ' + JSON.stringify(d0.word));
  ck.check('初始三条释义球已生成', (d0.balls || []).length >= 3,
    '实际 = ' + (d0.balls || []).length);
  ck.check('三条球都有可读释义', (d0.balls || []).slice(0, 3).every(function (b) {
    return !!(b && String(b.text || '').trim());
  }));
  ck.check('初始 3 条命', d0.lives === 3, '实际 = ' + d0.lives);

  await page.callMethod('move', { currentTarget: { dataset: { d: 1 } } });
  await page.waitFor(80);
  ck.check('向右移动篮子', (await page.data()).basket === 2,
    '实际 = ' + (await page.data()).basket);
  await page.callMethod('move', { currentTarget: { dataset: { d: 1 } } });
  await page.callMethod('move', { currentTarget: { dataset: { d: 1 } } });
  await page.waitFor(80);
  ck.check('篮子右侧边界夹取', (await page.data()).basket === 2,
    '实际 = ' + (await page.data()).basket);
  await page.callMethod('move', { currentTarget: { dataset: { d: -1 } } });
  await page.callMethod('move', { currentTarget: { dataset: { d: -1 } } });
  await page.callMethod('move', { currentTarget: { dataset: { d: -1 } } });
  await page.waitFor(80);
  ck.check('篮子左侧边界夹取', (await page.data()).basket === 0,
    '实际 = ' + (await page.data()).basket);

  await page.callMethod('_end');
  await page.waitFor(150);
  const over = await page.data();
  ck.check('结算状态出现', over.over === true);
  ck.check('结算星级文案非空', !!String(over.starsText || '').trim());
  ck.check('结算组件已挂载', !!(await page.$('settle-pop')));

  await page.callMethod('again');
  await page.waitFor(250);
  const restarted = await page.data();
  ck.check('重开后恢复未结算状态', restarted.over === false);
  ck.check('重开后生命恢复为 3', restarted.lives === 3, '实际 = ' + restarted.lives);
  await page.callMethod('_stopLoops');
});
