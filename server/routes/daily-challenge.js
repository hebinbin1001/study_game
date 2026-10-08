const express = require("express");
const { DailyScore, sequelize } = require("../db");
const time = require("../beijing-time");
const seedUtil = require("../seed");
const grades = require("../grade-keys");
const { displayName } = require("../nickname-util");
const { isMissingTable } = require("../table-missing");
const { displayScore } = require("../score-formula");

const router = express.Router();

/** 每日挑战固定 10 题（与其它玩法口径一致，方便对比） */
const TOTAL_Q = 10;
/** 单次挑战用时上限（毫秒）：超过视为异常数据，直接拒绝 */
const MAX_MS = 30 * 60 * 1000;
/** 榜单默认条数 */
const DEFAULT_LIMIT = 20;

/** 展示用分数：答对数为主，用时越短加分越多（与 PK 共用同一公式） */
const scoreOf = displayScore;

/** 校验并归一化提交数据 */
function normSubmit(body) {
  const b = body || {};
  const grade = String(b.grade || "");
  const correct = parseInt(b.correct, 10);
  const total = parseInt(b.total, 10);
  const durationMs = parseInt(b.durationMs, 10);
  if (!grades.isValidGrade(grade)) return { err: "学段不合法" };
  if (!isFinite(correct) || !isFinite(total) || !isFinite(durationMs)) return { err: "成绩字段不完整" };
  if (total !== TOTAL_Q) return { err: "题数不匹配（应为 " + TOTAL_Q + "）" };
  if (correct < 0 || correct > total) return { err: "答对数不合法" };
  if (durationMs < 1000 || durationMs > MAX_MS) return { err: "用时不合法" };
  return { grade, correct, total, durationMs };
}

/** a 是否优于 b（先比答对数，再比用时） */
function isBetter(a, b) {
  if (!b) return true;
  if (a.correct !== b.correct) return a.correct > b.correct;
  return a.durationMs < b.durationMs;
}

/** 榜单行 → 对外结构 */
function shapeRow(r, rank, openid) {
  return {
    rank,
    nickname: displayName(r.nickname, r.openid),
    avatarUrl: r.avatar_url || "",
    correct: parseInt(r.correct, 10) || 0,
    total: parseInt(r.total, 10) || 0,
    durationMs: parseInt(r.durationMs, 10) || 0,
    score: parseInt(r.score, 10) || 0,
    isMe: !!openid && r.openid === openid,
  };
}

/** 查某日某学段榜单（Top N） */
async function topOf(dateKey, grade, limit) {
  const cap = Math.max(1, Math.min(100, parseInt(limit, 10) || DEFAULT_LIMIT));
  const [rows] = await sequelize.query(
    `SELECT d.openid, d.correct, d.total, d.durationMs, d.score,
            u.nickname, u.avatar_url
       FROM daily_scores d
       JOIN users u ON u.openid = d.openid
      WHERE d.dateKey = :dateKey AND d.grade = :grade
      ORDER BY d.correct DESC, d.durationMs ASC, d.createdAt ASC
      LIMIT ${cap}`,
    { replacements: { dateKey, grade } }
  );
  return rows.map((r, i) => shapeRow(r, i + 1));
}

