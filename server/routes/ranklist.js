const express = require("express");
const { sequelize, User, RankRecord, Rank, Score } = require("../db");
// 段位名一律按 stars 现算（2026-09-13）：以前读存库的 rankId/Rank 表，
// 曲线与星星口径改了以后那两处不会跟着变 → 排行榜段位一直显示旧值（用户反馈「排行榜段位没更新」）。
const ladder = require("../rank-ladder");

const router = express.Router();

/**
 * 玩法进度榜「总览」用的玩法清单（与端上 utils/game-catalog.js 的 gameType 一一对应）。
 * 顺序 = 卡片展示顺序：题库类在前、数字智力在后。
 */
const SUMMARY_GAMES = [
  "word_warrior", "word_build", "link", "match", "idiom", "snake",
  "math24", "sudoku", "sprint", "balance", "g2048", "memory", "onestroke", "klotski",
];

/**
 * 上榜门槛（2026-09-19 用户要求：「没有注册的用户不能上排行榜」）。
 *
 * 什么算「没注册」：登录过但**没设昵称**（没走完资料这一步）的账号 ——
 * 他们此前会以匿名名义出现在榜上，既认不出人也没意义。
 * 现在三处榜单（总榜 / 玩法进度榜 / 玩法总览）统一按「users.nickname 非空」过滤。
 *
 * 注意：成绩本身照旧入库（不上榜 ≠ 不记录），用户补完昵称后立刻就能看到自己的名次。
 */
const NICKNAME_READY_SQL = "u.nickname IS NOT NULL AND u.nickname <> '' ";

/**
 * GET /api/ranklist/progress —— 玩法闯关进度榜（B3）
 * ?game=word_warrior&grade=primary12&type=all
 * 聚合：某玩法/学段/题型下，各玩家「已通关最大关卡号（star>0）」降序；
 * 同进度按 RankRecord.stars 降序。
 * 返回前 N + 我的名次（含页外）。
 */
