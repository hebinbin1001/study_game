const express = require("express");
const { Op } = require("sequelize");
const {
  User,
  UserAchievement,
  RankRecord,
  Score,
  WrongRecord,
  CheckinRecord,
  CustomLevel,
  PkMatch,
  UserAvatar,
  Avatar,
  sequelize,
} = require("../db");
const achievements = require("../achievements");
const time = require("../beijing-time");

const router = express.Router();

async function bestDailyRank(openid) {
  if (!openid) return 0;
  try {
    const [rows] = await sequelize.query(
      `SELECT MIN(rnk) AS bestRank
         FROM (
           SELECT (
             SELECT COUNT(*) + 1
               FROM daily_scores x
              WHERE x.dateKey = d.dateKey
                AND x.grade = d.grade
                AND (
                  x.correct > d.correct
                  OR (x.correct = d.correct AND x.durationMs < d.durationMs)
                  OR (
                    x.correct = d.correct
                    AND x.durationMs = d.durationMs
                    AND x.createdAt < d.createdAt
                  )
                )
           ) AS rnk
             FROM daily_scores d
            WHERE d.openid = :openid
         ) t`,
      { replacements: { openid } }
    );
    return parseInt(rows[0] && rows[0].bestRank, 10) || 0;
  } catch (err) {
    console.warn("[achievement] 每日挑战名次暂不可用：", err && err.message);
    return 0;
  }
}

async function currentSeasonRank(openid) {
  if (!openid) return 0;
  try {
    const season = time.seasonOf();
    const [mine] = await sequelize.query(
      `SELECT COALESCE(SUM(t.mx), 0) AS stars
         FROM (
           SELECT MAX(s.stars) AS mx
             FROM scores s
             JOIN users u ON u.id = s.user_id
            WHERE u.openid = :openid
              AND s.createdAt >= :start
              AND s.createdAt < :end
            GROUP BY s.game_type, s.grade, s.type_key, s.level
         ) t`,
      { replacements: { openid, start: season.start, end: season.endExclusive } }
    );
    const myStars = parseInt(mine[0] && mine[0].stars, 10) || 0;
    if (myStars <= 0) return 0;
    const [higher] = await sequelize.query(
      `SELECT COUNT(*) AS n
         FROM (
           SELECT SUM(t.mx) AS stars
             FROM (
               SELECT s.user_id, MAX(s.stars) AS mx
                 FROM scores s
                WHERE s.createdAt >= :start
                  AND s.createdAt < :end
                GROUP BY s.user_id, s.game_type, s.grade, s.type_key, s.level
             ) t
            GROUP BY t.user_id
         ) all_users
        WHERE all_users.stars > :myStars`,
      { replacements: { start: season.start, end: season.endExclusive, myStars } }
    );
    return (parseInt(higher[0] && higher[0].n, 10) || 0) + 1;
  } catch (err) {
    console.warn("[achievement] 赛季名次暂不可用：", err && err.message);
    return 0;
  }
}

async function pkWinCount(openid) {
  if (!openid) return 0;
  try {
    return await PkMatch.count({
      where: {
        status: "done",
        [Op.or]: [
          { challengerOpenid: openid, winner: "challenger" },
          { opponentOpenid: openid, winner: "opponent" },
        ],
      },
    });
  } catch (err) {
    console.warn("[achievement] PK 胜场暂不可用：", err && err.message);
    return 0;
  }
}

async function ownedSkinCount(openid) {
  if (!openid) return 0;
  try {
    const [owned, free] = await Promise.all([
      UserAvatar.findAll({ where: { openid }, attributes: ["avatarId"], raw: true }),
      Avatar.findAll({ where: { unlockType: "free" }, attributes: ["avatarId"], raw: true }),
    ]);
    const ids = {};
    owned.concat(free).forEach((row) => {
      if (row && row.avatarId) ids[row.avatarId] = 1;
    });
    return Object.keys(ids).length;
  } catch (err) {
    console.warn("[achievement] 皮肤收藏数暂不可用：", err && err.message);
    return 0;
  }
}

/**
 * 成就体系（2026-09-12 需求④ 扩充到 30+）
 *
 * 设计要点：
 *   1. 定义与判定口径全部在 server/achievements.js（纯函数、可单测），**不再依赖 achievements 表**——
 *      原表 conditionType 是 MySQL ENUM，每加一类条件都要改生产库结构；定义进代码后零 DDL。
 *   2. 解锁记录仍落 user_achievements（openid + achievementId + createdAt），
 *      `findOrCreate` 保证**幂等**：重复检查不会重复插入，也不会覆盖首次解锁时间。
 *   3. 列表返回**数组**（与改造前同形状），额外带上 category/progress/unlockedAt 等字段，
 *      老客户端忽略多余字段即可，前后端可各自升级。
 */

