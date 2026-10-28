const express = require("express");
const crypto = require("crypto");
const { Op } = require("sequelize");
const { PkMatch, User } = require("../db");
const seedUtil = require("../seed");
const grades = require("../grade-keys");
const pkRules = require("../pk-rules");
const time = require("../beijing-time");
const { displayName } = require("../nickname-util");
const { isMissingTable } = require("../table-missing");
const rankRouter = require("./rank");
const subscribe = require("../subscribe");

const router = express.Router();

/** 允许发起 PK 的玩法（题库类 7 款） */
const ALLOWED_MODES = ["shoot", "wordBuild", "link", "match", "idiom", "snake", "quiz"];
const MODE_LABELS = {
  shoot: "字母射击",
  wordBuild: "字母拼词工坊",
  link: "词语连连看",
  match: "词义消消乐",
  idiom: "成语拼字",
  snake: "单词贪吃蛇",
  quiz: "限时抢答"
};

/**
 * 应战通知里的「结果」话术（发起人视角）。
 * 发起人当时不在场，卡片上只写「被应战了」等于没说，得把胜负一起给出来。
 * @param {string} outcome 'challenger'|'opponent'|'draw'
 * @returns {string}
 */
function notifyOutcomeText(outcome) {
  if (outcome === "challenger") return "你赢了";
  if (outcome === "opponent") return "被超过了";
  return "打平";
}

/** 生成 8 位短码（大写 base36，避免小写 l/1 混淆的视觉问题不严重，保持简单） */
function genCode() {
  const n = crypto.randomBytes(6).readUIntBE(0, 6);
  return n.toString(36).toUpperCase().padStart(8, "0").slice(-8);
}

/** 生成一个库里没用过的短码 */
async function uniqueCode() {
  for (let i = 0; i < 6; i++) {
    const code = genCode();
    const exists = await PkMatch.findOne({ where: { code }, attributes: ["matchId"] });
    if (!exists) return code;
  }
  // 极小概率连撞 6 次：退化成带时间戳的长码，保证不失败
  return (Date.now().toString(36) + genCode()).slice(-14).toUpperCase();
}

