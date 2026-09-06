/**
 * 艾宾浩斯复习算法工具
 * 按 1/2/4/7/15/30 天间隔推送待复习题目
 */

// 复习间隔（天）
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];

/**
 * 计算下次复习时间
 * @param {number} reviewCount 已复习次数
 * @param {number} mastery 熟练度（0~100）
 * @param {boolean} isCorrect 本次是否正确
 * @returns {object} { mastery, reviewCount, nextReviewAt }
 */
function calculateNextReview(reviewCount, mastery, isCorrect) {
  const now = new Date();

  if (!isCorrect) {
    // 答错：重置复习次数，降低熟练度，明天再复习
    return {
      mastery: Math.max(0, mastery - 10),
      reviewCount: 0,
      nextReviewAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  // 答对：增加熟练度，按间隔计算下次复习时间
  const newMastery = Math.min(100, mastery + 20);
  const intervalIdx = Math.min(reviewCount, EBBINGHAUS_INTERVALS.length - 1);
  const intervalDays = EBBINGHAUS_INTERVALS[intervalIdx];
  const nextReviewAt = new Date(
    now.getTime() + intervalDays * 24 * 60 * 60 * 1000
  );

  return {
    mastery: newMastery,
    reviewCount: reviewCount + 1,
    nextReviewAt,
  };
}

/**
 * 判断是否需要复习
 * @param {Date} nextReviewAt 下次复习时间
 * @returns {boolean}
 */
function isDueForReview(nextReviewAt) {
  if (!nextReviewAt) return true;
  return new Date(nextReviewAt) <= new Date();
}

/**
 * 获取复习时间文案
 * @param {Date} nextReviewAt 下次复习时间
 * @returns {string} 如 "明天"、"2天后"、"已到期"
 */
function getNextReviewText(nextReviewAt) {
  if (!nextReviewAt) return "已到期";

  const now = new Date();
  const diffMs = new Date(nextReviewAt) - now;
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) return "已到期";
  if (diffDays === 1) return "明天";
  if (diffDays === 2) return "后天";
  return `${diffDays}天后`;
}

/**
 * 获取复习进度（0~5）
 * @param {number} mastery 熟练度
 * @returns {number} 复习进度（0~5）
 */
function getReviewProgress(mastery) {
  return Math.min(5, Math.floor(mastery / 20));
}

/**
 * 获取复习阶段文案
 * @param {number} reviewCount 已复习次数
 * @returns {string} 如 "第1次复习"
 */
function getReviewStageText(reviewCount) {
  if (reviewCount === 0) return "首次复习";
  if (reviewCount === 1) return "第1次复习";
  if (reviewCount === 2) return "第2次复习";
  if (reviewCount === 3) return "第3次复习";
  if (reviewCount === 4) return "第4次复习";
  if (reviewCount === 5) return "第5次复习";
  return "已稳定";
}

module.exports = {
  EBBINGHAUS_INTERVALS,
  calculateNextReview,
  isDueForReview,
  getNextReviewText,
  getReviewProgress,
  getReviewStageText,
};