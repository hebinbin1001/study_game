/**
 * server/admin-query.js —— 管理端查询规则的纯函数（2026-09-29）
 *
 * 为什么单独抽出来：
 *   管理端的「排序 / 搜索 / 采集率」规则需要单测覆盖，而 routes/admin.js 依赖
 *   Sequelize 与真实数据库，不好直接测。这里只放**纯函数**，SQL 由路由负责拼。
 *
 * 关联：routes/admin.js（消费方）、tests/unit/admin-query.test.js（用例）
 */
'use strict';

/**
 * 允许的排序键，与页面上的切换按钮一一对应。
 *    active  —— 最近活跃（默认，运营最常看）
 *    stars   —— 段位星数降序
 *    created —— 注册时间降序（默认就是列表顺序）
 */
const SORT_KEYS = ['active', 'stars', 'created'];

/** 默认排序：最近活跃 */
const DEFAULT_SORT = 'active';

/**
 * 归一化排序键：不认识的 key 一律回退默认值（防前端传脏参数）。
 * @param {*} raw
 * @returns {string} 'active' | 'stars' | 'created'
 */
function resolveSort(raw) {
  const k = String(raw == null ? '' : raw).trim().toLowerCase();
  return SORT_KEYS.indexOf(k) >= 0 ? k : DEFAULT_SORT;
}

/**
 * 转义 LIKE 里的元字符。
 *
 * 为什么必须转义：用户搜「100%」时，未转义的 `%` 会命中**所有人**（LIKE 通配符），
 * 看起来像「搜索没生效」。`_`（单字符通配）同理。
 * MySQL 默认转义符是反斜杠（未开 NO_BACKSLASH_ESCAPES）。
 *
 * @param {*} s
 * @returns {string}
 */
function escapeLike(s) {
  return String(s == null ? '' : s).replace(/[\\%_]/g, function (ch) {
    return '\\' + ch;
  });
}

/**
 * 把用户输入变成搜索模式串；空词返回 null（调用方据此跳过搜索）。
 * @param {*} q 原始搜索词
 * @returns {{term:string, pattern:string}|null}
 */
function searchPattern(q) {
  const term = String(q == null ? '' : q).trim();
  if (!term) return null;
  return { term: term, pattern: '%' + escapeLike(term) + '%' };
}

/**
 * 管理端搜索覆盖哪些列（页面提示文案与此保持一致）。
 * 昵称与 openid 在 users 表上；微信名（wx_nickname）可能还没建列，由路由降级处理。
 */
const SEARCH_FIELDS = ['nickname', 'wx_nickname', 'openid'];

/**
 * 微信名采集率（百分比，保留 1 位小数）。
 *
 * 口径：users 表里 wx_nickname 非空的账号数 ÷ 注册总数。
 * 为什么要有这个指标：微信从 2022 年起不允许静默读取昵称，只能靠用户主动点一次
 * 「使用微信昵称」，所以采集率是**引导效果**的直接度量 —— 低了就该调引导，不是调代码。
 *
 * @param {number} collected 已采集到微信名的账号数
 * @param {number} total 注册总数
 * @returns {number} 0~100 的百分比；total 为 0 时返回 0
 */
function collectRate(collected, total) {
  const c = Number(collected) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  const pct = (c / t) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct * 10) / 10;
}

/**
 * 玩法热度榜：把「game_type → 局数」聚合成降序数组（给管理端「玩法热度」块用）。
 *
 * @param {Array<{game_type:string, cnt:number|string}>} rows 直接来自 GROUP BY 查询
 * @param {Object<string,string>} [names] game_type → 中文名（缺省时用 key 本身）
 * @returns {Array<{game:string, label:string, count:number}>}
 */
function gameHeat(rows, names) {
  const map = names || {};
  const list = (rows || []).map(function (r) {
    const game = String((r && r.game_type) || '').trim();
    return {
      game: game,
      label: map[game] || game || '未知',
      count: Number((r && r.cnt) || 0) || 0
    };
  }).filter(function (r) { return !!r.game && r.count > 0; });
  // 局数降序；同局数按名称稳定排序，避免每次刷新顺序抖动
  list.sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
  });
  return list;
}

/**
 * 按给定的 id 顺序重排用户行（管理端「两步取数」的第二步）。
 *
 * 为什么需要这个函数（2026-09-29 加固；来源是一次**误报**排查）：
 *   管理端排序改成服务端排序后，走的是「先用原生 SQL 取本页 id 顺序 → 再按 id 取详情」。
 *   两步之间靠 Map 对齐，而 **id 的类型可能不一致** —— 原生 SQL 返回的 id 可能是
 *   字符串（mysql2 按列类型决定），Sequelize 模型返回的是数字，`Map.get('12')` 找不到
 *   数字 key 的 `12`，结果**这一页全部落空**：接口 200、total 正常、list=[]、没有任何报错，
 *   管理端只显示「共 N 人 · 已加载 0」，看起来像用户数据丢了。
 *
 *   说明：2026-09-29 那次「已加载 0」最终查明是**端上用例等待条件写错**导致的误报，
 *   不是本函数导致的；但类型不一致是真实风险，一旦发生就是静默空列表，所以照样加固。
 *   这里一律用 `String(id)` 做键，两种类型都能对上；顺带解决「IN (...) 不保证顺序」。
 *
 * @param {Array<Object>} rows 数据库查出来的用户行（含 id）
 * @param {Array<number|string>} ids 期望的顺序
 * @returns {Array<Object>} 按 ids 顺序排列、且只保留命中的行
 */
function reorderById(rows, ids) {
  const byId = new Map();
  (rows || []).forEach(function (r) {
    if (r && r.id !== null && r.id !== undefined) byId.set(String(r.id), r);
  });
  return (ids || [])
    .map(function (id) { return byId.get(String(id)); })
    .filter(Boolean);
}

module.exports = {
  SORT_KEYS: SORT_KEYS,
  DEFAULT_SORT: DEFAULT_SORT,
  SEARCH_FIELDS: SEARCH_FIELDS,
  resolveSort: resolveSort,
  escapeLike: escapeLike,
  searchPattern: searchPattern,
  collectRate: collectRate,
  gameHeat: gameHeat,
  reorderById: reorderById
};
