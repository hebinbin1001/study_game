/**
 * utils/review.js —— 错题回流主玩法（R2）
 *
 * 职责：把「错题本 + 艾宾浩斯到期」接入对局抽题 —— 每局以固定概率优先出待复习错题，
 *       让主玩法本身成为自动复习，而不是只有主动进错题本才复习得了。
 *
 * 设计要点：
 *   · 全部为纯函数，随机源可注入 —— 不依赖 wx / 网络 / 真实随机，单测可完全覆盖；
 *   · 任何一步不满足（未登录 / 池为空 / 已出完 / 接口失败）都回退原随机抽题，
 *     离线可玩是底线，绝不能因为错题数据把对局卡住。
 */

'use strict';

var constants = require('./constants');
var ebbinghaus = require('./ebbinghaus');

// 错题回流概率：需求约定 20%~30%，取中值 25%
var DEFAULT_REVIEW_RATE = 0.25;

/**
 * 把 /api/wrong/list 的 pending 记录整理成出题池。
 *
 * 逐条过滤规则：
 *   1. question 快照必须完整（有 q 与 a），否则无法出题，跳过；
 *   2. dueOnly 为真时只保留已到期的错题（nextReviewAt 缺失视为到期）；
 *   3. 分类关卡（typeKey 非空且非 all）只保留属于该分类的题型；
 *   4. 同一题面（q）只保留一条，避免同一局重复出题。
 *
 * @param {Array} records WrongRecord 数组（字段含 question / nextReviewAt）
 * @param {Object} [opts]
 * @param {string} [opts.typeKey] 题型分类 key（空或 all 表示不限）
 * @param {boolean} [opts.dueOnly=true] 是否只取已到期的错题
 * @returns {Array} 出题池，元素形如 { item, record }
 */
function buildPool(records, opts) {
  opts = opts || {};
  var dueOnly = opts.dueOnly !== false;
  var typeKey = opts.typeKey || '';
  var seen = {};
  var out = [];

  (records || []).forEach(function (r) {
    var item = r && r.question;
    if (!item || !item.q || !item.a) return;                          // 快照不完整
    if (dueOnly && !ebbinghaus.isDueForReview(r.nextReviewAt)) return; // 未到期
    if (typeKey && typeKey !== 'all' && !constants.isItemInGroup(item, typeKey)) return;
    if (seen[item.q]) return;                                         // 同题面去重
    seen[item.q] = true;
    out.push({ item: item, record: r });
  });

  return out;
}

/**
 * 由已出题列表构造「题面 → true」映射，供 pickFromPool 排重。
 * @param {Array} items 已出词条
 * @returns {Object} { [q]: true }
 */
function usedMapOf(items) {
  var m = {};
  (items || []).forEach(function (it) {
    if (it && it.q) m[it.q] = true;
  });
  return m;
}

/**
 * 从错题池取一条本局尚未出过的题。
 * @param {Array} pool buildPool 的产物
 * @param {Object} [usedMap] usedMapOf 的产物
 * @param {Function} [random] 随机源（默认 Math.random；单测可注入）
 * @returns {Object|null} { item, record }；无可用错题返回 null
 */
function pickFromPool(pool, usedMap, random) {
  var rnd = random || Math.random;
  var used = usedMap || {};
  var avail = (pool || []).filter(function (p) {
    return p && p.item && !used[p.item.q];
  });
  if (!avail.length) return null;
  return avail[Math.floor(rnd() * avail.length)];
}

/**
 * 本局这一题是否走错题回流。
 * @param {number} [rate] 回流概率，默认 DEFAULT_REVIEW_RATE
 * @param {Function} [random] 随机源
 * @returns {boolean} true 表示本题优先从错题池取
 */
function shouldUseReview(rate, random) {
  var r = rate == null ? DEFAULT_REVIEW_RATE : rate;
  if (!(r > 0)) return false;
  var rnd = random || Math.random;
  return rnd() < r;
}

module.exports = {
  DEFAULT_REVIEW_RATE: DEFAULT_REVIEW_RATE,
  buildPool: buildPool,
  usedMapOf: usedMapOf,
  pickFromPool: pickFromPool,
  shouldUseReview: shouldUseReview
};
