/**
 * server/achievements.js —— 成就体系唯一口径（纯逻辑，不依赖 Sequelize/express，可单测）
 *
 * 为什么把定义放代码里（与 server/rank-ladder.js 同一思路）：
 *   · 原实现把成就定义写进 achievements 表，且 conditionType 是 MySQL ENUM（只有 5 个取值），
 *     每加一类条件都要改生产库表结构；扩到 30+ 后这类 DDL 会反复出现；
 *   · 定义进代码后，「阈值表 + 判定函数」可以像段位阶梯那样被单测盯住（幂等、边界、无死成就）；
 *   · 用户解锁记录仍然落 `user_achievements` 表（只存 openid + achievementId + createdAt），
 *     **不需要任何表结构变更**。
 *
 * 覆盖分类（2026-09-12 需求④）：
 *   答题 / 关卡 / 玩法 / 习惯 / 错题 / 段位 / 自定义题库
 *
 * ⚠️ 每条成就的 metric 必须是 METRICS 里存在的键（单测会拦），否则就是永远解不开的「死成就」。
 * ⚠️ 新增成就不需要改数据库；但**新增 metric 必须在 statsFrom 里补上数据来源**。
 */

"use strict";

// ============ 一、分类（成就页 tab） ============
const CATEGORIES = [
  { key: "answer", label: "答题", emoji: "🎯" },
  { key: "level", label: "关卡", emoji: "🚩" },
  { key: "play", label: "玩法", emoji: "🎮" },
  { key: "habit", label: "习惯", emoji: "🔥" },
  { key: "wrong", label: "错题", emoji: "📖" },
  { key: "rank", label: "段位", emoji: "🎖" },
  { key: "custom", label: "自定义", emoji: "🧩" },
];

// ============ 二、可判定的指标（键 → 从 stats 里取值） ============
// 新增指标：这里加一条 + statsFrom 里补数据来源 + 单测会检查「每个 metric 至少被一条成就使用」
const METRICS = {
  totalCorrect: (s) => s.totalCorrect,         // 累计答对题数
  maxCombo: (s) => s.maxCombo,                 // 单局最高连击
  comboTotal: (s) => s.comboTotal,             // 各局最高连击之和（一局最多 10 连，用累计做多档）
  perfectRun: (s) => s.perfectRun,             // 是否出现过「单局全对」（0/1）
  perfectStreak: (s) => s.perfectStreak,       // 连续全对的最长局数
  wins: (s) => s.wins,                         // 累计通关次数
  perfectCount: (s) => s.perfectCount,         // 3 星通关次数
  perfectLevels: (s) => s.perfectLevels,       // 拿到 3 星的关卡数（按 学段+关卡 去重）
  maxScore: (s) => s.maxScore,                 // 单局最高得分
  stars: (s) => s.stars,                       // 累计星数（云端口径）
  playCount: (s) => s.playCount,               // 累计对局数
  streakMax: (s) => s.streakMax,               // 最长连续签到天数
  checkinTotal: (s) => s.checkinTotal,         // 累计签到天数
  wrongMastered: (s) => s.wrongMastered,       // 已掌握错题条数
  reviewedItems: (s) => s.reviewedItems,       // 复习过的错题条数
  rankId: (s) => s.rankId,                     // 段位（大段位 1~8，0=还没记录）
  customLevels: (s) => s.customLevels,         // 提交过的自定义关卡数
  // —— 玩法深度（按 scores.game_type 统计通关次数；见 statsFrom）——
  snakeClears: (s) => s.snakeClears,           // 单词贪吃蛇通关次数
  math24Clears: (s) => s.math24Clears,         // 算 24 点通关次数
  sudokuClears: (s) => s.sudokuClears,         // 数独通关次数
  memoryClears: (s) => s.memoryClears          // 记忆矩阵通过次数
};

