const express = require("express");
const { User, Score } = require("../db");
// 复用 rank 路由里挂的「重算段位星」实现（每关历史最高星去重），见 rank.js 的说明
const rankRouter = require("./rank");
const { isBanned, pausedGames } = require("../admin-controls");
const {
  CODE,
  SCORE_PER_QUESTION,
  starsByRate,
  ratePercent,
} = require("../constants");

const router = express.Router();

// 关卡题数的合理上限（防御极端入参导致的巨型数据）
const MAX_TOTAL_Q = 100;
// 学段标识最大长度（对齐 scores.grade STRING(16)）
const MAX_GRADE_LEN = 16;

/**
 * GET /api/score/history
 * 返回当前用户每个（玩法/学段/题型/关卡）的历史最高成绩，供端上恢复被系统清理的 ww_stars。
 */
router.get("/history", async (req, res) => {
  try {
    if (!req.openid) {
      return res.send({ code: CODE.USER_UNKNOWN, data: null, message: "未识别用户（openid 缺失）" });
    }
    const user = await User.findOne({ where: { openid: req.openid } });
    if (!user) {
      return res.send({ code: 0, data: { totalRows: 0, history: [] } });
    }
    const rows = await Score.findAll({
      where: { user_id: user.id },
      attributes: [
        "game_type",
        "grade",
        "type_key",
        "level",
        "stars",
        "score",
        "correct_count",
        "total_q",
        "createdAt",
      ],
      order: [["createdAt", "ASC"]],
      raw: true,
    });
    const best = new Map();
    rows.forEach((row) => {
      const key = [
        row.game_type || "word_warrior",
        row.grade || "",
        row.type_key || "",
        row.level == null ? "" : row.level,
      ].join("|");
      const stars = Math.max(0, Math.min(3, Number(row.stars) || 0));
      const prev = best.get(key);
      if (!prev || stars > prev.stars) {
        best.set(key, {
          gameType: row.game_type || "word_warrior",
          grade: row.grade || "",
          typeKey: row.type_key || "",
          level: Number(row.level) || 0,
          stars,
          score: Number(row.score) || 0,
          correctCount: Number(row.correct_count) || 0,
          totalQ: Number(row.total_q) || 0,
          createdAt: row.createdAt,
        });
      }
    });
    res.send({
      code: CODE.OK,
      data: {
        totalRows: rows.length,
        history: Array.from(best.values()),
      },
    });
  } catch (err) {
    console.error("GET /api/score/history 失败：", err);
    res.send({ code: CODE.INTERNAL_ERROR, data: null, message: "服务内部错误" });
  }
});

/**
 * 校验并规范化成绩上报入参（REQ-API-4，加固版）。
 *
 * ── 服务端推导策略 ──────────────────────────────────────────────
 * score / stars / maxCombo 原由客户端自报且无一致性校验，可被任意伪造刷分。
 * 现改为：客户端只上报「业务输入」（grade/level/correctCount/totalQ），
 *   1) score  = correctCount × 每题得分（服务端推导，忽略客户端 score）；
 *   2) stars  = 由正确率(correctCount/totalQ)按星级阈值推导（忽略客户端 stars）；
 *   3) maxCombo 无法由答对数推导（依赖答对顺序），仅做合理性校正：
 *      可选字段，缺省 0，提供时夹取到 [0, correctCount]（连击不可能超过答对数）。
 * 明显超限/与推导不一致的自报字段将被拒绝或校正，杜绝直接写入。
 *
 * ── 例外：totalQ=0 的「非答题记录」（2026-10-28 用户拍板 A） ──────────
 * 数独/华容道/2048 这类玩法没有逐题正确率，只剩「这关值几星」。原来客户端会按
 * 3 星=10/10 编一组样本骗过上面的推导 —— 星级对了，但学习报告里凭空多出「答对 10 题」。
 * 现在允许 totalQ=0（同时要求 correctCount=0）表示「本局无题目」：score 记 0，
 * 星级直接落客户端自报值（校验 0~3 的整数）。学习报告的题量与正确率只统计 total_q>0，
 * 这类记录自然被排除，而星星、游玩局数、玩法进度榜照常。
 *
 * @param {Object} body 请求体
 * @returns {Object|null} 规范化后的落库记录；入参缺失/非法返回 null
 */
