-- 生词本建表脚本（2026-10-28）
--
-- 用途：人工在云开发 MySQL 控制台执行（服务启动时 ensure-tables.js 也会自动建，
--       这份脚本是给「不想等重启」或「要核对线上结构」的场景准备的）。
-- 幂等：CREATE TABLE IF NOT EXISTS，重复执行安全。
--
-- 设计要点：
--   · (openid, word) 唯一 —— 同一个词从拼写题、选择题、结算页各收藏一次，
--     在用户心里都是同一个词，不该出现三条；
--   · 字段存的是**收藏时的快照**（grade/type/hint/ipa），不存题库外键 ——
--     词库会迭代，收藏记录要保留用户当时看到的那个词形与释义；
--   · 不做复习排期，那是错题本（wrong_records）的职责。

CREATE TABLE IF NOT EXISTS `word_favorites` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `openid` VARCHAR(64) NOT NULL COMMENT '用户标识',
  `word` VARCHAR(64) NOT NULL COMMENT '词条（英语单词或成语，已去挖空标记）',
  `grade` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '学段 key（收藏时快照）',
  `type` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '题型（收藏时快照）',
  `hint` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '释义/提示（收藏时快照）',
  `ipa` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '音标（没有就空串）',
  `source` VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源：wrong/result/preview/manual',
  `createdAt` DATETIME NOT NULL COMMENT '创建时间',
  `updatedAt` DATETIME NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_favorite_openid_word` (`openid`, `word`),
  KEY `idx_favorite_openid_updated` (`openid`, `updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生词本';
