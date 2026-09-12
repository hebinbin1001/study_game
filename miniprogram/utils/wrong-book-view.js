/**
 * utils/wrong-book-view.js —— 错题本列表页的纯视图逻辑（可单测）
 *
 * 为什么单独抽出来：
 *   分页追加、分组标题去重、移除后计数调整这三件事最容易写错（尤其「翻页时分组标题重复」
 *   和「删掉一条后下标错位」），埋在 Page 里只能靠真机点、没法稳定回归。
 *   这里做成纯函数，页面只负责 setData 与交互，单测覆盖边界。
 *
 * 关联需求（2026-09-12 需求②）：错题本分页展示 + 复习答对后可删除/保留。
 */

'use strict';

var ebbinghaus = require('./ebbinghaus');

var PAGE_SIZE = 20;   // 每页条数（与后端上限 100 对齐）

/**
 * 拼列表请求地址（两个 tab 各自分页）。
 * @param {string} scope pending|mastered
 * @param {number} page 1 起
 * @param {number} [pageSize]
 * @returns {string}
 */
function listUrl(scope, page, pageSize) {
  var s = (scope === 'mastered') ? 'mastered' : 'pending';
  var p = Math.max(1, parseInt(page, 10) || 1);
  var size = Math.max(1, parseInt(pageSize, 10) || PAGE_SIZE);
  return '/api/wrong/list?scope=' + s + '&page=' + p + '&pageSize=' + size;
}

/**
 * 服务端记录 → 端上展示字段（到期文案 / 复习进度 / 阶段文案）。
 * @param {Object} item
 * @returns {Object}
 */
function decorate(item) {
  var it = item || {};
  var nextText = ebbinghaus.getNextReviewText(it.nextReviewAt);
  return {
    recordId: it.recordId,
    questionId: it.questionId,
    question: it.question,
    wrongCount: it.wrongCount,
    mastery: it.mastery,
    nextReviewAt: it.nextReviewAt,
    reviewCount: it.reviewCount,
    dueLabel: nextText,
    reviewProgress: ebbinghaus.getReviewProgress(it.mastery),
    reviewStageText: ebbinghaus.getReviewStageText(it.reviewCount),
    nextReviewText: nextText
  };
}

/** 已掌握卡片只需展示字段（不排复习计划） */
function decorateMastered(item) {
  var it = item || {};
  return {
    recordId: it.recordId,
    questionId: it.questionId,
    question: it.question,
    wrongCount: it.wrongCount,
    mastery: it.mastery
  };
}

/**
 * 待复习列表 → 渲染行。相同到期文案只在第一次出现处插一个分组标题
 * （分页追加时重复调用也是安全的：整段重算，不会出现重复分组头）。
 * @param {Array} pending
 * @returns {Array} [{t:'g',text} | {t:'c',it}]
 */
function groupPending(pending) {
  var rows = [];
  var last = null;
  (pending || []).forEach(function (it) {
    if (it.dueLabel !== last) {
      rows.push({ t: 'g', text: it.dueLabel });
      last = it.dueLabel;
    }
    rows.push({ t: 'c', it: it });
  });
  return rows;
}

/**
 * 把一页数据合并进页面状态（纯函数，返回新状态片段）。
 * @param {Object} state 当前状态 {pending, mastered, renderList, activeTab, page, moreCount}
 * @param {Object} page 服务端分页响应 {items, page, total, hasMore, counts}
 * @param {boolean} reset true=替换（新的一轮加载），false=追加下一页
 * @returns {Object} 可 setData 的状态片段
 */
function applyPage(state, page, reset) {
  var s = state || {};
  var data = page || {};
  var items = data.items || [];
  var counts = data.counts || { total: 0, pending: 0, mastered: 0 };

  if (s.activeTab === 'mastered') {
    var mastered = reset ? items.map(decorateMastered)
      : (s.mastered || []).concat(items.map(decorateMastered));
    return {
      mastered: mastered,
      stats: { total: counts.total, pending: counts.pending, mastered: counts.mastered },
      page: data.page || 1,
      hasMore: !!data.hasMore,
      moreCount: Math.max(0, (data.total || mastered.length) - mastered.length)
    };
  }

  var pending = reset ? items.map(decorate)
    : (s.pending || []).concat(items.map(decorate));
  var renderList = groupPending(pending);
  return {
    pending: pending,
    renderList: renderList,
    visible: renderList,
    visibleN: pending.length,
    stats: { total: counts.total, pending: counts.pending, mastered: counts.mastered },
    page: data.page || 1,
    hasMore: !!data.hasMore,
    moreCount: Math.max(0, (data.total || pending.length) - pending.length)
  };
}

/**
 * 老服务端（全量返回，没有 items 字段）兼容：行为与改造前一致，只是没有分页。
 * @param {Object} data { pending, mastered, total }
 * @returns {Object} 状态片段
 */
function applyLegacy(data) {
  var d = data || {};
  var pending = (d.pending || []).map(decorate);
  var mastered = (d.mastered || []).map(decorateMastered);
  var renderList = groupPending(pending);
  return {
    pending: pending,
    mastered: mastered,
    renderList: renderList,
    visible: renderList,
    visibleN: pending.length,
    page: 1,
    hasMore: false,
    moreCount: 0,
    stats: {
      total: d.total || (pending.length + mastered.length),
      pending: pending.length,
      mastered: mastered.length
    }
  };
}

/**
 * 本地移除一条后的新状态（不重新拉页，避免多一次往返与列表跳动）。
 * 只对「本地确实加载到的那一条」调整计数；未加载到时保持原样，onShow 重载会纠正。
 * @param {Object} state
 * @param {string} recordId
 * @returns {Object}
 */
function removeRecord(state, recordId) {
  var s = state || {};
  var hadPending = false;
  var hadMastered = false;
  var pending = (s.pending || []).filter(function (it) {
    if (it.recordId === recordId) { hadPending = true; return false; }
    return true;
  });
  var mastered = (s.mastered || []).filter(function (it) {
    if (it.recordId === recordId) { hadMastered = true; return false; }
    return true;
  });
  var dropped = (hadPending || hadMastered) ? 1 : 0;
  var stats = s.stats || { total: 0, pending: 0, mastered: 0 };
  var renderList = groupPending(pending);
  return {
    pending: pending,
    mastered: mastered,
    renderList: renderList,
    visible: renderList,
    visibleN: pending.length,
    moreCount: Math.max(0, (s.moreCount || 0) - dropped),
    stats: {
      total: Math.max(0, (stats.total || 0) - dropped),
      pending: Math.max(0, (stats.pending || 0) - (hadPending ? 1 : 0)),
      mastered: Math.max(0, (stats.mastered || 0) - (hadMastered ? 1 : 0))
    }
  };
}

module.exports = {
  PAGE_SIZE: PAGE_SIZE,
  listUrl: listUrl,
  decorate: decorate,
  decorateMastered: decorateMastered,
  groupPending: groupPending,
  applyPage: applyPage,
  applyLegacy: applyLegacy,
  removeRecord: removeRecord
};
