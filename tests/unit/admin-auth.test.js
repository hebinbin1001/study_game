/**
 * admin-auth.test.js —— 管理员判定 + 昵称脱敏（2026-09-13）
 *
 * 需求：管理员能看别人微信昵称与统计；普通用户看不到别的微信名（排行榜脱敏）。
 * 安全默认：ADMIN_OPENIDS / ADMIN_PASSCODE 都没配 → 谁都不是管理员。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('管理员判定与昵称脱敏');

const { checkAdmin, pickWxNickname, maskNickname, maskOpenid, adminOpenidSet } = require('../../server/admin-auth');

s.test('默认安全：两个环境变量都没配 → 谁都不是管理员', () => {
  s.assert.equal(checkAdmin('o1', 'any', {}).ok, false);
  s.assert.equal(checkAdmin('o1', '', {}).ok, false);
});

s.test('openid 白名单命中即管理员（逗号分隔、允许空格）', () => {
  const env = { ADMIN_OPENIDS: 'oA, oB ,,oC' };
  s.assert.equal(adminOpenidSet(env).size, 3);
  s.assert.equal(checkAdmin('oB', '', env).ok, true);
  s.assert.equal(checkAdmin('oB', '', env).by, 'openid');
  s.assert.equal(checkAdmin('oX', '', env).ok, false);
});

s.test('口令命中即管理员；口令为空串时不能靠空口令进', () => {
  const env = { ADMIN_PASSCODE: 'secret-123' };
  s.assert.equal(checkAdmin('oX', 'secret-123', env).ok, true);
  s.assert.equal(checkAdmin('oX', 'secret-123', env).by, 'passcode');
  s.assert.equal(checkAdmin('oX', 'wrong', env).ok, false);
  s.assert.equal(checkAdmin('oX', '', { ADMIN_PASSCODE: '' }).ok, false);
});

s.test('昵称脱敏：保留首字，其余打码（最多 3 个星）', () => {
  s.assert.equal(maskNickname('张三丰'), '张**');
  s.assert.equal(maskNickname('小'), '*');
  s.assert.equal(maskNickname('Abcdef'), 'A***');
  s.assert.equal(maskNickname(''), '用户');
  s.assert.equal(maskNickname('未命名'), '用户');
  s.assert.equal(maskNickname(null), '用户');
});

s.test('微信名白名单（用户要求：只有 h842917647 是管理员）', () => {
  const env = { ADMIN_WX_NICKNAMES: 'h842917647' };
  s.assert.equal(checkAdmin('o1', '', env, 'h842917647').ok, true);
  s.assert.equal(checkAdmin('o1', '', env, 'h842917647').by, 'wxNickname');
  s.assert.equal(checkAdmin('o1', '', env, 'H842917647 ').ok, true, '大小写/空格不敏感');
  s.assert.equal(checkAdmin('o1', '', env, '别人').ok, false, '其他人都看不到');
  s.assert.equal(checkAdmin('o1', '', env, '').ok, false, '没有微信名不放行');
  s.assert.equal(checkAdmin('o1', '', {}, 'h842917647').ok, false, '未配置白名单时不放行');
});

s.test('openid 掩码：前 6 后 4，短串只留前缀', () => {
  s.assert.equal(maskOpenid('oABCDEFGHIJKL'), 'oABCDE****IJKL');
  s.assert.equal(maskOpenid('short'), 'sho***');
  s.assert.equal(maskOpenid(''), '');
});

s.test('微信名取值：列就绪时只认 wx_nickname，禁止回落到展示昵称（防越权）', () => {
  const row = { nickname: 'h842917647', wx_nickname: '' };
  // 用户 2026-09-13 已执行 DDL → 列就绪：展示昵称冒充管理员微信名不算数
  s.assert.equal(pickWxNickname(row, true), '', '列就绪时展示昵称不参与白名单');
  s.assert.equal(pickWxNickname({ nickname: '小明', wx_nickname: 'h842917647' }, true), 'h842917647');
  // 列未就绪（DDL 未执行）→ 退化兜底，保证管理端至少能用
  s.assert.equal(pickWxNickname(row, false), 'h842917647');
  s.assert.equal(pickWxNickname(null, true), '');
  s.assert.equal(pickWxNickname(undefined, false), '');
});
