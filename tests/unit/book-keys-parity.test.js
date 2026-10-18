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

s.test('版本 key 完全一致（通用 + pep + wys）', () => {
  const frontKeys = front.BOOKS.map(function (b) { return b.key; });
  s.assert.deepEqual(back.BOOK_KEYS, frontKeys);
  s.assert.equal(back.BOOK_KEYS[0], '');   // 第一项必须是「通用」
  // 2026-10-18 拍板：部编版删除（语文不分版本，选了也不生效，是假选项）
  s.assert.false(back.isValidBook('bjb'));
  s.assert.true(front.BOOKS.every(function (b) { return b.key !== 'bjb'; }));
});

s.test('初高中不可选教材版本（中高考词汇统一）', () => {
  ['kg', 'g1', 'g6'].forEach(function (g) {
    s.assert.true(front.isBookSelectable(g), g + ' 应可选版本');
  });
  ['g7', 'g8', 'g9', 'g10', 'g11', 'g12', 'college'].forEach(function (g) {
    s.assert.false(front.isBookSelectable(g), g + ' 不应可选版本');
  });
  s.assert.false(front.isBookSelectable(''));
});

s.test('isValidBook：合法通过、非法拒绝', () => {
  s.assert.true(back.isValidBook(''));
  s.assert.true(back.isValidBook('pep'));
  s.assert.true(back.isValidBook('wys'));
  s.assert.false(back.isValidBook('bjb'));
  s.assert.false(back.isValidBook('yilin'));
  s.assert.false(back.isValidBook('PEP'));   // 大小写敏感，避免两套 key 并存
  s.assert.true(back.isValidBook(null));
  s.assert.true(back.isValidBook(undefined));
  s.assert.true(front.isValidBook(''));
  s.assert.false(front.isValidBook('bjb'));
  s.assert.false(front.isValidBook('abc'));
});

s.done();
