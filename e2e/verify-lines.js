'use strict';

/**
 * verify-lines.js —— 玩法线（P3 一期）端到端验证
 *
 * 背景（用户 2026-09-13 反馈）：
 *   「闯关学习只有从字母射击才可以进去，其他题库的玩法都是单独的」——一期给 6 款题库玩法
 *   各做了一条 30 关玩法线，并把玩法 tab 改成二级分段（闯关线 / 数字智力）。
 *
 * 覆盖：
 *   A. 关卡页支持 ?mode=xxx 直达某条玩法线：chips 里 6 条线都在、当前视图是这条线、30 行关卡；
 *   B. 点该线第 1 关 → 落到对应玩法页，挑战局成立；
 *   C. 结算写星走 <学段>@mode_<玩法>@<关卡>，且**不改动**主线/题型练习的存档键（快照比对）；
 *   D. 同一关两次进牌面一致（玩法线种子可复现）、相邻关不同；
 *   E. 玩法 tab 二级分段：闯关线 6 款（都带 lineMode）/ 数字智力 9 款。
 *
 * 踩坑备注：
 *   · currentPage().path 不带前导斜杠（实际 = pages/link/link）；
 *   · 牌面是 onLoad → newRound 之后才 setData，直接读 data 会读到空数组，必须轮询等；
 *   · 模拟器存档跨用例持久，判断「有没有误写别的命名空间」要用前后快照比对，不能看键存在与否。
 *
 * 运行：node e2e/verify-lines.js
 */

const H = require('./lib/harness');

const LINE_URL = '/pages/level/level?mode=link';
const LINK_PAGE = 'pages/link/link';

