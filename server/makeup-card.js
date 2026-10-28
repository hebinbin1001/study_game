/**
 * server/makeup-card.js —— 补签卡规则（2026-10-29）
 *
 * ## 发放口径（2026-10-29 用户拍板：严格连续 7 天）
 *
 *   连续签到天数**正好**是 7 的倍数那天，发 1 张补签卡（7/14/21/28…）。
 *
 *   为什么不用「累计签到 7 天」：那样一周来三次的人也能攒卡，卡就退化成
 *   「签到次数兑换券」；而这张卡存在的唯一理由是**别断档**，所以必须挂在连续上。
 *
 *   断在第 7 天的正日子怎么办：那天本来该发卡，但你没有第 7 天的记录，所以不发。
 *   这很关键 —— 如果允许「用一张卡补第 7 天 → 变连续 → 又发一张」，卡就成了
 *   零成本续命，从消耗品变永动机。规则定死：**卡只在真实签到时发**。
 *
 * ## 使用口径
 *
 *   只能补**昨天**，而且**前天必须有签到记录**：
 *     · 只补昨天：断两天以上时补昨天只能得到 streak=1，接不上任何东西，白花一张卡。
 *       真正需要补的场景 99% 是「昨天忘了」；
 *     · 要求前天有记录：补一个接不上的洞同样没有意义（同一条理由）。
 *
 *   补签后**不触发**新的里程碑发卡，但奖励星照算 —— 连续性是真恢复了，
 *   段位星按 checkin_records 的 streak 现算（见 routes/rank.js 的 syncRankStars），
 *   用户该拿的星星不会少。
 *
 * ## 为什么可以不做持有上限
 *
 *   每「连续 7 天」产出 1 张，而最多「每 7 天用掉 1 张」（只能用一次，且只能补昨天）。
 *   产出与消耗同速，长期玩下来卡数不会失控；断得比 7 天更频繁的人自然会把卡用光。
 *   再加一个上限，只会让「这周不该拿卡」这种解释成本出现，收益为零。
 *
 * 本文件是纯函数，不碰数据库，便于单测；读写库在 routes/checkin.js。
 */
'use strict';

/** 严格连续满多少天发一张卡 */
const MILESTONE_STREAK = 7;

/** 号码补零 */
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * 日期 key（'YYYY-MM-DD'）加减天数。
 * 用 UTC 算「自然日」，不涉及时区偏移 —— 传进来的 key 已经是北京时间的日期，
 * 这里只做日历运算，和 beijing-time.dayKeyOffset 的口径一致。
 * @param {string} key
 * @param {number} days
 * @returns {string}
 */
function shiftKey(key, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (parseInt(days, 10) || 0)));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

/**
 * 这一天该不该发补签卡。
 * @param {number} streak 连续签到天数
 * @returns {boolean}
 */
function shouldGrant(streak) {
  const s = parseInt(streak, 10);
  if (!Number.isFinite(s) || s <= 0) return false;
  return s % MILESTONE_STREAK === 0;
}

/** 把签到记录整理成「已签日期」集合 */
function signedSet(records) {
  const set = {};
  (records || []).forEach(function (r) {
    if (r && r.date) set[String(r.date)] = true;
  });
  return set;
}

/**
 * 现在能不能补签、补哪一天。
 *
 * 不能补时给一个 reason，端上据此给不同文案 —— 「没卡」和「补了也接不上」
 * 是两种完全不同的处境，用同一句「暂时不能补签」会让用户反复点。
 *
 * @param {Array<Object>} records 该用户的签到记录（[{date, streak}]）
 * @param {number} cards 未使用的补签卡数
 * @param {string} today 今天（东八区 'YYYY-MM-DD'）
 * @returns {{can:boolean, target:string, reason:string}} reason: ''|'no_card'|'already'|'no_prev'
 */
function planMakeup(records, cards, today) {
  const signed = signedSet(records);
  const yesterday = shiftKey(today, -1);
  const before = shiftKey(today, -2);

  if (!yesterday) return { can: false, target: '', reason: 'bad_date' };

  // 昨天已经签过：不存在「补」这件事。放在最前面，避免给「没卡」的噪音提示。
  if (signed[yesterday]) return { can: false, target: yesterday, reason: 'already' };

  if ((parseInt(cards, 10) || 0) <= 0) return { can: false, target: yesterday, reason: 'no_card' };

  // 前天也没签 → 昨天补上也只有 streak=1，接不上之前的连续，白花一张
  if (!signed[before]) return { can: false, target: yesterday, reason: 'no_prev' };

  return { can: true, target: yesterday, reason: '' };
}

/**
 * 补签后重算「从某天起」的所有连续天数。
 *
 * 为什么必须重算：checkin_records.streak 是**冗余存储**（写入时看昨天的记录 +1）。
 * 补签把中间某个洞填上之后，那个洞之后每一条记录的连续天数都会变大 ——
 * 不重算的话，用户看到「日历上补齐了，但连续天数还是断的」，而且之后每天
 * 签到都会从错误的地基上继续 +1，越错越远。
 *
 * @param {Array<Object>} records 该用户全部签到记录，**必须按 date 升序**
 * @param {string} fromDate 补的那一天（此时 records 里应已包含它）
 * @returns {Array<{date:string, streak:number}>} 需要写回库的记录（只含值真的变了的）
 */
function recomputeFrom(records, fromDate) {
  const list = records || [];
  const changes = [];
  let idx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].date) === String(fromDate)) { idx = i; break; }
  }
  if (idx < 0) return changes;

  // 基线：补签前一天那条记录的连续天数。没有前一天 = 从 1 开始（正常情况不会发生，
  // 因为 planMakeup 要求前天有记录；这里只是兜底，不让脏数据把后面的记录算炸）。
  let prevDate = idx > 0 ? String(list[idx - 1].date) : '';
  let prevStreak = idx > 0 ? (parseInt(list[idx - 1].streak, 10) || 0) : 0;

  for (let i = idx; i < list.length; i++) {
    const it = list[i];
    if (!it || !it.date) continue;
    const date = String(it.date);
    // 与前一天接得上就 +1，否则重新从 1 开始（补签只填一个洞，后面再接不上就还是断）
    const streak = (prevDate && shiftKey(prevDate, 1) === date) ? prevStreak + 1 : 1;

    const old = parseInt(it.streak, 10) || 0;
    if (old !== streak) changes.push({ date: date, streak: streak });

    prevDate = date;
    prevStreak = streak;
  }
  return changes;
}

module.exports = {
  MILESTONE_STREAK,
  shiftKey,
  shouldGrant,
  planMakeup,
  recomputeFrom
};
