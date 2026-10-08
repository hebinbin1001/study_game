/**
 * server/routes/admin.js —— 管理员接口（2026-09-13 用户需求）
 *
 * 能力（参考主流小程序后台的「运营概览 + 用户列表」）：
 *   GET  /api/admin/check  —— 校验当前身份是否管理员（管理页输入口令后先调这个）
 *   GET  /api/admin/stats  —— 注册人数、在线人数、今日活跃/新增、累计答题、段位分布
 *   GET  /api/admin/users  —— 用户列表（**完整昵称**、掩码 openid、注册时间、最近活跃、段位、答题数）
 *
 * 2026-09-29 补齐（用户要求「你看下管理员界面还缺少，一起做了」）：
 *   · /stats  加「微信名采集率」「玩法热度」——采集率是微信名引导效果的直接度量
 *   · /users  支持排序（active/stars/created）、搜索扩展到微信名与 openid、返回头像
 *   规则（排序白名单 / LIKE 转义 / 采集率 / 热度聚合）抽在 server/admin-query.js，有单测。
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
const { checkAdmin, pickWxNickname, maskOpenid } = require("../admin-auth");
const { dedupeStars } = require("../rank-stars");
const adminQuery = require("../admin-query");
const { GAME_NAMES } = require("../game-names");
const rankRouter = require("./rank");   // 取「最近一次段位星同步」的诊断信息

const router = express.Router();

/**
 * 读某用户的「展示昵称 / 微信名」。
 * ⚠️ wx_nickname 列可能还没在生产库加上（DDL 由用户执行）—— 这里用原生 SQL 读，
 *    列不存在时自动降级成「只有昵称」，不让接口 5000（2026-09-13 踩过这个坑）。
 */
