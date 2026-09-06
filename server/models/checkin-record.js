const { DataTypes } = require("sequelize");

/**
 * 签到记录模型（checkin_records 表）
 * 记录用户每日签到
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "CheckinRecord",
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
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: "签到日期",
      },
      streak: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: "连续签到天数",
      },
    },
    {
      tableName: "checkin_records",
      timestamps: true,
      updatedAt: false,
    }
  );
};