// ============ 三、成就定义（36 条） ============
// ⚠️ id 与**美术已交付的图标文件名一一对应**（2026-09-12 第二批素材到货后反向对齐）：
//    图标目录 miniprogram/assets/achievements/ 里已有的名字才算数，缺图的会走 emoji 兜底。
//    新增/改名请同步 docs/美术素材需求与豆包提示词.md §5.1，否则出图会与代码对不上。
//
// 注意：combo 类不用「单局连击 20/30」做多档 —— 一局只有 10 题，单局连击上限就是 10，
//      那样写会变成永远解不开的死成就（comboTotal = 各局最高连击之和才是可达的多档指标）。
// icon 统一为 /assets/achievements/<id>.png —— 图标由美术产出（见 docs/美术素材需求与豆包提示词.md），
// 图未到位时前端用 emoji 兜底，不会显示裂图。
const DEFINITIONS = [
  // —— 答题 ——
  { achievementId: "answer_100", name: "初露锋芒", description: "累计答对 100 题", category: "answer", metric: "totalCorrect", threshold: 100 },
  { achievementId: "answer_1000", name: "勤学不辍", description: "累计答对 1000 题", category: "answer", metric: "totalCorrect", threshold: 1000 },
  { achievementId: "answer_5000", name: "学富五车", description: "累计答对 5000 题", category: "answer", metric: "totalCorrect", threshold: 5000 },
  { achievementId: "combo_10", name: "连击新手", description: "单局连击达到 10（答满一整局）", category: "answer", metric: "maxCombo", threshold: 10 },
  { achievementId: "combo_20", name: "手感升温", description: "累计连击 20 次", category: "answer", metric: "comboTotal", threshold: 20 },
  { achievementId: "combo_master", name: "连击大师", description: "累计连击 50 次", category: "answer", metric: "comboTotal", threshold: 50 },
  { achievementId: "perfect_run", name: "一题不错", description: "单局全部答对", category: "answer", metric: "perfectRun", threshold: 1 },

  // —— 关卡 ——
  { achievementId: "first_blood", name: "首胜", description: "首次通关任意关卡", category: "level", metric: "wins", threshold: 1 },
  { achievementId: "level_clear_1", name: "旗开得胜", description: "累计通关 5 次", category: "level", metric: "wins", threshold: 5 },
  { achievementId: "level_clear_10", name: "小有所成", description: "累计通关 10 次", category: "level", metric: "wins", threshold: 10 },
  { achievementId: "level_clear_30", name: "闯关好手", description: "累计通关 30 次", category: "level", metric: "wins", threshold: 30 },
  { achievementId: "perfect_clear", name: "完美通关", description: "累计 10 次三星通关", category: "level", metric: "perfectCount", threshold: 10 },
  { achievementId: "grade_all_3star", name: "三星收藏家", description: "30 个不同关卡拿到三星", category: "level", metric: "perfectLevels", threshold: 30 },
  { achievementId: "chapter_perfect", name: "星满书页", description: "累计获得 200 颗星", category: "level", metric: "stars", threshold: 200 },
  { achievementId: "boss_slayer", name: "魔王终结者", description: "单局拿下满分 100 分", category: "level", metric: "maxScore", threshold: 100 },
  { achievementId: "no_mistake_run", name: "无瑕三连", description: "连续 3 局全部答对", category: "level", metric: "perfectStreak", threshold: 3 },

  // —— 玩法 ——
  { achievementId: "play_first", name: "初次登场", description: "完成第一局对战", category: "play", metric: "playCount", threshold: 1 },
  { achievementId: "play_all_types", name: "渐入佳境", description: "累计对战 20 局", category: "play", metric: "playCount", threshold: 20 },
  { achievementId: "star_collector", name: "星数收集", description: "累计获得 50 颗星", category: "play", metric: "stars", threshold: 50 },

  // —— 习惯 ——
  { achievementId: "early_bird", name: "早起打卡", description: "完成第一次签到", category: "habit", metric: "checkinTotal", threshold: 1 },
  { achievementId: "streak_3", name: "小有恒心", description: "连续签到 3 天", category: "habit", metric: "streakMax", threshold: 3 },
  { achievementId: "streak_7", name: "一周不断", description: "连续签到 7 天", category: "habit", metric: "streakMax", threshold: 7 },
  { achievementId: "streak_30", name: "月度铁人", description: "连续签到 30 天", category: "habit", metric: "streakMax", threshold: 30 },
  { achievementId: "streak_100", name: "百日不辍", description: "连续签到 100 天", category: "habit", metric: "streakMax", threshold: 100 },
  { achievementId: "daily_7", name: "习惯初成", description: "累计签到 7 天", category: "habit", metric: "checkinTotal", threshold: 7 },

  // —— 错题 ——
  { achievementId: "wrong_clear_10", name: "错题克星", description: "掌握 10 道错题", category: "wrong", metric: "wrongMastered", threshold: 10 },
  { achievementId: "wrong_clear_50", name: "错题终结者", description: "掌握 50 道错题", category: "wrong", metric: "wrongMastered", threshold: 50 },
  { achievementId: "review_master", name: "温故知新", description: "复习过 50 道错题", category: "wrong", metric: "reviewedItems", threshold: 50 },

  // —— 段位（rankId 取大段位 1~8，与 server/rank-ladder.js 的 cell 对齐） ——
  { achievementId: "rank_bronze", name: "青铜战士", description: "达到青铜段位", category: "rank", metric: "rankId", threshold: 1 },
  { achievementId: "rank_gold", name: "黄金战士", description: "达到黄金段位", category: "rank", metric: "rankId", threshold: 3 },
  { achievementId: "rank_platinum", name: "铂金战士", description: "达到铂金段位", category: "rank", metric: "rankId", threshold: 4 },
  { achievementId: "rank_diamond", name: "钻石战士", description: "达到钻石段位", category: "rank", metric: "rankId", threshold: 5 },
  { achievementId: "rank_king", name: "王者战士", description: "达到王者段位", category: "rank", metric: "rankId", threshold: 7 },
  { achievementId: "rank_glory", name: "荣耀王者", description: "达到荣耀王者段位", category: "rank", metric: "rankId", threshold: 8 },

  // —— 自定义题库 ——
  { achievementId: "custom_level_1", name: "出题人", description: "提交 1 个自定义关卡", category: "custom", metric: "customLevels", threshold: 1 },
  { achievementId: "custom_level_5", name: "题库作者", description: "提交 5 个自定义关卡", category: "custom", metric: "customLevels", threshold: 5 },

  // —— 玩法深度（美术已交付这 4 张图标；2026-09-12 P2 打通各玩法成绩上报后启用）——
  { achievementId: "snake_master", name: "贪吃蛇大师", description: "单词贪吃蛇通关 3 次", category: "play", metric: "snakeClears", threshold: 3 },
  { achievementId: "math24_master", name: "24 点高手", description: "算 24 点通关 3 次", category: "play", metric: "math24Clears", threshold: 3 },
  { achievementId: "sudoku_master", name: "数独行家", description: "数独通关 3 次", category: "play", metric: "sudokuClears", threshold: 3 },
  { achievementId: "memory_master", name: "记忆大师", description: "记忆矩阵通过 3 次", category: "play", metric: "memoryClears", threshold: 3 },
];

