'use strict';

/**
 * 错题本工作台：一行分段 / 搜索收起 / 答案默认收起 / 底部主操作 / 筛选面板。
 *
 * 2026-10-25 信息架构重排后跟着改的断言（原断言查的 .plan-card / .filter-row 已被合并）：
 *   · 「计划卡 + 3 tab」合并成一行分段 .wb-chip（统计与 tab 二合一，去掉重复数字）
 *   · 搜索默认收起，点顶栏 🔍（.wb-icon）才展开
 *   · 题型/排序从常驻筛选行收进 ⋯（.filter-btn）弹层
 *   · 主操作「开始复习」固定在底部 .wb-foot
 */

const H = require('./lib/harness');

H.runSuite('verify-wrong-book-ux（错题本工作台）', async function (miniProgram, ck) {
  const page = await H.goto(miniProgram, '/pages/wrong-book/wrong-book', 1400);
  ck.check('错题本根容器渲染', !!(await H.waitForSelector(page, '.page-wrong-book', 8000)));
  const d0 = await page.data();
  if (d0.needLogin) {
    ck.check('未登录展示统一门禁', !!(await page.$('.gate-bar')));
    return;
  }

  // ---- 首屏结构：一行分段（统计与 tab 二合一）----
  const chips = await page.$$('.wb-chip');
  ck.check('首屏是一行分段（待复习 / 复习中 / 已掌握）', chips.length === 3,
    '实际 ' + chips.length + ' 个');
  ck.check('首屏不再有独立统计卡', !(await page.$('.plan-card')));
  ck.check('首屏不再有常驻筛选行（收进 ⋯）', !(await page.$('.filter-row')));

  // ---- 搜索默认收起，点 🔍 展开 ----
  ck.check('搜索默认收起（不占首屏）', !(await page.$('.wb-search')));
  ck.check('searchOpen 默认 false', d0.searchOpen === false, 'searchOpen=' + d0.searchOpen);
  const icons = await page.$$('.wb-icon');
  if (icons.length > 0) {
    await icons[0].tap();
    await page.waitFor(200);
    ck.check('点 🔍 后搜索框展开', !!(await page.$('.wb-search')));
    const dSearch = await page.data();
    ck.check('searchOpen 变为 true', dSearch.searchOpen === true);
    // 收起，避免影响后续点击与截图
    await icons[0].tap();
    await page.waitFor(150);
  }

  // ---- 答案默认收起（2026-09-13 的既有口径，不能回退）----
  ck.check('错题卡默认不展示答案', (await page.$$('.question-answer')).length === 0);
  ck.check('错题卡提供查看答案入口', (await page.$$('.answer-peek')).length > 0);

  const peek = await page.$('.answer-peek');
  if (peek) {
    await peek.tap();
    await page.waitFor(200);
    ck.check('点击后可临时显示答案', (await page.$$('.question-answer')).length > 0);
  }

  // ---- 底部固定主操作 ----
  ck.check('底部固定主操作存在', !!(await page.$('.wb-foot')) && !!(await page.$('.btn-review')));

  // ---- 筛选面板（题型 / 排序）----
  const filter = await page.$('.filter-btn');
  if (filter) {
    await filter.tap();
    await page.waitFor(250);
    ck.check('筛选面板打开', !!(await page.$('.filter-sheet')));
    const fchips = await page.$$('.filter-chip');
    if (fchips.length > 1) {
      await fchips[1].tap();
      await page.waitFor(500);
      const d1 = await page.data();
      ck.check('选择题型后条件生效并关闭面板', !!d1.curType && d1.filterShow === false,
        'curType=' + d1.curType + ' filterShow=' + d1.filterShow);
      ck.check('筛选生效后出现提示条', !!(await page.$('.wb-filter-tip')));
    }
  }
});
