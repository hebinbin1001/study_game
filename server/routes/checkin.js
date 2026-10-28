const express = require("express");
const { Op } = require("sequelize");
const { CheckinRecord, RankRecord, User, Score, MakeupCard, sequelize } = require("../db");
// 签到奖励口径（2026-09-13 重标）：每天 1 星 + 里程碑 2/5/8/15，见 server/checkin-rewards.js
const { rewardForStreak } = require("../checkin-rewards");
// 补签卡口径（2026-10-29）：严格连续 7 天发 1 张、只能补昨天，见 server/makeup-card.js
const makeupRules = require("../makeup-card");
// 签到核心（2026-10-29 抽出）：与 routes/daily.js 的每日一题打卡共用一份实现
const { doCheckin } = require("../checkin-core");
const rankRouter = require("./rank");
const time = require("../beijing-time");

const router = express.Router();

/**
 * POST /api/checkin —— 手动签到
 */
router.post("/", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const r = await doCheckin(openid);
    if (r.already) {
      return res.send({ code: 4000, data: null, message: "今日已签到" });
    }
    res.send({ code: 0, data: r });
  } catch (err) {
    console.error("POST /api/checkin 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/checkin/auto —— 学习自动打卡（M6-E）
 * 今日已产生成绩（完成过一次闯关）才视为达成学习目标，自动签到；未学习不打卡。
 * 返回：{ checkedIn: false, reason: 'no_learn' } / { checkedIn:true, already? / 签到结果 }
 */
router.post("/auto", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const user = await User.findOne({ where: { openid } });
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }

    // 今日是否完成学习（存在成绩记录）
    const p = time.beijingParts();
    const startOfToday = time.beijingMidnightUtc(p.y, p.m, p.d);
    const todayScore = await Score.count({
      where: { user_id: user.id, createdAt: { [Op.gte]: startOfToday } },
    });
    if (todayScore < 1) {
      return res.send({ code: 0, data: { checkedIn: false, reason: "no_learn" } });
    }

    const r = await doCheckin(openid);
    if (r.already) {
      return res.send({ code: 0, data: { checkedIn: true, already: true } });
    }
    res.send({ code: 0, data: Object.assign({ checkedIn: true }, r) });
  } catch (err) {
    console.error("POST /api/checkin/auto 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * 补签卡状态（卡数 / 能不能补 / 补哪天 / 不能补的原因）。
 *
 * 为什么单独查最近几天，而不复用 GET / 里那份 records：那份受 `month` 参数影响，
 * 今天正好是 1 号时，昨天和前天的记录根本不在数组里，补签判断会错成「前天没签」。
 *
 * @param {string} openid
 * @param {string} todayDate 东八区今天
 */
async function makeupStateOf(openid, todayDate) {
  const cards = await MakeupCard.count({ where: { openid, usedFor: null } });
  const recent = await CheckinRecord.findAll({
    where: { openid, date: { [Op.gte]: time.dayKeyOffset(-7) } },
    order: [["date", "ASC"]],
  });
  const plan = makeupRules.planMakeup(recent, cards, todayDate);
  return { cards: cards, can: plan.can, target: plan.target, reason: plan.reason };
}

/**
 * GET /api/checkin —— 获取签到记录
 */
router.get("/", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const { month } = req.query; // YYYY-MM
    const where = { openid };

    if (month) {
      const startDate = new Date(month + "-01");
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      where.date = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      };
    }

    const records = await CheckinRecord.findAll({
      where,
      order: [["date", "ASC"]],
    });

    // 当前连续天数：今天已签取今天，否则看昨天
    const todayDate = time.todayKey();
    const todayRecord = records.find((r) => r.date === todayDate);

    let currentStreak = todayRecord ? todayRecord.streak : 0;
    if (!todayRecord) {
      const yesterdayDate = time.dayKeyOffset(-1);
      const yesterdayRecord = records.find((r) => r.date === yesterdayDate);
      if (yesterdayRecord) currentStreak = yesterdayRecord.streak;
    }

    // 补签卡状态：表还没建（新功能未部署）时不能把整个签到日历拖垮
    let makeup = null;
    try { makeup = await makeupStateOf(openid, todayDate); }
    catch (e) { console.error("读取补签卡状态失败（不影响签到日历）：", e && e.message); }

    res.send({
      code: 0,
      data: { records, currentStreak, totalCheckins: records.length, makeup },
    });
  } catch (err) {
    console.error("GET /api/checkin 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/** 补签失败的业务码（端上也有自己的文案，这里给一份便于接口调试） */
const MAKEUP_FAIL = {
  no_card: { code: 4001, message: "没有可用的补签卡" },
  already: { code: 4002, message: "昨天已经签过了，不用补" },
  no_prev: { code: 4003, message: "前天也没有签到记录，补一天接不回来" },
  bad_date: { code: 4004, message: "日期异常，稍后再试" },
};

/**
 * POST /api/checkin/makeup —— 用一张补签卡补昨天（2026-10-29）
 *
 * 口径（见 server/makeup-card.js）：只能补昨天，且前天必须有签到记录；
 * 补签后会**重算**该用户从昨天起的所有 streak（streak 是冗余存储，
 * 不重算的话用户看到的是「日历补上了、连续天数还是断的」，而且之后每天
 * 都在错误的地基上继续 +1）。
 *
 * 返回：{ date, streak, rewardStars, cardsLeft }
 */
router.post("/makeup", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const today = time.todayKey();
    let reason = "";
    const out = await sequelize.transaction(async (t) => {
      const cards = await MakeupCard.count({ where: { openid, usedFor: null }, transaction: t });
      const recent = await CheckinRecord.findAll({
        where: { openid, date: { [Op.gte]: time.dayKeyOffset(-7) } },
        order: [["date", "ASC"]],
        transaction: t,
      });
      const plan = makeupRules.planMakeup(recent, cards, today);
      if (!plan.can) { reason = plan.reason; throw new Error("makeup_rejected"); }

      // 闸门：只有「条件更新成功」的那个请求能往下走。
      // 用户连点两下时，第二个请求会在 usedFor IS NULL 上拿到 0 行，直接被挡回。
      const card = await MakeupCard.findOne({
        where: { openid, usedFor: null },
        order: [["id", "ASC"]],
        transaction: t,
      });
      if (!card) { reason = "no_card"; throw new Error("makeup_rejected"); }
      const [affected] = await MakeupCard.update(
        { usedFor: plan.target, usedAt: new Date() },
        { where: { id: card.id, usedFor: null }, transaction: t }
      );
      if (!affected) { reason = "no_card"; throw new Error("makeup_rejected"); }

      // 插入补签记录：streak 先给 1，紧接着由 recomputeFrom 算出真值
      await CheckinRecord.create({ openid, date: plan.target, streak: 1 }, { transaction: t });

      const all = await CheckinRecord.findAll({
        where: { openid },
        order: [["date", "ASC"]],
        transaction: t,
      });
      const changes = makeupRules.recomputeFrom(all, plan.target);
      for (let i = 0; i < changes.length; i++) {
        await CheckinRecord.update(
          { streak: changes[i].streak },
          { where: { openid, date: changes[i].date }, transaction: t }
        );
      }

      const hit = changes.find((c) => c.date === plan.target);
      const streak = hit ? hit.streak : 1;
      const left = await MakeupCard.count({ where: { openid, usedFor: null }, transaction: t });
      return { date: plan.target, streak, rewardStars: rewardForStreak(streak), cardsLeft: left };
    });

    // 段位星 = 答题去重星 + 签到累计奖励（按记录现算，见 routes/rank.js）→
    // 重算 streak 后奖励星自动跟上，这里只需触发一次同步。失败不影响补签本身。
    try {
      await rankRouter.syncRankStars(openid);
    } catch (e) {
      console.error("补签后重算段位星失败（不影响补签）：", e && e.message);
    }

    res.send({ code: 0, data: out });
  } catch (err) {
    if (err && err.message === "makeup_rejected") {
      const f = MAKEUP_FAIL[reason] || MAKEUP_FAIL.bad_date;
      return res.send({ code: f.code, data: null, message: f.message });
    }
    console.error("POST /api/checkin/makeup 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
