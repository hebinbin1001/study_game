const { DataTypes } = require("sequelize");

/**
 * 错题记录模型（wrong_records 表）
 * 记录用户答错的题目，支持艾宾浩斯复习
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "WrongRecord",
    {
      recordId: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        comment: "记录 ID",
      },
      openid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "用户标识",
      },
      questionId: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: "题目标识（type + q + a）",
      },
      question: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: "题目快照（type/q/a/hint）",
      },
      wrongCount: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: "错误次数",
      },
      nextReviewAt: {
        type: DataTypes.DATE,
        comment: "下次复习时间",
      },
      reviewCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已复习次数",
      },
      mastery: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "熟练度（0~100）",
      },
    },
    {
      tableName: "wrong_records",
      timestamps: true,
      updatedAt: false,
    }
  );
};