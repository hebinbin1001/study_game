/**
 * server/ensure-tables.js —— 生产环境启动时自动补齐「新增表 / 新增列 / 新增索引」
 *
 * 为什么需要（2026-10-08）：
 *   每日挑战 / 赛季 / 好友 PK 要三张新表，用户在云托管控制台手动执行 SQL 时报
 *   `ETIMEDOUT（connect）` —— 那是**执行入口连不上 MySQL**，不是语句有问题。
 *   而容器本身连数据库是通的（启动时 authenticate 成功、/api/health 返回 db:connected）。
 *   所以让服务在启动时自己把缺的结构补上，比让用户反复试控制台更可靠。
 *
 * 安全边界（很重要，别扩大）：
 *   · 只执行 `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN`（先查 information_schema）/
 *     `ADD INDEX`（先查 STATISTICS）——**全是「缺什么补什么」，不改已有列、不删任何东西**；
 *   · 幂等：重复启动不会重复建、不会报错；
 *   · 失败只告警不阻断启动（新功能不可用，但老功能照常）；
 *   · 生产环境的**其它**表结构变更仍需人工 migration —— 这份清单只覆盖本次新增。
 *
 * 与 docs/sql/2026-10-08-赛季与PK建表.sql 保持一致（人工执行脚本仍然保留，
 * 两条路等价：手动执行 SQL 或直接部署）。
 *
 * 注意：本模块**不 require ./db**，sequelize 实例由调用方传入，避免循环依赖。
 */
'use strict';

