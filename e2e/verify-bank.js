'use strict';

/**
 * verify-bank.js —— 题库（2026-09-18 新增功能）端到端验证
 *
 * 覆盖：
 *   1. 学习 tab 有题库入口（用户 2026-09-18 改口径：题库放学习 tab，不放玩法 tab）
 *   2. 题库页结构渲染正常
 *   3. 未登录时按受限页规范显示门禁条（不发请求、不渲染列表）
 *
 * 说明：词条的「合并规则」（停用/改写/新增/恢复）是纯逻辑，已在
 * tests/unit/bank.test.js 覆盖；这里只验证页面与入口的真实可达性
 * ——模拟器是游客态，拿不到 openid，编辑动作的完整链路由云端冒烟兜底。
 *
 * 运行：node e2e/verify-bank.js
 */

const H = require('./lib/harness');

H.runSuite('verify-bank（题库）', async function (miniProgram, ck) {
  console.log('[1/4] 玩法 tab 不再有题库入口（题库归学习 tab）');
  const play = await H.goto(miniProgram, '/pages/playlist/playlist', 1800);
  // 用户 2026-09-18 明确：题库归学习 tab，玩法 tab 不再放入口
  ck.check('玩法 tab 不再有题库入口 .bank-entry', !(await play.$('.bank-entry')));

  console.log('[2/4] 直接进入题库页（游客态点入口会先弹登录，这里直接导航）');
  // 为什么不在用例里点入口：游客态下 goBank() 会先弹登录引导弹窗，
  // 弹窗会挂住 automator 的响应（超时假失败）。入口是否可点由点击护栏 +
  // 页面渲染回归覆盖，这里直接 reLaunch 验证页面本身。
  const page = await H.goto(miniProgram, '/pages/bank/bank', 1500);
  if (page.path !== 'pages/bank/bank') return;

  ck.check('题库页根容器 .bk-page 已渲染', !!(await H.waitForSelector(page, '.bk-page', 8000)));
  ck.check('顶部标题区 .bk-head 已渲染', !!(await H.waitForSelector(page, '.bk-head', 8000)));

  console.log('[3/4] 未登录 → 受限页门禁（与其它受限页同一规范）');
  const data = await page.data();
  if (data.needLogin) {
    ck.check('未登录时 data.needLogin = true', data.needLogin === true);
    ck.check('渲染登录引导条 .gate-bar', !!(await H.waitForSelector(page, '.gate-bar', 6000)));
    const gateBtn = await page.$('.gate-btn');
    ck.check('引导条带「去登录」按钮', !!gateBtn);
    ck.check('未登录不渲染词条列表（.bk-item 数量为 0）',
      (await page.$$('.bk-item')).length === 0);
  } else {
    // 模拟器若已带登录态（开发者工具登录过），退化为校验列表可用
    ck.check('已登录态：词条列表已渲染', (await page.$$('.bk-item')).length > 0);
  }

  console.log('[4/4] 学习 tab 也有题库入口');
  const study = await H.goto(miniProgram, '/pages/study/study', 1600);
  ck.check('进入学习 tab', study.path === 'pages/study/study', '实际 = ' + study.path);
  const links = await study.$$('.link');
  let found = false;
  for (const l of links) {
    const t = await l.text();
    if (t && t.indexOf('题库') >= 0) { found = true; break; }
  }
  ck.check('学习 tab 有题库入口', found);
});