/** 成就图标路径（图未到位时前端用 emoji 兜底） */
function iconOf(achievementId) {
  return "/assets/achievements/" + achievementId + ".png";
}

/**
 * 由原始数据算出各项指标（纯函数：入参是朴素对象，便于单测喂样本）。
 *
 * @param {Object} input
 * @param {Object} [input.rankRecord] rank_records 行 { wins, stars, rankId }
 * @param {Array}  [input.scores]     scores 行（按 createdAt 升序）{ correct_count, total_q, max_combo, stars }
 * @param {Array}  [input.wrongRecords] wrong_records 行 { mastery, reviewCount }
 * @param {Array}  [input.checkins]   checkin_records 行 { date, streak }
 * @param {number} [input.customLevelCount] 自定义关卡数
 * @returns {Object} 指标快照
 */
function statsFrom(input) {
  const src = input || {};
  const rank = src.rankRecord || {};
  const scores = src.scores || [];
  const wrongs = src.wrongRecords || [];
  const checkins = src.checkins || [];

  const totalCorrect = scores.reduce((n, s) => n + (Number(s.correct_count) || 0), 0);
  const maxCombo = scores.reduce((n, s) => Math.max(n, Number(s.max_combo) || 0), 0);
  const comboTotal = scores.reduce((n, s) => n + (Number(s.max_combo) || 0), 0);
  const maxScore = scores.reduce((n, s) => Math.max(n, Number(s.score) || 0), 0);
  const isPerfect = (s) => {
    const total = Number(s.total_q) || 0;
    return total > 0 && Number(s.correct_count) === total;
  };
  const perfectRun = scores.some(isPerfect) ? 1 : 0;
  const perfectCount = scores.filter((s) => Number(s.stars) === 3).length;

  // 连续「全对」最长局数（按上报顺序）
  let perfectStreak = 0;
  let run = 0;
  scores.forEach((s) => {
    if (isPerfect(s)) {
      run += 1;
      perfectStreak = Math.max(perfectStreak, run);
    } else {
      run = 0;
    }
  });

  // 拿到三星的关卡数（按 学段+关卡 去重：同一关刷多次只算一关）
  const perfectLevelSet = {};
  scores.forEach((s) => {
    if (Number(s.stars) !== 3) return;
    perfectLevelSet[String(s.grade || '') + '|' + String(s.level || '')] = 1;
  });

  const streakMax = checkins.reduce((n, c) => Math.max(n, Number(c.streak) || 0), 0);
  const wrongMastered = wrongs.filter((w) => (Number(w.mastery) || 0) >= 100).length;
  const reviewedItems = wrongs.filter((w) => (Number(w.reviewCount) || 0) >= 1).length;

  // 玩法深度：按 scores.game_type 统计「通关次数」（stars>=1）。
  // 2026-09-12（挑战主线 P2）起各玩法都会上报成绩，这 4 项才有意义。
  const clearsOf = (gt) => scores.filter((s) => String(s.game_type) === gt && Number(s.stars) >= 1).length;

  return {
    totalCorrect: totalCorrect,
    maxCombo: maxCombo,
    comboTotal: comboTotal,
    perfectRun: perfectRun,
    perfectStreak: perfectStreak,
    wins: Number(rank.wins) || 0,
    perfectCount: perfectCount,
    perfectLevels: Object.keys(perfectLevelSet).length,
    maxScore: maxScore,
    stars: Number(rank.stars) || 0,
    playCount: scores.length,
    streakMax: streakMax,
    checkinTotal: checkins.length,
    // 注意：wrongTotal 目前没有对应成就（无图标），但仍算出来供其它统计消费；
    // 它不在 METRICS 里，所以不会触发「指标没人用」的护栏。
    wrongTotal: wrongs.length,
    wrongMastered: wrongMastered,
    reviewedItems: reviewedItems,
    rankId: Number(rank.rankId) || 0,
    customLevels: Number(src.customLevelCount) || 0,
    snakeClears: clearsOf('snake'),
    math24Clears: clearsOf('math24'),
    sudokuClears: clearsOf('sudoku'),
    memoryClears: clearsOf('memory')
  };
}

