const { DataTypes } = require("sequelize");

/**
 * 生词本（word_favorites 表，2026-10-28）
 *
 * 设计要点：
 *   · (openid, word) 唯一 —— 同一个词从拼写题、选择题、结算页各收藏一次，
 *     在用户心里都是「同一个词」，不该出现三条。重复收藏走更新快照 + 顶到最前；
 *   · 只存快照不存外键 —— 词库会迭代（改释义、调难度），收藏记录要保留用户当时
 *     看到的那个词形与释义，不能因为词库更新就变成另一道题；
 *   · 不做复习排期 —— 那是错题本（WrongRecord）的职责。两套排期混在一起，
 *     用户在同一页会看到两个「下次复习时间」，谁也说不清按哪个。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "WordFavorite",
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
        comment: "用户标识",
      },
      word: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "词条（英语单词或成语，已去挖空标记）",
      },
      grade: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "",
        comment: "学段 key（收藏时的快照）",
      },
      type: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "",
        comment: "题型（w1/w2/trans/fill/xhy…，收藏时的快照）",
      },
      hint: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: "",
        comment: "释义 / 提示（收藏时的快照）",
      },
      ipa: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "",
        comment: "音标（没有就空串，端上不渲染）",
      },
      source: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "manual",
        comment: "来源：wrong/result/preview/manual",
      },
    },
    {
      tableName: "word_favorites",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["openid", "word"] },
        { fields: ["openid", "updatedAt"] },
      ],
    }
  );
};