/** 算「我」在该日该学段的排名（1 起；未参赛返回 0） */
async function rankOf(dateKey, grade, openid, correct, durationMs) {
  if (!openid) return 0;
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS n
       FROM daily_scores d
      WHERE d.dateKey = :dateKey AND d.grade = :grade
        AND (d.correct > :correct OR (d.correct = :correct AND d.durationMs < :durationMs))`,
    { replacements: { dateKey, grade, correct, durationMs } }
  );
  return (parseInt(rows[0] && rows[0].n, 10) || 0) + 1;
}

/** 统一的「功能未就绪」响应：DDL 没跑时不 500，端上展示引导文案 */
function notReady(res, err) {
  console.warn("[dailychallenge] 表未就绪：", err && err.message);
  res.send({
    code: 0,
    data: { available: false, message: "每日挑战功能准备中，请稍后再来" },
  });
}

/**
 * GET /api/dailychallenge/info?grade=g3
 * 返回今日日期、题目种子、我的最好成绩、今日榜。
 */
router.get("/info", async (req, res) => {
  try {
    const grade = String(req.query.grade || "");
    if (!grades.isValidGrade(grade)) {
      return res.send({ code: 4000, data: null, message: "学段不合法" });
    }
    const dateKey = time.todayKey();
    const seed = seedUtil.dailySeed(dateKey, grade);

    let best = null;
    if (req.openid) {
      const row = await DailyScore.findOne({ where: { openid: req.openid, dateKey } });
      if (row) {
        best = {
          correct: row.correct,
          total: row.total,
          durationMs: row.durationMs,
          score: row.score,
          rank: await rankOf(dateKey, grade, req.openid, row.correct, row.durationMs),
        };
      }
    }
    const top = await topOf(dateKey, grade, DEFAULT_LIMIT);
    res.send({
      code: 0,
      data: { available: true, dateKey, seed, grade, totalQ: TOTAL_Q, best, top },
    });
  } catch (err) {
    if (isMissingTable(err)) return notReady(res, err);
    console.error("GET /api/dailychallenge/info 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/dailychallenge/submit
 * body: { grade, correct, total, durationMs }
 * 同一人当天只保留最好成绩。
 */
router.post("/submit", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const s = normSubmit(req.body);
    if (s.err) return res.send({ code: 4000, data: null, message: s.err });

    const dateKey = time.todayKey();
    const score = scoreOf(s.correct, s.durationMs);
    const existing = await DailyScore.findOne({ where: { openid, dateKey } });

    let improved = false;
    if (isBetter(s, existing)) {
      if (existing) {
        await existing.update({
          grade: s.grade,
          correct: s.correct,
          total: s.total,
          durationMs: s.durationMs,
          score,
        });
      } else {
        try {
          await DailyScore.create({
            openid,
            dateKey,
            grade: s.grade,
            correct: s.correct,
            total: s.total,
            durationMs: s.durationMs,
            score,
          });
        } catch (e) {
          // 并发下唯一索引冲突：重新读一次，按「更优才覆盖」再走一遍
          const again = await DailyScore.findOne({ where: { openid, dateKey } });
          if (again && isBetter(s, again)) {
            await again.update({
              grade: s.grade,
              correct: s.correct,
              total: s.total,
              durationMs: s.durationMs,
              score,
            });
          }
        }
      }
      improved = true;
    }

    const bestRow = await DailyScore.findOne({ where: { openid, dateKey } });
    const best = bestRow
      ? {
        correct: bestRow.correct,
        total: bestRow.total,
        durationMs: bestRow.durationMs,
        score: bestRow.score,
        rank: await rankOf(dateKey, s.grade, openid, bestRow.correct, bestRow.durationMs),
      }
      : null;
    const top = await topOf(dateKey, s.grade, DEFAULT_LIMIT);
    res.send({
      code: 0,
      data: { available: true, improved, dateKey, best, top },
    });
  } catch (err) {
    if (isMissingTable(err)) return notReady(res, err);
    console.error("POST /api/dailychallenge/submit 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/dailychallenge/rank?grade=g3&dateKey=2026-10-08&limit=20
 * 支持查历史某天的榜（dateKey 省略 = 今天）。
 */
router.get("/rank", async (req, res) => {
  try {
    const grade = String(req.query.grade || "");
    if (!grades.isValidGrade(grade)) {
      return res.send({ code: 4000, data: null, message: "学段不合法" });
    }
    const dateKey = time.todayKey(req.query.dateKey ? req.query.dateKey + "T12:00:00+08:00" : undefined);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.send({ code: 4000, data: null, message: "日期不合法" });
    }
    const top = await topOf(dateKey, grade, req.query.limit);
    let me = null;
    if (req.openid) {
      const row = await DailyScore.findOne({ where: { openid: req.openid, dateKey } });
      if (row) {
        me = {
          correct: row.correct,
          total: row.total,
          durationMs: row.durationMs,
          score: row.score,
          rank: await rankOf(dateKey, grade, req.openid, row.correct, row.durationMs),
        };
      }
    }
    res.send({ code: 0, data: { available: true, dateKey, grade, top, me } });
  } catch (err) {
    if (isMissingTable(err)) return notReady(res, err);
    console.error("GET /api/dailychallenge/rank 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
