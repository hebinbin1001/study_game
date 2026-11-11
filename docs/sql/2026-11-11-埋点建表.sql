-- 2026-11-11 埋点事件表（最小数据回路）
--
-- 说明：生产环境启动时 server/ensure-tables.js 会自动补建/补齐这张表（push 即部署），
-- 这份脚本只是「同一口径的人工执行版」，方便在云托管控制台核对/手动建表。
-- 只增不改：不含 DROP / TRUNCATE / MODIFY / CHANGE。
--
-- day 用 VARCHAR(10) 存北京时间自然日（与 checkin_records.date 同一口径），
-- 避免容器 UTC 时区在 00:00~08:00 把事件算到前一天。

CREATE TABLE IF NOT EXISTS `track_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `openid` VARCHAR(64) NOT NULL COMMENT '用户标识',
  `event` VARCHAR(24) NOT NULL COMMENT 'visit/game_start/game_end/share_open/d1_return',
  `day` VARCHAR(10) NOT NULL COMMENT '北京时间自然日 YYYY-MM-DD',
  `game_type` VARCHAR(24) NOT NULL DEFAULT '' COMMENT '玩法 key',
  `grade` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '学段 key',
  `level` INT NOT NULL DEFAULT 0 COMMENT '关卡号（0=无）',
  `scene` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '启动/分享场景值',
  `stars` TINYINT NOT NULL DEFAULT 0 COMMENT '本局星级 0~3',
  `win` TINYINT NOT NULL DEFAULT 0 COMMENT '是否通关 0/1',
  `duration_ms` INT NOT NULL DEFAULT 0 COMMENT '本局时长（毫秒）',
  `payload` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '附加信息（禁止放正文/隐私）',
  `createdAt` DATETIME NOT NULL COMMENT '创建时间',
  `updatedAt` DATETIME NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_track_day_event` (`day`, `event`),
  KEY `idx_track_openid_day` (`openid`, `day`),
  KEY `idx_track_event_game` (`event`, `game_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='埋点事件';
