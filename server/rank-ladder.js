/**
 * server/rank-ladder.js —— 段位阶梯（唯一口径）
 *
 * 设计（2026-09 需求 ①）：
 *   · 8 个大段位 × 每段 9 个小级 = 72 级：青铜 1~9 → 白银 1~9 → … → 荣耀王者 1~9；
 *   · 晋升货币是「累计星星」（rank_records.stars），不再是胜场 ——
 *     玩家看得懂「还差几颗星」，而胜场跟水平的关系更绕；
 *   · 每级所需星数**递增**：第 i 级（0 基）需要 2 + floor(i / 6) 颗，
 *     即青铜前几级每级 2 星、中段 3 星……越往后越贵，荣耀王者 9 级累计需 527 星。
 *   · rankId 仍是大段位编号（1~8），与模型的 unlocks 语义（皮肤按段位解锁）保持兼容，
 *     因此**不需要改表结构**，小级与名称都由本模块按 stars 现算。
 */

'use strict';

// key 用于拼「小级徽章图」文件名：/assets/ranks/rank-<key>-<1~9>-256.png
// icon 保留大段位图，作为小级图缺失时前端 onerror 的兜底。
const BIG_RANKS = [
  { id: 1, key: 'bronze', name: '青铜', icon: '/assets/ranks/bronze.png' },
  { id: 2, key: 'silver', name: '白银', icon: '/assets/ranks/silver.png' },
  { id: 3, key: 'gold', name: '黄金', icon: '/assets/ranks/gold.png' },
  { id: 4, key: 'platinum', name: '铂金', icon: '/assets/ranks/platinum.png' },
  { id: 5, key: 'diamond', name: '钻石', icon: '/assets/ranks/diamond.png' },
  { id: 6, key: 'star', name: '星耀', icon: '/assets/ranks/star.png' },
  { id: 7, key: 'king', name: '王者', icon: '/assets/ranks/king.png' },
  { id: 8, key: 'glory', name: '荣耀王者', icon: '/assets/ranks/glory.png' }
];

const LEVELS_PER_RANK = 9;
const TOTAL_CELLS = BIG_RANKS.length * LEVELS_PER_RANK;   // 72

/**
 * 第 i 级（0 基）升到下一级所需星数 —— 随级数递增。
 * @param {number} i 0 基级序号（0 ~ TOTAL_CELLS-2）
 * @returns {number} 所需星数
 */
function starsToAdvance(i) {
  return 2 + Math.floor(i / 6);
}

/**
 * 进入第 cell 级（1 基）所需的累计星数。第 1 级为 0。
 * @param {number} cell 1 基级序号
 * @returns {number} 累计星数门槛
 */
function starsForCell(cell) {
  let sum = 0;
  const upto = Math.max(0, Math.min(cell - 1, TOTAL_CELLS - 1));
  for (let i = 0; i < upto; i++) sum += starsToAdvance(i);
  return sum;
}

/**
 * 由累计星数推出当前段位。
 * @param {number} stars 累计星数
 * @returns {{cell:number, rankId:number, rankLevel:number, rankName:string, icon:string}}
 */
function rankOf(stars) {
  const s = Math.max(0, Math.floor(stars || 0));
  let cell = 1;
  for (let c = TOTAL_CELLS; c >= 1; c--) {
    if (s >= starsForCell(c)) { cell = c; break; }
  }
  const bigIdx = Math.floor((cell - 1) / LEVELS_PER_RANK);
  const big = BIG_RANKS[bigIdx];
  const level = ((cell - 1) % LEVELS_PER_RANK) + 1;
  return {
    cell: cell,
    rankId: big.id,
    rankLevel: level,
    rankName: big.name + ' ' + level,
    // 72 级小级徽章（2026-09-12 美术交付；-256 为端上展示尺寸），
    // iconBig 是大段位图，供小级图缺失时兜底。
    icon: '/assets/ranks/rank-' + big.key + '-' + level + '-256.png',
    iconBig: big.icon
  };
}

/**
 * 晋升进度（用于「还差几颗星」的展示）。
 * @param {number} stars 累计星数
 * @returns {Object} { ...当前段位, nextRankName, starsForNext, starsNeeded, progressPercent, isMaxRank }
 */
function progressOf(stars) {
  const cur = rankOf(stars);
  const isMaxRank = cur.cell >= TOTAL_CELLS;
  if (isMaxRank) {
    return Object.assign({}, cur, {
      nextRankName: null,
      starsForNext: starsForCell(TOTAL_CELLS),
      starsNeeded: 0,
      progressPercent: 100,
      isMaxRank: true
    });
  }
  const nextCell = cur.cell + 1;
  const from = starsForCell(cur.cell);
  const to = starsForCell(nextCell);
  const span = to - from;
  const got = Math.max(0, Math.min(span, Math.floor(stars || 0) - from));
  const next = rankOf(to);
  return Object.assign({}, cur, {
    nextRankName: next.rankName,
    starsForNext: to,
    starsNeeded: Math.max(0, to - Math.floor(stars || 0)),
    progressPercent: span > 0 ? Math.min(100, Math.round(got / span * 100)) : 100,
    isMaxRank: false
  });
}

module.exports = {
  BIG_RANKS,
  LEVELS_PER_RANK,
  TOTAL_CELLS,
  starsToAdvance,
  starsForCell,
  rankOf,
  progressOf
};