router.get("/progress", async (req, res) => {
  try {
    const game = (req.query.game || "word_warrior").toString();
    const grade = (req.query.grade || "").toString();
    const typeParam = (req.query.type || "").toString();
    // type: '' 或 'all' → 不限题型（综合或全部）；否则限定该题型 key
    const anyType = !typeParam || typeParam === "all";
    if (!grade) {
      return res.send({ code: 4000, data: null, message: "缺少 grade" });
    }

    // 聚合每用户在该维度下已通关（star>0）的最大关卡
    const whereSql = [];
    const binds = { game, grade };
    whereSql.push("s.game_type = :game");
    whereSql.push("s.grade = :grade");
    whereSql.push("s.stars > 0");
    if (!anyType) {
      whereSql.push("s.type_key = :type");
      binds.type = typeParam;
    }

    // JOIN users 过滤「没设昵称」的账号（未完成注册不上榜）
    const [rows] = await sequelize.query(
      `SELECT s.user_id,
              MAX(s.level) AS max_level,
              COUNT(DISTINCT CONCAT(s.type_key,'@',s.level)) AS passed_levels
         FROM scores s
         JOIN users u ON u.id = s.user_id AND ${NICKNAME_READY_SQL}
        WHERE ${whereSql.join(" AND ")}
        GROUP BY s.user_id
        ORDER BY max_level DESC, passed_levels DESC
        LIMIT 200`,
      { replacements: binds }
    );

    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const userIds = rows.map((r) => r.user_id);
    const userRows = userIds.length
      ? await User.findAll({ where: { id: userIds }, attributes: ["id", "openid", "nickname", "avatar_url"] })
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));
    const openids = userRows.map((u) => u.openid);
    const rrRows = openids.length
      ? await RankRecord.findAll({ where: { openid: openids }, attributes: ["openid", "rankId", "stars"] })
      : [];
    const rrMap = new Map(rrRows.map((r) => [r.openid, r]));
    const rankIds = [...new Set(rrRows.map((r) => r.rankId))];
    const rankRows = rankIds.length ? await Rank.findAll({ where: { rankId: rankIds } }) : [];
    const rankNameMap = new Map(rankRows.map((r) => [r.rankId, r.rankName]));

    const ranked = rows.map((r, i) => {
      const user = userMap.get(r.user_id);
      const rr = user ? rrMap.get(user.openid) : null;
      return {
        rank: i + 1,
        nickname: user.nickname,
        avatarUrl: user ? user.avatar_url : "",
        rankName: ladder.rankOf(rr ? rr.stars : 0).rankName,
        stars: rr ? rr.stars : 0,
        maxLevel: parseInt(r.max_level, 10) || 0,
        passedLevels: parseInt(r.passed_levels, 10) || 0,
      };
    });

    const offset = (page - 1) * pageSize;
    const pageList = ranked.slice(offset, offset + pageSize);
    const total = ranked.length;

    // 我的名次（可能不在本页）
    let me = null;
    if (req.openid) {
      const meRow = rows.findIndex((r) => {
        const u = userMap.get(r.user_id);
        return u && u.openid === req.openid;
      });
      if (meRow >= 0) me = ranked[meRow];
    }

    res.send({
      code: 0,
      data: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), list: pageList, me },
    });
  } catch (err) {
    console.error("GET /api/ranklist/progress 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/rank/world —— 世界排行榜（全服 Top 100）
 * ?page=1&pageSize=20
 */
/**
 * GET /api/ranklist/progress-summary —— 玩法进度榜「总览」
 *
 * 为什么需要它（2026-09-18 用户反馈「玩法排行榜显示不太友好 + 向右超出边界」）：
 *   原来玩法榜是一行平铺 14 个玩法 chips，既撑破页面宽度、又看不出每个玩法的情况。
 *   改成「玩法卡片列表 → 点进去看该玩法完整榜」，卡片数据就要一次性拿 14 个玩法的
 *   「榜首 + 我的进度」。逐玩法调 /progress 要发 14 个请求，所以这里做批量汇总。
 *
 * 进度口径（与单玩法榜一致）：stars>0 的关卡里取最大关卡号；另给「通关关卡数」。
 * 这里**不限学段/题型**（卡片展示的是该玩法的总进度）；细分维度去详情榜看。
 */
router.get("/progress-summary", async (req, res) => {
  try {
    // 同 /progress：没设昵称的账号不上榜
    const [rows] = await sequelize.query(
      `SELECT s.game_type,
              s.user_id,
              MAX(s.level) AS max_level,
              COUNT(DISTINCT CONCAT(s.grade, '@', s.type_key, '@', s.level)) AS passed_levels
         FROM scores s
         JOIN users u ON u.id = s.user_id AND ${NICKNAME_READY_SQL}
        WHERE s.stars > 0
        GROUP BY s.game_type, s.user_id`
    );

    // 按玩法分组 → 排序（关卡高者靠前，同关卡比通关数）
    const byGame = new Map(SUMMARY_GAMES.map((g) => [g, []]));
    rows.forEach((r) => {
      const g = String(r.game_type || "");
      if (!byGame.has(g)) byGame.set(g, []);
      byGame.get(g).push({
        userId: r.user_id,
        maxLevel: parseInt(r.max_level, 10) || 0,
        passedLevels: parseInt(r.passed_levels, 10) || 0,
      });
    });

    const allUids = new Set();
    byGame.forEach((arr) => {
      arr.sort((a, b) => (b.maxLevel - a.maxLevel) || (b.passedLevels - a.passedLevels));
      if (arr[0]) allUids.add(arr[0].userId);
    });
    const userRows = allUids.size
      ? await User.findAll({
        where: { id: [...allUids] },
        attributes: ["id", "openid", "nickname", "avatar_url"],
      })
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));
    // 「我的进度」自己可能不是榜首，得单独查一次
    let myId = 0;
    if (req.openid) {
      const meUser = await User.findOne({ where: { openid: req.openid }, attributes: ["id"] });
      if (meUser) myId = meUser.id;
    }

    const list = SUMMARY_GAMES.map((game) => {
      const arr = byGame.get(game) || [];
      const top = arr[0] || null;
      const champUser = top ? userMap.get(top.userId) : null;
      let myValue = 0;
      let myRank = 0;
      if (myId) {
        const idx = arr.findIndex((x) => x.userId === myId);
        if (idx >= 0) {
          myValue = arr[idx].maxLevel;
          myRank = idx + 1;
        }
      }
      return {
        game,
        players: arr.length,
        // 已按门槛 JOIN 过滤过，能出现在这里的用户一定有昵称，不再需要「未命名」兜底
        champNickname: champUser ? champUser.nickname : "",
        champAvatarUrl: champUser ? (champUser.avatar_url || "") : "",
        champValue: top ? top.maxLevel : 0,
        myValue,
        myRank,
      };
    });

    res.send({ code: 0, data: { list } });
  } catch (err) {
    console.error("GET /api/ranklist/progress-summary 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

router.get("/world", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // 查询排行榜（按星星降序、同分按胜场升序时间）
    // ⚠️ 必须 JOIN users 过滤「没设昵称」的账号：否则未完成注册的人会以匿名名义上榜
    const [rows] = await sequelize.query(
      `SELECT r.openid, r.stars, r.wins, u.nickname, u.avatar_url
         FROM rank_records r
         JOIN users u ON u.openid = r.openid AND ${NICKNAME_READY_SQL}
        ORDER BY r.stars DESC, r.wins DESC, r.createdAt ASC
        LIMIT :limit OFFSET :offset`,
      { replacements: { limit: pageSize, offset } }
    );
    const [countRows] = await sequelize.query(
      `SELECT COUNT(*) AS total
         FROM rank_records r
         JOIN users u ON u.openid = r.openid AND ${NICKNAME_READY_SQL}`
    );
    const count = parseInt((countRows && countRows[0] && countRows[0].total) || 0, 10);

    // 组装返回数据
    const list = rows.map((record, index) => {
      return {
        rank: offset + index + 1,
        openid: record.openid,
        nickname: record.nickname,
        avatarUrl: record.avatar_url || "",
        rankId: ladder.rankOf(record.stars).rankId,
        rankName: ladder.rankOf(record.stars).rankName,
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

    // 获取用户信息（2026-09-19：没设昵称的账号不上榜，自己也不例外）
    const user = await User.findOne({
      where: { openid },
      attributes: ["nickname", "avatar_url"],
    });
    if (!user || !user.nickname) {
      // 未完成注册（没设昵称）→ 不上榜，前端据此不显示「我的排名」
      return res.send({ code: 0, data: null, message: "未设置昵称，暂不上榜" });
    }

    // 计算我的排名（比我星数多的记录数 + 同星记录数 + 1）
    //
    // ⚠️ 用原生 SQL 而不是 Sequelize 的 Op：一是要和「有昵称才上榜」的 JOIN 口径一致，
    //    二是历史上这里踩过 v6 操作符的坑（旧式 $gt / $ne 会被序列化成
    //    `stars = '[object Object]'`，直接把接口打成 5000，见 tests/unit/sequelize-operators.test.js）。
    const [higherRows] = await sequelize.query(
      `SELECT COUNT(*) AS c
         FROM rank_records r
         JOIN users u ON u.openid = r.openid AND ${NICKNAME_READY_SQL}
        WHERE r.stars > :stars`,
      { replacements: { stars: myRecord.stars } }
    );
    const [sameRows] = await sequelize.query(
      `SELECT COUNT(*) AS c
         FROM rank_records r
         JOIN users u ON u.openid = r.openid AND ${NICKNAME_READY_SQL}
        WHERE r.stars = :stars AND r.openid <> :me`,
      { replacements: { stars: myRecord.stars, me: openid } }
    );
    const myRank =
      parseInt((higherRows[0] || {}).c || 0, 10) +
      parseInt((sameRows[0] || {}).c || 0, 10) + 1;

    // 获取段位信息
    const rank = await Rank.findOne({
      where: { rankId: myRecord.rankId },
    });

    res.send({
      code: 0,
      data: {
        rank: myRank,
        nickname: user.nickname,
        avatarUrl: user ? user.avatar_url : "",
        rankId: ladder.rankOf(myRecord.stars).rankId,
        rankName: ladder.rankOf(myRecord.stars).rankName,
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
