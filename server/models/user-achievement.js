const { DataTypes } = require("sequelize");

/**
 * 用户成就关联模型（user_achievements 表）
 * 记录用户已解锁的成就
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "UserAchievement",
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
      achievementId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: "成就标识",
      },
    },
    {
      tableName: "user_achievements",
      timestamps: true,
      updatedAt: false,
    }
  );
};