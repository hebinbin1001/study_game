/**
 * utils/achievement-view.js —— 成就页的纯视图逻辑（可单测）
 *
 * 职责：
 *   · 把服务端返回的成就数组补成可直接渲染的卡片（emoji 兜底、进度文案、解锁日期）；
 *   · 由数据推导分类 tab（不写死数量，后端加分类前端自动出现）；
 *   · 「全部」视图按分类插分组标题行。
 *
 * 为什么单独抽出：分类筛选/分组/日期格式化这些纯逻辑埋在 Page 里只能靠点，抽出来能单测。
 * 关联需求（2026-09-12 需求④）：成就主页更丰富 —— 分类筛选 + 进度 + 两态。
 */

'use strict';

// 分类 emoji 兜底（服务端只给 key；图标未到位时用 emoji 呈现勋章视觉）
var CATEGORY_EMOJI = {
  answer: '🎯',
  level: '🚩',
  play: '🎮',
  habit: '🔥',
  wrong: '📖',
  rank: '🎖',
  custom: '🧩'
};
var FALLBACK_EMOJI = '🏅';

/** 分类展示顺序（后端返回未知分类时追加在末尾） */
var CATEGORY_ORDER = ['answer', 'level', 'play', 'habit', 'wrong', 'rank', 'custom'];

function labelOfCategory(key, fromServerLabel) {
  if (fromServerLabel) return fromServerLabel;
  var map = {
    answer: '答题', level: '关卡', play: '玩法',
    habit: '习惯', wrong: '错题', rank: '段位', custom: '自定义'
  };
  return map[key] || key;
}

/** 时间 → YYYY-MM-DD（空值返回空串，渲染时整行不显示） */
function formatDate(value) {
  if (!value) return '';
  var d = (value instanceof Date) ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  var mm = d.getMonth() + 1;
  var dd = d.getDate();
  return d.getFullYear() + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd);
}

/**
 * 服务端成就 → 渲染卡片。
 * @param {Array} list 服务端返回的成就数组
 * @returns {Array}
 */
function decorate(list) {
  return (list || []).map(function (item) {
    var it = item || {};
    var threshold = Number(it.threshold) || 0;
    var current = Number(it.current) || 0;
    var progress = (typeof it.progress === 'number') ? it.progress
      : (threshold > 0 ? Math.min(100, Math.round(current / threshold * 100)) : 0);
    return {
      achievementId: it.achievementId,
      name: it.name,
      description: it.description,
      category: it.category || 'other',
      icon: it.icon || '',
      iconErr: false,                     // 图片加载失败时置 true → 渲染 emoji
      emoji: CATEGORY_EMOJI[it.category] || FALLBACK_EMOJI,
      unlocked: !!it.unlocked,
      current: current,
      threshold: threshold,
      progress: progress,
      progressText: it.unlocked ? '已达成' : (current + '/' + threshold),
      unlockedText: formatDate(it.unlockedAt)
    };
  });
}

/**
 * 由数据推导分类 tab（含「全部」）。后端新增分类时前端自动出现，无需改代码。
 * @param {Array} decorated decorate() 的结果
 * @returns {Array} [{ key, label, emoji, total, unlocked }]
 */
function buildCategories(decorated) {
  var list = decorated || [];
  var seen = {};
  var buckets = {};
  list.forEach(function (it) {
    var key = it.category || 'other';
    if (!buckets[key]) buckets[key] = { key: key, label: labelOfCategory(key), emoji: CATEGORY_EMOJI[key] || FALLBACK_EMOJI, total: 0, unlocked: 0 };
    buckets[key].total += 1;
    if (it.unlocked) buckets[key].unlocked += 1;
    seen[key] = true;
  });

  var ordered = [];
  CATEGORY_ORDER.forEach(function (key) {
    if (buckets[key]) ordered.push(buckets[key]);
  });
  Object.keys(buckets).forEach(function (key) {
    if (CATEGORY_ORDER.indexOf(key) === -1) ordered.push(buckets[key]);
  });

  var allUnlocked = ordered.reduce(function (n, c) { return n + c.unlocked; }, 0);
  return [
    { key: 'all', label: '全部', emoji: '🏅', total: list.length, unlocked: allUnlocked },
    { key: 'unlocked', label: '已解锁', emoji: '✅', total: list.length, unlocked: allUnlocked }
  ].concat(ordered);
}

/**
 * 按分类筛选（key='all' 返回全部；'unlocked' 只看已解锁）。
 */
function filterByCategory(decorated, key) {
  var list = decorated || [];
  if (!key || key === 'all') return list.slice();
  if (key === 'unlocked') return list.filter(function (it) { return it.unlocked; });
  return list.filter(function (it) { return it.category === key; });
}

/**
 * 把卡片列表转成带分类分组的渲染行（仅「全部」视图用分组；具体分类下不插标题）。
 * @param {Array} decorated
 * @param {string} activeKey
 * @param {Array} categories buildCategories() 的结果
 * @returns {Array} [{t:'g',text,emoji,count,unlocked}] | [{t:'c',it}]
 */
function buildRows(decorated, activeKey, categories) {
  var list = filterByCategory(decorated, activeKey);
  if (activeKey !== 'all') {
    return list.map(function (it) { return { t: 'c', it: it }; });
  }
  var labelOf = {};
  (categories || []).forEach(function (c) { labelOf[c.key] = c; });
  var rows = [];
  var last = null;
  list.forEach(function (it) {
    if (it.category !== last) {
      var meta = labelOf[it.category] || { label: it.category, emoji: FALLBACK_EMOJI, total: 0, unlocked: 0 };
      rows.push({ t: 'g', text: meta.label, emoji: meta.emoji, count: meta.total, unlocked: meta.unlocked });
      last = it.category;
    }
    rows.push({ t: 'c', it: it });
  });
  return rows;
}

/** 汇总（页头进度卡） */
function summaryOf(decorated) {
  var list = decorated || [];
  var unlocked = list.filter(function (it) { return it.unlocked; }).length;
  return {
    total: list.length,
    unlocked: unlocked,
    percent: list.length ? Math.round(unlocked / list.length * 100) : 0
  };
}

module.exports = {
  CATEGORY_EMOJI: CATEGORY_EMOJI,
  FALLBACK_EMOJI: FALLBACK_EMOJI,
  CATEGORY_ORDER: CATEGORY_ORDER,
  formatDate: formatDate,
  decorate: decorate,
  buildCategories: buildCategories,
  filterByCategory: filterByCategory,
  buildRows: buildRows,
  summaryOf: summaryOf
};
