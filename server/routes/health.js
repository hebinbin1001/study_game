const express = require("express");
const { sequelize } = require("../db");
const { CODE } = require("../constants");

const router = express.Router();

/**
 * GET /api/health —— 服务存活探针（REQ-API-1）
 *
 * 真实探测数据库连通性（sequelize.authenticate() 底层执行 SELECT 1），
 * 避免“恒返回 connected”的假探针：
 *   - 成功：HTTP 200 { code:0, data:{ status:'ok', db:'connected' } }
 *   - 失败：HTTP 503 { code:5001, data:{ status:'error', db:'disconnected' },
 *            message:'数据库连接异常' }
 * 503 语义供云托管健康检查识别 DB 不可用并触发容器重启。
 */
router.get("/", async (req, res) => {
  try {
    await sequelize.authenticate(); // 执行 SELECT 1，抛错即连接异常
    res.send({ code: CODE.OK, data: { status: "ok", db: "connected" } });
  } catch (err) {
    console.error("健康检查：数据库连接异常：", err);
    res.status(503).send({
      code: CODE.HEALTH_DB_DOWN,
      data: { status: "error", db: "disconnected" },
      message: "数据库连接异常",
    });
  }
});

module.exports = router;