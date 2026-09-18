/**
 * utils/level-picker.js —— 「从题库选题」的纯逻辑（2026-09-18 方案 A）
 *
 * 背景：自建关卡（原「自定义题库」）的编辑器原先只能**手工逐题打字**，
 * 而新题库页里已经有用户的词条了 —— 用户自然会期待"从我的题库里挑 10 题组一关"。
 * 这个模块负责那一步的数据转换，页面只管渲染。
 *
 * 为什么单独抽出来：排序/去重/截断这些规则最容易写错（重复题、超 10 题、覆盖用户手输的），
 * 抽成纯函数就能单测钉住（见 tests/unit/level-picker.test.js）。
 *
 * 口径说明（用户 2026-09-18 拍板）：自建关卡的题**不进闯关题源** ——
 * 关卡是独立作品（10 题一关、可分享、试玩不进段位），题库才是学段题池。
 * 所以这里只做「题库 → 关卡草稿」的单向搬运，不反过来影响出题。
 */

'use strict';

/** 一关固定 10 题（与后端强校验一致） */
var LEVEL_SIZE = 10;

/**
 * 词条 → 关卡题目。
 * 只保留关卡需要的字段（type/q/a/hint/d），并把题库里的内部标记（_user/_edited）剥掉。
 */
function toLevelItem(word) {
  var out = {
    type: (word && word.type) || 'w1',
    q: (word && word.q) || '',
    a: (word && word.a) || '',
    hint: (word && word.hint) || '',
    _key: itemKey(word)
  };
  // 干扰项可选：有就带上（关卡校验器认 d 字段）
  if (word && word.d && word.d.length) out.d = word.d;
  return out;
}

/** 题目去重键：题型 + 题目 + 答案（同题型同题目算重复） */
function itemKey(word) {
  if (!word) return '';
  return ((word.type || '') + '|' + (word.q || '') + '|' + (word.a || ''));
}

/** 排序权重：我的新增(0) → 我改过的(1) → 内置(2) */
function rankOf(word) {
  if (!word) return 9;
  if (word._user) return 0;
  if (word._edited) return 1;
  return 2;
}

/**
 * 把题库词条整理成「可勾选列表」：我的排前面 → 按题型聚一下 → 去掉明显不可出题的条目。
 * @param {Array<Object>} words dict.loadByGrade() 的结果
 * @returns {Array<Object>} 每项 { type,q,a,hint,key,label,src }
 */
function buildOptions(words) {
  var list = (words || []).filter(function (w) {
    return w && w.q && w.a;                    // 缺题目/答案的没法出题
  }).map(function (w) {
    var it = toLevelItem(w);
    return {
      key: it._key,
      type: it.type,
      q: it.q,
      a: it.a,
      hint: it.hint,
      src: w._user ? '我的' : (w._edited ? '已修改' : '内置'),
      srcRank: rankOf(w)
    };
  });
  // 稳定排序：先按来源，再按题型，最后按题目（保证同样输入得到同样顺序，便于复现与断言）
  list.sort(function (a, b) {
    if (a.srcRank !== b.srcRank) return a.srcRank - b.srcRank;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    if (a.q !== b.q) return a.q < b.q ? -1 : 1;
    return 0;
  });
  // 同题去重（保留排序靠前的那条）
  var seen = {};
  var out = [];
  list.forEach(function (x) {
    if (seen[x.key]) return;
    seen[x.key] = true;
    out.push(x);
  });
  return out;
}

/**
 * 勾选结果 → 追加进关卡题单（不覆盖用户已手输的内容）。
 *
 * 规则：
 *   · 已在题单里的同题不重复加；
 *   · 加满 10 题就停（关卡固定 10 题一组）；
 *   · 返回 { items, added, skipped, full } 供页面提示。
 *
 * @param {Array<Object>} current 当前题单
 * @param {Array<Object>} picked 勾选的词条（题库原始结果，带 _user/_edited 也可）
 * @returns {Object}
 */
function mergeInto(current, picked) {
  var items = (current || []).slice();
  var seen = {};
  items.forEach(function (it) { seen[itemKey(it)] = true; });

  var added = 0;
  var skipped = 0;
  (picked || []).forEach(function (w) {
    var key = itemKey(w);
    if (seen[key]) { skipped++; return; }
    if (items.length >= LEVEL_SIZE) { skipped++; return; }
    var it = toLevelItem(w);
    delete it._key;                            // 内部字段不写进关卡数据
    items.push(it);
    seen[key] = true;
    added++;
  });
  return { items: items, added: added, skipped: skipped, full: items.length >= LEVEL_SIZE };
}

/** 还差几题才够 10 题一组（已是 10 或超过返回 0） */
function remaining(current) {
  var n = (current || []).length;
  return n >= LEVEL_SIZE ? 0 : LEVEL_SIZE - n;
}

module.exports = {
  LEVEL_SIZE: LEVEL_SIZE,
  itemKey: itemKey,
  toLevelItem: toLevelItem,
  buildOptions: buildOptions,
  mergeInto: mergeInto,
  remaining: remaining
};
