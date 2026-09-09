const { Sequelize } = require("sequelize");
const mysql = require("mysql2/promise");

// 从环境变量中读取数据库配置（沿用微信云托管约定）
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

// MYSQL_ADDRESS 形如 "host:port"，按 ":" 拆分
const [host, port] = MYSQL_ADDRESS.split(":");

// 运行环境：默认 development
const NODE_ENV = process.env.NODE_ENV || "development";

// 建立 Sequelize 实例，数据库名使用本项目库名 word_warrior
const sequelize = new Sequelize("word_warrior", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql" /* one of 'mysql' | 'mariadb' | 'postgres' | 'mssql' */,
  logging: false, // 关闭 SQL 日志，减少运行期噪音
});

// 引入模型定义（传入 sequelize 实例）
const User = require("./models/user")(sequelize);
const Score = require("./models/score")(sequelize);
const Avatar = require("./models/avatar")(sequelize);
const UserAvatar = require("./models/user-avatar")(sequelize);
const Rank = require("./models/rank")(sequelize);
const RankRecord = require("./models/rank-record")(sequelize);
const CustomLevel = require("./models/custom-level")(sequelize);
const LevelReview = require("./models/level-review")(sequelize);
const WrongRecord = require("./models/wrong-record")(sequelize);
const CheckinRecord = require("./models/checkin-record")(sequelize);
const MilestoneClaim = require("./models/milestone-claim")(sequelize);
const Achievement = require("./models/achievement")(sequelize);
const UserAchievement = require("./models/user-achievement")(sequelize);

// 建立关联
User.hasMany(Score, { foreignKey: "user_id" });
User.hasMany(UserAvatar, { foreignKey: "openid", sourceKey: "openid" });
User.hasMany(RankRecord, { foreignKey: "openid", sourceKey: "openid" });
User.hasMany(CustomLevel, { foreignKey: "authorOpenid", sourceKey: "openid" });
User.hasMany(WrongRecord, { foreignKey: "openid", sourceKey: "openid" });
User.hasMany(CheckinRecord, { foreignKey: "openid", sourceKey: "openid" });
User.hasMany(UserAchievement, { foreignKey: "openid", sourceKey: "openid" });

/**
 * 数据库初始化方法。
 *
 * 按 NODE_ENV 限定 sync 策略，避免每次启动在【生产环境】自动比对/改动表结构：
 *  - development / test（非生产）：执行 sync({ alter: true }) 便捷建表/改表；
 *  - production：只验证数据库连通（authenticate），绝不自动改表——
 *    生产环境的表结构变更必须走 migration 或由 DBA 脚本管理。
 */
// 连接重试配置：扛云托管 MySQL 实例冷启动延迟
const RETRY_TIMES = 5;
const RETRY_BASE_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 确保目标库存在（不依赖云托管 executeSQLs 的建库时机）
async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host,
    port: port ? parseInt(port, 10) : 3306,
    user: MYSQL_USERNAME,
    password: MYSQL_PASSWORD,
  });
  await conn.query(
    "CREATE DATABASE IF NOT EXISTS word_warrior DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await conn.end();
}

// 单次连接/建表尝试（生产仅探测连通，非生产 sync 建表）
async function connect() {
  await ensureDatabase();
  if (NODE_ENV === "production") {
    await sequelize.authenticate();
  } else {
    await sequelize.sync({ alter: true });
    // 非生产环境：初始化内置数据（形象 + 段位）
    const { seedAvatars } = require("./seeders/avatar-seed");
    const { seedRanks } = require("./seeders/rank-seed");
    await seedAvatars(sequelize);
    await seedRanks(sequelize);
  }
}

// 带退避重试的连接：成功即返回，重试耗尽仍失败则抛错
async function init() {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_TIMES; attempt++) {
    try {
      await connect();
      console.log(
        `[db] 连接成功（第 ${attempt} 次尝试，NODE_ENV=${NODE_ENV}）：` +
          (NODE_ENV === "production" ? "跳过 sync 自动建表" : "sync({ alter: true }) 完成")
      );
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[db] 连接失败（第 ${attempt}/${RETRY_TIMES} 次）：${err.message}`);
      if (attempt < RETRY_TIMES) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
  }
  throw lastErr;
}

// 导出连接/初始化方法与模型
module.exports = {
  sequelize,
  init,
  connect,
  User,
  Score,
  Avatar,
  UserAvatar,
  Rank,
  RankRecord,
  CustomLevel,
  LevelReview,
  WrongRecord,
  CheckinRecord,
  MilestoneClaim,
  Achievement,
  UserAchievement,
};