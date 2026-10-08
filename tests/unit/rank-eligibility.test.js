/**
 * rank-eligibility.test.js —— 上榜门槛（口径在 2026-10-08 反转了）
 *
 * 原规则（2026-09-19）：「没设昵称不能上榜」，本意是挡住匿名用户、让榜单读得下去。
 * 但微信从 2022 年起不给真实昵称，让用户主动点键盘上方的「使用微信昵称」又几乎没人点 ——
 * 结果是**把最活跃的那批人全挡在榜外**：线上 22 个用户里 16 个真人登录过、
 * 有人玩了几十局，一个都没上榜。
 *
 * 现规则（2026-10-08，配合「登录即有名」）：**门槛取消**。
 * 注册就发默认昵称（「战士 3F2A」，见 server/nickname-util.js），登录即上榜；
 * 用户身份由 openid 保证唯一，昵称只是展示层。
 *
 * 所以这个用例跟着**反转**：不再要求「必须有门槛」，而是钉住「门槛不许回来」。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('上榜门槛（2026-10-08 已取消）');

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'server/routes/ranklist.js'), 'utf8');
const LOGIN = fs.readFileSync(path.join(ROOT, 'server/routes/login.js'), 'utf8');

s.test('门槛常量已失效（恒真），不能再按昵称过滤', () => {
  s.assert.ok(SRC.indexOf('NICKNAME_READY_SQL') >= 0, '常量保留着，将来要恢复口径只需改这一行');
  const m = /const NICKNAME_READY_SQL = "([^"]+)"/.exec(SRC);
  s.assert.ok(!!m, '常量应是一段 SQL 片段');
  s.assert.equal(m[1], '1=1',
    '必须是恒真片段 —— 一旦写回昵称判断，等于又把不设昵称的活跃用户挡在榜外');
  // 这个片段是拼在 `JOIN ... AND ${...}` 后面的，带 SQL 行尾注释会把同一行后续 SQL 一起吞掉
  s.assert.ok(m[1].indexOf('--') < 0 && m[1].indexOf('/*') < 0, '片段里不能出现 SQL 注释');
});

s.test('三处榜单仍然 JOIN users（取昵称/头像用），但不再用来过滤人', () => {
  const joins = SRC.match(/JOIN users u ON /g) || [];
  s.assert.ok(joins.length >= 4,
    '至少 4 处 JOIN（progress / progress-summary / world 列表 / world 计数），实际 ' + joins.length);
  const withGate = SRC.match(/JOIN users u ON [^\n]*NICKNAME_READY_SQL/g) || [];
  s.assert.equal(withGate.length, joins.length,
    '每处 JOIN 都带上这个常量（现在是恒真，保持写法统一）');
});

s.test('我的名次：不再因为「没昵称」而不返回', () => {
  s.assert.ok(!/if \(!user \|\| !user\.nickname\)/.test(SRC), '不应再按昵称挡住自己');
  s.assert.ok(SRC.indexOf('未设置昵称，暂不上榜') < 0, '那句提示应该已经删掉');
});

s.test('注册就给默认昵称（「登录即有名」的前提）', () => {
  s.assert.contains(LOGIN, 'defaultNickname');
  s.assert.ok(/defaults:\s*\{[^}]*nickname/.test(LOGIN), '建档时要带上默认昵称');
});

s.test('榜单用 displayName 兜底，不再出现「未命名」', () => {
  s.assert.ok(SRC.indexOf('"未命名"') < 0, '源码里不应再出现「未命名」兜底');
  s.assert.contains(SRC, 'displayName');
});

s.done();
