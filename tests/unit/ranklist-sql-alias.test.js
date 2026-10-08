/**
 * ranklist-sql-alias.test.js —— 排行榜封顶 SQL 的表别名护栏
 *
 * 背景（线上 5000 的真实案例）：封顶表达式读 `users.exam_cleared_tier`，
 * 但星数来自 `rank_records`。曾经只传了一个别名，生成
 * `LEAST(r.stars, CASE r.exam_cleared_tier ...)` → MySQL 报 Unknown column，
 * 排行榜的 /world 与 /me 直接 5000。
 *
 * 这是一个「单测发现不了、SQL 里才炸」的坑（纯逻辑模块 exam-gate 的单测全过），
 * 所以这里直接对源码做静态断言：调用必须同时给出 rank_records 与 users 两个别名。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('排行榜封顶 SQL 别名');

const SRC = fs.readFileSync(
  path.join(__dirname, '../../server/routes/ranklist.js'),
  'utf8'
);

s.test('effectiveStarsExpr 必须接收 rankAlias + userAlias 两个参数', () => {
  s.assert.contains(SRC, 'async function effectiveStarsExpr(rankAlias, userAlias)');
  // 封顶表达式用 users 的别名，星数用 rank_records 的别名
  s.assert.contains(SRC, 'examGate.capSqlCase(userAlias || "u")');
});

s.test('所有调用点都显式传了 users 别名（不能再出现单参数调用）', () => {
  const calls = SRC.match(/effectiveStarsExpr\([^)]*\)/g) || [];
  // 函数定义长这样：effectiveStarsExpr(rankAlias, userAlias) → 按参数名排除
  const invocations = calls.filter(function (c) { return c.indexOf('rankAlias') < 0; });
  s.assert.true(invocations.length >= 2, '调用点数量异常：' + JSON.stringify(invocations));
  invocations.forEach(function (c) {
    s.assert.contains(c, '"u"', '调用缺少 users 别名：' + c);
  });
});

s.test('封顶 SQL 里不出现「星数表别名 + exam_cleared_tier」这种错配', () => {
  // 函数体里 capSqlCase 的入参必须是 userAlias（而非 rankAlias）
  const body = SRC.slice(SRC.indexOf('async function effectiveStarsExpr'), SRC.indexOf('async function examClearedMap'));
  s.assert.false(body.indexOf('capSqlCase(rankAlias)') >= 0, 'capSqlCase 传了 rankAlias');
});

s.done();
