const express = require("express");
const { Avatar, UserAvatar, RankRecord } = require("../db");

const router = express.Router();

/**
 * GET /api/avatar/list —— 获取可用形象列表 + 已解锁状态
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

    // 获取所有形象
    const allAvatars = await Avatar.findAll();

    // 获取用户已解锁的形象
    const unlocked = await UserAvatar.findAll({
      where: { openid },
      attributes: ["avatarId", "currentUsed"],
    });

    const unlockedMap = new Map();
    unlocked.forEach((u) => {
      unlockedMap.set(u.avatarId, u.currentUsed);
    });

    // 按类型分组
    const warriors = [];
    const monsters = [];

    allAvatars.forEach((avatar) => {
      const item = {
        avatarId: avatar.avatarId,
        name: avatar.name,
        rarity: avatar.rarity,
        icon: avatar.icon,
        unlockType: avatar.unlockType,
        unlockValue: avatar.unlockValue,
        unlocked: unlockedMap.has(avatar.avatarId) || avatar.unlockType === "free",
        currentUsed: unlockedMap.get(avatar.avatarId) || false,
      };
      if (avatar.type === "warrior") {
        warriors.push(item);
      } else {
        monsters.push(item);
      }
    });

    res.send({
      code: 0,
      data: { warriors, monsters },
    });
  } catch (err) {
    console.error("GET /api/avatar/list 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/avatar/unlock —— 解锁形象
 * 检查解锁条件（星数/段位），满足则解锁
 */
router.post("/unlock", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { avatarId } = req.body;
    if (!avatarId) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    // 获取形象信息
    const avatar = await Avatar.findOne({ where: { avatarId } });
    if (!avatar) {
      return res.send({
        code: 4001,
        data: null,
        message: "形象不存在",
      });
    }

    // 检查是否已解锁
    const existing = await UserAvatar.findOne({
      where: { openid, avatarId },
    });
    if (existing) {
      return res.send({
        code: 0,
        data: { unlocked: true, already: true },
      });
    }

    // 里程碑皮肤（unlockType='milestone'）：仅由每日一题连续签到自动发放，禁止手动解锁
    if (avatar.unlockType === "milestone") {
      return res.send({
        code: 4002,
        data: null,
        message: "该皮肤需每日一题连续签到达到天数后自动解锁",
      });
    }

    // 检查解锁条件
    let canUnlock = avatar.unlockType === "free";

    if (!canUnlock && avatar.unlockType === "stars") {
      // 星数解锁：检查累计星数
      const rankRecord = await RankRecord.findOne({
        where: { openid },
        attributes: ["stars"],
      });
      const totalStars = rankRecord ? rankRecord.stars : 0;
      canUnlock = totalStars >= avatar.unlockValue;
    }

    if (!canUnlock && avatar.unlockType === "rank") {
      // 段位解锁：检查段位
      const rankRecord = await RankRecord.findOne({
        where: { openid },
        attributes: ["rankId"],
      });
      const currentRank = rankRecord ? rankRecord.rankId : 1;
      canUnlock = currentRank >= avatar.unlockValue;
    }

    if (!canUnlock) {
      return res.send({
        code: 4002,
        data: null,
        message: "未满足解锁条件",
      });
    }

    // 解锁形象
    await UserAvatar.create({
      openid,
      avatarId,
      currentUsed: false,
    });

    res.send({ code: 0, data: { unlocked: true, already: false } });
  } catch (err) {
    console.error("POST /api/avatar/unlock 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/avatar/use —— 使用形象
 */
router.post("/use", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { avatarId } = req.body;
    if (!avatarId) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    // 检查是否已解锁
    const existing = await UserAvatar.findOne({
      where: { openid, avatarId },
    });
    if (!existing) {
      return res.send({
        code: 4003,
        data: null,
        message: "形象未解锁",
      });
    }

    // 取消其他形象的 currentUsed
    await UserAvatar.update(
      { currentUsed: false },
      { where: { openid } }
    );

    // 设置当前使用
    await UserAvatar.update(
      { currentUsed: true },
      { where: { openid, avatarId } }
    );

    res.send({ code: 0, data: { success: true } });
  } catch (err) {
    console.error("POST /api/avatar/use 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;