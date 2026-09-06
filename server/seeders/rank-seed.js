/**
 * 段位数据初始化脚本
 * 8 段位：青铜→白银→黄金→铂金→钻石→星耀→王者→荣耀王者
 */
const ranks = [
  {
    rankId: 1,
    rankName: "青铜",
    icon: "/assets/ranks/bronze.png",
    minWins: 0,
  },
  {
    rankId: 2,
    rankName: "白银",
    icon: "/assets/ranks/silver.png",
    minWins: 10,
  },
  {
    rankId: 3,
    rankName: "黄金",
    icon: "/assets/ranks/gold.png",
    minWins: 30,
  },
  {
    rankId: 4,
    rankName: "铂金",
    icon: "/assets/ranks/platinum.png",
    minWins: 60,
  },
  {
    rankId: 5,
    rankName: "钻石",
    icon: "/assets/ranks/diamond.png",
    minWins: 100,
  },
  {
    rankId: 6,
    rankName: "星耀",
    icon: "/assets/ranks/star.png",
    minWins: 150,
  },
  {
    rankId: 7,
    rankName: "王者",
    icon: "/assets/ranks/king.png",
    minWins: 220,
  },
  {
    rankId: 8,
    rankName: "荣耀王者",
    icon: "/assets/ranks/glory.png",
    minWins: 300,
  },
];

/**
 * 初始化段位数据
 * @param {import('sequelize').Sequelize} sequelize
 */
async function seedRanks(sequelize) {
  const Rank = require("../models/rank")(sequelize);

  // 先清空再插入（幂等：已存在则跳过）
  for (const rank of ranks) {
    await Rank.findOrCreate({
      where: { rankId: rank.rankId },
      defaults: rank,
    });
  }

  console.log(`[seed] 段位数据初始化完成，共 ${ranks.length} 条`);
}

module.exports = { ranks, seedRanks };