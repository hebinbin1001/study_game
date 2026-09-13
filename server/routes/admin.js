/**
 * server/routes/admin.js —— 管理员接口（2026-09-13 用户需求）
 *
 * 能力（参考主流小程序后台的「运营概览 + 用户列表」）：
 *   GET  /api/admin/check  —— 校验当前身份是否管理员（管理页输入口令后先调这个）
 *   GET  /api/admin/stats  —— 注册人数、在线人数、今日活跃/新增、累计答题、段位分布
 *   GET  /api/admin/users  —— 用户列表（**完整昵称**、掩码 openid、注册时间、最近活跃、段位、答题数）
 *
 * 权限：`server/admin-auth.js` —— ADMIN_OPENIDS 白名单或 ADMIN_PASSCODE 口令（环境变量，零 DDL）。
 * 隐私：完整微信昵称只在本路由返回；排行榜等公开接口一律返回脱敏昵称（maskNickname）。
 *
 * 「在线人数」口径（小程序没有长连接，主流做法是按活跃窗口估算）：
 *   最近 5 分钟内有成绩上报的用户数 —— 用 scores.createdAt 推导，**不需要给表加列**。
 */
'use strict';

const express = require("express");
const { Op } = require("sequelize");
const { fn, col } = require("sequelize");
const { User, Score, RankRecord, sequelize } = require("../db");
const ladder = require("../rank-ladder");
const { checkAdmin, maskOpenid } = require("../admin-auth");
const { dedupeStars } = require("../rank-stars");
const rankRouter = require("./rank");   // 取「最近一次段位星同步」的诊断信息

const router = express.Router();

/**
 * 读某用户的「展示昵称 / 微信名」。
 * ⚠️ wx_nickname 列可能还没在生产库加上（DDL 由用户执行）—— 这里用原生 SQL 读，
 *    列不存在时自动降级成「只有昵称」，不让接口 5000（2026-09-13 踩过这个坑）。
 */
async function nicknamesOf(openid) {
  if (!openid) return { nickname: "", wx: "" };
  try {
    const [rows] = await sequelize.query(
      "SELECT nickname, wx_nickname FROM users WHERE openid = :o LIMIT 1",
      { replacements: { o: openid } }
    );
    const r = (rows && rows[0]) || {};
    return { nickname: r.nickname || "", wx: r.wx_nickname || r.nickname || "" };
  } catch (e) {
    const [rows] = await sequelize.query(
      "SELECT nickname FROM users WHERE openid = :o LIMIT 1",
      { replacements: { o: openid } }
    );
    const r = (rows && rows[0]) || {};
    return { nickname: r.nickname || "", wx: r.nickname || "" };
  }
}

/** 批量取微信名（列不存在 → 返回空 Map，前端显示「未获取」） */
async function wxNicknameMap(openids) {
  const map = new Map();
  if (!openids.length) return map;
  try {
    const [rows] = await sequelize.query(
      "SELECT openid, wx_nickname FROM users WHERE openid IN (:ids)",
      { replacements: { ids: openids } }
    );
    (rows || []).forEach((r) => { if (r.wx_nickname) map.set(r.openid, r.wx_nickname); });
  } catch (e) {
    // 列不存在：整批没有微信名，属于预期内的降级
  }
  return map;
}

/**
 * 探测生产库有没有 wx_nickname 列（管理端据此提示「请先执行 DDL」）。
 * 用一条最轻的 SELECT，列不存在会抛错 → 返回 false，不影响其它逻辑。
 */
