const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

// 引入数据层初始化与 openid 透传中间件
const { init } = require("./db");
const openid = require("./middlewares/openid");

// 引入各业务路由
const healthRouter = require("./routes/health");
const userRouter = require("./routes/user");
const nicknameRouter = require("./routes/nickname");
const scoreRouter = require("./routes/score");
const avatarRouter = require("./routes/avatar");
const rankRouter = require("./routes/rank");
const ranklistRouter = require("./routes/ranklist");
const levelRouter = require("./routes/level");
const levelReviewRouter = require("./routes/level-review");
const wrongRouter = require("./routes/wrong");

const app = express();

// ---- CORS：显式可信来源配置（不开放 *） ----
// 说明：小程序 wx.request 属于非浏览器请求，不携带 Origin、不受 CORS 约束，
// 此处主要约束浏览器/调试工具跨域调用。白名单来源以环境变量
// CORS_ALLOW_ORIGIN（逗号分隔）声明；本地开发默认放行 localhost 任意端口；
// 带 Origin 但不在白名单的请求不授予 CORS 头（浏览器侧拦截，服务端不处理跨域授权）。
const allowedOrigins = (process.env.CORS_ALLOW_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // 无 Origin（wx.request / curl / 同源）放行
    if (!origin) return callback(null, false);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // 本地调试默认放行 localhost / 127.0.0.1 任意端口
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
};

// 通用中间件：请求体解析、跨域、请求日志
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors(corsOptions));
app.use(morgan("tiny"));

// 挂载路由（业务路由统一先经过 openid 中间件解析用户身份）
app.use("/api/health", healthRouter);
app.use("/api/user", openid, userRouter);
app.use("/api/nickname", openid, nicknameRouter);
app.use("/api/score", openid, scoreRouter);
app.use("/api/avatar", openid, avatarRouter);
app.use("/api/rank", openid, rankRouter);
app.use("/api/ranklist", openid, ranklistRouter);
app.use("/api/level", openid, levelRouter);
app.use("/api/level/review", openid, levelReviewRouter);
app.use("/api/wrong", openid, wrongRouter);

const port = process.env.PORT || 80;

async function bootstrap() {
  try {
    await init();
    console.log("数据库初始化成功");
    const server = app.listen(port, () => {
      console.log("启动成功", port);
    });
    // 监听端口错误（如被占用/EADDRINUSE），打印日志并优雅退出
    server.on("error", (err) => {
      console.error("服务启动失败：", err);
      process.exit(1);
    });
  } catch (err) {
    // 数据库连接失败：打印明确错误并终止启动（REQ-API-1）
    console.error("MySQL 连接失败，服务终止启动：", err);
    process.exit(1);
  }
}

bootstrap();