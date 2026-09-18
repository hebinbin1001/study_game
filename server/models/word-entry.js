const { DataTypes } = require("sequelize");

/**
 * 用户题库覆盖记录（word_entries 表，2026-09-18）
 *
 * 需求：题库页要能编辑/新增/删除词条，并且这些题库就是闯关线的题源。
 * 设计：不改内置词库文件（只读、随版本发布），而是把**用户的改动**单独存一张表，
 *      端上按「学段 + 题型 + 题目」指纹合并（见 miniprogram/utils/bank.js）：
 *        action='create'  用户新增的词条
 *        action='patch'   改写内置条目的释义/例句/干扰项（题目本身不变，指纹才稳定）
 *        action='disable' 停用某条内置条目（界面上等同删除，可逆）
 *
 * 为什么内置条目用「停用」而不是物理删除：内置词库以后升级会补词，
 * 硬删会与升级冲突；停用记录留在表里，恢复只需删这一行。
 *
 * ⚠️ 本表需要生产库执行 DDL 才会生效（见 docs/题库与词条编辑-部署说明.md）。
 *    与其他表一致：生产环境不跑 sync({ alter: true })，表结构由人工脚本管理。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "WordEntry",
    {
      entryId: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        comment: "覆盖记录 ID",
      },
      openid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "所属用户 openid",
      },
      // 列名不用 key（MySQL 保留字），用 itemKey
      itemKey: {
        type: DataTypes.STRING(191),
        allowNull: false,
        comment: "词条指纹 grade|type|q",
      },
      action: {
        type: DataTypes.ENUM("create", "patch", "disable"),
        allowNull: false,
        comment: "create=新增 / patch=改写内置 / disable=停用内置",
      },
      grade: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: "学段 key",
      },
      type: {
        type: DataTypes.STRING(16),
        comment: "题型码（w1/w2/c1/c2/xhy/zc/fill/trans）",
      },
      q: {
        type: DataTypes.STRING(255),
        comment: "题目（w2/c2 为含 * 的模板）",
      },
      a: {
        type: DataTypes.STRING(255),
        comment: "答案",
      },
      hint: {
        type: DataTypes.STRING(255),
        comment: "提示 / 释义",
      },
      ex: {
        type: DataTypes.STRING(512),
        comment: "例句（可选）",
      },
      d: {
        type: DataTypes.STRING(255),
        comment: "干扰项（逗号分隔，可选）",
      },
    },
    {
      tableName: "word_entries",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["openid", "itemKey"] },
        { fields: ["openid", "grade"] },
      ],
    }
  );
};
