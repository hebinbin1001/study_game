const { DataTypes } = require("sequelize");

/**
 * 审核记录模型（level_reviews 表）
 * 记录关卡审核流转
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "LevelReview",
    {
      reviewId: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        comment: "审核记录 ID",
      },
      levelId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: "关卡 ID",
      },
      reviewerOpenid: {
        type: DataTypes.STRING(64),
        comment: "审核员 openid",
      },
      status: {
        type: DataTypes.ENUM("approved", "rejected"),
        allowNull: false,
        comment: "审核结果",
      },
      comment: {
        type: DataTypes.STRING(256),
        comment: "审核意见",
      },
    },
    {
      tableName: "level_reviews",
      timestamps: true,
      updatedAt: false,
    }
  );
};