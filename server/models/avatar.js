const { DataTypes } = require("sequelize");

/**
 * 形象模型（avatars 表）
 * 战士/怪兽皮肤，按段位/星数解锁
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "Avatar",
    {
      avatarId: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        comment: "形象标识，如 warrior_01",
      },
      name: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: "形象名称",
      },
      type: {
        type: DataTypes.ENUM("warrior", "monster"),
        allowNull: false,
        comment: "类型：战士/怪兽",
      },
      rarity: {
        type: DataTypes.ENUM("common", "rare", "epic", "legend"),
        allowNull: false,
        comment: "稀有度：普通/稀有/史诗/传说",
      },
      icon: {
        type: DataTypes.STRING(256),
        allowNull: false,
        comment: "图标路径",
      },
      unlockType: {
        type: DataTypes.ENUM("stars", "rank", "level", "free"),
        allowNull: false,
        defaultValue: "free",
        comment: "解锁类型：星数/段位/关卡/默认",
      },
      unlockValue: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "解锁阈值",
      },
    },
    {
      tableName: "avatars",
      timestamps: false,
    }
  );
};