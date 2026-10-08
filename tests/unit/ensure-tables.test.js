/**
 * ensure-tables.test.js —— 生产自动补表清单的静态护栏
 *
 * 这段 DDL 会在生产启动时自动执行，写错一个列名/表名就是线上事故，
 * 而且它跑在容器里、平时看不出来。这里把「只增不改」的边界钉死：
 *   · 三张新表的 DDL 必须带 IF NOT EXISTS；
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
  s.assert.equal(ensure.TABLES.length, 3);
  s.assert.equal(ensure.COLUMNS.length, 1);
  s.assert.equal(ensure.INDEXES.length, 1);
});

s.test('三张表齐备且都用 CREATE TABLE IF NOT EXISTS', () => {
  const names = ensure.TABLES.map(function (t) { return t.name; });
  s.assert.deepEqual(names, ['daily_scores', 'season_claims', 'pk_matches']);
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

s.test('与人工执行脚本同源：SQL 文件里也有这三张表', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../docs/sql/2026-10-08-赛季与PK建表.sql'),
    'utf8'
  );
  ensure.TABLES.forEach(function (t) {
    s.assert.contains(sql, 'CREATE TABLE IF NOT EXISTS `' + t.name + '`');
  });
  s.assert.contains(sql, '`book` VARCHAR(8)');
});

s.done();
