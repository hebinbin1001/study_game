/**
 * rank-eligibility.test.js —— 上榜门槛（2026-09-19 用户要求）
 *
 * 用户原话：「没有注册的用户不能上排行榜」。这里的「没注册」= 登录了但没设昵称
 * （没走完资料那一步）—— 他们此前会以「未命名」出现在榜上。
 *
 * 这条规则是**查询侧**过滤（成绩照旧入库，补完昵称立刻上榜），共三处榜单 + 我的名次，
 * 任何一处漏了都会重新冒出「未命名」。用例直接扫源码把四处钉住。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('上榜门槛（必须有昵称）');

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'server/routes/ranklist.js'), 'utf8');

s.test('统一门槛常量存在，且包含「非空昵称」判断', () => {
  s.assert.ok(SRC.indexOf('NICKNAME_READY_SQL') >= 0, '应有统一的门槛常量');
  const m = /const NICKNAME_READY_SQL = "([^"]+)"/.exec(SRC);
  s.assert.ok(!!m, '常量应是一段 SQL 片段');
  s.assert.contains(m[1], 'u.nickname IS NOT NULL');
  s.assert.contains(m[1], "u.nickname <> ''");
});

s.test('三处榜单查询都 JOIN users 并按门槛过滤', () => {
  // JOIN users u ON ... AND <门槛>  出现次数 = /progress、/progress-summary、/world（+count）
  const joins = SRC.match(/JOIN users u ON /g) || [];
  s.assert.ok(joins.length >= 4,
    '至少 4 处 JOIN 带门槛（progress / progress-summary / world 列表 / world 计数），实际 ' + joins.length);
  const withGate = SRC.match(/JOIN users u ON [^\n]*NICKNAME_READY_SQL/g) || [];
  s.assert.equal(withGate.length, joins.length, '每一处 JOIN 都必须带门槛，不能只 JOIN 不过滤');
});

s.test('我的名次：没昵称就直接不上榜（返回 data null）', () => {
  s.assert.ok(/if \(!user \|\| !user\.nickname\)/.test(SRC), '/me 应判断自己有没有昵称');
  s.assert.contains(SRC, 'data: null, message: "未设置昵称，暂不上榜"');
});

s.test('我的名次计算也用同一门槛（否则名次和别人看到的榜对不上）', () => {
  const meSection = SRC.slice(SRC.indexOf('计算我的排名'));
  const gates = meSection.match(/NICKNAME_READY_SQL/g) || [];
  s.assert.ok(gates.length >= 2, '「比我高」和「同星」两段计数都要带门槛，实际 ' + gates.length);
});

s.test('总榜不再有「未命名」兜底（上榜的人一定有昵称）', () => {
  s.assert.ok(SRC.indexOf('"未命名"') < 0, '源码里不应再出现「未命名」兜底');
});
