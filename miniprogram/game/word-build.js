/**
 * game/word-build.js —— 拼字类玩法共用引擎（纯逻辑，无 wx 依赖，可单测）
 *
 * 服务两款玩法：
 *   1. 字母拼词工坊（mode='letter'）：给中文意思，把打乱的字母块拼回英文单词；
 *   2. 成语拼字（mode='idiom'）：给释义，把字块（含 2 个干扰字）拼回四字成语。
 *
 * 设计要点：
 *   - 出题、干扰项、提示全部是纯函数，页面只负责渲染，便于单测；
 *   - 字块统一为 { id, ch, used, hinted }，槽位（slots）存 tileId 或 null；
 *   - 提示只补"第一个错位/空位"，不整题泄题；
 *   - 词库不符时优雅降级：可选词条不足时返回实际数量，不抛错。
 *
 * 关联：pages/word-build（字母拼词工坊）、pages/idiom-build（成语拼字）
 */

'use strict';

var constants = require('../utils/constants');

var ROUND_Q = 8;      // 每局题数
// 初始命数：3 → 5（2026-09-12 与字母射击统一口径）
//   3 命 + 90/70/40 时，通关最多答错 2 题 → 8 题局最低正确率 75%，
//   1 星档（40%~69%）数学上不可达（与 R1 修掉的星级死区同类缺陷）。
//   5 命 + 90/70/60 下，6~10 题局三档星级都可达；护栏见 utils/__tests__/challenge.test.js。
var LIVES = 5;        // 初始命数
var HINTS = 3;        // 每局提示次数
var POINTS = 10;      // 每题得分
var MIN_LEN = 3;      // 英文单词最短 3 个字母
var MAX_LEN = 10;     // 英文单词最长 10 个字母（再长屏幕放不下字母块）
var EXTRA_TILES = 2;  // 成语拼字的干扰字个数