/** 需要确保存在的表（DDL 与 docs/sql 脚本逐字一致） */
const TABLES = [
  {
    name: 'daily_scores',
    ddl:
      'CREATE TABLE IF NOT EXISTS `daily_scores` (' +
      ' `id` INT NOT NULL AUTO_INCREMENT COMMENT \'主键\',' +
      ' `openid` VARCHAR(64) NOT NULL COMMENT \'用户标识\',' +
      ' `dateKey` VARCHAR(10) NOT NULL COMMENT \'挑战日期（东八区，YYYY-MM-DD）\',' +
      ' `grade` VARCHAR(16) NOT NULL DEFAULT \'\' COMMENT \'学段 key（kg/g1…college）\',' +
      ' `correct` INT NOT NULL DEFAULT 0 COMMENT \'答对题数\',' +
      ' `total` INT NOT NULL DEFAULT 0 COMMENT \'总题数\',' +
      ' `durationMs` INT NOT NULL DEFAULT 0 COMMENT \'总用时（毫秒）\',' +
      ' `score` INT NOT NULL DEFAULT 0 COMMENT \'展示用分数\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' `updatedAt` DATETIME NOT NULL COMMENT \'更新时间\',' +
      ' PRIMARY KEY (`id`),' +
      ' UNIQUE KEY `uniq_daily_openid_date` (`openid`, `dateKey`),' +
      ' KEY `idx_daily_date_grade` (`dateKey`, `grade`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'每日挑战赛成绩\''
  },
  {
    name: 'season_claims',
    ddl:
      'CREATE TABLE IF NOT EXISTS `season_claims` (' +
      ' `id` CHAR(36) NOT NULL COMMENT \'主键（UUID）\',' +
      ' `openid` VARCHAR(64) NOT NULL COMMENT \'用户标识\',' +
      ' `seasonKey` VARCHAR(16) NOT NULL COMMENT \'赛季 key（如 2026-S5）\',' +
      ' `tier` VARCHAR(16) NOT NULL DEFAULT \'\' COMMENT \'奖励档位（top3/top10/active）\',' +
      ' `rank` INT NOT NULL DEFAULT 0 COMMENT \'领取时的赛季名次\',' +
      ' `stars` INT NOT NULL DEFAULT 0 COMMENT \'发放星数\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' PRIMARY KEY (`id`),' +
      ' UNIQUE KEY `uniq_season_openid` (`openid`, `seasonKey`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'赛季奖励领取记录\''
  },
  {
    name: 'pk_matches',
    ddl:
      'CREATE TABLE IF NOT EXISTS `pk_matches` (' +
      ' `matchId` CHAR(36) NOT NULL COMMENT \'主键（UUID）\',' +
      ' `code` VARCHAR(16) NOT NULL COMMENT \'短码（分享链接用）\',' +
      ' `seed` INT NOT NULL DEFAULT 0 COMMENT \'题目种子\',' +
      ' `grade` VARCHAR(16) NOT NULL DEFAULT \'\' COMMENT \'学段 key\',' +
      ' `lineMode` VARCHAR(24) NOT NULL DEFAULT \'\' COMMENT \'玩法线 key\',' +
      ' `level` INT NOT NULL DEFAULT 1 COMMENT \'关卡号\',' +
      ' `challengerOpenid` VARCHAR(64) NOT NULL COMMENT \'发起人 openid\',' +
      ' `challengerNick` VARCHAR(64) NOT NULL DEFAULT \'\' COMMENT \'发起人昵称快照\',' +
      ' `challengerCorrect` INT NOT NULL DEFAULT 0 COMMENT \'发起人答对数\',' +
      ' `challengerTotal` INT NOT NULL DEFAULT 0 COMMENT \'发起人总题数\',' +
      ' `challengerMs` INT NOT NULL DEFAULT 0 COMMENT \'发起人用时(ms)\',' +
      ' `challengerReward` INT NOT NULL DEFAULT 0 COMMENT \'发起人奖励星\',' +
      ' `opponentOpenid` VARCHAR(64) NULL COMMENT \'应战人 openid\',' +
      ' `opponentNick` VARCHAR(64) NOT NULL DEFAULT \'\' COMMENT \'应战人昵称快照\',' +
      ' `opponentCorrect` INT NOT NULL DEFAULT 0 COMMENT \'应战人答对数\',' +
      ' `opponentTotal` INT NOT NULL DEFAULT 0 COMMENT \'应战人总题数\',' +
      ' `opponentMs` INT NOT NULL DEFAULT 0 COMMENT \'应战人用时(ms)\',' +
      ' `opponentReward` INT NOT NULL DEFAULT 0 COMMENT \'应战人奖励星\',' +
      ' `status` VARCHAR(8) NOT NULL DEFAULT \'open\' COMMENT \'状态：open/done\',' +
      ' `winner` VARCHAR(12) NOT NULL DEFAULT \'\' COMMENT \'challenger/opponent/draw\',' +
      ' `finishedAt` DATETIME NULL COMMENT \'结算时间\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' `updatedAt` DATETIME NOT NULL COMMENT \'更新时间\',' +
      ' PRIMARY KEY (`matchId`),' +
      ' UNIQUE KEY `uniq_pk_code` (`code`),' +
      ' KEY `idx_pk_challenger` (`challengerOpenid`),' +
      ' KEY `idx_pk_opponent` (`opponentOpenid`),' +
      ' KEY `idx_pk_finished` (`status`, `finishedAt`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'好友PK战帖\''
  },
  {
    name: 'admin_controls',
    ddl:
      'CREATE TABLE IF NOT EXISTS `admin_controls` (' +
      ' `id` INT NOT NULL AUTO_INCREMENT COMMENT \'主键\',' +
      ' `ctype` VARCHAR(16) NOT NULL COMMENT \'ban_user / pause_game\',' +
      ' `target` VARCHAR(64) NOT NULL COMMENT \'openid 或玩法 key\',' +
      ' `value` VARCHAR(255) NULL COMMENT \'原因\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' `updatedAt` DATETIME NOT NULL COMMENT \'更新时间\',' +
      ' PRIMARY KEY (`id`),' +
      ' UNIQUE KEY `uniq_admin_control` (`ctype`, `target`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'管理员运营控制\''
  },
  {
    name: 'milestone_claims',
    ddl:
      'CREATE TABLE IF NOT EXISTS `milestone_claims` (' +
      ' `id` CHAR(36) NOT NULL COMMENT \'主键\',' +
      ' `openid` VARCHAR(64) NOT NULL COMMENT \'用户标识\',' +
      ' `day` INT NOT NULL COMMENT \'连续天数里程碑\',' +
      ' `reward` VARCHAR(32) NOT NULL DEFAULT \'\' COMMENT \'奖励类型\',' +
      ' `avatarId` VARCHAR(32) NOT NULL DEFAULT \'\' COMMENT \'皮肤标识\',' +
      ' `stars` INT NOT NULL DEFAULT 0 COMMENT \'奖励星数\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' PRIMARY KEY (`id`),' +
      ' UNIQUE KEY `uniq_milestone_openid_day` (`openid`, `day`),' +
      ' KEY `idx_milestone_openid` (`openid`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'每日一题里程碑领取记录\''
  },
  {
    // 2026-10-28 订阅消息：记录「用户点过几次允许 / 发出几条 / 最近失败原因」。
    // 只是观测用，发送时不拿它当闸门（见 server/subscribe.js 的说明）。
    name: 'subscribe_grants',
    ddl:
      'CREATE TABLE IF NOT EXISTS `subscribe_grants` (' +
      ' `id` INT NOT NULL AUTO_INCREMENT COMMENT \'主键\',' +
      ' `openid` VARCHAR(64) NOT NULL COMMENT \'用户标识\',' +
      ' `scene` VARCHAR(24) NOT NULL COMMENT \'订阅场景 key\',' +
      ' `granted` INT NOT NULL DEFAULT 0 COMMENT \'累计同意次数\',' +
      ' `sent` INT NOT NULL DEFAULT 0 COMMENT \'累计发送成功条数\',' +
      ' `failed` INT NOT NULL DEFAULT 0 COMMENT \'累计发送失败条数\',' +
      ' `lastError` VARCHAR(64) NOT NULL DEFAULT \'\' COMMENT \'最近失败原因（errcode:errmsg）\',' +
      ' `lastGrantAt` DATETIME NULL COMMENT \'最近同意时间\',' +
      ' `lastSendAt` DATETIME NULL COMMENT \'最近发送时间\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' `updatedAt` DATETIME NOT NULL COMMENT \'更新时间\',' +
      ' PRIMARY KEY (`id`),' +
      ' UNIQUE KEY `uniq_subscribe_openid_scene` (`openid`, `scene`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'订阅消息授权与发送记录\''
  },
  {
    name: 'word_favorites',
    ddl:
      'CREATE TABLE IF NOT EXISTS `word_favorites` (' +
      ' `id` INT NOT NULL AUTO_INCREMENT COMMENT \'主键\',' +
      ' `openid` VARCHAR(64) NOT NULL COMMENT \'用户标识\',' +
      ' `word` VARCHAR(64) NOT NULL COMMENT \'词条（英语单词或成语，已去挖空标记）\',' +
      ' `grade` VARCHAR(16) NOT NULL DEFAULT \'\' COMMENT \'学段 key（收藏时快照）\',' +
      ' `type` VARCHAR(16) NOT NULL DEFAULT \'\' COMMENT \'题型（收藏时快照）\',' +
      ' `hint` VARCHAR(128) NOT NULL DEFAULT \'\' COMMENT \'释义/提示（收藏时快照）\',' +
      ' `ipa` VARCHAR(64) NOT NULL DEFAULT \'\' COMMENT \'音标（没有就空串）\',' +
      ' `source` VARCHAR(16) NOT NULL DEFAULT \'manual\' COMMENT \'来源：wrong/result/preview/manual\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' `updatedAt` DATETIME NOT NULL COMMENT \'更新时间\',' +
      ' PRIMARY KEY (`id`),' +
      // 唯一键按 word 而不是 questionId：同一个词从拼写题和选择题收藏，用户心里是同一条
      ' UNIQUE KEY `uniq_favorite_openid_word` (`openid`, `word`),' +
      ' KEY `idx_favorite_openid_updated` (`openid`, `updatedAt`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'生词本\''
  },
  {
    name: 'makeup_cards',
    ddl:
      'CREATE TABLE IF NOT EXISTS `makeup_cards` (' +
      ' `id` INT NOT NULL AUTO_INCREMENT COMMENT \'主键\',' +
      ' `openid` VARCHAR(64) NOT NULL COMMENT \'用户标识\',' +
      ' `streakAt` INT NOT NULL COMMENT \'在哪个连续天数里程碑获得（7/14/21…）\',' +
      ' `usedFor` VARCHAR(10) NULL DEFAULT NULL COMMENT \'补签的日期（NULL = 未使用）\',' +
      ' `usedAt` DATETIME NULL DEFAULT NULL COMMENT \'使用时间\',' +
      ' `createdAt` DATETIME NOT NULL COMMENT \'创建时间\',' +
      ' `updatedAt` DATETIME NOT NULL COMMENT \'更新时间\',' +
      ' PRIMARY KEY (`id`),' +
      // 同一里程碑只发一次：补签重算 / 接口重试 / 并发都靠这个键兜住
      ' UNIQUE KEY `uniq_makeup_openid_streak` (`openid`, `streakAt`),' +
      // 查「有没有未使用的卡」走这条（usedFor IS NULL）
      ' KEY `idx_makeup_openid_used` (`openid`, `usedFor`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'补签卡\''
  }
];

