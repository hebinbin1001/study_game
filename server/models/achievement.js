const { DataTypes } = require("sequelize");

/**
 * 成就模型（achievements 表）
 * 成就勋章定义
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "Achievement",
    {
      achievementId: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: "成就标识",
      },
      name: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: "成就名称",
      },
      description: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: "描述",
      },
      icon: {
        type: DataTypes.STRING(256),
        allowNull: false,
        comment: "图标路径",
      },
      conditionType: {
        type: DataTypes.ENUM("total_wins", "total_stars", "max_combo", "rank", "perfect_clear"),
        allowNull: false,
        comment: "条件类型",
      },
      conditionValue: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "条件阈值",
      },
    },
    {
      tableName: "achievements",
      timestamps: false,
    }
  );
};