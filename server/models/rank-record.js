const { DataTypes } = require("sequelize");

/**
 * 段位记录模型（rank_records 表）
 * 记录用户的段位、胜场、星数
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "RankRecord",
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
      rankId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "当前段位 ID",
      },
      wins: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "累计胜场",
      },
      stars: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "累计星数",
      },
    },
    {
      tableName: "rank_records",
      timestamps: true,
      updatedAt: false,
    }
  );
};