-- ============================================================
-- 2026-10-28 订阅消息建表
--
-- 用途：记录「用户点过几次允许 / 发出几条 / 最近一次失败原因」。
--       订阅额度在微信侧，服务端查不到，这张表只做观测，不当初筛。
--
-- 是否需要人工执行：**不需要**。
--   server/ensure-tables.js 已把同样的 DDL 登记进启动自检，
--   部署后容器启动时会自动建（幂等，重复启动不会重复建、不会报错）。
--   这份文件是「同源对照」用的，方便 DBA 审计或手工兜底。
--
-- 与 ensure-tables.js 的对应关系：由 tests/unit/ensure-tables.test.js 守住。
-- ============================================================

CREATE TABLE IF NOT EXISTS `subscribe_grants` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `openid` VARCHAR(64) NOT NULL COMMENT '用户标识',
  `scene` VARCHAR(24) NOT NULL COMMENT '订阅场景 key',
  `granted` INT NOT NULL DEFAULT 0 COMMENT '累计同意次数',
  `sent` INT NOT NULL DEFAULT 0 COMMENT '累计发送成功条数',
  `failed` INT NOT NULL DEFAULT 0 COMMENT '累计发送失败条数',
  `lastError` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最近失败原因（errcode:errmsg）',
  `lastGrantAt` DATETIME NULL COMMENT '最近同意时间',
  `lastSendAt` DATETIME NULL COMMENT '最近发送时间',
  `createdAt` DATETIME NOT NULL COMMENT '创建时间',
  `updatedAt` DATETIME NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_subscribe_openid_scene` (`openid`, `scene`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅消息授权与发送记录';