async function wxColumnReady() {
  try {
    await sequelize.query("SELECT wx_nickname FROM users LIMIT 1");
    return true;
  } catch (e) {
    return false;
  }
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;      // 在线窗口：最近 5 分钟

/** 管理员校验中间件：不通过统一返回 4003（前端据此提示「口令无效」） */
async function requireAdmin(req, res, next) {
  try {
    const passcode = (req.get && req.get("x-admin-passcode")) || req.query.passcode || "";
    // 微信名白名单（ADMIN_WX_NICKNAMES）：取用户存下的微信名；没有 wx_nickname 列/值时用展示昵称兜底
    const names = await nicknamesOf(req.openid);
    const wxNickname = names.wx;
    const r = checkAdmin(req.openid, passcode, process.env, wxNickname);
    if (!r.ok) {
      return res.send({ code: 4003, data: null, message: "需要管理员权限" });
    }
    req.adminBy = r.by;
    req.adminNickname = wxNickname;
    next();
  } catch (err) {
    console.error("requireAdmin 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
}

/** 今天 0 点（服务端时区） */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** GET /api/admin/check —— 是否管理员（管理页用来判断口令对不对） */
router.get("/check", async (req, res) => {
  try {
    const passcode = (req.get && req.get("x-admin-passcode")) || req.query.passcode || "";
    const names = await nicknamesOf(req.openid);
    const wxNickname = names.wx;
    const r = checkAdmin(req.openid, passcode, process.env, wxNickname);
    res.send({
      code: 0,
      data: {
        isAdmin: r.ok,
        by: r.by,
        openidMasked: maskOpenid(req.openid || ""),
        // 只有已经是管理员时才给完整 openid —— 方便把当前账号转成 ADMIN_OPENIDS 白名单
        // （普通用户即使调这个接口也只会拿到下面这份 null，看不到别人的 openid）
        openid: r.ok ? (req.openid || "") : "",
        nickname: wxNickname,
      },
      message: "ok",
    });
  } catch (err) {
    console.error("GET /api/admin/check 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/** GET /api/admin/stats —— 运营概览 */
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const today0 = startOfToday();
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

    const [totalUsers, todayNewUsers, totalScores, onlineUsers, todayActiveUsers] = await Promise.all([
      User.count(),
      User.count({ where: { createdAt: { [Op.gte]: today0 } } }),
      Score.count(),
      Score.count({ distinct: true, col: "user_id", where: { createdAt: { [Op.gte]: onlineSince } } }),
      Score.count({ distinct: true, col: "user_id", where: { createdAt: { [Op.gte]: today0 } } }),
    ]);

    // 段位分布：按大段聚合（人数不多，内存聚合足够；将来人多再改 SQL）
    const rankRows = await RankRecord.findAll({ attributes: ["stars"], raw: true });
    const dist = {};
    rankRows.forEach((r) => {
      const name = ladder.rankOf(r.stars || 0).rankName;
      const big = String(name).split(" ")[0];
      dist[big] = (dist[big] || 0) + 1;
    });

    res.send({
      code: 0,
      data: {
        totalUsers,          // 注册人数
        onlineUsers,         // 在线人数（最近 5 分钟有成绩上报）
        todayActiveUsers,    // 今日活跃（今日有成绩上报）
        todayNewUsers,       // 今日新增注册
        totalScores,         // 累计答题/上报局数
        onlineWindowMin: ONLINE_WINDOW_MS / 60000,
        rankDist: dist,
        // 微信名列是否已创建（false = 还没执行 ALTER TABLE，微信名必然显示「未获取」）
        wxNicknameColumnReady: await wxColumnReady(),
        // 段位同步自检：最近一次重算是否成功（空字符串 = 最近一次成功）
        lastRankSyncError: rankRouter.syncRankDiagnostics().lastSyncError || "",
        lastRankSyncAt: rankRouter.syncRankDiagnostics().lastSyncAt || null,
      },
      message: "ok",
    });
  } catch (err) {
    console.error("GET /api/admin/stats 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/** GET /api/admin/users?page=1&pageSize=20&q=昵称 —— 用户列表（含完整昵称，仅管理员） */
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const q = String(req.query.q || "").trim();

    const where = {};
    if (q) where.nickname = { [Op.like]: `%${q}%` };

    const total = await User.count({ where });
    const users = await User.findAll({
      where,
      attributes: ["id", "openid", "nickname", "avatar_url", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      raw: true,
    });

    const ids = users.map((u) => u.id);
    const openids = users.map((u) => u.openid);
    const [scoreAgg, ranks] = await Promise.all([
      ids.length
        ? Score.findAll({
          where: { user_id: { [Op.in]: ids } },
          attributes: ["user_id", [fn("COUNT", col("id")), "cnt"], [fn("MAX", col("createdAt")), "last"]],
          group: ["user_id"],
          raw: true,
        })
        : [],
      openids.length
        ? RankRecord.findAll({
          where: { openid: { [Op.in]: openids } },
          attributes: ["openid", "stars", "wins"],
          raw: true,
        })
        : [],
    ]);
    // 诊断用：该用户「流水星数」= 每局上报星数直接相加（改口径之前的口径）
    // 与展示星数（去重后）对比，能一眼看出「同一关反复刷」贡献了多少虚高星星
    const rawAgg = ids.length
      ? await Score.findAll({
        where: { user_id: { [Op.in]: ids } },
        attributes: ["user_id", [fn("SUM", col("stars")), "raw"]],
        group: ["user_id"],
        raw: true,
      })
      : [];
    const rawMap = new Map(rawAgg.map((r) => [r.user_id, Number(r.raw) || 0]));
    // 现算「去重后星数」：与库里的 stars（rank_record.stars）对比，两者不等 = 同步没生效
    const allScores = ids.length
      ? await Score.findAll({
        where: { user_id: { [Op.in]: ids } },
        attributes: ["user_id", "game_type", "grade", "type_key", "level", "stars"],
        raw: true,
      })
      : [];
    const scoresByUser = new Map();
    allScores.forEach((r) => {
      if (!scoresByUser.has(r.user_id)) scoresByUser.set(r.user_id, []);
      scoresByUser.get(r.user_id).push(r);
    });
    const wxMap = await wxNicknameMap(openids);
    const scoreMap = new Map(scoreAgg.map((r) => [r.user_id, r]));
    const rankMap = new Map(ranks.map((r) => [r.openid, r]));

    const list = users.map((u) => {
      const s = scoreMap.get(u.id) || {};
      const r = rankMap.get(u.openid) || {};
      const stars = Number(r.stars) || 0;
      return {
        nickname: u.nickname || "未命名",             // 管理员可见完整昵称
        wxNickname: wxMap.get(u.openid) || "",        // 微信名（仅本接口返回；列未加时为空）
        openidMasked: maskOpenid(u.openid),           // openid 打码展示
        createdAt: u.createdAt,
        lastActiveAt: s.last || null,
        scoreCount: Number(s.cnt) || 0,
        stars,
        starsRaw: rawMap.get(u.id) || 0,   // 流水口径（对比用；展示口径是 stars）
        starsDeduped: dedupeStars(scoresByUser.get(u.id) || []),   // 按当前口径现算（应等于 stars）
        rankName: ladder.rankOf(stars).rankName,
      };
    });

    res.send({
      code: 0,
      data: { page, pageSize, total, hasMore: page * pageSize < total, list },
      message: "ok",
    });
  } catch (err) {
    console.error("GET /api/admin/users 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