/**
 * 逐条判定成就（纯函数）。
 * @param {Object} stats statsFrom 的输出
 * @returns {Array} [{ achievementId, current, threshold, progress, unlocked }]
 */
function evaluate(stats) {
  const s = stats || {};
  return DEFINITIONS.map((def) => {
    const metric = METRICS[def.metric];
    const current = metric ? (Number(metric(s)) || 0) : 0;
    const threshold = Number(def.threshold) || 0;
    const progress = threshold > 0 ? Math.min(100, Math.round(current / threshold * 100)) : 0;
    return {
      achievementId: def.achievementId,
      current: current,
      threshold: threshold,
      progress: progress,
      unlocked: current >= threshold,
    };
  });
}

/**
 * 组装 /api/achievement/list 的返回数据。
 *
 * ⚠️ 保持**数组**形状（与改造前一致）：老客户端拿到多余字段会忽略，
 * 新客户端用 category/progress/unlockedAt 做分类筛选与进度条 —— 前后端可以各自升级，不会互相打挂。
 *
 * @param {Object} stats statsFrom 的输出
 * @param {Object} [unlockedAt] { achievementId: Date|string } 已解锁时间
 * @returns {Array}
 */
function listWithProgress(stats, unlockedAt) {
  const unlockedMap = unlockedAt || {};
  const result = evaluate(stats);
  const byId = {};
  result.forEach((r) => { byId[r.achievementId] = r; });

  return DEFINITIONS.map((def) => {
    const state = byId[def.achievementId];
    const at = unlockedMap[def.achievementId];
    return {
      achievementId: def.achievementId,
      name: def.name,
      description: def.description,
      category: def.category,
      icon: iconOf(def.achievementId),
      // 兼容旧客户端字段（conditionType/conditionValue），新客户端改用 metric/threshold
      conditionType: def.metric,
      conditionValue: def.threshold,
      metric: def.metric,
      threshold: def.threshold,
      current: state.current,
      progress: state.progress,
      unlocked: !!state.unlocked || !!at,
      unlockedAt: at || null,
    };
  });
}

/** 分类元数据（前端 tab 用；也可由列表里的 category 字段自行归组） */
function categories() {
  return CATEGORIES.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji }));
}

module.exports = {
  CATEGORIES,
  METRICS,
  DEFINITIONS,
  iconOf,
  statsFrom,
  evaluate,
  listWithProgress,
  categories,
};