async function nicknamesOf(openid) {
  if (!openid) return { nickname: "", wx: "", columnReady: false };
  try {
    const [rows] = await sequelize.query(
      "SELECT nickname, wx_nickname FROM users WHERE openid = :o LIMIT 1",
      { replacements: { o: openid } }
    );
    const r = (rows && rows[0]) || {};
    // 列已就绪（用户 2026-09-13 已执行 DDL）：微信名**只认 wx_nickname**，
    // 不回落到展示昵称 —— 否则谁把展示昵称改成管理员微信名就能越权进管理端。
    return { nickname: r.nickname || "", wx: pickWxNickname(r, true), columnReady: true };
  } catch (e) {
    const [rows] = await sequelize.query(
      "SELECT nickname FROM users WHERE openid = :o LIMIT 1",
      { replacements: { o: openid } }
    );
    const r = (rows && rows[0]) || {};
    // 列还没加（DDL 未执行）：退化为展示昵称兜底，保证管理端至少能用
    return { nickname: r.nickname || "", wx: pickWxNickname(r, false), columnReady: false };
  }
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;      // 在线窗口：最近 5 分钟

/**
 * 按搜索词找匹配的 openid 列表（昵称 / 微信名 / openid 三列）。
 *
 * 为什么要走原生 SQL：`wx_nickname` 不在 Sequelize 模型里（见 models/user.js 的说明），
 * 用不了模型的 where；而且这里要在三列之间做 OR，原生一句更清楚。
 * 列不存在时降级成「昵称 + openid」两列。
 *
 * @param {string} pattern LIKE 模式（已转义，来自 adminQuery.searchPattern）
 * @returns {Promise<string[]>} 命中的 openid（最多 500，防止一次拉爆内存）
 */
async function searchOpenids(pattern) {
  const base = "SELECT openid FROM users WHERE ";
  const tail = " LIMIT 500";
  try {
    const [rows] = await sequelize.query(
      base + "(nickname LIKE :p OR wx_nickname LIKE :p OR openid LIKE :p)" + tail,
      { replacements: { p: pattern } }
    );
    return (rows || []).map((r) => r.openid).filter(Boolean);
  } catch (e) {
    const [rows] = await sequelize.query(
      base + "(nickname LIKE :p OR openid LIKE :p)" + tail,
      { replacements: { p: pattern } }
    );
    return (rows || []).map((r) => r.openid).filter(Boolean);
  }
}

/**
 * 排序键 → SQL 片段（users 别名 u）。
 *   每个都带 `u.id DESC` 兜底，保证同值时顺序稳定 —— 否则翻页会重复/漏人。
 */
const ORDER_SQL = {
  // 最近活跃：该用户最近一次成绩上报时间（从没上报的排最后，MySQL 中 NULL 在 DESC 时垫底）
  active: "(SELECT MAX(s.createdAt) FROM scores s WHERE s.user_id = u.id) DESC, u.id DESC",
  // 段位星数：rank_records 里的展示口径
  stars: "COALESCE((SELECT r.stars FROM rank_records r WHERE r.openid = u.openid LIMIT 1), 0) DESC, u.id DESC",
  created: "u.createdAt DESC, u.id DESC"
};

/**
 * 按排序键取一页用户 id（只取 id，详情仍走原有聚合逻辑，改动面最小）。
 * @param {Array<string>|null} openids 搜索命中的 openid（null = 不按搜索过滤）
 */
async function orderedUserIds(openids, sort, limit, offset) {
  const whereSql = openids ? " WHERE u.openid IN (:openids)" : "";
  const [rows] = await sequelize.query(
    "SELECT u.id FROM users u" + whereSql + " ORDER BY " + ORDER_SQL[sort] + " LIMIT :limit OFFSET :offset",
    { replacements: { openids: openids || [], limit: limit, offset: offset } }
  );
  return (rows || []).map((r) => r.id);
}

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
        // nickname 保留展示昵称口径（页面兼容）；wxNickname 是「微信名白名单实际取的值」
        nickname: names.nickname,
        wxNickname: wxNickname,
        // 微信名列是否已就绪（false = 还没执行 ALTER TABLE，微信名必然为空）
        wxColumnReady: names.columnReady,
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

    const [totalUsers, todayNewUsers, totalScores, onlineUsers, todayActiveUsers, gameRows] = await Promise.all([
      User.count(),
      User.count({ where: { createdAt: { [Op.gte]: today0 } } }),
      Score.count(),
      Score.count({ distinct: true, col: "user_id", where: { createdAt: { [Op.gte]: onlineSince } } }),
      Score.count({ distinct: true, col: "user_id", where: { createdAt: { [Op.gte]: today0 } } }),
      // 玩法热度：每个玩法被玩了多少局（看运营该往哪个玩法加内容）
      Score.findAll({
        attributes: ["game_type", [fn("COUNT", col("id")), "cnt"]],
        group: ["game_type"],
        raw: true,
      }),
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
        // 玩法热度（局数降序；未登记的新玩法会以原始 key 出现，便于发现遗漏）
        gameHeat: adminQuery.gameHeat(gameRows, GAME_NAMES),
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

/**
 * GET /api/admin/users —— 用户列表（含完整昵称与微信名，仅管理员）
 *
 * 参数：
 *   page=1 & pageSize=20    分页（pageSize 上限 50）
 *   q=关键词                搜昵称 / 微信名 / openid（LIKE 元字符已转义）
 *   sort=active|stars|created  排序：最近活跃（默认）/ 段位星数 / 注册时间
 */
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const sort = adminQuery.resolveSort(req.query.sort);
    const searched = adminQuery.searchPattern(req.query.q);

    // 搜索要先解析成 openid 列表（要跨 nickname / wx_nickname / openid 三列 OR）
    const searchedOpenids = searched ? await searchOpenids(searched.pattern) : null;
    const where = searchedOpenids ? { openid: { [Op.in]: searchedOpenids } } : {};

    const total = await User.count({ where });

    // 两步取数：先按排序键拿这一页的 id 顺序，再按 id 取详情（聚合逻辑保持原样）
    //
    // 降级 + 可观测（2026-09-29）：排序 SQL 出错时**绝不能**静默返回空列表 ——
    // 管理端会显示成「共 22 人 · 已加载 0」，看起来像「用户都没了」而不是「排序坏了」。
    // 出错就退回注册时间排序（等于旧行为），并把这个事实带回响应里。
    let idsInOrder = [];
    let orderError = "";
    try {
      idsInOrder = await orderedUserIds(searchedOpenids, sort, pageSize, (page - 1) * pageSize);
    } catch (e) {
      orderError = (e && e.message) || String(e);
      console.error("admin/users 排序查询失败，回退注册时间排序：", e);
      idsInOrder = await orderedUserIds(searchedOpenids, "created", pageSize, (page - 1) * pageSize);
    }
    const rows = idsInOrder.length
      ? await User.findAll({
        where: { id: { [Op.in]: idsInOrder } },
        attributes: ["id", "openid", "nickname", "avatar_url", "createdAt"],
        raw: true,
      })
      : [];
    // IN 查询不保证顺序 → 按 idsInOrder 还原（否则排序等于白做）。
    // ⚠️ 必须用 reorderById：原生 SQL 与模型返回的 id 类型可能不一致（字符串 vs 数字），
    //    直接 Map.get 会全部落空 → 列表静默变空（防御性加固，见 admin-query.reorderById 注释）。
    const users = adminQuery.reorderById(rows, idsInOrder);

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
    const scoreMap = new Map(scoreAgg.map((r) => [r.user_id, r]));
    const rankMap = new Map(ranks.map((r) => [r.openid, r]));

    const list = users.map((u) => {
      const s = scoreMap.get(u.id) || {};
      const r = rankMap.get(u.openid) || {};
      const stars = Number(r.stars) || 0;
      return {
        nickname: u.nickname || "未命名",             // 管理员可见完整昵称
        avatarUrl: u.avatar_url || "",                // 头像（此前查了却没返回，列表一直是空的）
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
      data: {
        page, pageSize, total,
        hasMore: page * pageSize < total,
        sort,                 // 实际生效的排序键（前端据此校正显示）
        orderError,           // 非空 = 排序降级了（管理端提示用；正常情况下是空串）
        idCount: idsInOrder.length,   // 诊断：本页命中的用户数（=0 而 total>0 说明排序/筛选有问题）
        list
      },
      message: "ok",
    });
  } catch (err) {
    console.error("GET /api/admin/users 失败：", err);
    // 2026-10-08：把原因带出来。这个接口出过一次「pageSize=50 就 5000、20 却正常」的怪事，
    // 当时只能靠猜（线上日志要翻云托管控制台）。这是**仅管理员可见**的接口，
    // 带上 err.message 不会外泄给普通用户，排查效率却能高一个数量级。
    res.send({
      code: 5000, data: null,
      message: "服务内部错误：" + ((err && err.message) || "未知"),
    });
  }
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
