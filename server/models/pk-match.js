const { DataTypes } = require("sequelize");

/**
 * 好友 PK 战帖模型（pk_matches 表）
 *
 * 一行 = 一张战帖：A 发起（带题目种子与自己的成绩），B 通过分享链接应战，
 * 服务端用同一套规则判胜负并记录双方奖励星。
 *
 * ⚠️ 生产环境不会自动建表，需先执行 docs/sql/2026-10-08-赛季与PK建表.sql。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "PkMatch",
    {
      matchId: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        comment: "主键",
      },
      code: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: "短码（分享链接用）",
      },
      seed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "题目种子（双方同一套题）",
      },
      grade: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "",
        comment: "学段 key",
      },
      lineMode: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: "",
        comment: "玩法线 key（题库类玩法）",
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "关卡号",
      },
      challengerOpenid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "发起人 openid",
      },
      challengerNick: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "",
        comment: "发起人昵称（快照）",
      },
      challengerCorrect: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "发起人答对数",
      },
      challengerTotal: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "发起人总题数",
      },
      challengerMs: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "发起人用时（毫秒）",
      },
      challengerReward: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "发起人获得奖励星（判定后写入）",
      },
      opponentOpenid: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: "应战人 openid",
      },
      opponentNick: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "",
        comment: "应战人昵称（快照）",
      },
      opponentCorrect: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "应战人答对数",
      },
      opponentTotal: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "应战人总题数",
      },
      opponentMs: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "应战人用时（毫秒）",
      },
      opponentReward: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "应战人获得奖励星（判定后写入）",
      },
      status: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: "open",
        comment: "状态：open 待应战 / done 已结束",
      },
      winner: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: "",
        comment: "胜者：challenger/opponent/draw",
      },
      finishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "结算时间",
      },
    },
    {
      tableName: "pk_matches",
      timestamps: true,
      indexes: [
        { unique: true, name: "uniq_pk_code", fields: ["code"] },
        { name: "idx_pk_challenger", fields: ["challengerOpenid"] },
        { name: "idx_pk_opponent", fields: ["opponentOpenid"] },
      ],
    }
  );
};
