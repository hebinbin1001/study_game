const { DataTypes } = require("sequelize");

/**
 * 用户形象关联模型（user_avatars 表）
 * 记录用户已解锁的形象及当前使用的形象
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "UserAvatar",
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
      avatarId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: "形象标识",
      },
      currentUsed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "当前是否使用",
      },
    },
    {
      tableName: "user_avatars",
      timestamps: true,
      updatedAt: false,
    }
  );
};