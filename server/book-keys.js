/**
 * server/book-keys.js —— 教材版本 key 白名单（服务端校验用）
 *
 * 与前端 miniprogram/utils/constants.js 的 BOOKS 一一对应，
 * 由 tests/unit/book-keys-parity.test.js 守着。
 */
'use strict';

var BOOK_KEYS = ['', 'pep', 'wys', 'bjb'];

function isValidBook(key) {
  return BOOK_KEYS.indexOf(String(key === undefined || key === null ? '' : key)) >= 0;
}

module.exports = { BOOK_KEYS: BOOK_KEYS, isValidBook: isValidBook };
