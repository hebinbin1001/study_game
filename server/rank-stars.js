/**
 * server/rank-stars.js —— 段位星星口径（2026-09-13 用户拍板 (C)）
 *
 * 问题：段位星星原来只有签到会涨，而前端每次通关调用的 `/api/rank/sync` **服务端根本没实现**
 *       （404 静默失败）；一旦补上又不能简单累加 —— 同一关反复刷会重复叠星，导致「太容易满级」。
 *
 * 现在的口径：**按 (game_type, grade, type_key, level) 取每关历史最高星，再求和**。
 *   · 同一关刷 100 次也只算一次最高星 → 星星总量有真实上限（主线 210 关 + 玩法线 1260 关 ×3 星 ≈ 4410）
 *   · 与成绩上报里 `bestStars`（score.js 已在用的同关最高星）同一思路，口径一致
 *
 * 纯函数 `dedupeStars(rows)` 单独导出，便于单测；DB 部分只做「取数 → 调用纯函数 → 写回」。
 */
'use strict';

/**
 * 把成绩行去重成「历史最高星总和」。
 * @param {Array<Object>} rows 每行含 { game_type, grade, type_key, level, stars }
 * @returns {number} 去重后的星星总数
 */
function dedupeStars(rows) {
  const keyed = new Map();
  (rows || []).forEach((r) => {
    if (!r) return;
    const game = String(r.game_type || "word_warrior");
    const grade = String(r.grade || "");
    const type = String(r.type_key || "");
    const level = String(r.level == null ? "" : r.level);
    const key = [game, grade, type, level].join("|");
    const s = Math.max(0, Math.min(3, Number(r.stars) || 0));
    if (!keyed.has(key) || keyed.get(key) < s) keyed.set(key, s);
  });
  let sum = 0;
  keyed.forEach((s) => { sum += s; });
  return sum;
}

module.exports = { dedupeStars };
