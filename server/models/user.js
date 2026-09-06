const { DataTypes } = require("sequelize");

/**
 * 用户模型（users 表）
 * 字段设计见 design.md「2.3.2 (4) MySQL 表设计」
 * 通过 db.js 传入 sequelize 实例进行定义，避免循环依赖。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "主键",
      },
      openid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true, // 唯一约束，同时建立唯一索引
        comment: "微信 OpenID",
      },
      nickname: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: "昵称（2~12 字符，云端镜像字段）",
      },
      avatar_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "头像 URL（预留）",
      },
    },
    {
      tableName: "users",
      // timestamps 默认 true，自动维护 createdAt / updatedAt
    }
  );
};