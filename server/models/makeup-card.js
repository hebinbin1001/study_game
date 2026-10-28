const { DataTypes } = require("sequelize");

/**
 * 补签卡（makeup_cards 表，2026-10-29）
 *
 * 一张卡一行（不是「一个用户一行 + 计数」）：
 *   · 需要知道每张卡是**在哪个连续里程碑**拿到的 —— 唯一键 (openid, streakAt)
 *     顺便就挡住了「同一里程碑重复发卡」（连续天数重算、补签、重试都不会多发）；
 *   · 需要知道每张卡**用在哪一天**（usedFor），否则出了问题没法回答
 *     「这个用户 10-28 的补签是哪张卡换的」；
 *   · 计数式设计做不到上面两点，而且并发下 += 1 还得加锁。
 *
 * 口径见 server/makeup-card.js 顶部注释（严格连续满 7 天发 1 张、只能补昨天、
 * 且前天必须有签到记录、补签不触发新的里程碑发卡）。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "MakeupCard",
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
      streakAt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "在哪个连续天数里程碑获得（7/14/21…）",
      },
      // 用 VARCHAR(10) 而不是 DATEONLY：值就是 'YYYY-MM-DD' 字符串，与
      // checkin_records.date、daily_scores.dateKey 同一套口径，比较时不用管时区。
      usedFor: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: "补签的日期（NULL = 未使用）",
      },
      usedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "使用时间",
      },
    },
    {
      tableName: "makeup_cards",
      timestamps: true,
    }
  );
};
