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

  // 2026-09-18 二次改版：自建库 + 掌握状态筛选 + 新建题库入口
  const data0 = await page.data();
  if (!data0.needLogin) {
    ck.check('词库选择 chips 已渲染（内置档）',
      (await page.$$('.bk-chip--bank')).length >= 1, '实际 ' + (await page.$$('.bk-chip--bank')).length);
    ck.check('有「＋ 新建题库」入口', !!(await page.$('.bk-chip--new')));
    ck.check('掌握状态筛选 3 档（全部/薄弱/已掌握）', (await page.$$('.bk-mf')).length === 3,
      '实际 ' + (await page.$$('.bk-mf')).length);
    const allCount = data0.totalAll;
    const weakBtn = await page.$('.bk-mf.weak');
    if (weakBtn) {
      await weakBtn.tap();
      await page.waitFor(400);
      const dWeak = await page.data();
      ck.check('切到「薄弱」筛选后不崩且计数不超过全部',
        dWeak.mFilter === 'weak' && (dWeak.shown || []).length <= allCount,
        'weak shown = ' + (dWeak.shown || []).length + ' / all = ' + allCount);
      await (await page.$('.bk-mf')).tap();
      await page.waitFor(300);
    }
    const newBank = await page.$('.bk-chip--new');
    if (newBank) {
      await newBank.tap();
      await page.waitFor(400);
      ck.check('点「新建题库」弹出建库表单', (await page.$$('.bk-sheet')).length >= 1);
      const cancel = await page.$('.bk-btn.ghost');
      if (cancel) { await cancel.tap(); await page.waitFor(300); }
    }
  }

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
  let foundLevel = false;
  for (const l of links) {
    const t = await l.text();
    if (!t) continue;
    if (t.indexOf('题库') >= 0 && t.indexOf('自建关卡') < 0) found = true;
    if (t.indexOf('自建关卡') >= 0) foundLevel = true;
  }
  ck.check('学习 tab 有题库入口', found);
  // 2026-09-18 改名：原「自定义题库」→「自建关卡」，避免与新「题库」撞名
  ck.check('学习 tab 的自建关卡入口已改名（不再叫自定义题库）', foundLevel);

  // ---------- [5] 自建关卡编辑器：从题库选题（方案 A） ----------
  console.log('[5] 关卡编辑器「从题库选」：勾选 → 加入题单');
  const editor = await H.goto(miniProgram, '/pages/level-editor/level-editor', 1600);
  ck.check('编辑器页渲染', !!(await H.waitForSelector(editor, '.page-editor', 8000)));
  const pickBtn = await editor.$('.btn-pick');
  ck.check('存在「📚 从题库选」按钮', !!pickBtn);
  if (pickBtn) {
    await pickBtn.tap();
    await editor.waitFor(900);
    const d1 = await editor.data();
    ck.check('选题弹层打开', d1.pickerShow === true, '实际 = ' + d1.pickerShow);
    ck.check('列出本学段词条（>0 条）', (d1.pickerOptions || []).length > 0,
      '实际 = ' + (d1.pickerOptions || []).length);
    const items = await editor.$$('.pk-item');
    ck.check('可勾选条目已渲染', items.length > 0, '实际 ' + items.length);
    if (items.length >= 2) {
      await items[0].tap();
      await editor.waitFor(300);
      await items[1].tap();
      await editor.waitFor(300);
      const d2 = await editor.data();
      ck.check('勾选计数为 2', d2.pickerCount === 2, '实际 = ' + d2.pickerCount);
      const applyBtn = (await editor.$$('.pk-btn'))[1];
      await applyBtn.tap();
      await editor.waitFor(900);
      const d3 = await editor.data();
      ck.check('加入题单：弹层关闭', d3.pickerShow === false, '实际 = ' + d3.pickerShow);
      ck.check('题单里多了 2 道来自题库的题', (d3.items || []).length === 2,
        '实际 = ' + (d3.items || []).length);
      ck.check('搬进来的题字段完整（type/q/a）',
        (d3.items || []).every((it) => it.type && it.q && it.a),
        JSON.stringify((d3.items || []).slice(0, 2)));
      ck.check('题库内部标记没有写进关卡数据',
        (d3.items || []).every((it) => it._user === undefined && it._key === undefined));
    }
  }
});
