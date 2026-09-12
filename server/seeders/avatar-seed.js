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
    name: "🪄 传说贤者 · 连续 365 天",
    type: "warrior",
    rarity: "legend",
    icon: "/assets/skins/skin-legend-sage.png",
    unlockType: "milestone",
    unlockValue: 365,
  },
  // ===== 战士皮肤扩充（2026-09-12 美术到货 24 套；这里是新增的 15 套，
  //       旧 id（warrior_0X / milestone_XX）保持不变以兼容已拥有皮肤的玩家）=====
  { avatarId: "skin-page-soldier",    name: "书页小兵",   type: "warrior", rarity: "common", icon: "/assets/skins/skin-page-soldier.png",    unlockType: "free",  unlockValue: 0 },
  { avatarId: "skin-lion-cub",        name: "小狮子学徒", type: "warrior", rarity: "common", icon: "/assets/skins/skin-lion-cub.png",        unlockType: "free",  unlockValue: 0 },
  { avatarId: "skin-dino-rookie",     name: "小恐龙新兵", type: "warrior", rarity: "rare",   icon: "/assets/skins/skin-dino-rookie.png",     unlockType: "stars", unlockValue: 60 },
  { avatarId: "skin-fox-scout",       name: "狐狸侦察兵", type: "warrior", rarity: "rare",   icon: "/assets/skins/skin-fox-scout.png",       unlockType: "stars", unlockValue: 90 },
  { avatarId: "skin-eagle-archer",    name: "鹰羽弓手",   type: "warrior", rarity: "epic",   icon: "/assets/skins/skin-eagle-archer.png",    unlockType: "stars", unlockValue: 140 },
  { avatarId: "skin-bear-guard",      name: "棕熊重卫",   type: "warrior", rarity: "epic",   icon: "/assets/skins/skin-bear-guard.png",      unlockType: "stars", unlockValue: 200 },
  { avatarId: "skin-owl-sage",        name: "猫头鹰贤者", type: "warrior", rarity: "epic",   icon: "/assets/skins/skin-owl-sage.png",        unlockType: "stars", unlockValue: 260 },
  { avatarId: "skin-wolf-ranger",     name: "狼牙游侠",   type: "warrior", rarity: "legend", icon: "/assets/skins/skin-wolf-ranger.png",     unlockType: "stars", unlockValue: 330 },
  { avatarId: "skin-bronze-warrior",  name: "青铜战士",   type: "warrior", rarity: "rare",   icon: "/assets/skins/skin-bronze-warrior.png",  unlockType: "rank",  unlockValue: 1 },
  { avatarId: "skin-silver-blade",    name: "白银卫士",   type: "warrior", rarity: "rare",   icon: "/assets/skins/skin-silver-blade.png",    unlockType: "rank",  unlockValue: 2 },
  { avatarId: "skin-platinum-warden", name: "铂金守卫",   type: "warrior", rarity: "epic",   icon: "/assets/skins/skin-platinum-warden.png", unlockType: "rank",  unlockValue: 4 },
  { avatarId: "skin-diamond-knight",  name: "钻石骑士",   type: "warrior", rarity: "legend", icon: "/assets/skins/skin-diamond-knight.png",  unlockType: "rank",  unlockValue: 5 },
  { avatarId: "skin-star-marshal",    name: "星耀星使",   type: "warrior", rarity: "legend", icon: "/assets/skins/skin-star-marshal.png",    unlockType: "rank",  unlockValue: 6 },
  { avatarId: "skin-glory-phoenix",   name: "荣耀凤凰",   type: "warrior", rarity: "legend", icon: "/assets/skins/skin-glory-phoenix.png",   unlockType: "rank",  unlockValue: 8 },
  { avatarId: "skin-scholar-king",    name: "学者之王",   type: "warrior", rarity: "legend", icon: "/assets/skins/skin-scholar-king.png",    unlockType: "level", unlockValue: 30 },
];

/**
 * 初始化形象数据
 * @param {import('sequelize').Sequelize} sequelize
 */
async function seedAvatars(sequelize) {
  const Avatar = require("../models/avatar")(sequelize);

  // 幂等写入：已存在的行会被更新（upsert），这样「上架新皮肤 / 改名字改图标」只需改本文件，
  // 部署后自动生效；不会影响用户的解锁记录（user_avatars 只存 avatarId）。
  let created = 0;
  for (const avatar of avatars) {
    // 用 findOrCreate（而不是 upsert）：MySQL 上 upsert 依赖 ON DUPLICATE KEY UPDATE，
    // 在某些托管环境的权限/引擎组合下会抛错；这里只保证「缺的补上」，已有行不动 —— 对新上架皮肤足够。
    const [row, isNew] = await Avatar.findOrCreate({
      where: { avatarId: avatar.avatarId },
      defaults: avatar,
    });
    if (isNew) created++;
  }

  console.log(`[seed] 形象数据初始化完成：清单 ${avatars.length} 条，本次新增 ${created} 条`);
  return { total: avatars.length, created };
}

/**
 * 皮肤目录自检（幂等，进程内只跑一次）。
 *
 * 为什么需要：生产启动路径里的 seed 出过「代码上架 24 套、线上仍 8 套」的问题，
 * 而容器日志本地看不到。这里把结果**返回出来**（供健康检查暴露），
 * 下次再出问题，本地一句 health 就能看到原因。
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {Promise<{ok:boolean, total?:number, created?:number, error?:string}>}
 */
let rosterDone = null;
async function ensureAvatarRoster(sequelize) {
  if (rosterDone) return rosterDone;
  try {
    const r = await seedAvatars(sequelize);
    rosterDone = { ok: true, total: r.total, created: r.created };
  } catch (err) {
    // 不缓存失败：下次请求会重试（并再次记录错误）
    return { ok: false, error: String((err && err.message) || err).slice(0, 200) };
  }
  return rosterDone;
}

module.exports = { avatars, seedAvatars, ensureAvatarRoster };
