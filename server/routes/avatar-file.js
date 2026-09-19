const express = require("express");
const { AvatarBlob } = require("../db");

/**
 * GET /api/avatar/:openid —— 读取用户头像图片（2026-09-19）
 *
 * 为什么单独一个路由文件、且**不挂 openid 中间件**：
 *   1. 头像是公开资源（排行榜等公开展示要用），别人手机上也得看到；
 *   2. `<image src>` 发出的请求不会带自定义头，拿不到 openid，所以必须公开可读；
 *   3. 挂载点与用户相关接口分开，避免误加鉴权中间件把它挡住。
 *
 * 表未建（DDL 未执行）或该用户没传过头像时返回 404 —— 前端 <image> 会自动走兜底展示。
 */
const router = express.Router();

router.get("/:openid", async (req, res) => {
  try {
    const openid = String(req.params.openid || "");
    if (!openid) return res.status(404).end();
    const row = await AvatarBlob.findOne({ where: { openid } });
    if (!row) return res.status(404).end();
    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data || "");
    res.setHeader("Content-Type", row.mime || "image/png");
    // 换头像时 URL 上的 ?v= 会变，所以这里可以放心长缓存
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.end(buf);
  } catch (err) {
    // 表不存在（DDL 未执行）等：当作没有头像
    res.status(404).end();
  }
});

module.exports = router;
