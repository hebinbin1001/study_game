/**
 * ensure-tables.test.js —— 生产自动补表清单的静态护栏
 *
 * 这段 DDL 会在生产启动时自动执行，写错一个列名/表名就是线上事故，
 * 而且它跑在容器里、平时看不出来。这里把「只增不改」的边界钉死：
 *   · 每张新增表的 DDL 必须带 IF NOT EXISTS；
 *   · 不许出现 DROP / TRUNCATE / MODIFY / CHANGE 这类破坏性语句；
 *   · 列与索引必须先查 information_schema 再决定是否执行。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('生产自动补表');

const ensure = require('../../server/ensure-tables');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '../../server/ensure-tables.js'), 'utf8');

s.test('导出的是函数，且带上清单常量', () => {
  s.assert.equal(typeof ensure, 'function');
  s.assert.equal(ensure.TABLES.length, 8);
  s.assert.equal(ensure.COLUMNS.length, 1);
  s.assert.equal(ensure.INDEXES.length, 1);
});

s.test('新表齐备且都用 CREATE TABLE IF NOT EXISTS', () => {
  const names = ensure.TABLES.map(function (t) { return t.name; });
  // 精确比对（而不是「至少包含」）：多一张没人知道的表 = 线上多一份没人维护的 DDL
  s.assert.deepEqual(names, ['daily_scores', 'season_claims', 'pk_matches', 'admin_controls',
    'milestone_claims', 'subscribe_grants', 'word_favorites', 'makeup_cards']);
  ensure.TABLES.forEach(function (t) {
    s.assert.contains(t.ddl, 'CREATE TABLE IF NOT EXISTS `' + t.name + '`');
  });
});

s.test('新增列是 users.book（教材版本），且走先查后加', () => {
  s.assert.equal(ensure.COLUMNS[0].table, 'users');
  s.assert.equal(ensure.COLUMNS[0].column, 'book');
  s.assert.contains(SRC, 'information_schema.COLUMNS');
  s.assert.contains(SRC, 'information_schema.STATISTICS');
  s.assert.contains(SRC, 'information_schema.TABLES');
});

s.test('不含任何破坏性语句（DROP / TRUNCATE / MODIFY / CHANGE / DELETE）', () => {
  const all = ensure.TABLES.map(function (t) { return t.ddl; })
    .concat(ensure.COLUMNS.map(function (c) { return c.ddl; }))
    .concat(ensure.INDEXES.map(function (i) { return i.ddl; }))
    .join(' ');
  ['DROP ', 'TRUNCATE', 'MODIFY ', 'CHANGE ', 'DELETE '].forEach(function (bad) {
    s.assert.false(all.toUpperCase().indexOf(bad) >= 0, '出现破坏性语句：' + bad);
  });
});

s.test('与人工执行脚本同源：docs/sql 下的脚本里都有这些表', () => {
  // 2026-10-28 起改为扫整个 docs/sql 目录：每批新表配一份自己的脚本，
  // 而不是往 2026-10-08 那份里追加 —— 那样脚本会越来越长、越来越难对照。
  const dir = path.join(__dirname, '../../docs/sql');
  const sql = fs.readdirSync(dir)
    .filter(function (f) { return /\.sql$/.test(f); })
    .map(function (f) { return fs.readFileSync(path.join(dir, f), 'utf8'); })
    .join('\n');
  ensure.TABLES.forEach(function (t) {
    s.assert.contains(sql, 'CREATE TABLE IF NOT EXISTS `' + t.name + '`');
  });
  s.assert.contains(sql, '`book` VARCHAR(8)');
});

s.done();
