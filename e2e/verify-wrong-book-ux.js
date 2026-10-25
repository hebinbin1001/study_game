'use strict';

/** 错题本工作台：计划卡 / 答案默认收起 / 筛选面板。 */

const H = require('./lib/harness');

H.runSuite('verify-wrong-book-ux（错题本工作台）', async function (miniProgram, ck) {
  const page = await H.goto(miniProgram, '/pages/wrong-book/wrong-book', 1400);
  ck.check('错题本根容器渲染', !!(await H.waitForSelector(page, '.page-wrong-book', 8000)));
  const d0 = await page.data();
  if (d0.needLogin) {
    ck.check('未登录展示统一门禁', !!(await page.$('.gate-bar')));
    return;
  }
  ck.check('首屏显示复习计划卡', !!(await page.$('.plan-card')));
  ck.check('首屏显示题型与排序入口', !!(await page.$('.filter-row')));
  ck.check('错题卡默认不展示答案', (await page.$$('.question-answer')).length === 0);
  ck.check('错题卡提供查看答案入口', (await page.$$('.answer-peek')).length > 0);

  const peek = await page.$('.answer-peek');
  if (peek) {
    await peek.tap();
    await page.waitFor(200);
    ck.check('点击后可临时显示答案', (await page.$$('.question-answer')).length > 0);
  }

  const filter = await page.$('.filter-btn');
  if (filter) {
    await filter.tap();
    await page.waitFor(250);
    ck.check('筛选面板打开', !!(await page.$('.filter-sheet')));
    const chips = await page.$$('.filter-chip');
    if (chips.length > 1) {
      await chips[1].tap();
      await page.waitFor(500);
      const d1 = await page.data();
      ck.check('选择题型后条件生效并关闭面板', !!d1.curType && d1.filterShow === false,
        'curType=' + d1.curType + ' filterShow=' + d1.filterShow);
    }
  }

});
