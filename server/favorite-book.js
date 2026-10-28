/**
 * server/favorite-book.js —— 生词本的纯逻辑（2026-10-28）
 *
 * 为什么单独一个文件：
 *   路由只负责取 openid、查库、回包；「字段怎么校验、分页算不算合法」这些判断
 *   放在这里，才能脱离 Express 和 MySQL 做单测。
 *
 * 与错题本（server/wrong-book.js）的区别：
 *   · 错题本是**被动**收集：答错自动进，带艾宾浩斯复习排期（nextReviewAt / mastery）；
 *   · 生词本是**主动**收藏：用户点 ⭐，只存最近一次快照，按收藏时间倒序，不做排期。
 *   所以这里没有 intervals，也没有「掌握度」——用户想复习就点「组一局」。
 *
 * 为什么按 word 做唯一键而不是 questionId：
 *   错题的 questionId 是「题面」派生（同一词在不同题型里是不同 id），而生词本的
 *   语义是「这个词我想再看一眼」，同一个词从拼写题和选择题收藏应该是同一条。
 */
'use strict';

/** 字段长度上限（与表结构一致，改这里要同步 ensure-tables.js） */
const MAX_WORD = 64;
const MAX_HINT = 128;
const MAX_IPA = 64;
const MAX_CODE = 16;

const DEFAULT_PAGE_SIZE = 20;
/** 单页上限：一次拉太多会影响端上渲染，也不该让接口成为爬全库的通道 */
const MAX_PAGE_SIZE = 100;

/** 收藏来源，只用于统计「大家从哪里收藏」，不参与业务判断 */
const SOURCES = ['wrong', 'result', 'preview', 'manual'];
const DEFAULT_SOURCE = 'manual';

/**
 * 按字符截断（不是字节）：库里是 utf8mb4，中文按 1 字符算，截断位置要按字符数才对得上。
 * @param {*} value
 * @param {number} max
 * @returns {string}
 */
function clip(value, max) {
  const s = String(value === undefined || value === null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * 校验并规范化一条收藏。
 * @param {Object} body 请求体
 * @returns {{ok:boolean, value?:Object, message?:string}}
 */
function normalizeItem(body) {
  const raw = body || {};
  const word = clip(raw.word, MAX_WORD);
  // 空词条无法形成题目，直接拒绝而不是存一条空记录 —— 空记录会让「组一局」出怪题
  if (!word) return { ok: false, message: '缺少词条' };

  const source = String(raw.source || '').trim();
  return {
    ok: true,
    value: {
      word: word,
      grade: clip(raw.grade, MAX_CODE),
      type: clip(raw.type, MAX_CODE),
      hint: clip(raw.hint, MAX_HINT),
      ipa: clip(raw.ipa, MAX_IPA),
      source: SOURCES.indexOf(source) >= 0 ? source : DEFAULT_SOURCE,
    },
  };
}

/**
 * 解析分页参数。
 * 与错题本同一口径：**越界一律报错**，不悄悄纠正 —— 悄悄纠正会让端上以为
 * 「翻到了第 999 页」，实际拿回第一页，问题被藏住。
 * @param {Object} query
 * @returns {{page:number, pageSize:number}|null} 非法返回 null
 */
function parsePaging(query) {
  const q = query || {};
  const hasPage = q.page !== undefined && q.page !== '';
  const hasSize = q.pageSize !== undefined && q.pageSize !== '';
  if (!hasPage && !hasSize) return { page: 1, pageSize: DEFAULT_PAGE_SIZE };

  const page = parseInt(q.page, 10);
  const pageSize = parseInt(q.pageSize, 10);
  if (!Number.isFinite(page) || page < 1) return null;
  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) return null;
  return { page: page, pageSize: pageSize };
}

/**
 * 组装列表响应。
 * @param {Array<Object>} items 已裁剪字段的行
 * @param {number} total 该用户总数
 * @param {number} page
 * @param {number} pageSize
 */
function buildListResponse(items, total, page, pageSize) {
  const count = Math.max(0, parseInt(total, 10) || 0);
  return {
    items: items || [],
    page: page,
    pageSize: pageSize,
    total: count,
    hasMore: page * pageSize < count,
  };
}

/**
 * 行 → 端上结构（去掉 openid 与自增主键，端上不需要，也不该拿到别人的标识）
 * @param {Object} row Sequelize 实例或 raw 行
 */
function shapeRow(row) {
  const r = row || {};
  return {
    word: r.word || '',
    grade: r.grade || '',
    type: r.type || '',
    hint: r.hint || '',
    ipa: r.ipa || '',
    source: r.source || DEFAULT_SOURCE,
    at: r.updatedAt ? new Date(r.updatedAt).getTime() : 0,
  };
}

module.exports = {
  MAX_WORD: MAX_WORD,
  MAX_HINT: MAX_HINT,
  MAX_IPA: MAX_IPA,
  DEFAULT_PAGE_SIZE: DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE: MAX_PAGE_SIZE,
  SOURCES: SOURCES,
  DEFAULT_SOURCE: DEFAULT_SOURCE,
  clip: clip,
  normalizeItem: normalizeItem,
  parsePaging: parsePaging,
  buildListResponse: buildListResponse,
  shapeRow: shapeRow,
};
