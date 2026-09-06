const { DataTypes } = require("sequelize");

/**
 * 自定义关卡模型（custom_levels 表）
 * 玩家创建的关卡，支持草稿/待审核/通过/拒绝状态
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "CustomLevel",
    {
      levelId: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: "关卡标识",
      },
      title: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "关卡标题",
      },
      description: {
        type: DataTypes.STRING(256),
        comment: "关卡描述",
      },
      authorOpenid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "作者 openid",
      },
      grade: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: "学段",
      },
      items: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: "题目列表",
      },
      totalQ: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "总题数",
      },
      status: {
        type: DataTypes.ENUM("draft", "pending", "approved", "rejected"),
        defaultValue: "draft",
        comment: "状态：草稿/待审核/通过/拒绝",
      },
      shareCode: {
        type: DataTypes.STRING(6),
        unique: true,
        comment: "分享码",
      },
    },
    {
      tableName: "custom_levels",
      timestamps: true,
    }
  );
};