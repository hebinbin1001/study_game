const { DataTypes } = require("sequelize");

/**
 * 每日一题连续里程碑领取记录模型（milestone_claims 表）
 * 记录用户已领取的里程碑（按天数），防止重复发放
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "MilestoneClaim",
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
      day: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "里程碑连续天数（30/60/100/250/365）",
      },
      reward: {
        type: DataTypes.STRING(32),
        defaultValue: "",
        comment: "奖励类型：skin/star",
      },
      avatarId: {
        type: DataTypes.STRING(32),
        defaultValue: "",
        comment: "奖励皮肤标识（reward=skin 时）",
      },
      stars: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "奖励星数（reward=star 时）",
      },
    },
    {
      tableName: "milestone_claims",
      timestamps: true,
      updatedAt: false,
    }
  );
};
