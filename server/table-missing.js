/**
 * server/table-missing.js —— 识别「表不存在」错误
 *
 * 生产环境（NODE_ENV=production）不会自动 sync 表结构，新功能的 DDL 要人工执行。
 * 如果 DDL 还没跑，路由直接 5000 会让整块功能（甚至段位重算）挂掉。
 * 这里统一识别 MySQL 的 ER_NO_SUCH_TABLE，让调用方降级成「功能准备中」。
 */
'use strict';

/** Sequelize 各处包错的 code 都翻一遍 */
function errorCodes(err) {
  if (!err) return [];
  return [
    err.code,
    err.original && err.original.code,
    err.parent && err.parent.code,
    err.original && err.original.errno,
    err.parent && err.parent.errno,
  ];
}

/**
 * 是否为「表不存在」错误。
 * @param {Error} err
 * @returns {boolean}
 */
function isMissingTable(err) {
  var codes = errorCodes(err);
  if (codes.indexOf("ER_NO_SUCH_TABLE") >= 0) return true;
  if (codes.indexOf(1146) >= 0) return true;
  var msg = (err && err.message) || "";
  return /doesn't exist|does not exist/i.test(msg) && /table/i.test(msg);
}

/**
 * 是否为「列不存在」错误（ER_BAD_FIELD_ERROR）。
 * 用于「生产库还没执行 ALTER TABLE ADD COLUMN」时优雅降级。
 * @param {Error} err
 * @returns {boolean}
 */
function isMissingColumn(err) {
  var codes = errorCodes(err);
  if (codes.indexOf("ER_BAD_FIELD_ERROR") >= 0) return true;
  if (codes.indexOf(1054) >= 0) return true;
  var msg = (err && err.message) || "";
  return /unknown column/i.test(msg);
}

module.exports = { isMissingTable: isMissingTable, isMissingColumn: isMissingColumn };
