/**
 * 形象数据初始化脚本
 * 内置 8 个形象（4 战士 + 4 怪兽）
 */
const avatars = [
  // 战士皮肤
  {
    avatarId: "warrior_01",
    name: "初学者战士",
    type: "warrior",
    rarity: "common",
    icon: "/assets/avatars/warrior_01.png",
    unlockType: "free",
    unlockValue: 0,
  },
  {
    avatarId: "warrior_02",
    name: "学徒战士",
    type: "warrior",
    rarity: "rare",
    icon: "/assets/avatars/warrior_02.png",
    unlockType: "stars",
    unlockValue: 30,
  },
  {
    avatarId: "warrior_03",
    name: "精英战士",
    type: "warrior",
    rarity: "epic",
    icon: "/assets/avatars/warrior_03.png",
    unlockType: "rank",
    unlockValue: 3,
  },
  {
    avatarId: "warrior_04",
    name: "传说战士",
    type: "warrior",
    rarity: "legend",
    icon: "/assets/avatars/warrior_04.png",
    unlockType: "rank",
    unlockValue: 7,
  },
  // 怪兽皮肤
  {
    avatarId: "monster_01",
    name: "小怪兽",
    type: "monster",
    rarity: "common",
    icon: "/assets/avatars/monster_01.png",
    unlockType: "free",
    unlockValue: 0,
  },
  {
    avatarId: "monster_02",
    name: "火焰怪兽",
    type: "monster",
    rarity: "rare",
    icon: "/assets/avatars/monster_02.png",
    unlockType: "stars",
    unlockValue: 50,
  },
  {
    avatarId: "monster_03",
    name: "冰霜怪兽",
    type: "monster",
    rarity: "epic",
    icon: "/assets/avatars/monster_03.png",
    unlockType: "rank",
    unlockValue: 4,
  },
  {
    avatarId: "monster_04",
    name: "雷霆巨兽",
    type: "monster",
    rarity: "legend",
    icon: "/assets/avatars/monster_04.png",
    unlockType: "rank",
    unlockValue: 6,
  },
  // ===== 每日一题连续里程碑限定皮肤（B2，unlockType='milestone'，unlockValue=连续天数） =====
  {
    avatarId: "milestone_30",
    name: "🐲 神龙 · 连续 30 天",
    type: "warrior",
    rarity: "legend",
    icon: "/assets/avatars/milestone_30.png",
    unlockType: "milestone",
    unlockValue: 30,
  },
  {
    avatarId: "milestone_60",
    name: "🦄 独角兽 · 连续 60 天",
    type: "warrior",
    rarity: "legend",
    icon: "/assets/avatars/milestone_60.png",
    unlockType: "milestone",
    unlockValue: 60,
  },
  {
    avatarId: "milestone_100",
    name: "👑 皇冠 · 连续 100 天",
    type: "warrior",
    rarity: "legend",
    icon: "/assets/avatars/milestone_100.png",
    unlockType: "milestone",
    unlockValue: 100,
  },
  {
    avatarId: "milestone_250",
    name: "⚡ 闪电 · 连续 250 天",
    type: "warrior",
    rarity: "legend",
    icon: "/assets/avatars/milestone_250.png",
    unlockType: "milestone",
    unlockValue: 250,
  },
  {
    avatarId: "milestone_365",
    name: "🎖 年度之星 · 连续 365 天",
    type: "warrior",
    rarity: "legend",
    icon: "/assets/avatars/milestone_365.png",
    unlockType: "milestone",
    unlockValue: 365,
  },
];

/**
 * 初始化形象数据
 * @param {import('sequelize').Sequelize} sequelize
 */
async function seedAvatars(sequelize) {
  const Avatar = require("../models/avatar")(sequelize);

  // 先清空再插入（幂等：已存在则跳过）
  for (const avatar of avatars) {
    await Avatar.findOrCreate({
      where: { avatarId: avatar.avatarId },
      defaults: avatar,
    });
  }

  console.log(`[seed] 形象数据初始化完成，共 ${avatars.length} 条`);
}

module.exports = { avatars, seedAvatars };