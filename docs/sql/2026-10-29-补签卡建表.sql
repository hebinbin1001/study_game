-- 补签卡建表（2026-10-29）
--
-- 口径：严格连续签到满 7 天（7/14/21…）发 1 张；一张卡补一天，只能补「昨天」，
--       且「前天」必须有签到记录（否则补了接不上，白花一张）。
--       规则与校验都在 server/makeup-card.js，这里是持久化。
--
-- 执行方式二选一：
--   1. 云托管控制台 SQL 窗口手工执行本文件；
--   2. 什么都不做 —— 服务启动时 server/ensure-tables.js 会自动建（与本次 DDL 逐字一致）。
--
-- 说明：一张卡一行（不是「一个用户一行 + 计数」），因为要回答两个问题：
--   「这张卡是在哪个连续里程碑拿到的」→ streakAt，配合唯一键防重复发放；
--   「这张卡用在哪一天」→ usedFor，出问题能倒查。

CREATE TABLE IF NOT EXISTS `makeup_cards` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `openid` VARCHAR(64) NOT NULL COMMENT '用户标识',
  `streakAt` INT NOT NULL COMMENT '在哪个连续天数里程碑获得（7/14/21…）',
  `usedFor` VARCHAR(10) NULL DEFAULT NULL COMMENT '补签的日期（NULL = 未使用）',
  `usedAt` DATETIME NULL DEFAULT NULL COMMENT '使用时间',
  `createdAt` DATETIME NOT NULL COMMENT '创建时间',
  `updatedAt` DATETIME NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_makeup_openid_streak` (`openid`, `streakAt`),
  KEY `idx_makeup_openid_used` (`openid`, `usedFor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='补签卡';
