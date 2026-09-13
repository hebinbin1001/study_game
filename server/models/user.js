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
      // ⚠️ 微信昵称（wx_nickname）**故意不在这里声明**：
      //    2026-09-13 踩坑 —— 一旦写进模型，Sequelize 默认 SELECT 所有字段，
      //    生产库还没加列时所有读用户表的接口直接 5000（冒烟 6 组红）。
      //    这张表上的 wx_nickname 一律用原生 SQL 读写（见 routes/user.js 与 routes/admin.js），
      //    列不存在时自动降级，不影响任何主流程。
      token: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
        comment: "登录态令牌（M5：标准登录签发，单用户单 token，重登刷新）",
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "手机号（预留字段，M5 不开放绑定流程，需企业认证后开通）",
      },
    },
    {
      tableName: "users",
      // timestamps 默认 true，自动维护 createdAt / updatedAt
    }
  );
};
