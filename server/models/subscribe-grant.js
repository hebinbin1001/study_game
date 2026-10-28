const { DataTypes } = require("sequelize");

/**
 * 订阅消息授权记录（subscribe_grants 表，2026-10-28）
 *
 * 为什么需要：一次性订阅的额度存在微信侧，服务端**查不到**余额，也没有接口可查。
 * 所以这里不试图复刻额度，只记三件能观测的事：
 *   · granted  —— 用户点过几次「允许」（看订阅弹窗转化率）；
 *   · sent / failed —— 实际发出几条、失败几条（看通道健康度）；
 *   · lastError —— 最近一次的微信 errcode（43101 = 用户额度已用完，属正常，不是故障）。
 *
 * ⚠️ 发送时**不拿额度当闸门**：记账一旦漏记（网络抖动、前端没回调），
 *    就会永久漏发；而多发一次 API 调用几乎没有代价。宁可多调，不可漏发。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "SubscribeGrant",
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
      scene: {
        type: DataTypes.STRING(24),
        allowNull: false,
        comment: "订阅场景 key（如 pk_accept / checkin_break）",
      },
      granted: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "用户累计同意次数（点击「允许」的计数）",
      },
      sent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "累计发送成功条数",
      },
      failed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "累计发送失败条数",
      },
      lastError: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "",
        comment: "最近一次失败原因（微信 errcode:errmsg）",
      },
      lastGrantAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "最近一次同意时间",
      },
      lastSendAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "最近一次发送时间",
      },
    },
    {
      tableName: "subscribe_grants",
      timestamps: true,
      indexes: [{ unique: true, fields: ["openid", "scene"] }],
    }
  );
};