/** Fisher–Yates 洗牌（可注入随机源，便于单测复现） */
function shuffle(list, random) {
  var rnd = random || Math.random;
  var a = (list || []).slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/** 答案是否可用作字母拼词：纯英文字母且长度在 3~10 之间 */
function isLetterItem(item) {
  if (!item || !item.a) return false;
  var a = String(item.a);
  if (!/^[a-zA-Z]+$/.test(a)) return false;
  return a.length >= MIN_LEN && a.length <= MAX_LEN;
}

/** 答案是否可用作成语拼字：不含英文字母且长度 >= 4（四字成语及以上） */
function isIdiomItem(item) {
  if (!item || !item.a) return false;
  var a = String(item.a);
  if (/[a-zA-Z]/.test(a)) return false;
  return a.length >= 4;
}

/** 按玩法挑选合法词条（同一答案只保留一条） */
function filterPool(items, mode) {
  var test = mode === 'letter' ? isLetterItem : isIdiomItem;
  var seen = {};
  var out = [];
  (items || []).forEach(function (it) {
    if (!test(it)) return;
    var key = String(it.a).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(it);
  });
  return out;
}

/**
 * 合并两个词池：优先用第一个（最近学段），不足 minCount 时并入第二个（其他学段）。
 * @param {Array} primary 首选词条（最近学段）
 * @param {Array} fallback 兜底词条（其他学段）
 * @param {string} mode 'letter' | 'idiom'
 * @param {number} [minCount=ROUND_Q] 期望的最少题数
 * @returns {Array} 去重后的词条池
 */
function mergePools(primary, fallback, mode, minCount) {
  var need = minCount == null ? ROUND_Q : minCount;
  var first = filterPool(primary, mode);
  if (first.length >= need) return first;
  var seen = {};
  first.forEach(function (it) { seen[String(it.a).toLowerCase()] = true; });
  var out = first.slice();
  filterPool(fallback, mode).forEach(function (it) {
    var key = String(it.a).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(it);
  });
  return out;
}

/**
 * 一局的题目队列（随机取 count 条，去重）。
 * @returns {Array} 长度 <= count（词池不足时给多少算多少）
 */
function pickQuestions(pool, count, random) {
  var n = count == null ? ROUND_Q : count;
  return shuffle(pool || [], random).slice(0, Math.max(0, n));
}

/** 题目提示文案：中英互译词条显示中文词，其余显示释义 */
function promptOf(item, mode) {
  if (!item) return '';
  if (mode === 'idiom') return String(item.hint || '');
  if (item.type === 'trans') return String(item.q || item.hint || '');
  return String(item.hint || item.q || '');
}

/** 从其他词条的答案里抽干扰字（不与该题答案重复） */
function noiseChars(pool, answer, count, random) {
  var rnd = random || Math.random;
  var used = {};
  String(answer || '').split('').forEach(function (ch) { used[ch] = true; });
  var out = [];
  var guard = 0;
  while (out.length < count && guard++ < 400) {
    if (!pool || !pool.length) break;
    var src = String(pool[Math.floor(rnd() * pool.length)].a || '');
    if (!src) continue;
    var ch = src.charAt(Math.floor(rnd() * src.length));
    if (used[ch]) continue;
    used[ch] = true;
    out.push(ch);
  }
  return out;
}

/**
 * 生成字块：答案字符 + 干扰字符，打乱后重新编号（id 与下标一致）。
 * @param {string} answer 正确答案
 * @param {string[]} [extras] 干扰字符
 * @param {Function} [random] 随机源
 */
function makeTiles(answer, extras, random) {
  var chars = String(answer || '').split('').concat(extras || []);
  var list = shuffle(chars, random).map(function (ch, i) {
    return { id: i, ch: ch, used: false, hinted: false };
  });
  list.forEach(function (t, i) { t.id = i; });
  return list;
}

/** 生成 n 个空槽位 */
function makeSlots(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(null);
  return out;
}

/** 当前已填入的答案文本（空槽位算空串） */
function answerText(slots, tiles) {
  return (slots || []).map(function (tid) {
    return tid === null || tid === undefined ? '' : (tiles[tid] ? tiles[tid].ch : '');
  }).join('');
}

/** 槽位是否已填满 */
function isComplete(slots) {
  return (slots || []).indexOf(null) === -1;
}

/** 是否答对（英文忽略大小写） */
function isCorrect(text, answer) {
  return String(text || '').toLowerCase() === String(answer || '').toLowerCase();
}

/** 把字块放进第一个空槽；无可放位置或字块已用时原样返回 */
function placeTile(tiles, slots, tileId) {
  if (!tiles[tileId] || tiles[tileId].used) return { tiles: tiles, slots: slots };
  var idx = slots.indexOf(null);
  if (idx === -1) return { tiles: tiles, slots: slots };
  var nextTiles = tiles.slice();
  var nextSlots = slots.slice();
  nextTiles[tileId] = Object.assign({}, tiles[tileId], { used: true, hinted: false });
  nextSlots[idx] = tileId;
  return { tiles: nextTiles, slots: nextSlots };
}

/** 取出某个槽位里的字块（放回字块池） */
function takeSlot(tiles, slots, idx) {
  var tid = slots[idx];
  if (tid === null || tid === undefined) return { tiles: tiles, slots: slots };
  var nextTiles = tiles.slice();
  var nextSlots = slots.slice();
  nextTiles[tid] = Object.assign({}, tiles[tid], { used: false, hinted: false });
  nextSlots[idx] = null;
  return { tiles: nextTiles, slots: nextSlots };
}

/**
 * 提示一步：找到第一个"空着或放着错字"的槽位，放入正确字块。
 * @returns {{index:number, tiles:Array, slots:Array}|null} 已全对时返回 null
 */
function hintStep(answer, tiles, slots) {
  var want = String(answer || '').split('');
  for (var i = 0; i < want.length; i++) {
    var tid = slots[i];
    if (tid !== null && tid !== undefined && tiles[tid] && tiles[tid].ch === want[i]) continue;
    var next = { tiles: tiles, slots: slots };
    if (tid !== null && tid !== undefined) next = takeSlot(next.tiles, next.slots, i);
    for (var j = 0; j < next.tiles.length; j++) {
      if (!next.tiles[j].used && next.tiles[j].ch === want[i]) {
        var placed = placeTile(next.tiles, next.slots, j);
        var hintedTiles = placed.tiles.slice();
        hintedTiles[j] = Object.assign({}, hintedTiles[j], { hinted: true });
        return { index: i, tiles: hintedTiles, slots: placed.slots };
      }
    }
    return null;   // 字块池里找不到需要的字（理论不会发生）
  }
  return null;
}

/** 星级：按答对题数占总题数比例（90% / 70% / 60%，与字母射击同一套阈值） */
function starsFor(right, total) {
  var t = parseInt(total, 10) || 0;
  if (!t) return 0;
  return constants.starsByRate((parseInt(right, 10) || 0) / t * 100);
}

/** 结算文案（答对题数 / 总题数 / 得分 / 剩余提示） */
function resultText(right, total, score, hintsLeft) {
  return '答对 ' + right + ' / ' + total + ' 题\n本局得分 ' + score + '\n剩余提示 ' + hintsLeft + ' 次';
}

module.exports = {
  ROUND_Q: ROUND_Q,
  LIVES: LIVES,
  HINTS: HINTS,
  POINTS: POINTS,
  MIN_LEN: MIN_LEN,
  MAX_LEN: MAX_LEN,
  EXTRA_TILES: EXTRA_TILES,
  shuffle: shuffle,
  isLetterItem: isLetterItem,
  isIdiomItem: isIdiomItem,
  filterPool: filterPool,
  mergePools: mergePools,
  pickQuestions: pickQuestions,
  promptOf: promptOf,
  noiseChars: noiseChars,
  makeTiles: makeTiles,
  makeSlots: makeSlots,
  answerText: answerText,
  isComplete: isComplete,
  isCorrect: isCorrect,
  placeTile: placeTile,
  takeSlot: takeSlot,
  hintStep: hintStep,
  starsFor: starsFor,
  resultText: resultText
};
