const express = require("express");
const {
  Achievement,
  UserAchievement,
  RankRecord,
  Score,
} = require("../db");

const router = express.Router();

// 内置成就定义
const DEFAULT_ACHIEVEMENTS = [
  {
    achievementId: "first_blood",
    name: "首胜",
    description: "首次通关",
    icon: "/assets/achievements/first_blood.png",
    conditionType: "total_wins",
    conditionValue: 1,
  },
  {
    achievementId: "combo_master",
    name: "连击大师",
    description: "单局连击达到10",
    icon: "/assets/achievements/combo_master.png",
    conditionType: "max_combo",
    conditionValue: 10,
  },
  {
    achievementId: "star_collector",
    name: "星数收集",
    description: "累计获得50星",
    icon: "/assets/achievements/star_collector.png",
    conditionType: "total_stars",
    conditionValue: 50,
  },
  {
    achievementId: "rank_bronze",
    name: "青铜段位",
    description: "达到青铜段位",
    icon: "/assets/achievements/rank_bronze.png",
    conditionType: "rank",
    conditionValue: 1,
  },
  {
    achievementId: "rank_king",
    name: "王者段位",
    description: "达到王者段位",
    icon: "/assets/achievements/rank_king.png",
    conditionType: "rank",
    conditionValue: 7,
  },
  {
    achievementId: "perfect_clear",
    name: "完美通关",
    description: "单局获得3星评价",
    icon: "/assets/achievements/perfect_clear.png",
    conditionType: "perfect_clear",
    conditionValue: 1,
  },
];

/**
 * 初始化内置成就
 */
async function initAchievements() {
  for (const ach of DEFAULT_ACHIEVEMENTS) {
    await Achievement.findOrCreate({
      where: { achievementId: ach.achievementId },
      defaults: ach,
    });
  }
}

/**
 * GET /api/achievement/list —— 获取成就列表 + 解锁状态
 */
router.get("/list", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    // 确保内置成就存在
    await initAchievements();

    // 获取所有成就
    const allAchievements = await Achievement.findAll();

    // 获取用户已解锁的成就
    const userAchievements = await UserAchievement.findAll({
      where: { openid },
      attributes: ["achievementId"],
    });

    const unlockedSet = new Set(userAchievements.map((a) => a.achievementId));

    // 组装返回数据
    const list = allAchievements.map((ach) => ({
      achievementId: ach.achievementId,
      name: ach.name,
      description: ach.description,
      icon: ach.icon,
      conditionType: ach.conditionType,
      conditionValue: ach.conditionValue,
      unlocked: unlockedSet.has(ach.achievementId),
    }));

    res.send({ code: 0, data: list });
  } catch (err) {
    console.error("GET /api/achievement/list 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/achievement/check —— 检查并解锁成就
 */
router.post("/check", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    await initAchievements();

    // 获取用户数据
    const rankRecord = await RankRecord.findOne({
      where: { openid },
    });

    const scores = await Score.findAll({
      where: { user_id: (await require("../db").User.findOne({ where: { openid } })).id },
    });

    const userAchievements = await UserAchievement.findAll({
      where: { openid },
    });

    const unlockedSet = new Set(userAchievements.map((a) => a.achievementId));

    const allAchievements = await Achievement.findAll();
    const newlyUnlocked = [];

    for (const ach of allAchievements) {
      if (unlockedSet.has(ach.achievementId)) continue;

      let unlocked = false;

      switch (ach.conditionType) {
        case "total_wins":
          unlocked = rankRecord && rankRecord.wins >= ach.conditionValue;
          break;
        case "total_stars":
          unlocked = rankRecord && rankRecord.stars >= ach.conditionValue;
          break;
        case "rank":
          unlocked = rankRecord && rankRecord.rankId >= ach.conditionValue;
          break;
        case "max_combo":
          // 从成绩中找最大连击
          const maxCombo = scores.reduce((max, s) => Math.max(max, s.max_combo || 0), 0);
          unlocked = maxCombo >= ach.conditionValue;
          break;
        case "perfect_clear":
          // 统计 3 星通关次数
          const perfectCount = scores.filter((s) => s.stars === 3).length;
          unlocked = perfectCount >= ach.conditionValue;
          break;
      }

      if (unlocked) {
        await UserAchievement.create({
          openid,
          achievementId: ach.achievementId,
        });
        newlyUnlocked.push(ach);
      }
    }

    res.send({
      code: 0,
      data: {
        newlyUnlocked,
        totalUnlocked: unlockedSet.size + newlyUnlocked.length,
      },
    });
  } catch (err) {
    console.error("POST /api/achievement/check 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;