/**
 * 汇总算指标所需的原始数据。
 *
 * 踩坑记录：Score 挂在 users.id 上（不是 openid），得先按 openid 找到 user；
 * 找不到 user（从没登录建档过）时不能直接返回空成就，而是把 scores 当空数组继续判——
 * 这样「签到/段位」这类不依赖成绩的成就仍然能正确判定。
 *
 * @param {string} openid
 * @returns {Promise<Object>} stats 快照
 */
async function loadStats(openid) {
  const user = await User.findOne({ where: { openid } });

  const [
    rankRecord,
    scores,
    wrongRecords,
    checkins,
    customLevelCount,
    dailyBestRank,
    seasonRank,
    pkWins,
    ownedSkins,
  ] = await Promise.all([
    RankRecord.findOne({ where: { openid } }),
    user
      ? Score.findAll({ where: { user_id: user.id }, order: [["createdAt", "ASC"]] })
      : Promise.resolve([]),
    WrongRecord.findAll({ where: { openid } }),
    CheckinRecord.findAll({ where: { openid } }),
    // 自定义关卡表用的是 authorOpenid（不是 openid）；被拒的草稿不计入
    CustomLevel.count({ where: { authorOpenid: openid, status: { [Op.ne]: "rejected" } } }),
    bestDailyRank(openid),
    currentSeasonRank(openid),
    pkWinCount(openid),
    ownedSkinCount(openid),
  ]);

  return achievements.statsFrom({
    rankRecord: rankRecord
      ? { wins: rankRecord.wins, stars: rankRecord.stars, rankId: rankRecord.rankId }
      : null,
    scores: scores.map((s) => ({
      grade: s.grade,
      level: s.level,
      score: s.score,
      game_type: s.game_type,
      correct_count: s.correct_count,
      total_q: s.total_q,
      max_combo: s.max_combo,
      stars: s.stars,
    })),
    wrongRecords: wrongRecords.map((w) => ({
      mastery: w.mastery,
      reviewCount: w.reviewCount,
    })),
    checkins: checkins.map((c) => ({ date: c.date, streak: c.streak })),
    customLevelCount: customLevelCount,
    dailyBestRank: dailyBestRank,
    seasonRank: seasonRank,
    pkWins: pkWins,
    ownedSkinCount: ownedSkins,
  });
}

/** 读取用户已解锁记录：{ achievementId: createdAt } */
async function loadUnlocked(openid) {
  const rows = await UserAchievement.findAll({ where: { openid } });
  const map = {};
  rows.forEach((r) => { map[r.achievementId] = r.createdAt; });
  return map;
}

/**
 * 判定并落库新解锁的成就（幂等），返回新解锁列表。
 * @param {string} openid
 * @returns {Promise<Object>} { stats, newlyUnlocked, unlockedAt }
 */
async function syncUnlocks(openid) {
  const stats = await loadStats(openid);
  const unlockedAt = await loadUnlocked(openid);
  const evaluated = achievements.evaluate(stats);

  const newlyUnlocked = [];
  for (const state of evaluated) {
    if (!state.unlocked || unlockedAt[state.achievementId]) continue;
    // findOrCreate 幂等：并发重复调用也只会有一条记录
    const [row, created] = await UserAchievement.findOrCreate({
      where: { openid, achievementId: state.achievementId },
      defaults: { openid, achievementId: state.achievementId },
    });
    unlockedAt[state.achievementId] = row.createdAt;
    if (created) {
      const def = achievements.DEFINITIONS.find((d) => d.achievementId === state.achievementId);
      newlyUnlocked.push({
        achievementId: def.achievementId,
        name: def.name,
        description: def.description,
        category: def.category,
        icon: achievements.iconOf(def.achievementId),
      });
    }
  }

  return { stats, newlyUnlocked, unlockedAt };
}

/**
 * GET /api/achievement/list —— 获取成就列表 + 解锁状态
 */
router.get("/list", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    // 列表顺手做一次判定（用户打开成就页时就能看到最新进度与解锁），落库幂等
    const { stats, unlockedAt } = await syncUnlocks(openid);
    res.send({ code: 0, data: achievements.listWithProgress(stats, unlockedAt) });
  } catch (err) {
    console.error("GET /api/achievement/list 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/achievement/check —— 检查并解锁成就
 */
router.post("/check", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { newlyUnlocked, unlockedAt } = await syncUnlocks(openid);

    res.send({
      code: 0,
      data: {
        newlyUnlocked,
        totalUnlocked: Object.keys(unlockedAt).length,
        total: achievements.DEFINITIONS.length,
      },
    });
  } catch (err) {
    console.error("POST /api/achievement/check 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/achievement/categories —— 成就分类（前端 tab；也可以直接由列表里的 category 归组）
 */
router.get("/categories", async (req, res) => {
  res.send({ code: 0, data: achievements.categories() });
});

module.exports = router;