/** 东八区「今天」的 UTC 起止（用于统计当天 PK 奖励） */
function todayRange() {
  const p = time.beijingParts();
  const start = new Date(Date.UTC(p.y, p.m, p.d) - time.BEIJING_OFFSET);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

/** 战帖时间展示：月-日 时:分（按用户/服务器所在时区展示，绝对时间仍由 ISO 字段保证） */
function dateTimeText(value) {
  const d = new Date(value);
  if (!isFinite(d.getTime())) return "";
  const p = time.beijingParts(d);
  return pad2(p.m + 1) + "-" + pad2(p.d) + " " + pad2(p.hh) + ":" + pad2(p.mm);
}

/** 某用户今天通过 PK 已经拿到的星（用于每日上限封顶） */
async function todayEarned(openid) {
  if (!openid) return 0;
  const { start, end } = todayRange();
  const rows = await PkMatch.findAll({
    where: {
      status: "done",
      finishedAt: { [Op.gte]: start, [Op.lt]: end },
      [Op.or]: [{ challengerOpenid: openid }, { opponentOpenid: openid }]
    },
    raw: true
  });
  let sum = 0;
  rows.forEach(function (r) {
    if (r.challengerOpenid === openid) sum += Math.max(0, parseInt(r.challengerReward, 10) || 0);
    if (r.opponentOpenid === openid) sum += Math.max(0, parseInt(r.opponentReward, 10) || 0);
  });
  return sum;
}

/** 战帖 → 对外结构（不暴露 openid，只给「是不是我」） */
function shapeMatch(row, openid, full) {
  const isChallenger = row.challengerOpenid === openid;
  const isOpponent = row.opponentOpenid === openid;
  const role = isChallenger ? "challenger" : (isOpponent ? "opponent" : "guest");
  const expired = pkRules.isExpired(row.createdAt);
  const expiresAt = new Date(new Date(row.createdAt).getTime() + pkRules.PK_EXPIRE_DAYS * 24 * 3600 * 1000);
  const canAccept = row.status === "open" && !expired && !!openid
    && !isChallenger && (!row.opponentOpenid || isOpponent);
  const data = {
    code: row.code,
    seed: row.seed,
    grade: row.grade,
    lineMode: row.lineMode,
    modeLabel: MODE_LABELS[row.lineMode] || row.lineMode,
    level: row.level,
    status: row.status,
    winner: row.winner,
    expired,
    role,
    canAccept,
    sharePath: "/pages/pk/pk?code=" + row.code,
    createdAt: row.createdAt,
    expiresAt,
    createdText: dateTimeText(row.createdAt),
    expireText: expired ? "已于 " + dateTimeText(expiresAt) + " 过期" : dateTimeText(expiresAt) + " 前有效",
    challenger: {
      nickname: row.challengerNick,
      correct: row.challengerCorrect,
      total: row.challengerTotal,
      ms: row.challengerMs,
      reward: row.challengerReward,
      isMe: isChallenger
    },
    opponent: row.opponentOpenid
      ? {
        nickname: row.opponentNick,
        correct: row.opponentCorrect,
        total: row.opponentTotal,
        ms: row.opponentMs,
        reward: row.opponentReward,
        isMe: isOpponent
      }
      : null
  };
  if (full) {
    data.totalQ = row.challengerTotal || 10;
  }
  return data;
}

function notReady(res, err) {
  console.warn("[pk] 表未就绪：", err && err.message);
  res.send({ code: 0, data: { available: false, message: "好友 PK 功能准备中，请稍后再来" } });
}

 /**
 * POST /api/pk/create
 * body: { grade, lineMode, level, correct, total, durationMs }
 * 发起一张战帖：记下题目种子 + 我的成绩，返回分享短码。
 */
router.post("/create", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const b = req.body || {};
    const grade = String(b.grade || "");
    const lineMode = String(b.lineMode || "");
    const level = Math.max(1, Math.min(30, parseInt(b.level, 10) || 1));
    if (!grades.isValidGrade(grade)) {
      return res.send({ code: 4000, data: null, message: "学段不合法" });
    }
    if (ALLOWED_MODES.indexOf(lineMode) < 0) {
      return res.send({ code: 4000, data: null, message: "该玩法暂不支持 PK" });
    }
    const s = pkRules.normalizeScore({
      correct: b.correct,
      total: b.total,
      ms: b.durationMs
    });
    if (!s) {
      return res.send({ code: 4000, data: null, message: "成绩数据不合法" });
    }

    const user = await User.findOne({ where: { openid } });
    const code = await uniqueCode();
    // 种子优先用客户端传来的（发起人要先按这个种子答题，答完才提交战绩，
    // 所以种子必须由发起端先定下来）；没传则服务端兜底生成。
    // 种子只影响出题，不影响成绩校验（成绩仍走 normalizeScore 校验）。
    const seedIn = parseInt(b.seed, 10);
    const seed = isFinite(seedIn) && seedIn > 0 && seedIn <= 2147483647
      ? seedIn
      : seedUtil.pkSeed(openid, Date.now());
    await PkMatch.create({
      code,
      seed,
      grade,
      lineMode,
      level,
      challengerOpenid: openid,
      challengerNick: displayName(user && user.nickname, openid),
      challengerCorrect: s.correct,
      challengerTotal: s.total,
      challengerMs: s.ms
    });

    res.send({
      code: 0,
      data: {
        available: true,
        code,
        seed,
        grade,
        lineMode,
        modeLabel: MODE_LABELS[lineMode],
        level,
        totalQ: s.total,
        sharePath: "/pages/pk/pk?code=" + code
      }
    });
  } catch (err) {
    if (isMissingTable(err)) return notReady(res, err);
    console.error("POST /api/pk/create 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/pk/my —— 我的战帖（我发起的 + 我应战的），最近 30 条
 * ⚠️ 必须声明在 /:code 之前，否则会被 /:code 捕获。
 */
router.get("/my", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const rows = await PkMatch.findAll({
      where: { [Op.or]: [{ challengerOpenid: openid }, { opponentOpenid: openid }] },
      order: [["createdAt", "DESC"]],
      limit: 30
    });
    const list = rows.map(function (row) {
      const m = shapeMatch(row, openid, false);
      let myScore = null;
      let oppScore = null;
      let iWin = false;
      let myReward = 0;
      if (m.role === "challenger") {
        myScore = row.challengerCorrect; oppScore = row.opponentCorrect;
        myReward = row.challengerReward;
        iWin = row.winner === "challenger";
      } else if (m.role === "opponent") {
        myScore = row.opponentCorrect; oppScore = row.challengerCorrect;
        myReward = row.opponentReward;
        iWin = row.winner === "opponent";
      }
      return {
        code: m.code,
        // lineMode 给端上「再战」用（原来只给了中文 modeLabel，端上无法据此重开同一款玩法）
        lineMode: m.lineMode,
        modeLabel: m.modeLabel,
        grade: m.grade,
        level: m.level,
        status: m.status,
        expired: m.expired,
        role: m.role,
        opponentNickname: m.role === "challenger"
          ? (m.opponent ? m.opponent.nickname : "等待应战")
          : m.challenger.nickname,
        myScore,
        oppScore,
        winner: m.winner,
        iWin,
        isDraw: m.winner === "draw",
        myReward,
        createdAt: m.createdAt,
        expiresAt: m.expiresAt,
        createdText: m.createdText,
        expireText: m.expireText
      };
    });
    res.send({ code: 0, data: { available: true, list } });
  } catch (err) {
    if (isMissingTable(err)) return notReady(res, err);
    console.error("GET /api/pk/my 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/pk/:code —— 战帖详情（分享落地页用）
 */
router.get("/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").toUpperCase();
    if (!/^[0-9A-Z]{6,14}$/.test(code)) {
      return res.send({ code: 4000, data: null, message: "战帖码不合法" });
    }
    const row = await PkMatch.findOne({ where: { code } });
    if (!row) {
      return res.send({ code: 4000, data: null, message: "战帖不存在或已失效" });
    }
    res.send({ code: 0, data: shapeMatch(row, req.openid, true) });
  } catch (err) {
    if (isMissingTable(err)) return notReady(res, err);
    console.error("GET /api/pk/:code 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/pk/:code/accept
 * body: { correct, total, durationMs }
 * 应战：写入我的成绩 → 判胜负 → 发奖励星（每天封顶 10 星）。
 *
 * 2026-10-28 起发起人额外拿「邀请回执」+1 星（PK_INVITE_BONUS）：战帖被好友应战
 * 就发，不论输赢。否则分享出去对发起人是零回执 —— 分享链在这里断了。
 * 这份奖励计入 PK_DAILY_CAP，与胜负奖励共用一个上限，不能单独刷。
 */
router.post("/:code/accept", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const code = String(req.params.code || "").toUpperCase();
    const row = await PkMatch.findOne({ where: { code } });
    if (!row) {
      return res.send({ code: 4000, data: null, message: "战帖不存在或已失效" });
    }
    if (row.status === "done") {
      return res.send({ code: 4000, data: null, message: "这张战帖已经打完了" });
    }
    if (row.challengerOpenid === openid) {
      return res.send({ code: 4000, data: null, message: "不能应战自己发起的战帖" });
    }
    if (row.opponentOpenid && row.opponentOpenid !== openid) {
      return res.send({ code: 4000, data: null, message: "这张战帖已经被其他好友应战了" });
    }
    if (pkRules.isExpired(row.createdAt)) {
      return res.send({ code: 4000, data: null, message: "战帖已过期（超过 " + pkRules.PK_EXPIRE_DAYS + " 天）" });
    }
    const s = pkRules.normalizeScore({
      correct: req.body && req.body.correct,
      total: req.body && req.body.total,
      ms: req.body && req.body.durationMs
    });
    if (!s) {
      return res.send({ code: 4000, data: null, message: "成绩数据不合法" });
    }

    const challenger = {
      correct: row.challengerCorrect,
      total: row.challengerTotal,
      ms: row.challengerMs
    };
    const outcome = pkRules.outcomeOf(challenger, s);
    const myEarned = await todayEarned(openid);
    const chEarned = await todayEarned(row.challengerOpenid);
    const myReward = pkRules.capDaily(myEarned, pkRules.rewardOf(outcome, false));
    // 发起人这一边多一份「邀请回执」（2026-10-28）：战帖被应战就 +1 星，不论输赢。
    // 幂等天然成立 —— 本分支跑完 status 就变 done，第二次进入会被上面的「已经打完了」拦住。
    const chBase = pkRules.challengerBaseOf(outcome);
    const chReward = pkRules.capDaily(chEarned, chBase);
    // 实际发出去的邀请星（日上限不够时会先保证胜负奖励，见 capDaily 的截断顺序）
    const chInviteGranted = Math.max(0, chReward - Math.min(chBase - pkRules.PK_INVITE_BONUS, chReward));

    const user = await User.findOne({ where: { openid } });
    await row.update({
      opponentOpenid: openid,
      opponentNick: displayName(user && user.nickname, openid),
      opponentCorrect: s.correct,
      opponentTotal: s.total,
      opponentMs: s.ms,
      opponentReward: myReward,
      challengerReward: chReward,
      status: "done",
      winner: outcome,
      finishedAt: new Date()
    });

    // 奖励星落库后重算双方段位（与签到同一套：从表求和，不直接累加）
    for (const o of [openid, row.challengerOpenid]) {
      try {
        await rankRouter.syncRankStars(o);
      } catch (e) {
        console.error("PK 结算后重算段位星失败（不影响对战结果）：", e && e.message);
      }
    }

    // 订阅消息（2026-10-28）：战帖被应战 → 通知发起人回来看结果。
    // 旁路动作，**不 await**：模板没配、用户没额度、微信超时，都不该拖住应战响应。
    // sendScene 内部已吞掉全部异常，这里再兜一层是防「未处理的 rejection」。
    subscribe
      .sendScene(
        row.challengerOpenid,
        "pk_accept",
        {
          opponent: row.opponentNick,
          // 「对手」两字不能省：卡片上 thing1 是对方昵称，thing2 若只写「8/10 题 · 你赢了」，
          // 发起人会读成自己的成绩 —— 他当时不在场，没有上下文可纠正。
          scoreText: "对手 " + s.correct + "/" + s.total + " 题 · " + notifyOutcomeText(outcome),
          at: Date.now()
        },
        { page: "pages/pk/pk?code=" + code }
      )
      .catch(function () {});

    res.send({
      code: 0,
      data: {
        outcome,
        winner: outcome,
        myReward,
        challengerReward: chReward,
        challengerInvite: chInviteGranted,
        cappedDaily: myReward < pkRules.rewardOf(outcome, false),
        match: shapeMatch(row, openid, true)
      }
    });
  } catch (err) {
    if (isMissingTable(err)) return notReady(res, err);
    console.error("POST /api/pk/:code/accept 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
