const { Sequelize } = require("sequelize");

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

// 建立关联：一个用户拥有多条成绩
User.hasMany(Score, { foreignKey: "user_id" });

/**
 * 数据库初始化方法。
 *
 * 按 NODE_ENV 限定 sync 策略，避免每次启动在【生产环境】自动比对/改动表结构：
 *  - development / test（非生产）：执行 sync({ alter: true }) 便捷建表/改表；
 *  - production：只验证数据库连通（authenticate），绝不自动改表——
 *    生产环境的表结构变更必须走 migration 或由 DBA 脚本管理。
 */
async function init() {
  if (NODE_ENV === "production") {
    await sequelize.authenticate(); // 仅探测连通性
    console.log(
      `[db] 生产模式（NODE_ENV=${NODE_ENV}）：跳过 sync 自动建表/改表，表结构变更请走 migration`
    );
  } else {
    await sequelize.sync({ alter: true });
    console.log(
      `[db] 非生产模式（NODE_ENV=${NODE_ENV}）：执行 sync({ alter: true }) 同步表结构`
    );
  }
}

// 导出初始化方法与模型
module.exports = {
  sequelize,
  init,
  User,
  Score,
};