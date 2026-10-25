'use strict';

/**
 * 错题复习「十题一关」流程。
 *
 * 守的是 2026-10-25 的改动：
 *   · 关内**全自动推进** —— 原来答对后会弹「是否移出错题本」的模态弹窗，
 *     必须点一下才继续；现在答对答错都自动下一题。
 *     如果弹窗回来了，本用例后续的 `.option` 点击会被挡住而卡住/失败。
 *   · 一关最多 10 题，答完进本关结算并显示正确率。
 */

const H = require('./lib/harness');

H.runSuite('verify-wrong-review-flow（十题一关）', async function (miniProgram, ck) {
  const page = await H.goto(miniProgram, '/pages/wrong-review/wrong-review', 1200);
  ck.check('复习页渲染', !!(await H.waitForSelector(page, '.page-wrong-review', 8000)));

  const d0 = await page.data();
  // 未登录 / 没有待复习题时，页面应当给出完成态而不是白屏
  if (!d0.totalCount) {
    ck.check('无待复习题时展示完成态（不白屏）', !!(await page.$('.completed')));
    return;
  }

  ck.check('一关最多 10 题', d0.totalCount <= 10, '本关题数=' + d0.totalCount);
  ck.check('进度按本关显示（第 x / 本关题数）', !!(await page.$('.progress-text')));

  // 连答到本关结束：点第一个选项，答对答错都会自动推进
  const maxRounds = d0.totalCount + 6;
  let tapped = 0;
  for (let i = 0; i < maxRounds; i++) {
    const d = await page.data();
    if (d.completed) break;
    const opts = await page.$$('.option');
    if (!opts.length) {
      await page.waitFor(300);
      continue;
    }
    await opts[0].tap();
    tapped++;
    // 答对 800ms / 答错 1500ms 后自动下一题，留足余量
    await page.waitFor(1700);
  }

  ck.check('连答后进入本关结算', !!(await page.$('.completed')), '点击次数=' + tapped);

  const d1 = await page.data();
  ck.check('结算页给出本关正确率', d1.levelRate >= 0 && d1.levelRate <= 100,
    'levelRate=' + d1.levelRate);
  ck.check('结算页答对数不超过本关题数', d1.correctCount <= d1.totalCount,
    d1.correctCount + '/' + d1.totalCount);
  ck.check('结算页有返回错题本入口', !!(await page.$('.btn-back')));
});
