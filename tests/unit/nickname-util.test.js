/**
 * nickname-util.test.js —— 默认昵称生成与展示兜底
 *
 * 为什么值得测（2026-10-08）：
 *   原来是「必须设昵称才上榜」，等于把不设昵称的活跃用户全挡在榜外。
 *   改成「注册即有名」之后，这个函数就成了**所有用户名的源头** ——
 *   它一旦生成出空串、超长串或者带奇怪符号的名字，会在排行榜、管理端、
 *   分享卡片上同时冒出来，而且已经落库的名字改起来很麻烦。所以边界要钉死。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('默认昵称与展示兜底');

const N = require('../../server/nickname-util');

s.test('默认昵称：取 openid 里可读字符的后 4 位，大写', () => {
  // 去掉 - 之后是 oYKK5BxASv6V6VhK8wFV3tUHJCQ，后 4 位 HJCQ
  s.assert.equal(N.defaultNickname('oYK-K5BxASv6V6VhK8wFV3tUHJCQ'), '战士 HJCQ');
  s.assert.equal(N.defaultNickname('abc123'), '战士 C123');
});

s.test('默认昵称：把 openid 里的 - 和 _ 过滤掉再取后 4 位', () => {
  // 真实 openid 里带 - 和 _，过滤后长度可能不足 4 → 前面补 0，不能出现空串或短串
  const name = N.defaultNickname('a-b_c');
  s.assert.equal(name.indexOf('战士 '), 0);
  s.assert.equal(name.replace('战士 ', '').length, 4);
});

s.test('默认昵称：脏输入一律退回「战士 0000」，绝不出空串', () => {
  s.assert.equal(N.defaultNickname(''), '战士 0000');
  s.assert.equal(N.defaultNickname(null), '战士 0000');
  s.assert.equal(N.defaultNickname(undefined), '战士 0000');
  s.assert.equal(N.defaultNickname('----'), '战士 0000');
  // 中文字符会被过滤掉，剩下 openid → 后 4 位 enid
  s.assert.equal(N.defaultNickname('中文openid'), '战士 ENID');
});

s.test('默认昵称长度落在公众号/页面的安全区间（2~12 字）', () => {
  ['abc123', '', 'oYK-K5BxASv6V6VhK8wFV3tUHJCQ'].forEach(function (id) {
    const n = N.defaultNickname(id);
    s.assert.true(n.length >= 2 && n.length <= 12, '「' + n + '」长度 ' + n.length);
  });
});

s.test('展示兜底：用户设过就用用户的（含首尾空格要清掉）', () => {
  s.assert.equal(N.displayName('追梦007', 'abc123'), '追梦007');
  s.assert.equal(N.displayName('  皮皮  ', 'abc123'), '皮皮');
});

s.test('展示兜底：没设过就用默认昵称，不出「未命名」', () => {
  s.assert.equal(N.displayName('', 'abc123'), '战士 C123');
  s.assert.equal(N.displayName(null, 'abc123'), '战士 C123');
  s.assert.equal(N.displayName('   ', 'abc123'), '战士 C123');
  s.assert.equal(N.displayName(undefined, ''), '战士 0000');
});

s.test('同一个 openid 永远得到同一个默认名（榜单上不会跳来跳去）', () => {
  const id = 'oYK-K5BxASv6V6VhK8wFV3tUHJCQ';
  s.assert.equal(N.defaultNickname(id), N.defaultNickname(id));
  s.assert.equal(N.displayName('', id), N.displayName(null, id));
});

s.done();
