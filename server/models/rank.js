const { DataTypes } = require("sequelize");

/**
 * 段位模型（ranks 表）
 * 8 段位：青铜→白银→黄金→铂金→钻石→星耀→王者→荣耀王者
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "Rank",
    {
      rankId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        comment: "段位 ID（1~8）",
      },
      rankName: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: "段位名称",
      },
      icon: {
        type: DataTypes.STRING(256),
        allowNull: false,
        comment: "段位图标路径",
      },
      minWins: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "晋升所需累计胜场",
      },
    },
    {
      tableName: "ranks",
      timestamps: false,
    }
  );
};