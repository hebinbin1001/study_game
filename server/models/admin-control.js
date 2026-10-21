const { DataTypes } = require("sequelize");

/** 管理员运营控制：拉黑用户 / 暂停玩法入口。ctype + target 唯一。 */
module.exports = (sequelize) => {
  return sequelize.define(
    "AdminControl",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ctype: { type: DataTypes.STRING(16), allowNull: false, comment: "ban_user / pause_game" },
      target: { type: DataTypes.STRING(64), allowNull: false, comment: "openid 或玩法 key" },
      value: { type: DataTypes.STRING(255), allowNull: true, comment: "原因" },
    },
    {
      tableName: "admin_controls",
      timestamps: true,
      indexes: [{ unique: true, name: "uniq_admin_control", fields: ["ctype", "target"] }],
    }
  );
};