/** 需要确保存在的列（列不存在才 ALTER —— MySQL 的 ADD COLUMN 不支持 IF NOT EXISTS） */
const COLUMNS = [
  {
    table: 'users',
    column: 'book',
    ddl: 'ALTER TABLE `users` ADD COLUMN `book` VARCHAR(8) NULL COMMENT \'教材版本（空=通用/pep/wys）\''
  }
];

/** 需要确保存在的索引（赛季聚合按时间扫 scores） */
const INDEXES = [
  {
    table: 'scores',
    index: 'idx_scores_created',
    ddl: 'ALTER TABLE `scores` ADD INDEX `idx_scores_created` (`createdAt`)'
  }
];

/** 表是否存在 */
async function tableExists(sequelize, table) {
  const [rows] = await sequelize.query(
    'SELECT COUNT(*) AS c FROM information_schema.TABLES' +
    ' WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    { replacements: [table] }
  );
  return (parseInt((rows[0] || {}).c, 10) || 0) > 0;
}

/** 列是否存在 */
async function columnExists(sequelize, table, column) {
  const [rows] = await sequelize.query(
    'SELECT COUNT(*) AS c FROM information_schema.COLUMNS' +
    ' WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    { replacements: [table, column] }
  );
  return (parseInt((rows[0] || {}).c, 10) || 0) > 0;
}

