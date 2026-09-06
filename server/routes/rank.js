const express = require("express");
const { Rank, RankRecord, User } = require("../db");

const router = express.Router();

/**
 * GET /api/rank/info —— 获取段位信息
 */
router.get("/info", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    // 获取段位记录
    const rankRecord = await RankRecord.findOne({
      where: { openid },
    });

    const rankId = rankRecord ? rankRecord.rankId : 1;
    const wins = rankRecord ? rankRecord.wins : 0;
    const stars = rankRecord ? rankRecord.stars : 0;

    // 获取段位信息
    const rank = await Rank.findOne({ where: { rankId } });

    res.send({
      code: 0,
      data: {
        rankId,
        rankName: rank ? rank.rankName : "青铜",
        icon: rank ? rank.icon : "/assets/ranks/bronze.png",
        wins,
        stars,
      },
    });
  } catch (err) {
    console.error("GET /api/rank/info 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/rank/progress —— 获取段位晋升进度
 */
router.get("/progress", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    // 获取段位记录
    const rankRecord = await RankRecord.findOne({
      where: { openid },
    });

    const currentRankId = rankRecord ? rankRecord.rankId : 1;
    const currentWins = rankRecord ? rankRecord.wins : 0;

    // 获取当前段位
    const currentRank = await Rank.findOne({
      where: { rankId: currentRankId },
    });

    // 获取下一段位
    const nextRank = await Rank.findOne({
      where: { rankId: currentRankId + 1 },
    });

    if (!nextRank) {
      // 已达最高段位
      return res.send({
        code: 0,
        data: {
          currentRank: {
            rankId: currentRankId,
            rankName: currentRank ? currentRank.rankName : "荣耀王者",
          },
          nextRank: null,
          currentWins,
          winsNeeded: 0,
          progressPercent: 100,
          isMaxRank: true,
        },
      });
    }

    const winsNeeded = nextRank.minWins - (currentRank ? currentRank.minWins : 0);
    const progressPercent = winsNeeded > 0 ? Math.min(100, Math.round((currentWins - (currentRank ? currentRank.minWins : 0)) / winsNeeded * 100)) : 100;

    res.send({
      code: 0,
      data: {
        currentRank: {
          rankId: currentRankId,
          rankName: currentRank ? currentRank.rankName : "青铜",
        },
        nextRank: {
          rankId: nextRank.rankId,
          rankName: nextRank.rankName,
        },
        currentWins,
        winsNeeded,
        progressPercent,
        isMaxRank: false,
      },
    });
  } catch (err) {
    console.error("GET /api/rank/progress 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/rank/sync —— 同步段位（通关后调用，累加胜场/星数并晋升）
 */
router.post("/sync", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { stars } = req.body;
    if (stars === undefined || stars === null || stars < 0) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失或非法",
      });
    }

    // 获取用户
    const [user] = await User.findOrCreate({
      where: { openid },
      defaults: { openid },
    });

    // 获取段位记录
    let rankRecord = await RankRecord.findOne({
      where: { openid },
    });

    if (!rankRecord) {
      // 首次创建
      rankRecord = await RankRecord.create({
        openid,
        rankId: 1,
        wins: 0,
        stars: 0,
      });
    }

    // 累加胜场（1 次通关 = 1 胜）和星数
    const newWins = rankRecord.wins + 1;
    const newStars = rankRecord.stars + stars;

    // 计算新段位
    let newRankId = rankRecord.rankId;
    const allRanks = await Rank.findAll({ order: [["rankId", "ASC"]] });

    for (const r of allRanks) {
      if (newWins >= r.minWins) {
        newRankId = r.rankId;
      } else {
        break;
      }
    }

    // 更新记录
    await rankRecord.update({
      wins: newWins,
      stars: newStars,
      rankId: newRankId,
    });

    // 获取新段位信息
    const newRank = await Rank.findOne({ where: { rankId: newRankId } });

    res.send({
      code: 0,
      data: {
        rankId: newRankId,
        rankName: newRank ? newRank.rankName : "青铜",
        wins: newWins,
        stars: newStars,
        rankUp: newRankId > rankRecord.rankId,
      },
    });
  } catch (err) {
    console.error("POST /api/rank/sync 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;