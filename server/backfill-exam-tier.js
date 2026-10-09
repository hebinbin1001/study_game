/**
 * server/backfill-exam-tier.js —— 老用户段位封顶的存量修复（2026-10-09）
 *
 * 背景（线上事故）：
 *   2026-10-08 上线「段位封顶 + 晋级考试」——没通过下一个大段的考试，星星与段位就卡在当前大段。
 *   但这个规则**没有考虑存量用户**：所有老账号的 `users.exam_cleared_tier` 都是空，
 *   于是不管真实攒了多少星，对外展示一律封顶到第一个大段的上界（26 星）。
 *   线上实测：管理员账号真实 334 星 → 展示 26 星、段位「青铜 9」。
 *   （当时排行榜还在 5000，这个数字没露出来；10-09 修好排行榜后立刻暴露。）
 *
 * 修复思路（不改已有成绩、不重置进度）：
 *   对「从没考过晋级考试」的老账号，按它的**真实累计星数**反查现在应处的大段，
 *   写进 exam_cleared_tier —— 等价于「历史成绩自动补考通过」。
 *   效果：老用户星数立刻恢复原值；只有继续往**更高段位**爬时才会遇到考试。
 *
 * 幂等：只处理 exam_cleared_tier 为空的账号，已考过的账号一律不动。
 * 与本项目其它迁移一致：失败只告警，不阻断启动。
 */
'use strict';

const ladder = require('./rank-ladder');

/**
 * 纯函数：算出「需要补录」的账号及其应写入的大段 key。
 * @param {Array<{openid:string,stars:number|string,examClearedTier:string|null}>} rows
 * @returns {Array<{openid:string,stars:number,tier:string}>}
 */
function planBackfill(rows) {
  return (rows || [])
    .filter(function (r) {
      if (!r || !r.openid) return false;
      const cleared = String(r.examClearedTier == null ? '' : r.examClearedTier).trim();
      const stars = Number(r.stars) || 0;
      // 已考过的跳过；0 星的本来就是最低段，没有封顶影响
      return !cleared && stars > 0;
    })
    .map(function (r) {
      const stars = Number(r.stars) || 0;
      // ⚠️ 必须用 rankKey（字符串 key）—— exam_cleared_tier 存的是 key，不是数字 id
      return { openid: r.openid, stars: stars, tier: ladder.rankOf(stars).rankKey };
    });
}

/**
 * 执行补录。
 * @param {Object} sequelize Sequelize 实例（由 db.js 传入，避免循环依赖）
 * @returns {Promise<Array<{openid:string,stars:number,tier:string}>>} 本次补录的账号
 */
async function backfillExamTier(sequelize) {
  const [rows] = await sequelize.query(
    'SELECT u.openid AS openid, COALESCE(r.stars, 0) AS stars, u.exam_cleared_tier AS examClearedTier' +
    ' FROM users u LEFT JOIN rank_records r ON r.openid = u.openid'
  );
  const plan = planBackfill(rows);
  for (const p of plan) {
    // WHERE 再判一次空值：并发下也不会覆盖用户刚考出来的成绩
    await sequelize.query(
      "UPDATE users SET exam_cleared_tier = ?" +
      " WHERE openid = ? AND (exam_cleared_tier IS NULL OR exam_cleared_tier = '')",
      { replacements: [p.tier, p.openid] }
    );
  }
  if (plan.length) {
    console.log('[exam-backfill] 已为 ' + plan.length + ' 名老用户补录「已通过段位」：'
      + plan.slice(0, 5).map(function (p) { return p.openid.slice(-4) + '→' + p.tier + '(' + p.stars + '星)'; }).join(' '));
  }
  return plan;
}

module.exports = backfillExamTier;
module.exports.planBackfill = planBackfill;
