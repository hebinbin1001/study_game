const { DataTypes } = require("sequelize");

/**
 * 自建题库（word_banks 表，2026-09-18）
 *
 * 需求（用户 2026-09-18 拍板）：自建库**挂在某个学段下作为附加题源** ——
 * 比如给「小学3-4」挂一个「我家错词本」，闯关时和内置词库一起抽题；
 * 而不是像 demo 那样全局切换 activeBank（那样会让闯关线的学段参数失去意义）。
 *
 * 一个用户在一个学段下可以有多个库，每个库可单独启用/停用（enabled），
 * 停用只是不参与出题，词条还在，随时能开回来。
 *
 * ⚠️ 生产库需要执行 DDL（见 docs/题库-生产库建表与部署说明.md）。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "WordBank",
    {
      bankId: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        comment: "自建库 ID",
      },
      openid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "所属用户 openid",
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "库名，如「我家错词本」",
      },
      grade: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: "挂在哪个学段下（作为该学段的附加题源）",
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "是否参与出题",
      },
    },
    {
      tableName: "word_banks",
      timestamps: true,
      indexes: [{ fields: ["openid", "grade"] }],
    }
  );
};
