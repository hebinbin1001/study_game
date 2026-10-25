'use strict';

/**
 * verify-letter-bubble.js —— Boss 补字母泡泡龙端到端回归
 *
 * 验证真实页面元素点击、正确破盾、错误扣命、暂停恢复、逐词推进和最终结算。
 */
const H = require('./lib/harness');
const challenge = require('../miniprogram/utils/challenge');
const fs = require('fs');
const path = require('path');

const ART_DIR = path.resolve(__dirname, '..', 'artifacts', 'letter-bubble-fx');
fs.mkdirSync(ART_DIR, { recursive: true });

H.runSuite('verify-letter-bubble（Boss 补字母泡泡龙）', async function (miniProgram, ck) {
  const seed = challenge.lineSeedOf('kg', 'letterBubble', 1);
  const url = '/pages/letter-bubble/letter-bubble?challenge=1&line=mode_letterBubble&grade=kg&level=1&seed=' + seed;
  const page = await H.goto(miniProgram, url, 1800);

  ck.check('玩法根容器渲染', !!(await H.waitForSelector(page, '.lb-page', 8000)));
  const ready = await H.waitForData(page, function (d) {
    return !d.booting && !d.over && (d.bubbles || []).length > 0;
  }, 15000, 'letter bubble ready');
  ck.check('开局完成并生成目标词与护盾', !!ready);
  if (!ready) return;

  ck.check('目标词为纯英文', /^[A-Za-z]+$/.test(String(ready.word || '')), '实际 = ' + ready.word);
  ck.check('护盾泡泡 7~9 枚', ready.bubbles.length >= 7 && ready.bubbles.length <= 9,
    '实际 = ' + ready.bubbles.length);
  ck.check('护盾只有一个缺口字母', ready.bubbles.filter(function (b) { return b.correct; }).length === 1);
  ck.check('题面包含一个正在闪烁的空位', ready.letters.filter(function (x) { return x.blank; }).length === 1);
  ck.check('挑战进度写入 line=mode_letterBubble', (await page.data()).showNext === true);

  let state = await page.data();
  let widgets = await page.$$('.lb-bubble');
  let correctIndex = state.bubbles.findIndex(function (b) { return b.correct; });
  ck.check('正确泡泡可定位', correctIndex >= 0);
  if (correctIndex < 0 || !widgets[correctIndex]) return;

  const beforeQ = state.qIndex;
  const beforeScore = state.score;
  const beforeBossHp = state.bossHp;
  await widgets[correctIndex].tap();
  await page.waitFor(80);
  const duringAttack = await page.data();
  ck.check('页面中的真实战士节点进入冲锋态', duringAttack.heroAttacking === true);
  ck.check('真实战士位移目标来自 Boss 坐标',
    String(duringAttack.heroStrikeStyle || '').indexOf('--strike-y') >= 0);
  await page.waitFor(220);
  await H.withTimeout(miniProgram.screenshot({
    path: path.join(ART_DIR, 'attack.png')
  }), 10000, 'attack screenshot');
  const advanced = await H.waitForData(page, function (d) {
    return d.qIndex > beforeQ || d.over;
  }, 5000, 'correct advance');
  ck.check('点击正确字母后进入下一词', !!advanced);
  ck.check('正确命中增加得分', !!advanced && advanced.score > beforeScore);
  ck.check('正确命中削减 Boss 护盾', !!advanced && advanced.bossHp < beforeBossHp);
  ck.check('正确命中触发冲刺斩击反馈', !!advanced && advanced.fxSeq > 0
    && advanced.fxMode === 'attack');
  ck.check('冲刺目标取 Boss 实际坐标，而非屏幕固定中心',
    !!advanced && Number(advanced.fxTargetX) > 0 && Number(advanced.fxTargetY) > 0);
  ck.check('战士从下方玩家坐标冲向 Boss',
    !!advanced && Number(advanced.fxPlayerY) > Number(advanced.fxTargetY));

  state = await page.data();
  widgets = await page.$$('.lb-bubble');
  let wrongIndex = state.bubbles.findIndex(function (b) { return !b.correct; });
  const beforeLives = state.lives;
  const sameQ = state.qIndex;
  if (wrongIndex >= 0 && widgets[wrongIndex]) {
    await widgets[wrongIndex].tap();
    await page.waitFor(80);
    const duringCounter = await page.data();
    ck.check('页面中的真实 Boss 节点进入反击冲锋态', duringCounter.bossCountering === true);
    ck.check('真实 Boss 位移目标来自玩家坐标',
      String(duringCounter.bossCounterStyle || '').indexOf('--counter-y') >= 0);
    await page.waitFor(180);
    await H.withTimeout(miniProgram.screenshot({
      path: path.join(ART_DIR, 'counter.png')
    }), 10000, 'counter screenshot');
    const hurt = await H.waitForData(page, function (d) {
      return d.lives < beforeLives;
    }, 3000, 'wrong life');
    ck.check('点击错误字母会扣一条护盾', !!hurt);
    ck.check('错误命中触发 Boss 反击反馈', !!hurt && hurt.fxMode === 'counter');
    ck.check('Boss 反击同样使用双方实际坐标',
      !!hurt && Number(hurt.fxTargetY) < Number(hurt.fxPlayerY));
    const refreshed = await H.waitForData(page, function (d) {
      return d.qIndex === sameQ && !d.paused && (!d.activeBubbleId || d.over);
    }, 5000, 'wrong refresh');
    ck.check('答错后停留在同一个词并刷新护盾', !!refreshed);
  } else {
    ck.check('错误泡泡可定位', false);
  }

  for (let i = 0; i < 14; i++) {
    state = await page.data();
    if (state.over) break;
    widgets = await page.$$('.lb-bubble');
    correctIndex = state.bubbles.findIndex(function (b) { return b.correct; });
    if (correctIndex < 0 || !widgets[correctIndex]) break;
    const q = state.qIndex;
    await widgets[correctIndex].tap();
    await H.waitForData(page, function (d) {
      return d.qIndex > q || d.over;
    }, 8000, 'round ' + q);
  }

  const finalState = await H.waitForData(page, function (d) { return d.over === true; }, 6000, 'settled');
  ck.check('完成全部目标词后进入结算', !!finalState);
  ck.check('通关状态与星级正确', !!finalState && finalState.win === true
    && /⭐/.test(String(finalState.starsText || '')));
  ck.check('结算层已挂载', !!(await page.$('settle-pop')));
});
