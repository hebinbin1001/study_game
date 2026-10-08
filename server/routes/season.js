const express = require("express");
const { SeasonClaim, sequelize } = require("../db");
const time = require("../beijing-time");
const seasonRewards = require("../season-rewards");
const { displayName } = require("../nickname-util");
const { isMissingTable } = require("../table-missing");
const rankRouter = require("./rank");

const router = express.Router();

/** 赛季榜最多统计到前 300 名（再往后名次对奖励无意义，避免全表聚合） */
const LADDER_LIMIT = 300;

/**
 * 赛季积分口径：**本赛季内获得过的星星，按 (玩法×学段×题型×关卡) 去重求和**。
 * 与段位星同一套口径，区别只是多了时间窗 —— 同一关反复刷不会重复计分。
 */
async function seasonLadder(season, limit) {
  const cap = Math.max(1, Math.min(LADDER_LIMIT, parseInt(limit, 10) || 20));
  const [rows] = await sequelize.query(
    `SELECT u.openid, u.nickname, u.avatar_url, SUM(t.mx) AS stars
       FROM (
         SELECT s.user_id, MAX(s.stars) AS mx
           FROM scores s
          WHERE s.createdAt >= :start AND s.createdAt < :end
          GROUP BY s.user_id, s.game_type, s.grade, s.type_key, s.level
       ) t
       JOIN users u ON u.id = t.user_id
      GROUP BY u.openid, u.nickname, u.avatar_url
      ORDER BY stars DESC, u.openid ASC
      LIMIT ${cap}`,
    { replacements: { start: season.start, end: season.endExclusive } }
  );
  return rows.map(function (r, i) {
    return {
      rank: i + 1,
      nickname: displayName(r.nickname, r.openid),
      avatarUrl: r.avatar_url || "",
      stars: parseInt(r.stars, 10) || 0,
      openid: r.openid,
    };
  });
}

/** 单个用户的赛季积分 */
async function seasonStarsOf(openid, season) {
  if (!openid) return 0;
  const [rows] = await sequelize.query(
    `SELECT COALESCE(SUM(t.mx), 0) AS stars
       FROM (
         SELECT MAX(s.stars) AS mx
           FROM scores s
           JOIN users u ON u.id = s.user_id
          WHERE u.openid = :o AND s.createdAt >= :start AND s.createdAt < :end
          GROUP BY s.game_type, s.grade, s.type_key, s.level
       ) t`,
    { replacements: { o: openid, start: season.start, end: season.endExclusive } }
  );
  return parseInt(rows[0] && rows[0].stars, 10) || 0;
}

/** 在赛季榜里找我的名次（不在前 300 返回 0） */
function findMyRank(ladder, openid) {
  if (!openid) return 0;
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i].openid === openid) return ladder[i].rank;
  }
  return 0;
}

/** 榜单行去掉 openid（对外不暴露） */
function publicRow(row, openid) {
  return {
    rank: row.rank,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    stars: row.stars,
    isMe: !!openid && row.openid === openid,
  };
}

/**
 * GET /api/season/info
 * 当前赛季信息 + 我的积分/名次 + 赛季榜 + 上赛季奖励状态。
 */
router.get("/info", async (req, res) => {
  try {
    const openid = req.openid;
    const season = time.seasonOf();
    const prev = time.prevSeasonOf();

    const myStars = await seasonStarsOf(openid, season);
    const ladder = await seasonLadder(season, 20);
    const myRank = findMyRank(ladder, openid);

    // 上赛季：名次 + 可领奖励（只算一次，limit 300）
    const prevLadder = await seasonLadder(prev, LADDER_LIMIT);
    const prevRank = findMyRank(prevLadder, openid);
    let prevStars = 0;
    for (let i = 0; i < prevLadder.length; i++) {
      if (prevLadder[i].openid === openid) prevStars = prevLadder[i].stars;
    }
    const prevTier = seasonRewards.tierOf(prevRank, prevStars);
    let prevClaimed = false;
    if (openid) {
      const c = await SeasonClaim.findOne({ where: { openid, seasonKey: prev.key } });
      prevClaimed = !!c;
    }

    res.send({
      code: 0,
      data: {
        available: true,
        season: {
          key: season.key,
          name: season.name,
          start: season.start,
          endExclusive: season.endExclusive,
          daysLeft: time.daysLeftInSeason(),
        },
        me: { stars: myStars, rank: myRank },
        ladder: ladder.map(function (r) { return publicRow(r, openid); }),
        prevSeason: {
          key: prev.key,
          name: prev.name,
          stars: prevStars,
          rank: prevRank,
          tier: prevTier ? prevTier.tier : "",
          tierLabel: prevTier ? prevTier.label : "",
          rewardStars: prevTier ? prevTier.stars : 0,
          claimed: prevClaimed,
          claimable: !!prevTier && !prevClaimed,
        },
        tiers: seasonRewards.tiers(),
      },
    });
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("[season] 表未就绪：", err && err.message);
      return res.send({
        code: 0,
        data: { available: false, message: "赛季功能准备中，请稍后再来" },
      });
    }
    console.error("GET /api/season/info 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/season/claim
 * body: { seasonKey }
 * 只能领**上一个赛季**的奖励；同一赛季只能领一次。
 */
router.post("/claim", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const wantKey = String((req.body && req.body.seasonKey) || "");
    const prev = time.prevSeasonOf();
    if (wantKey && wantKey !== prev.key) {
      return res.send({ code: 4000, data: null, message: "只能领取上一赛季的奖励（" + prev.key + "）" });
    }

    const existing = await SeasonClaim.findOne({ where: { openid, seasonKey: prev.key } });
    if (existing) {
      return res.send({
        code: 0,
        data: { already: true, stars: existing.stars, tier: existing.tier, rank: existing.rank },
      });
    }

    const ladder = await seasonLadder(prev, LADDER_LIMIT);
    const rank = findMyRank(ladder, openid);
    let stars = 0;
    for (let i = 0; i < ladder.length; i++) {
      if (ladder[i].openid === openid) stars = ladder[i].stars;
    }
    const tier = seasonRewards.tierOf(rank, stars);
    if (!tier) {
      return res.send({ code: 4000, data: null, message: "上赛季还不够领奖资格（赛季积分需满 " + seasonRewards.ACTIVE_MIN_STARS + "）" });
    }

    await SeasonClaim.create({
      openid,
      seasonKey: prev.key,
      tier: tier.tier,
      rank,
      stars: tier.stars,
    });
    // 奖励星落库后重算段位（与签到同一套：从表求和，不直接累加）
    try {
      await rankRouter.syncRankStars(openid);
    } catch (e) {
      console.error("赛季奖励后重算段位星失败（不影响领取）：", e && e.message);
    }

    res.send({
      code: 0,
      data: { already: false, stars: tier.stars, tier: tier.tier, tierLabel: tier.label, rank },
    });
  } catch (err) {
    if (isMissingTable(err)) {
      return res.send({ code: 0, data: { available: false, message: "赛季功能准备中，请稍后再来" } });
    }
    console.error("POST /api/season/claim 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
