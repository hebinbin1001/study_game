'use strict';

/**
 * verify-result.js —— 结算页回归（R4：本局错题回顾）
 *
 * 覆盖：
 *   A. 结算页基础渲染
 *   B. 本局错题卡：条目数、完整词形（w2/c2 不能显示含 * 的题面）、释义、可选例句
 *   C. 读取后清空存储键 ww_last_wrong（否则下次进结算页会误显示上一局的错题）
 *
 * 说明：本局错题由 game 页经 storage 中转（URL 长度不够）。
 * 这里直接 seed 存储再进页面，避免为了"造错题"把 10 道题全部打一遍。
 *
 * 运行：node e2e/verify-result.js
 */

const H = require('./lib/harness');

const RESULT_URL = '/pages/result/result?grade=kindergarten&level=1&win=1'
  + '&score=80&correctCount=8&totalQ=10&rate=80&stars=2&maxCombo=3';

H.runSuite('verify-result（结算页 · R4）', async function (miniProgram, ck) {
  // seed 两条错题：一条普通词条、一条带例句的成语（同时验证 w2/c2 的词形还原）
  const seeded = [
    { type: 'w1', q: 'cat', a: 'cat', hint: '猫' },
    { type: 'c2', q: '守*待兔', a: '守株待兔', hint: '死守经验不知变通', ex: '守株待兔不可取。' }
  ];
  await miniProgram.callWxMethod('setStorageSync', 'ww_last_wrong', seeded);

  console.log('[1/4] 打开结算页');
  const page = await H.goto(miniProgram, RESULT_URL, 1800);
  ck.check('结算页根容器已渲染', !!(await H.waitForSelector(page, '.page-result', 8000)));

  console.log('[2/4] 校验本局错题卡渲染');
  const card = await H.waitForSelector(page, '.wrong-card', 8000);
  ck.check('出现本局错题卡 .wrong-card', !!card);
  const items = await H.waitForCount(page, '.wrong-item', 2, 8000);
  ck.check('错题条目数为 2', !!items, items ? ('实际 ' + items.length) : '未出现');

  const d = await page.data();
  ck.check('data.wrongItems 长度为 2', (d.wrongItems || []).length === 2,
    '实际 = ' + (d.wrongItems || []).length);

  console.log('[3/4] 校验字段：完整词形 / 释义 / 例句');
  const words = (d.wrongItems || []).map(function (x) { return x.word; });
  ck.check('w2/c2 显示完整词形（守株待兔，而非含 * 的题面）',
    words.indexOf('守株待兔') !== -1, '实际 = ' + JSON.stringify(words));
  const hints = (d.wrongItems || []).map(function (x) { return x.hint; });
  ck.check('释义已带上', hints.indexOf('猫') !== -1, '实际 = ' + JSON.stringify(hints));
  ck.check('例句已带上（词库 ex 字段）',
    (d.wrongItems || []).some(function (x) { return !!x.ex; }));

  console.log('[4/4] 校验读取后清空存储键');
  const left = await miniProgram.callWxMethod('getStorageSync', 'ww_last_wrong');
  ck.check('ww_last_wrong 读取后已清空', !left || left.length === 0,
    '实际 = ' + JSON.stringify(left));

  // 无错题时不渲染整块（避免留一块空白）
  console.log('[4.5/4] 无错题时不渲染错题卡');
  await miniProgram.callWxMethod('setStorageSync', 'ww_last_wrong', []);
  const page2 = await H.goto(miniProgram, RESULT_URL, 1600);
  ck.check('无错题时不出现错题卡', !(await page2.$('.wrong-card')));
});
