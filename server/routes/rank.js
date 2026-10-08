const express = require("express");
const { RankRecord, User, Score, CheckinRecord } = require("../db");
// 段位阶梯（8 大段 × 9 小级 = 72 级，按累计星数晋升）—— 唯一口径，见 rank-ladder.js
const ladder = require("../rank-ladder");
const { dedupeStars } = require("../rank-stars");
const { totalBonus } = require("../checkin-rewards");
const examGate = require("../exam-gate");
const { sequelize } = require("../db");

const router = express.Router();

/**
 * 读「已通过晋级考试的最高大段 key」（2026-10-08 新增）。
 *
 * 为什么用原生 SQL：`exam_cleared_tier` 列**故意不写进 Sequelize 模型** ——
 * 一旦写进去，Sequelize 默认 SELECT 全字段，生产库还没加列时所有读用户表的接口直接 5000
 * （wx_nickname 那轮踩过一模一样的坑）。列不存在时这里降级成空串（= 从没考过）。
 *
 * @param {string} openid
 * @returns {Promise<string>}
 */
async function examClearedTier(openid) {
  if (!openid) return "";
  try {
    const [rows] = await sequelize.query(
      "SELECT exam_cleared_tier FROM users WHERE openid = :o LIMIT 1",
      { replacements: { o: openid } }
    );
    const r = (rows && rows[0]) || {};
    return r.exam_cleared_tier || "";
  } catch (e) {
    return "";   // 列不存在（DDL 未执行）→ 按「没考过」处理，不影响别的功能
  }
}

/**
 * 按「每关历史最高星」重算并写回该用户的段位星（2026-09-13 用户拍板 (C)）。
 *
 * 为什么不让客户端自报、也不累加：
 *   · 原来前端一直 POST /api/rank/sync，但服务端**没有这个路由**（404 静默失败），
 *     段位星只有签到会涨；
 *   · 补上后若直接 `stars += 客户端值`，同一关反复刷就会重复叠星 —— 这正是「太容易满级」的根因。
 * 所以：服务端从 scores 表按 (game_type, grade, type_key, level) 取每关最高星，求和后**覆盖写**。
 * @returns {Promise<number>} 重算后的星星数
 */
async function syncRankStars(openid) {
  try {
    return await doSyncRankStars(openid);
  } catch (e) {
    lastSyncError = (e && e.message) || String(e);
    console.error("syncRankStars 失败：", lastSyncError);
    throw e;
  }
}

/** 同步失败信息（管理端展示，定位「段位不更新」用） */
let lastSyncError = "";
let lastSyncAt = null;

async function doSyncRankStars(openid) {
  // ⚠️ scores 表存的是 user_id（没有 openid 列）—— 直接按 openid 查会 SQL 报错，
  //    线上冒烟就是这么抓出来的（authed 返回 5000）。这里先换 user_id 再取成绩。
  const user = await User.findOne({ where: { openid } });
  const rows = user
    ? await Score.findAll({
      where: { user_id: user.id },
      attributes: ["game_type", "grade", "type_key", "level", "stars"],
      raw: true,
    })
    : [];
  // 段位星 = 答题去重星（按 玩法×学段×题型×关卡 取历史最高）+ 签到累计奖励
  // （签到奖励按 checkin_records 的连续天数重算，不需要给表加列）
  const checkinRows = await CheckinRecord.findAll({
    where: { openid },
    attributes: ["streak"],
    raw: true,
  });
  const stars = dedupeStars(rows) + totalBonus(checkinRows);
  const [record] = await RankRecord.findOrCreate({
    where: { openid },
    defaults: { openid, rankId: 1, wins: 0, stars: 0 },
  });
  // 同时把 rankId 写成「按当前曲线现算的大段位」——排行榜旧实现读的就是这个字段，
  // 不写回的话曲线改了它不会变（段位类皮肤解锁也依赖它）。
  const rankId = ladder.rankOf(stars).rankId;
  if (record.stars !== stars || record.rankId !== rankId) {
    record.stars = stars;
    record.rankId = rankId;
    await record.save();
  }
  lastSyncAt = new Date();
  lastSyncError = "";
  return stars;
}

/**
 * POST /api/rank/sync —— 重算段位星（幂等；忽略客户端自报的 stars）
 * 前端每次通关后都会调这个接口（历史遗留），现在服务端真正实现了它。
 */
