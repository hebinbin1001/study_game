const { DataTypes } = require("sequelize");

/**
 * 成绩模型（scores 表）
 * 字段设计见 design.md「2.3.2 (4) MySQL 表设计」
 * 通过 db.js 传入 sequelize 实例进行定义，避免循环依赖。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "Score",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "主键",
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "所属用户 ID（外键 → users.id）",
      },
      grade: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: "学段标识",
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "关卡序号",
      },
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "得分",
      },
      correct_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "答对题数",
      },
      total_q: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "总题数",
      },
      max_combo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "最高连击",
      },
      stars: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "星级（0~3）",
      },
    },
    {
      tableName: "scores",
      timestamps: true,
      // 成绩记录只保留上报时间戳 createdAt，无需 updatedAt
      updatedAt: false,
    }
  );
};