const express = require("express");
const { getMiniCode } = require("../utils/wechat");

const router = express.Router();

/**
 * GET /api/wxcode —— 生成小程序码（返回 base64 data-url，供前端海报合成 drawImage）
 * query：
 *   scene：场景值（≤32 可见字符，携带分享来源，如 inv=openid）
 *   page： 落地页，默认 pages/index/index
 *   env：  release | trial | develop（默认 release；体验/正式版可扫）
 * 成功 → { code:0, data:{ mime, dataUrl } }；失败 → { code, message }（前端降级为无码分享）
 */
router.get("/", async (req, res) => {
  try {
    const scene = String(req.query.scene || "");
    const page = String(req.query.page || "pages/index/index");
    const env = String(req.query.env || "release");
    if (scene.length > 32) {
      return res.send({ code: 4000, data: null, message: "scene 过长（需 ≤32 字符）" });
    }
    const buf = await getMiniCode(scene, page, env);
    res.send({
      code: 0,
      data: { mime: "image/png", dataUrl: "data:image/png;base64," + buf.toString("base64") },
    });
  } catch (err) {
    console.error("GET /api/wxcode 失败：", err.message);
    res.send({ code: 5000, data: null, message: (err && err.message) || "生成小程序码失败" });
  }
});

module.exports = router;
