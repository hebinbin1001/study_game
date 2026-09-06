const express = require("express");
const { User, RankRecord, Rank } = require("../db");

const router = express.Router();

/**
 * GET /api/rank/world —— 世界排行榜（全服 Top 100）
 * ?page=1&pageSize=20
 */
router.get("/world", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // 查询排行榜（按 score 降序，同分按 stars 降序）
    const { count, rows } = await RankRecord.findAndCountAll({
      order: [
        ["stars", "DESC"],
        ["wins", "DESC"],
        ["createdAt", "ASC"],
      ],
      limit: pageSize,
      offset,
    });

    // 获取段位信息
    const rankIds = [...new Set(rows.map((r) => r.rankId))];
    const ranks = await Rank.findAll({
      where: { rankId: rankIds },
    });
    const rankMap = new Map(ranks.map((r) => [r.rankId, r.rankName]));

    // 获取用户信息
    const openids = rows.map((r) => r.openid);
    const users = await User.findAll({
      where: { openid: openids },
      attributes: ["openid", "nickname", "avatar_url"],
    });
    const userMap = new Map(users.map((u) => [u.openid, u]));

    // 组装返回数据
    const list = rows.map((record, index) => {
      const user = userMap.get(record.openid);
      return {
        rank: offset + index + 1,
        openid: record.openid,
        nickname: user ? user.nickname : "未命名",
        avatarUrl: user ? user.avatar_url : "",
        rankId: record.rankId,
        rankName: rankMap.get(record.rankId) || "青铜",
        score: record.stars * 100 + record.wins * 10, // 综合得分
        stars: record.stars,
        wins: record.wins,
      };
    });

    res.send({
      code: 0,
      data: {
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
        list,
      },
    });
  } catch (err) {
    console.error("GET /api/rank/world 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/rank/me —— 我的排名
 */
router.get("/me", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    // 获取我的段位记录
    const myRecord = await RankRecord.findOne({
      where: { openid },
    });

    if (!myRecord) {
      return res.send({
        code: 0,
        data: {
          rank: 0,
          nickname: "",
          avatarUrl: "",
          rankId: 1,
          rankName: "青铜",
          score: 0,
          stars: 0,
          wins: 0,
        },
      });
    }

    // 计算我的排名（比我星数多的记录数 + 1）
    const higherCount = await RankRecord.count({
      where: {
        stars: { $gt: myRecord.stars },
      },
    });

    // 相同星数按更新时间排序
    const sameStars = await RankRecord.findAll({
      where: {
        stars: myRecord.stars,
        openid: { $ne: openid },
      },
      order: [["createdAt", "ASC"]],
    });

    const myRank = higherCount + sameStars.length + 1;

    // 获取用户信息
    const user = await User.findOne({
      where: { openid },
      attributes: ["nickname", "avatar_url"],
    });

    // 获取段位信息
    const rank = await Rank.findOne({
      where: { rankId: myRecord.rankId },
    });

    res.send({
      code: 0,
      data: {
        rank: myRank,
        nickname: user ? user.nickname : "未命名",
        avatarUrl: user ? user.avatar_url : "",
        rankId: myRecord.rankId,
        rankName: rank ? rank.rankName : "青铜",
        score: myRecord.stars * 100 + myRecord.wins * 10,
        stars: myRecord.stars,
        wins: myRecord.wins,
      },
    });
  } catch (err) {
    console.error("GET /api/rank/me 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;