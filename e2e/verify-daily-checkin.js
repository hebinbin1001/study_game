'use strict';

/**
 * 每日一题 → 今日签到 → 签到日历 全链路。
 * 此前只测页面渲染，无法发现「答题成功但签到状态没落库」与
 * 「提交失败却被本地标记已签」两类问题。
 */

const H = require('./lib/harness');

H.runSuite('verify-daily-checkin（每日一题签到链路）', async function (miniProgram, ck) {
  const page = await H.goto(miniProgram, '/pages/daily-question/daily-question', 1200);
  ck.check('每日一题页面渲染', !!(await H.waitForSelector(page, '.page-daily', 8000)));

  let d = await H.waitForData(page, function (x) {
    return x.loading === false && (x.answered === true || (x.options || []).length === 4);
  }, 12000, 'daily question ready');
  ck.check('每日一题拿到今日状态', !!d);
  if (!d) return;

  if (!d.answered) {
    const idx = (d.options || []).findIndex(function (x) { return x.text === d.meaning; });
    ck.check('题目包含唯一正确选项', idx >= 0, 'meaning=' + JSON.stringify(d.meaning));
    if (idx < 0) return;
    await page.callMethod('onPick', { currentTarget: { dataset: { key: String(idx) } } });
    d = await H.waitForData(page, function (x) {
      return x.answered === true || x.submitFailed === true;
    }, 15000, 'daily answer submitted');
    ck.check('答对后签到提交成功', !!d && d.answered === true && d.submitFailed === false,
      d ? JSON.stringify({ answered: d.answered, submitFailed: d.submitFailed }) : 'timeout');
    ck.check('签到连续天数为正数', !!d && d.streak > 0, 'streak=' + (d && d.streak));
  } else {
    ck.check('今日已签到时直接展示完成态', !!(await H.waitForSelector(page, '.done-card', 5000)));
  }

  const checkin = await H.goto(miniProgram, '/pages/checkin/checkin', 1000);
  ck.check('签到日历页渲染', !!(await H.waitForSelector(checkin, '.page-checkin', 8000)));
  const c = await H.waitForData(checkin, function (x) {
    return !!x.today && Array.isArray(x.calCells) && x.calCells.length > 0;
  }, 12000, 'checkin loaded');
  ck.check('签到页确认今日已签到', !!c && c.checkedIn === true,
    c ? JSON.stringify({ today: c.today, checkedIn: c.checkedIn, streak: c.currentStreak }) : 'timeout');
  ck.check('签到日历今日格子高亮', !!c && (c.calCells || []).some(function (x) {
    return x.isToday && x.on;
  }));
});
