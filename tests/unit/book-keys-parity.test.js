/**
 * book-keys-parity.test.js —— 前后端教材版本清单一致性
 *
 * 前端 BOOKS 决定用户能选哪些教材版本；服务端 book-keys 校验保存请求。
 * 只改一边会出现「前端能选、服务端拒收」。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('前后端教材版本一致性');

const front = require('../../miniprogram/utils/constants');
const back = require('../../server/book-keys');

s.test('版本 key 完全一致（通用 + pep + wys + bjb）', () => {
  const frontKeys = front.BOOKS.map(function (b) { return b.key; });
  s.assert.deepEqual(back.BOOK_KEYS, frontKeys);
  s.assert.equal(back.BOOK_KEYS[0], '');   // 第一项必须是「通用」
});

s.test('isValidBook：合法通过、非法拒绝', () => {
  s.assert.true(back.isValidBook(''));
  s.assert.true(back.isValidBook('pep'));
  s.assert.true(back.isValidBook('wys'));
  s.assert.true(back.isValidBook('bjb'));
  s.assert.false(back.isValidBook('yilin'));
  s.assert.false(back.isValidBook('PEP'));   // 大小写敏感，避免两套 key 并存
  // null/undefined 视作「通用」（空串），不当作非法输入
  s.assert.true(back.isValidBook(null));
  s.assert.true(back.isValidBook(undefined));
  s.assert.true(front.isValidBook(''));
  s.assert.false(front.isValidBook('abc'));
});

s.done();
