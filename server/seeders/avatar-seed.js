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