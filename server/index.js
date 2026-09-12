const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");

// 引入数据层初始化与 openid 透传中间件
const { init } = require("./db");
const openid = require("./middlewares/openid");

// 引入各业务路由
const healthRouter = require("./routes/health");
const loginRouter = require("./routes/login");
const wxcodeRouter = require("./routes/wxcode");
const userRouter = require("./routes/user");
const nicknameRouter = require("./routes/nickname");
const scoreRouter = require("./routes/score");
const avatarRouter = require("./routes/avatar");
const rankRouter = require("./routes/rank");
const ranklistRouter = require("./routes/ranklist");
const levelRouter = require("./routes/level");
const levelReviewRouter = require("./routes/level-review");
const wrongRouter = require("./routes/wrong");
const checkinRouter = require("./routes/checkin");
const dailyRouter = require("./routes/daily");
const achievementRouter = require("./routes/achievement");
const reportRouter = require("./routes/report");

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

// ============ 静态美术资源（成就图标 / 段位徽章） ============
// 为什么放在服务端而不是代码包里：微信上传时会检测「图片和音频资源大小」，
// 判的是**代码包内图片/音频的总量**（建议超过 200K 就放 CDN、用 URL 引入）。
// 这两批图合计 ~429KB，占了大头 → 移出代码包，由本服务以 /assets/** 静态提供，
// 端上用 utils/art.js 拼成完整 URL（<image> 加载网络图片不受域名白名单限制）。
// 资源目录：仓库根 `art/`，构建时由 Dockerfile COPY 进镜像（见 Dockerfile）。
const ART_DIR = [
  path.join(__dirname, "art"),                 // 容器内：/app/art
  path.join(__dirname, "..", "art"),           // 本地开发：<repo>/art
  path.join(__dirname, "public", "assets"),    // 兼容：若把资源放到 server/public
].find((d) => fs.existsSync(d));
if (ART_DIR) {
  app.use("/assets", express.static(ART_DIR, {
    maxAge: "7d",            // 文件名带内容特征且不常变，允许端上/中间层缓存
    fallthrough: true,       // 找不到就交给后面的 404
  }));
} else {
  console.warn("[art] 未找到静态美术资源目录（art/），成就图标与段位徽章将 404");
}

// 挂载路由（业务路由统一先经过 openid 中间件解析用户身份）
app.use("/api/health", healthRouter);
// 登录接口不需要鉴权（用 code 换 openid）
app.use("/api/login", loginRouter);
// 小程序码生成（不需要用户身份，供分享海报合成调用）
app.use("/api/wxcode", wxcodeRouter);
app.use("/api/user", openid, userRouter);
app.use("/api/nickname", openid, nicknameRouter);
app.use("/api/score", openid, scoreRouter);
app.use("/api/avatar", openid, avatarRouter);
app.use("/api/rank", openid, rankRouter);
app.use("/api/ranklist", openid, ranklistRouter);
app.use("/api/level", openid, levelRouter);
app.use("/api/level/review", openid, levelReviewRouter);
app.use("/api/wrong", openid, wrongRouter);
app.use("/api/checkin", openid, checkinRouter);
app.use("/api/daily", openid, dailyRouter);
app.use("/api/achievement", openid, achievementRouter);
app.use("/api/report", openid, reportRouter);

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
