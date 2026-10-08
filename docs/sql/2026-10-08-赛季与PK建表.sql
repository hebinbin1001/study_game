-- ============================================================
-- 词力战士 · 2026-10-08 新功能建表脚本
-- 内容：每日挑战赛 / 赛季奖励 / 好友 PK（异步战帖）三张表
--
-- ⚠️ 生产环境（NODE_ENV=production）不会自动同步表结构，必须手动执行本脚本。
--    执行前建议先备份：
--      mysqldump -h <host> -P <port> -u <user> -p word_warrior > backup_before_20261008.sql
--    脚本使用 CREATE TABLE IF NOT EXISTS，可重复执行（幂等）。
--    未建表时接口会自动降级为「功能准备中」，不会 500，但新玩法不可用。
-- ============================================================

-- ------------------------------------------------------------
-- 一、每日挑战赛成绩表
-- 一人一天一行；当天重打只保留最好成绩（服务端 upsert 取优）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_scores` (
  `id`         INT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `openid`     VARCHAR(64) NOT NULL COMMENT '用户标识',
  `dateKey`    VARCHAR(10) NOT NULL COMMENT '挑战日期（东八区，YYYY-MM-DD）',
  `grade`      VARCHAR(16) NOT NULL DEFAULT '' COMMENT '学段 key（kg/g1…college）',
  `correct`    INT NOT NULL DEFAULT 0 COMMENT '答对题数',
  `total`      INT NOT NULL DEFAULT 0 COMMENT '总题数',
  `durationMs` INT NOT NULL DEFAULT 0 COMMENT '总用时（毫秒）',
  `score`      INT NOT NULL DEFAULT 0 COMMENT '展示用分数',
  `createdAt`  DATETIME NOT NULL COMMENT '创建时间',
  `updatedAt`  DATETIME NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_daily_openid_date` (`openid`, `dateKey`),
  KEY `idx_daily_date_grade` (`dateKey`, `grade`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日挑战赛成绩';


-- ------------------------------------------------------------
-- 二、赛季奖励领取记录表
-- 一个用户一个赛季只能领一次
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `season_claims` (
  `id`        CHAR(36) NOT NULL COMMENT '主键（UUID）',
  `openid`    VARCHAR(64) NOT NULL COMMENT '用户标识',
  `seasonKey` VARCHAR(16) NOT NULL COMMENT '赛季 key（如 2026-S5）',
  `tier`      VARCHAR(16) NOT NULL DEFAULT '' COMMENT '奖励档位（top3/top10/active）',
  `rank`      INT NOT NULL DEFAULT 0 COMMENT '领取时的赛季名次',
  `stars`     INT NOT NULL DEFAULT 0 COMMENT '发放星数',
  `createdAt` DATETIME NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_season_openid` (`openid`, `seasonKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='赛季奖励领取记录';


-- ------------------------------------------------------------
-- 三、好友 PK 战帖表
-- 一行 = 一张战帖（发起人成绩 + 应战人成绩 + 胜负 + 奖励星）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pk_matches` (
  `matchId`          CHAR(36) NOT NULL COMMENT '主键（UUID）',
  `code`             VARCHAR(16) NOT NULL COMMENT '短码（分享链接用）',
  `seed`             INT NOT NULL DEFAULT 0 COMMENT '题目种子',
  `grade`            VARCHAR(16) NOT NULL DEFAULT '' COMMENT '学段 key',
  `lineMode`         VARCHAR(24) NOT NULL DEFAULT '' COMMENT '玩法线 key',
  `level`            INT NOT NULL DEFAULT 1 COMMENT '关卡号',
  `challengerOpenid` VARCHAR(64) NOT NULL COMMENT '发起人 openid',
  `challengerNick`   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '发起人昵称快照',
  `challengerCorrect` INT NOT NULL DEFAULT 0 COMMENT '发起人答对数',
  `challengerTotal`  INT NOT NULL DEFAULT 0 COMMENT '发起人总题数',
  `challengerMs`     INT NOT NULL DEFAULT 0 COMMENT '发起人用时(ms)',
  `challengerReward` INT NOT NULL DEFAULT 0 COMMENT '发起人奖励星',
  `opponentOpenid`   VARCHAR(64) NULL COMMENT '应战人 openid',
  `opponentNick`     VARCHAR(64) NOT NULL DEFAULT '' COMMENT '应战人昵称快照',
  `opponentCorrect`  INT NOT NULL DEFAULT 0 COMMENT '应战人答对数',
  `opponentTotal`    INT NOT NULL DEFAULT 0 COMMENT '应战人总题数',
  `opponentMs`       INT NOT NULL DEFAULT 0 COMMENT '应战人用时(ms)',
  `opponentReward`   INT NOT NULL DEFAULT 0 COMMENT '应战人奖励星',
  `status`           VARCHAR(8) NOT NULL DEFAULT 'open' COMMENT '状态：open/done',
  `winner`           VARCHAR(12) NOT NULL DEFAULT '' COMMENT 'challenger/opponent/draw',
  `finishedAt`       DATETIME NULL COMMENT '结算时间',
  `createdAt`        DATETIME NOT NULL COMMENT '创建时间',
  `updatedAt`        DATETIME NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`matchId`),
  UNIQUE KEY `uniq_pk_code` (`code`),
  KEY `idx_pk_challenger` (`challengerOpenid`),
  KEY `idx_pk_opponent` (`opponentOpenid`),
  KEY `idx_pk_finished` (`status`, `finishedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友PK战帖';


-- ------------------------------------------------------------
-- 四、性能索引（可选，但赛季聚合会按时间扫 scores，建议加）
--
-- MySQL 不支持 CREATE INDEX IF NOT EXISTS；若该索引已存在会报 1061 Duplicate key name，
-- 属正常现象，忽略即可。也可先执行下面这条查询确认是否已存在：
--   SHOW INDEX FROM scores WHERE Key_name = 'idx_scores_created';
-- ------------------------------------------------------------
ALTER TABLE `scores` ADD INDEX `idx_scores_created` (`createdAt`);

-- ------------------------------------------------------------
-- 五、教材版本列（二期：教材对接，2026-10-08）
--
-- 用途：记住用户选的教材版本（''=通用 / pep=人教版 / wys=外研版 / bjb=部编版），
--       换设备后仍生效。列没建时接口自动降级为「仅本地生效」，不影响使用。
-- 同样：列已存在会报 1060 Duplicate column name，可忽略。
--   如需先确认：SHOW COLUMNS FROM users LIKE 'book';
-- ------------------------------------------------------------
ALTER TABLE `users` ADD COLUMN `book` VARCHAR(8) NULL COMMENT '教材版本（空=通用/pep/wys/bjb）';


-- ------------------------------------------------------------
-- 六、执行后自检
-- ------------------------------------------------------------
-- SELECT COUNT(*) FROM daily_scores;
-- SELECT COUNT(*) FROM season_claims;
-- SELECT COUNT(*) FROM pk_matches;
-- SHOW INDEX FROM scores WHERE Key_name = 'idx_scores_created';
-- SHOW COLUMNS FROM users LIKE 'book';
