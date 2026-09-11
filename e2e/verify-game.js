'use strict';

/**
 * verify-game.js —— 端到端验证「字母射击打怪 / 单词闯关」页面与游戏逻辑
 *
 * 覆盖两类断言：
 *   A. 回归（原有意图）：进入关卡不自动跳结算页，HUD 与选项正常出题
 *   B. 玩法逻辑：答对 → 得分 +scorePerCorrect、连击累积、题号推进、连击浮层出现
 *
 * 进关前置（M7/M6-L，必须依次经过，否则引擎不启动、选项恒为 0）：
 *   形态选择层 .pick-start → 新手引导 .tutorial-mask ×3 → 出题
 *   （历史失败根因：本脚本写于形态自选上线前，未过这两层遮罩。）
 *
 * 关于连击字段（踩坑记录）：页面 data 里没有 `combo` 字段。
 *   引擎的连击经 onHudChange 映射为 `comboShow`（数字），
 *   用户可见的浮层文字是 `comboText`（连击 ≥2 才出现，800ms 后自动清除）。
 *   断言连击请用 comboShow / comboText，不要读 data.combo。
 *
 * 前置条件：微信开发者工具已安装且已登录。
 * 运行：node e2e/verify-game.js
 */

const H = require('./lib/harness');

const GAME_URL = '/pages/game/game?grade=kindergarten&level=1';
const EXPECTED_OPTIONS = 4;
const EXPECTED_TOTAL_Q = 10;
const SCORE_PER_CORRECT = 10;

/** 读出当前题的正确答案下标（从 page.data().options 里找 correct=true） */
function correctIndexOf(data) {
  return (data.options || []).findIndex(function (o) { return o.correct; });
}