router.post("/sync", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const stars = await syncRankStars(openid);
    const cur = ladder.rankOf(stars);
    res.send({
      code: 0,
      data: { stars, rankId: cur.rankId, rankName: cur.rankName },
      message: "ok",
    });
  } catch (err) {
    console.error("POST /api/rank/sync 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

// 供 score.js 复用（注意文件末尾是 module.exports = router，不能直接挂 module.exports）
router.syncRankStars = syncRankStars;
router.syncRankDiagnostics = function () { return { lastSyncAt: lastSyncAt, lastSyncError: lastSyncError }; };
router.dedupeStars = dedupeStars;

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

    const rankRecord = await RankRecord.findOne({ where: { openid } });
    const wins = rankRecord ? rankRecord.wins : 0;
    const rawStars = rankRecord ? rankRecord.stars : 0;

    // 晋级考试封顶（2026-10-08 用户拍板）：没考过下一个大段的考试 → 星星与段位都卡在当前大段最高级。
    // 库里的星星照常涨（下一段考试一过就自动「解锁」这些星），但**对外展示**走封顶值，
    // 这样段位、星数、以及端上的各种进度条三处口径一致，不会出现「星星涨了段位不动」的割裂感。
    const cleared = await examClearedTier(openid);
    const stars = examGate.cappedStars(rawStars, cleared);

    // 段位由累计星数现算（无需改表：rankId 仍是大段位，与皮肤解锁口径兼容）
    const cur = ladder.rankOf(stars);
    const prog = ladder.progressOf(stars);

    res.send({
      code: 0,
      data: {
        rankId: cur.rankId,
        rankLevel: cur.rankLevel,
        rankCell: cur.cell,
        rankName: cur.rankName,
        icon: cur.icon,
        nextRankName: prog.nextRankName,
        starsForNext: prog.starsForNext,
        starsNeeded: prog.starsNeeded,
        progressPercent: prog.progressPercent,
        isMaxRank: prog.isMaxRank,
        wins,
        stars,                 // 展示用（晋级考试封顶后）
        rawStars,              // 真实累计（诊断/调试用，前端不展示）
        examClearedTier: cleared,
        needExam: examGate.needsExam(rawStars, cleared),
        nextExamTier: examGate.needsExam(rawStars, cleared)
          ? examGate.nextTierToExam(cleared) : "",
      },
    });
  } catch (err) {
    console.error("GET /api/rank/info 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/rank/exam/pass —— 记录「晋级考试通过」（2026-10-08）
 *
 * 入参：{ tier }（刚通过的那个大段 key，可省略）
 * 规则：**一档一档往上考**，不能跳级 —— 服务端按「已通过的大段」自己算下一场该考谁，
 *       客户端传的 tier 只用来对账（不匹配就拒绝），防止改包跳级。
 *
 * ⚠️ 这是唯一写 exam_cleared_tier 的地方；星星本身不动（走封顶口径，见 exam-gate.js）。
 */
router.post("/exam/pass", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const cleared = await examClearedTier(openid);
    const next = examGate.nextTierToExam(cleared);
    if (!next) {
      return res.send({ code: 0, data: { examClearedTier: cleared }, message: "已到顶，无需再考" });
    }

    const want = String((req.body && req.body.tier) || "").trim();
    if (want && want !== next) {
      return res.send({
        code: 4000, data: null,
        message: "考试目标不匹配（当前应考：" + next + "）",
      });
    }

    await sequelize.query(
      "UPDATE users SET exam_cleared_tier = :t WHERE openid = :o",
      { replacements: { t: next, o: openid } }
    );
    res.send({ code: 0, data: { examClearedTier: next }, message: "ok" });
  } catch (err) {
    console.error("POST /api/rank/exam/pass 失败：", err);
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

    const rankRecord = await RankRecord.findOne({ where: { openid } });
    const stars = rankRecord ? rankRecord.stars : 0;
    const wins = rankRecord ? rankRecord.wins : 0;
    const cur = ladder.rankOf(stars);
    const prog = ladder.progressOf(stars);

    res.send({
      code: 0,
      data: {
        currentRank: {
          rankId: cur.rankId,
          rankLevel: cur.rankLevel,
          rankCell: cur.cell,
          rankName: cur.rankName,
          icon: cur.icon,
        },
        nextRank: prog.nextRankName ? { rankName: prog.nextRankName } : null,
        stars,
        wins,
        starsForNext: prog.starsForNext,
        starsNeeded: prog.starsNeeded,
        progressPercent: prog.progressPercent,
        isMaxRank: prog.isMaxRank,
      },
    });
  } catch (err) {
    console.error("GET /api/rank/progress 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
