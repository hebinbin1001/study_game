/**
 * server/wrong-book.js —— 错题本的服务端纯逻辑（不依赖 Sequelize / express，可单测）
 *
 * 为什么单独抽出来：
 *   · 分页计算（边界、hasMore）与「取哪一段（scope）」是最容易写错、也最该被单测盯住的部分；
 *   · 艾宾浩斯算法前端（utils/ebbinghaus.js）与后端必须完全一致，抽出来才能做「两端一致性」断言；
 *   · 路由层只做「取数 → 调这里 → 返回」，避免把边界判断埋在 async 路由里没法测。
 *
 * 关联需求（2026-09-12 需求② 错题本优化）：
 *   1. 列表分页展示，**不传分页参数时保持原有全量返回**（向后兼容旧客户端）；
 *   2. 错题复习答对后可删除，也可选择保留（删除接口幂等）。
 */

"use strict";

// 艾宾浩斯复习间隔（天）—— 必须与 miniprogram/utils/ebbinghaus.js 一致
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];

const DEFAULT_PAGE_SIZE = 20;   // 默认每页条数
const MAX_PAGE_SIZE = 100;      // 单页上限（防止一次拉爆）
const SCOPES = ["pending", "mastered", "all"];   // 待复习 / 已掌握 / 全部
const DEFAULT_SCOPE = "pending";

/**
 * 计算下次复习时间（与前端 utils/ebbinghaus.js 同一算法）。
 * @param {number} reviewCount 已复习次数
 * @param {number} mastery 熟练度 0~100
 * @param {boolean} isCorrect 本次是否答对
 * @param {Date} [now] 当前时间（注入便于测试）
 * @returns {{mastery:number, reviewCount:number, nextReviewAt:Date}}
 */
function calculateNextReview(reviewCount, mastery, isCorrect, now) {
  const at = now instanceof Date ? now : new Date();
  const count = Number(reviewCount) || 0;
  const level = Number(mastery) || 0;

  if (!isCorrect) {
    // 答错：重置复习次数，降低熟练度，明天再复习
    return {
      mastery: Math.max(0, level - 10),
      reviewCount: 0,
      nextReviewAt: new Date(at.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  // 答对：增加熟练度，按间隔计算下次复习时间
  const newMastery = Math.min(100, level + 20);
  const intervalIdx = Math.min(count, EBBINGHAUS_INTERVALS.length - 1);
  const intervalDays = EBBINGHAUS_INTERVALS[intervalIdx];
  return {
    mastery: newMastery,
    reviewCount: count + 1,
    nextReviewAt: new Date(at.getTime() + intervalDays * 24 * 60 * 60 * 1000),
  };
}

/**
 * 是否「老客户端」调用（不带任何分页/范围参数）→ 返回旧的 { pending, mastered, total } 形状。
 * 只要出现 page / pageSize / scope 任一参数，就按分页协议返回。
 * @param {Object} query 请求 query
 * @returns {boolean}
 */
function isLegacyQuery(query) {
  const q = query || {};
  const hasPage = q.page !== undefined && q.page !== "";
  const hasSize = q.pageSize !== undefined && q.pageSize !== "";
  const hasScope = q.scope !== undefined && q.scope !== "";
  return !hasPage && !hasSize && !hasScope;
}

/**
 * 解析并校验分页参数。
 * 规则（越界一律报错而不是悄悄纠正 —— 客户端传错时应立刻暴露）：
 *   · page：缺省 1；必须是 ≥1 的整数
 *   · pageSize：缺省 20；必须是 1~100 的整数
 *   · scope：缺省 pending；必须是 pending|mastered|all
 * @param {Object} query
 * @returns {{ok:boolean, page:number, pageSize:number, scope:string, message:string}}
 */
function parsePaging(query) {
  const q = query || {};
  const out = { ok: true, page: 1, pageSize: DEFAULT_PAGE_SIZE, scope: DEFAULT_SCOPE, message: "" };

  if (q.page !== undefined && q.page !== "") {
    const page = Number(q.page);
    if (!Number.isInteger(page) || page < 1) {
      out.ok = false;
      out.message = "page 必须是不小于 1 的整数";
      return out;
    }
    out.page = page;
  }

  if (q.pageSize !== undefined && q.pageSize !== "") {
    const size = Number(q.pageSize);
    if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
      out.ok = false;
      out.message = "pageSize 必须是 1~" + MAX_PAGE_SIZE + " 的整数";
      return out;
    }
    out.pageSize = size;
  }

  if (q.scope !== undefined && q.scope !== "") {
    if (SCOPES.indexOf(q.scope) === -1) {
      out.ok = false;
      out.message = "scope 只能是 " + SCOPES.join("/");
      return out;
    }
    out.scope = q.scope;
  }

  return out;
}

/**
 * 按熟练度把全部记录切成「待复习 / 已掌握」。
 * 口径：mastery ≥ 100 = 已掌握，其余（含新错）为待复习。
 * @param {Array} records
 * @returns {{pending:Array, mastered:Array}}
 */
function splitScope(records) {
  const list = records || [];
  return {
    pending: list.filter((r) => (Number(r.mastery) || 0) < 100),
    mastered: list.filter((r) => (Number(r.mastery) || 0) >= 100),
  };
}

/**
 * 取某个 scope 的记录（保持入参顺序）。
 * @param {Array} records
 * @param {string} scope pending|mastered|all
 * @returns {Array}
 */
function filterByScope(records, scope) {
  const list = records || [];
  if (scope === "all") return list.slice();
  const split = splitScope(list);
  return split[scope] || [];
}

/**
 * 分页切片。
 * @param {Array} records 该 scope 的全部记录
 * @param {number} page 1 起
 * @param {number} pageSize
 * @returns {{items:Array, page:number, pageSize:number, total:number, hasMore:boolean}}
 */
function paginate(records, page, pageSize) {
  const list = records || [];
  const p = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  const start = (p - 1) * size;
  const items = start >= list.length ? [] : list.slice(start, start + size);
  return {
    items: items,
    page: p,
    pageSize: size,
    total: list.length,
    hasMore: start + items.length < list.length,
  };
}

/**
 * 组装 /api/wrong/list 的返回数据。
 *   · 老客户端（不带参数）→ { pending, mastered, total }（与改造前完全一致）
 *   · 新客户端（带分页参数）→ { items, page, pageSize, total, hasMore, scope, counts }
 *     其中 total 是**该 scope** 的总数，counts 是三个口径的数量（供顶部统计与 tab 角标）
 * @param {Array} records
 * @param {Object} query
 * @returns {Object}
 */
function buildListResponse(records, query) {
  const list = records || [];
  const split = splitScope(list);

  if (isLegacyQuery(query)) {
    return {
      pending: split.pending,
      mastered: split.mastered,
      total: list.length,
    };
  }

  const paging = parsePaging(query);
  if (!paging.ok) {
    return { error: paging.message };
  }

  const scoped = filterByScope(list, paging.scope);
  const pageData = paginate(scoped, paging.page, paging.pageSize);
  return {
    items: pageData.items,
    page: pageData.page,
    pageSize: pageData.pageSize,
    total: pageData.total,
    hasMore: pageData.hasMore,
    scope: paging.scope,
    counts: {
      total: list.length,
      pending: split.pending.length,
      mastered: split.mastered.length,
    },
  };
}

module.exports = {
  EBBINGHAUS_INTERVALS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SCOPES,
  DEFAULT_SCOPE,
  calculateNextReview,
  isLegacyQuery,
  parsePaging,
  splitScope,
  filterByScope,
  paginate,
  buildListResponse,
};
