const { DataTypes } = require("sequelize");

/**
 * 赛季奖励领取记录模型（season_claims 表）
 *
 * 赛季 = 自然双月（1-2 月 … 11-12 月），赛季榜按「本赛季新获得星星（去重）+ 每日挑战活跃分」排名。
 * 赛季结束后可在赛季页领取一次奖励；本表用于幂等（同一赛季只能领一次）。
 *
 * ⚠️ 生产环境不会自动建表，需先执行 docs/sql/2026-10-08-赛季与PK建表.sql。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "SeasonClaim",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        comment: "主键",
      },
      openid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "用户标识",
      },
      seasonKey: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: "赛季 key（如 2026-S5）",
      },
      tier: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "",
        comment: "奖励档位（top3/top10/active）",
      },
      rank: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "领取时的赛季名次",
      },
      stars: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "发放星数",
      },
    },
    {
      tableName: "season_claims",
      timestamps: true,
      updatedAt: false,
      indexes: [
        { unique: true, name: "uniq_season_openid", fields: ["openid", "seasonKey"] },
      ],
    }
  );
};