/** 索引是否存在 */
async function indexExists(sequelize, table, index) {
  const [rows] = await sequelize.query(
    'SELECT COUNT(*) AS c FROM information_schema.STATISTICS' +
    ' WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    { replacements: [table, index] }
  );
  return (parseInt((rows[0] || {}).c, 10) || 0) > 0;
}

/**
 * 补齐所有「新增表 / 新增列 / 新增索引」（幂等）。
 * @param {Object} sequelize Sequelize 实例（由 db.js 传入，避免循环依赖）
 * @returns {Promise<{tables:string[], columns:string[], indexes:string[]}>} 本次实际新建的对象
 */
async function ensureTables(sequelize) {
  const created = { tables: [], columns: [], indexes: [] };

  for (const t of TABLES) {
    // 先查再建：CREATE TABLE IF NOT EXISTS 不告诉我们「是不是新建的」，日志里要能看出来
    const exists = await tableExists(sequelize, t.name);
    await sequelize.query(t.ddl);
    if (!exists) created.tables.push(t.name);
  }

  for (const c of COLUMNS) {
    if (await columnExists(sequelize, c.table, c.column)) continue;
    await sequelize.query(c.ddl);
    created.columns.push(c.table + '.' + c.column);
  }

  for (const i of INDEXES) {
    if (await indexExists(sequelize, i.table, i.index)) continue;
    try {
      await sequelize.query(i.ddl);
      created.indexes.push(i.table + '.' + i.index);
    } catch (e) {
      // 索引只是性能优化：个别库（如只读副本/权限受限）建不了也不该阻断启动
      console.warn('[ensure-tables] 建索引失败（忽略）：' + i.table + '.' + i.index + ' - ' + (e && e.message));
    }
  }

  if (created.tables.length || created.columns.length || created.indexes.length) {
    console.log('[ensure-tables] 本次新建：' + JSON.stringify(created));
  }
  return created;
}

module.exports = ensureTables;
module.exports.TABLES = TABLES;
module.exports.COLUMNS = COLUMNS;
module.exports.INDEXES = INDEXES;
