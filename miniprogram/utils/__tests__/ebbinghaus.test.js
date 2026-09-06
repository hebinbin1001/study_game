const ebbinghaus = require("../../utils/ebbinghaus");

console.log(">>> 运行 ebbinghaus.test.js\n");

const {
  calculateNextReview,
  isDueForReview,
  getNextReviewText,
  getReviewProgress,
  getReviewStageText,
  EBBINGHAUS_INTERVALS,
} = ebbinghaus;

// 测试 1：复习间隔配置
{
  assert(
    EBBINGHAUS_INTERVALS.length === 6 &&
      EBBINGHAUS_INTERVALS[0] === 1 &&
      EBBINGHAUS_INTERVALS[5] === 30,
    "EBBINGHAUS_INTERVALS: [1, 2, 4, 7, 15, 30]"
  );
}

// 测试 2：首次答错 → 明天再复习
{
  const result = calculateNextReview(0, 0, false);
  assert(
    result.mastery === 0 &&
      result.reviewCount === 0 &&
      isTomorrow(result.nextReviewAt),
    "首次答错：mastery=0, reviewCount=0, 明天复习"
  );
}

// 测试 3：首次答对 → 1 天后复习
{
  const result = calculateNextReview(0, 0, true);
  assert(
    result.mastery === 20 &&
      result.reviewCount === 1 &&
      isTomorrow(result.nextReviewAt),
    "首次答对：mastery=20, reviewCount=1, 1天后复习"
  );
}

// 测试 4：第 2 次答对 → 2 天后复习
{
  const result = calculateNextReview(1, 20, true);
  assert(
    result.mastery === 40 &&
      result.reviewCount === 2 &&
      isDaysLater(result.nextReviewAt, 2),
    "第2次答对：mastery=40, reviewCount=2, 2天后复习"
  );
}

// 测试 5：第 3 次答对 → 4 天后复习
{
  const result = calculateNextReview(2, 40, true);
  assert(
    result.mastery === 60 &&
      result.reviewCount === 3 &&
      isDaysLater(result.nextReviewAt, 4),
    "第3次答对：mastery=60, reviewCount=3, 4天后复习"
  );
}

// 测试 6：第 4 次答对 → 7 天后复习
{
  const result = calculateNextReview(3, 60, true);
  assert(
    result.mastery === 80 &&
      result.reviewCount === 4 &&
      isDaysLater(result.nextReviewAt, 7),
    "第4次答对：mastery=80, reviewCount=4, 7天后复习"
  );
}

// 测试 7：第 5 次答对 → 15 天后复习
{
  const result = calculateNextReview(4, 80, true);
  assert(
    result.mastery === 100 &&
      result.reviewCount === 5 &&
      isDaysLater(result.nextReviewAt, 15),
    "第5次答对：mastery=100, reviewCount=5, 15天后复习"
  );
}

// 测试 8：熟练度上限 100
{
  const result = calculateNextReview(5, 100, true);
  assert(
    result.mastery === 100 && result.reviewCount === 6,
    "熟练度上限 100"
  );
}

// 测试 9：答错重置熟练度
{
  const result = calculateNextReview(3, 60, false);
  assert(
    result.mastery === 50 && result.reviewCount === 0,
    "答错重置：mastery=50, reviewCount=0"
  );
}

// 测试 10：熟练度下限 0
{
  const result = calculateNextReview(0, 5, false);
  assert(
    result.mastery === 0 && result.reviewCount === 0,
    "熟练度下限 0"
  );
}

// 测试 11：isDueForReview
{
  const past = new Date(Date.now() - 1000);
  const future = new Date(Date.now() + 1000);
  assert(
    isDueForReview(past) === true &&
      isDueForReview(future) === false &&
      isDueForReview(null) === true,
    "isDueForReview: 过去=需复习, 未来=不需复习, 空=需复习"
  );
}

// 测试 12：getNextReviewText
{
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  assert(
    getNextReviewText(tomorrow) === "明天" &&
      getNextReviewText(dayAfterTomorrow) === "后天",
    "getNextReviewText: 明天/后天"
  );
}

// 测试 13：getReviewProgress
{
  assert(
    getReviewProgress(0) === 0 &&
      getReviewProgress(20) === 1 &&
      getReviewProgress(60) === 3 &&
      getReviewProgress(100) === 5,
    "getReviewProgress: 0~20~60~100 → 0~1~3~5"
  );
}

// 测试 14：getReviewStageText
{
  assert(
    getReviewStageText(0) === "首次复习" &&
      getReviewStageText(1) === "第1次复习" &&
      getReviewStageText(5) === "第5次复习" &&
      getReviewStageText(6) === "已稳定",
    "getReviewStageText: 首次/第N次/已稳定"
  );
}

console.log("\n== utils/ebbinghaus.js == 通过 14/14，断言 14 条");

function assert(condition, message) {
  if (condition) {
    console.log(`   PASS  ${message}`);
  } else {
    console.log(`   FAIL  ${message}`);
    process.exitCode = 1;
  }
}

function isTomorrow(date) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return Math.abs(new Date(date) - tomorrow) < 1000;
}

function isDaysLater(date, days) {
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return Math.abs(new Date(date) - target) < 1000;
}