async function main() {
  const ck = H.createChecker();
  let mp = null;
  try {
    mp = await H.ensureAutomation({ quiet: false });
    const starsBefore = (await mp.callWxMethod('getStorageSync', 'ww_stars')) || {};

    // ---------- A. 关卡页直达玩法线 ----------
    console.log('[1/5] 关卡页 ?mode=link 直达玩法线');
    const lvPage = await H.goto(mp, LINE_URL, 1800);
    const lvData = await lvPage.data();
    ck.check('当前视图是词语连连看玩法线', lvData.currentType === 'mode_link',
      '实际 = ' + lvData.currentType);
    const lineChips = (lvData.typeGroups || []).filter(function (t) {
      return String(t.key || '').indexOf('mode_') === 0;
    });
    // 2026-09-19：新增「限时抢答」→ 玩法线 6 → 7 条
    ck.check('顶部 chips 里有 7 条玩法线', lineChips.length === 7,
      '实际 = ' + lineChips.length + '（' + lineChips.map(function (t) { return t.key; }).join(',') + '）');
    ck.check('玩法线关卡共 30 关', (lvData.levels || []).length === 30,
      '实际 = ' + (lvData.levels || []).length);
    ck.check('关卡行带难度摘要', !!(lvData.levels && lvData.levels[0] && lvData.levels[0].sub),
      '实际 = ' + (lvData.levels && lvData.levels[0] && lvData.levels[0].sub));
    ck.check('玩法线不显示里程碑宝箱', (lvData.chests || []).length === 0,
      '实际 = ' + (lvData.chests || []).length);
    const gradeKey = (lvData.grades[lvData.currentGradeIndex] || {}).key || '';
    ck.check('拿到当前学段', !!gradeKey, '实际 = ' + gradeKey);

    // ---------- B. 点第 1 关进对局 ----------
    console.log('[2/5] 点该线第 1 关 → 对应玩法页 + 挑战局成立');
    const rows = await H.withTimeout(lvPage.$$('.lvrow'), 10000, 'query .lvrow');
    ck.check('关卡行渲染出来了', (rows || []).length === 30, '实际 = ' + (rows || []).length);
    await H.withTimeout(rows[0].tap(), 10000, 'tap first row');
    await lvPage.waitFor(1500);
    const afterTap = await mp.currentPage();
    ck.check('落到词语连连看页', afterTap.path === LINK_PAGE, '实际 = ' + afterTap.path);
    const lkData = await H.waitForData(afterTap, function (d) {
      return (d.cards || []).length === 16;
    }, 15000, 'link-cards-16');
    ck.check('牌面 16 张（8 对）', !!(lkData && (lkData.cards || []).length === 16),
      '实际 = ' + (lkData ? (lkData.cards || []).length : 'null'));
    ck.check('是挑战局（challenge=true）', !!(lkData && lkData.challenge === true),
      '实际 = ' + (lkData && lkData.challenge));
    ck.check('存档键是玩法线命名空间', !!(lkData && lkData.challengeKey === gradeKey + '@mode_link@1'),
      '实际 = ' + (lkData && lkData.challengeKey) + ' / 期望 = ' + gradeKey + '@mode_link@1');

    // ---------- B2. 「下一关」（2026-09-18 用户要求：过关后要提示下一关） ----------
    // 注意：本段会 reLaunch 到别的关卡（会销毁上面那个 page 句柄），
    // 所以必须放在 C 段写星断言**之前**只读断言、且不再复用 afterTap。
    console.log('[2.5/5] 结算层的「下一关」口径');
    ck.check('第 1 关已备好下一关（data.showNext=true）', !!(lkData && lkData.showNext === true),
      '实际 = ' + (lkData && lkData.showNext));

    // ---------- C. 结算写星：只写玩法线命名空间 ----------
    console.log('[3/5] 结算写星：只写 <学段>@mode_link@<关卡>');
    await afterTap.callMethod('_saveChallengeStars', 3);
    await afterTap.waitFor(400);
    const stars = (await mp.callWxMethod('getStorageSync', 'ww_stars')) || {};
    ck.check('玩法线星级已写入 ' + gradeKey + '@mode_link@1',
      stars[gradeKey + '@mode_link@1'] === 3,
      '实际 = ' + JSON.stringify(stars[gradeKey + '@mode_link@1']));
    ck.check('主线 @challenge@ 存档未被本用例改动',
      stars[gradeKey + '@challenge@1'] === starsBefore[gradeKey + '@challenge@1'],
      '前 = ' + JSON.stringify(starsBefore[gradeKey + '@challenge@1'])
        + ' / 后 = ' + JSON.stringify(stars[gradeKey + '@challenge@1']));
    ck.check('题型练习 @link@ 存档未被本用例改动',
      stars[gradeKey + '@link@1'] === starsBefore[gradeKey + '@link@1'],
      '前 = ' + JSON.stringify(starsBefore[gradeKey + '@link@1'])
        + ' / 后 = ' + JSON.stringify(stars[gradeKey + '@link@1']));

    // ---------- D. 种子可复现 ----------
    console.log('[4/5] 同一关两次进牌面一致；相邻关不同');
    const url1 = '/pages/link/link?challenge=1&line=mode_link&grade=' + gradeKey + '&level=7';
    const p1 = await H.goto(mp, url1, 1500);
    const d1 = await H.waitForData(p1, function (d) { return (d.cards || []).length === 16; },
      15000, 'line-7-cards');
    const labs1 = (d1 && d1.cards || []).map(function (c) { return c.lab; }).join('|');
    const p2 = await H.goto(mp, url1, 1500);
    const d2 = await H.waitForData(p2, function (d) { return (d.cards || []).length === 16; },
      15000, 'line-7-cards-again');
    const labs2 = (d2 && d2.cards || []).map(function (c) { return c.lab; }).join('|');
    ck.check('同一关两次牌面一致（种子可复现）', !!labs1 && labs1 === labs2);
    const p3 = await H.goto(mp, '/pages/link/link?challenge=1&line=mode_link&grade=' + gradeKey + '&level=8', 1500);
    const d3 = await H.waitForData(p3, function (d) { return (d.cards || []).length === 16; },
      15000, 'line-8-cards');
    const labs3 = (d3 && d3.cards || []).map(function (c) { return c.lab; }).join('|');
    ck.check('相邻两关牌面不同（种子按关派生）', !!labs3 && labs3 !== labs1);

    // ---------- E. 玩法 tab 二级分段 ----------
    console.log('[5/5] 玩法 tab 二级分段：闯关线 / 数字智力');
    const pl = await H.goto(mp, '/pages/playlist/playlist', 1600);
    const plData = await pl.data();
    ck.check('默认落在闯关线分段', plData.curSection === 'line', '实际 = ' + plData.curSection);
    const lineGames = plData.games || [];
    // 2026-09-19：新增「限时抢答」→ 闯关线从 6 款变 7 款
    ck.check('闯关线分段 7 款玩法', lineGames.length === 7, '实际 = ' + lineGames.length);
    ck.check('7 款都带 lineMode（点进去是关卡线而不是自由练）',
      lineGames.length === 7 && lineGames.every(function (g) { return !!g.lineMode; }),
      '实际 = ' + lineGames.map(function (g) { return g.lineMode || '-'; }).join(','));
    await pl.callMethod('pickSection', { currentTarget: { dataset: { key: 'casual' } } });
    await pl.waitFor(600);
    const casual = await pl.data();
    ck.check('切到数字智力分段', casual.curSection === 'casual', '实际 = ' + casual.curSection);
    ck.check('数字智力 9 款', (casual.games || []).length === 9, '实际 = ' + (casual.games || []).length);
    ck.check('弹弹球仍在数字智力里做未解锁占位',
      (casual.games || []).some(function (g) { return g.key === 'bounce' && !g.unlocked; }));

    // ---------- F. 最后一关不给「下一关」（放在最后：会 reLaunch，销毁前面的 page 句柄） ----------
    console.log('[6/6] 最后一关不给「下一关」');
    const lastUrl = '/pages/link/link?challenge=1&line=mode_link&grade=' + gradeKey + '&level=30';
    const pLast = await H.goto(mp, lastUrl, 1500);
    const dLast = await H.waitForData(pLast, function (d) { return (d.cards || []).length === 16; },
      15000, 'line-30-cards');
    ck.check('第 30 关（最后一关）不显示下一关', !!(dLast && dLast.showNext === false),
      '实际 = ' + (dLast && dLast.showNext));
  } catch (e) {
    ck.check('脚本执行无异常', false, (e && e.message) || String(e));
  } finally {
    if (mp) { try { await mp.close(); } catch (e) { /* 关闭异常忽略 */ } }
  }
  process.exitCode = H.summarize('verify-lines（玩法线）', ck);
}

main();
