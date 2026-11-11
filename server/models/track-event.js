const { DataTypes } = require("sequelize");

/**
 * 埋点事件表（track_events，2026-11-11）
 *
 * 一行一个事件，**只记行为不记内容**：不含昵称、头像、答案、词条正文。
 * 表结构见 server/ensure-tables.js（生产环境启动时自动补建；非生产由 sync 建）。
 *
 * 为什么 day 用 VARCHAR(10) 存 'YYYY-MM-DD'：
 *   与 checkin_records.date / daily_scores.dateKey 同一套「北京时间自然日」口径，
 *   容器时区是 UTC，直接用 DATE 列会在 00:00~08:00 之间算错天。
 *
 * 索引（见 ensure-tables.js）：
 *   · (day, event)         —— 按天出报表 / 漏斗
 *   · (openid, day)        —— 单用户留存 / 排障
 *   · (event, game_type)   —— 玩法热度与开局→完局漏斗
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "TrackEvent",
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: "主键",
      },
      openid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "用户标识（网关注入，与业务登录态无关）",
      },
      event: {
        type: DataTypes.STRING(24),
        allowNull: false,
        comment: "事件：visit/game_start/game_end/share_open/d1_return",
      },
      day: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "北京时间自然日 YYYY-MM-DD",
      },
      game_type: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: "",
        comment: "玩法 key（非玩法事件为空串）",
      },
      grade: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "",
        comment: "学段 key（快照）",
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "关卡号（0 = 无）",
      },
      scene: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "",
        comment: "启动/分享场景值（如 1007/1008/1044）",
      },
      stars: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: "本局星级（0~3，仅 game_end 有意义）",
      },
      win: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: "是否通关（0/1）",
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "本局时长（毫秒，0 = 未采集）",
      },
      payload: {
        type: DataTypes.STRING(200),
        allowNull: false,
        defaultValue: "",
        comment: "附加信息（key=value 串，禁止放正文/隐私）",
      },
    },
    {
      tableName: "track_events",
      timestamps: true,
    }
  );
};