function normalizeScoreBody(body) {
  if (!body || typeof body !== "object") return null;

  const { grade, level, correctCount, totalQ } = body;

  // grade：非空字符串
  if (typeof grade !== "string") return null;
  const gradeTrimmed = grade.trim();
  if (!gradeTrimmed || gradeTrimmed.length > MAX_GRADE_LEN) return null;

  // 题型分类 key（B3：'' 或 'all' 归一为综合；其余校验非空且短）
  let typeKey = "";
  if (typeof body.type === "string") {
    const t = body.type.trim();
    if (t && t !== "all") typeKey = t;
    if (typeKey.length > 16) return null;
  }
  // 玩法维度（B3：默认字词玩法，白名单外忽略）
  let gameType = "word_warrior";
  if (typeof body.game_type === "string" && /^[a-z0-9_]{1,24}$/.test(body.game_type)) {
    gameType = body.game_type;
  }

  // level / totalQ / correctCount：非负整数（totalQ=0 见下面「非答题记录」分支）
  if (!Number.isInteger(level) || level < 1) return null;
  if (!Number.isInteger(totalQ) || totalQ < 0 || totalQ > MAX_TOTAL_Q) return null;
  if (!Number.isInteger(correctCount) || correctCount < 0) return null;
  if (correctCount > totalQ) return null;

  // 非答题记录：休闲/益智玩法（数独、华容道、2048…）没有题目，total_q 落 0。
  // 星级由玩法自己判（服务端只校验 0~3），题量/正确率写 0 → 学习报告不统计这一局。
  // 攻击面与改造前持平：以前客户端也能自称 correct=10/total=10 换 3 星。
  if (totalQ === 0) {
    if (correctCount !== 0) return null;
    const claimed = (body.stars === undefined || body.stars === null) ? 0 : body.stars;
    if (!Number.isInteger(claimed) || claimed < 0 || claimed > 3) return null;
    return {
      grade: gradeTrimmed,
      type_key: typeKey,
      game_type: gameType,
      level,
      score: 0,
      correct_count: 0,
      total_q: 0,
      max_combo: 0,
      stars: claimed,
    };
  }

  // maxCombo：可选（前端旧版本可能不传），缺省 0；提供时校正到 [0, correctCount]
  let maxCombo = 0;
  if (body.maxCombo !== undefined && body.maxCombo !== null) {
    if (!Number.isInteger(body.maxCombo) || body.maxCombo < 0) return null;
    // 最大连击不可能超过答对题数，超出自报值按答对数封顶校正
    maxCombo = Math.min(body.maxCombo, correctCount);
  }

  // 服务端推导得分与星级（忽略客户端自报的 score / stars）
  const score = correctCount * SCORE_PER_QUESTION;
  const ratePct = ratePercent(correctCount, totalQ);
  const stars = starsByRate(ratePct);

  return {
    grade: gradeTrimmed,
    type_key: typeKey,
    game_type: gameType,
    level,
    score,
    correct_count: correctCount,
    total_q: totalQ,
    max_combo: maxCombo,
    stars,
  };
}

/**
 * POST /api/score —— 上报一局成绩（REQ-API-4）
 *
 * 用户不存在时自动建档（users 表 upsert openid），随后写入成绩记录。
 * 字段缺失/非法 → { code: 3001 }；无 openid → { code: 1001 }；
 * 成功 → { code: 0, data: { recordId } }。
 */
router.post("/", async (req, res) => {
  try {
    const record = normalizeScoreBody(req.body);
    if (!record) {
      return res.send({
        code: CODE.SCORE_INVALID,
        data: null,
        message: "成绩上报字段缺失或非法",
      });
    }

    if (!req.openid) {
      return res.send({
        code: CODE.USER_UNKNOWN,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }
    if (await isBanned(req.openid)) {
      return res.send({
        code: CODE.USER_UNKNOWN,
        data: null,
        message: "账号已被管理员暂停，请联系管理员",
      });
    }
    const paused = await pausedGames();
    if (paused.indexOf(record.game_type) >= 0) {
      return res.send({
        code: CODE.SCORE_INVALID,
        data: null,
        message: "该玩法已暂停开放",
      });
    }

    // 用户 upsert：存在即取，不存在即按 openid 建档（对应 POST /api/user 语义）
    const [user] = await User.findOrCreate({
      where: { openid: req.openid },
      defaults: { openid: req.openid },
    });

    const created = await Score.create({
      ...record,
      user_id: user.id,
    });

    // 段位星走「每关历史最高星去重」口径（2026-09-13 用户拍板 (C)）：
    // 每次上报后重算，避免同一关反复刷重复叠星。失败不影响成绩上报本身。
    try {
      await rankRouter.syncRankStars(req.openid);
    } catch (e) {
      console.error("POST /api/score 后重算段位星失败（不影响上报）：", e && e.message);
    }

    res.send({ code: CODE.OK, data: { recordId: created.id } });
  } catch (err) {
    console.error("POST /api/score 失败：", err);
    res.send({
      code: CODE.INTERNAL_ERROR,
      data: null,
      message: "服务内部错误",
    });
  }
});

/**
 * GET /api/score/best —— 查询历史最佳成绩（REQ-API-4）
 * ?grade=xxx&level=N
 * 无 openid → { code: 1001 }；参数缺失/非法 → { code: 3001 }；
 * 成功 → { code: 0, data: { bestStars, bestScore } }（无历史记录时为 0）。
 */
router.get("/best", async (req, res) => {
  try {
    const { grade, level } = req.query;

    // 学段与关卡参数缺失/非法视为入参错误
    if (!grade || grade.trim() === "") {
      return res.send({
        code: CODE.SCORE_INVALID,
        data: null,
        message: "成绩查询参数缺失或非法",
      });
    }
    const levelNum = Number(level);
    if (!Number.isInteger(levelNum) || levelNum < 1) {
      return res.send({
        code: CODE.SCORE_INVALID,
        data: null,
        message: "成绩查询参数缺失或非法",
      });
    }

    if (!req.openid) {
      return res.send({
        code: CODE.USER_UNKNOWN,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    // 用户 upsert：新用户查询属合法场景，无历史时按 0 返回
    const [user] = await User.findOrCreate({
      where: { openid: req.openid },
      defaults: { openid: req.openid },
    });

    // 取该「学段+关卡」下星级最高、得分最高的一条记录
    const best = await Score.findOne({
      where: { user_id: user.id, grade: grade.trim(), level: levelNum },
      order: [
        ["stars", "DESC"],
        ["score", "DESC"],
      ],
    });

    res.send({
      code: CODE.OK,
      data: {
        grade: grade.trim(),
        level: levelNum,
        bestStars: best ? best.stars : 0,
        bestScore: best ? best.score : 0,
      },
    });
  } catch (err) {
    console.error("GET /api/score/best 失败：", err);
    res.send({
      code: CODE.INTERNAL_ERROR,
      data: null,
      message: "服务内部错误",
    });
  }
});

module.exports = router;
// 附加导出纯函数，供单元/冒烟测试与前端契约核对复用（不影响作为 router 挂载）
module.exports.normalizeScoreBody = normalizeScoreBody;
