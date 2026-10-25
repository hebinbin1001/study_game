/** 好友 PK 有效期与列表时间展示护栏。 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('好友 PK 有效期 UI');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
}

s.test('PK 有效期统一为 3 天', () => {
  const rules = require('../../server/pk-rules');
  s.assert.equal(rules.PK_EXPIRE_DAYS, 3);
  const wxml = read('miniprogram/pages/pk/pk.wxml');
  s.assert.contains(wxml, '战帖 3 天内有效');
  s.assert.ok(wxml.indexOf('7 天') === -1, '页面仍有旧的 7 天文案');
});

s.test('战帖列表显示发起时间与有效期', () => {
  const js = read('miniprogram/pages/pk/pk.js');
  const wxml = read('miniprogram/pages/pk/pk.wxml');
  const server = read('server/routes/pk.js');
  s.assert.contains(js, 'createdText');
  s.assert.contains(js, 'expireText');
  s.assert.contains(wxml, '发起 {{item.createdText}}');
  s.assert.contains(wxml, '发起：{{match.createdText}}');
  s.assert.contains(server, 'expiresAt');
  s.assert.contains(server, 'createdText');
});

s.test('过期战帖在页面层和 API 层都不能应战', () => {
  const js = read('miniprogram/pages/pk/pk.js');
  const server = read('server/routes/pk.js');
  s.assert.contains(js, '战帖已超过 3 天');
  s.assert.contains(js, 'if (m.expired || !m.canAccept)');
  s.assert.contains(server, 'pkRules.isExpired(row.createdAt)');
});

s.done();
