const { DataTypes } = require("sequelize");

/**
 * 用户头像图（avatar_blobs 表，2026-09-19）
 *
 * 为什么需要它：
 *   `<button open-type="chooseAvatar">` 给的是**微信临时文件路径**（wxfile://tmp_xxx）。
 *   以前直接把这串路径存进 users.avatar_url —— 结果是：
 *     · 用户重启小程序后路径失效，头像变回默认；
 *     · 排行榜/管理端在**别人手机上**必然裂图（那串路径只在本人当时那台设备有效）。
 *   所以头像必须先落到我们自己的存储，再把**稳定地址**写进 users.avatar_url。
 *
 * 存哪：直接进库（LONGBLOB）。云托管容器磁盘是临时的（重启即丢），
 *      云存储又要另开服务；头像经前端压到 160px 后只有几十 KB，进库最省事、最可控。
 *
 * 读取：GET /api/avatar/:openid 直接把二进制吐回去（公开可读 —— 头像本来就用于排行榜展示）。
 *
 * ⚠️ 生产库需要执行 DDL（见 docs/管理员后台与隐私口径.md 的建表语句）。
 */
module.exports = (sequelize) => {
  return sequelize.define(
    "AvatarBlob",
    {
      openid: {
        type: DataTypes.STRING(64),
        primaryKey: true,
        comment: "所属用户 openid（一个用户一张头像，覆盖写）",
      },
      mime: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "image/png",
        comment: "图片 MIME",
      },
      data: {
        type: DataTypes.BLOB("long"),
        allowNull: false,
        comment: "图片二进制",
      },
      version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: "内容版本号（毫秒时间戳，用于 URL 上的 ?v= 破缓存）",
      },
    },
    {
      tableName: "avatar_blobs",
      timestamps: true,
    }
  );
};
