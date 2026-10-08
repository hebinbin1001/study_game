const { DataTypes } = require("sequelize");

/**
 * 每日挑战赛成绩模型（daily_scores 表）
 *
 * 玩法：每天（东八区自然日）同一个学段共用一套题（种子由 dateKey + grade 派生），
 *       当天出榜，按「答对数降序 → 用时升序」排名。
 *
 * 为什么一人一天一行：同一人当天可以重打，但只保留**最好成绩**（服务端 upsert 取优），
 * 这样榜单不会被刷屏，也不需要额外的「最佳成绩」聚合。
 *
 * ⚠️ 生产环境不会自动建表，需先执行 docs/sql/2026-10-08-赛季与PK建表.sql。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "DailyScore",
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
      dateKey: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "挑战日期（东八区，YYYY-MM-DD）",
      },
      grade: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "",
        comment: "学段 key（kg/g1…college）",
      },
      correct: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "答对题数",
      },
      total: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "总题数",
      },
      durationMs: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "总用时（毫秒）",
      },
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "展示用分数（答对数 ×100 + 速度奖励）",
      },
    },
    {
      tableName: "daily_scores",
      timestamps: true,
      indexes: [
        { unique: true, name: "uniq_daily_openid_date", fields: ["openid", "dateKey"] },
        { name: "idx_daily_date_grade", fields: ["dateKey", "grade"] },
      ],
    }
  );
};
