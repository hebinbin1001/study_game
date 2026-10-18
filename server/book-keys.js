/**
 * server/book-keys.js —— 教材版本 key 白名单（服务端校验用）
 *
 * 与前端 miniprogram/utils/constants.js 的 BOOKS 一一对应，
 * 由 tests/unit/book-keys-parity.test.js 守着。
 *
 * 2026-10-18：删除 'bjb'（部编版）。语文全国统一、本就不分版本，
 * 这个 key 存了也不改变出题结果，属于假选项；初高中也不细分版本
 * （中考/高考词汇统一），因此这里只剩「通用 + 人教版 + 外研版」。
 */
'use strict';

var BOOK_KEYS = ['', 'pep', 'wys'];

function isValidBook(key) {
  return BOOK_KEYS.indexOf(String(key === undefined || key === null ? '' : key)) >= 0;
}

module.exports = { BOOK_KEYS: BOOK_KEYS, isValidBook: isValidBook };