H.runSuite('verify-game（单词闯关）', async function (miniProgram, ck) {
  console.log('[1/7] 进入游戏页 ' + GAME_URL);
  const page = await H.goto(miniProgram, GAME_URL, 2000);

  // A1. 进关不能自动结算（原回归断言）
  let cur = await miniProgram.currentPage();
  ck.check('进入关卡后停留在游戏页（未自动跳结算页）', cur.path === 'pages/game/game', '实际路径 = ' + cur.path);
  if (cur.path !== 'pages/game/game') return;

  ck.check('游戏页根容器 .game-page 已渲染', !!(await H.waitForSelector(page, '.game-page', 8000)));

  // A2. 进关前置遮罩存在（证明现在确实有形态自选这一层）
  const pickMask = await page.$('.pick-mask');
  ck.check('进关前展示形态选择层 .pick-mask', !!pickMask);

  console.log('[2/7] 经过进关前置：形态选择 + 新手引导');
  const steps = await H.clearGameGates(page);
  steps.forEach(function (s) { console.log('        · ' + s); });
  ck.check('已走出进关前置（形态选择 + 新手引导）', steps.length > 0, steps.join(' / '));

  // A3. 出题：恰好 4 个选项
  console.log('[3/7] 等待出题（4 个选项）');
  const options = await H.waitForCount(page, '.option', EXPECTED_OPTIONS, 20000);
  ck.check('选项数量为 ' + EXPECTED_OPTIONS, !!options, options ? ('实际 ' + options.length) : '超时未出题');
  if (!options) return;

  // A4. HUD 正常
  const qnum = await H.textOf(page, '.hud-qnum');
  const lives = await H.textOf(page, '.hud-lives');
  console.log('        HUD 题号 = ' + qnum + ' · 命数 = ' + lives);
  ck.check('HUD 题号为第 1/' + EXPECTED_TOTAL_Q + ' 题', qnum === '第 1/' + EXPECTED_TOTAL_Q + ' 题', '实际 = ' + qnum);
  ck.check('HUD 命数非空', !!lives, '实际 = ' + lives);

  const before = await page.data();
  ck.check('页面 data.totalQ = ' + EXPECTED_TOTAL_Q, before.totalQ === EXPECTED_TOTAL_Q, '实际 = ' + before.totalQ);
  ck.check('页面 data.options 长度为 ' + EXPECTED_OPTIONS, (before.options || []).length === EXPECTED_OPTIONS,
    '实际 = ' + ((before.options || []).length));

  // B1. 答对第 1 题：[4/7]
  console.log('[4/7] 答对第 1 题（读 page.data() 定位正确项）');
  const ci1 = correctIndexOf(before);
  ck.check('当前题目存在唯一正确答案项', ci1 >= 0, 'correct 下标 = ' + ci1);
  if (ci1 < 0) return;

  await options[ci1].tap();
  // 等「题号推进」这个状态信号，而不是等固定时长。
  // 引擎主循环把 dt 钳制在 0.05s/帧（REQ-NFR-1），模拟器帧率偏低时游戏内 0.7s
  // 的死亡动画会明显慢于墙上时间，固定 waitFor(2200) 会随负载偶发假失败。
  // 引擎 _newQuestion() 先置 state=IDLE 再 emitHud，故题号推进即可安全作答下一题。
  const after1 = await H.waitForData(page, function (d) {
    return (d.qIndex || 0) > (before.qIndex || 0);
  }, 20000, '第 1 题答对后题号推进') || await page.data();
  console.log('        得分 ' + (before.score || 0) + ' → ' + (after1.score || 0)
    + ' · 连击 ' + (before.comboShow || 0) + ' → ' + (after1.comboShow || 0)
    + ' · 题号 ' + before.qIndex + ' → ' + after1.qIndex);

  ck.check('答对后得分 +' + SCORE_PER_CORRECT, (after1.score || 0) - (before.score || 0) === SCORE_PER_CORRECT,
    (before.score || 0) + ' → ' + (after1.score || 0));
  ck.check('答对后连击累积到 1', (after1.comboShow || 0) === 1, '实际 comboShow = ' + after1.comboShow);
  ck.check('答对后题号推进', after1.qIndex === before.qIndex + 1, before.qIndex + ' → ' + after1.qIndex);
  ck.check('答对后 life 未扣（HUD 仍为 ❤❤❤）', (await H.textOf(page, '.hud-lives')) === '❤❤❤',
    '实际 = ' + (await H.textOf(page, '.hud-lives')));

  // B2. 连答第 2 题：验证连击累积 + 用户可见连击浮层 [5/7]
  console.log('[5/7] 连答第 2 题，验证连击累积与连击浮层');
  const options2 = await H.waitForCount(page, '.option', EXPECTED_OPTIONS, 15000);
  ck.check('下一题仍出 ' + EXPECTED_OPTIONS + ' 个选项', !!options2,
    options2 ? ('实际 ' + options2.length) : '超时');
  if (!options2) return;

  const d2 = await page.data();
  const ci2 = correctIndexOf(d2);
  ck.check('下一题存在唯一正确答案项', ci2 >= 0, 'correct 下标 = ' + ci2);
  if (ci2 < 0) return;

  await options2[ci2].tap();
  // comboText 由页面在 800ms 后自动清除（墙上时间），须在窗口内高频轮询抓取
  let toast = null;
  for (let i = 0; i < 25; i++) {
    const d = await page.data();
    if (d.comboText) { toast = d.comboText; break; }
    await page.waitFor(60);
  }
  // 同样按状态等待：得分真正增加才算第 2 题作答被引擎接受
  const after2 = await H.waitForData(page, function (d) {
    return (d.score || 0) > (d2.score || 0);
  }, 20000, '第 2 题答对后得分增加') || await page.data();

  console.log('        得分 ' + (d2.score || 0) + ' → ' + (after2.score || 0)
    + ' · 连击 ' + (d2.comboShow || 0) + ' → ' + (after2.comboShow || 0)
    + ' · 浮层 = ' + JSON.stringify(toast));

  ck.check('连对第 2 题得分再 +' + SCORE_PER_CORRECT,
    (after2.score || 0) - (d2.score || 0) === SCORE_PER_CORRECT,
    (d2.score || 0) + ' → ' + (after2.score || 0));
  ck.check('连击累积到 2', (after2.comboShow || 0) === 2, '实际 comboShow = ' + after2.comboShow);
  ck.check('出现连击浮层「2 连击!」', toast === '2 连击!', '实际 = ' + JSON.stringify(toast));

  // A5/A6. 出题链路与页面状态 [6/7][7/7]
  console.log('[6/7] 校验下一题继续出题');
  const options3 = await H.waitForCount(page, '.option', EXPECTED_OPTIONS, 15000);
  ck.check('第 3 题仍出 ' + EXPECTED_OPTIONS + ' 个选项', !!options3,
    options3 ? ('实际 ' + options3.length) : '超时');

  console.log('[7/7] 校验页面未跳转/未崩溃');
  cur = await miniProgram.currentPage();
  ck.check('全流程结束后仍在游戏页', cur.path === 'pages/game/game', '实际 = ' + cur.path);
  const end = await page.data();
  ck.check('整局未提前进入结算态', !end.over, '实际 over = ' + end.over);
});
