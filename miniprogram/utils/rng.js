/**
 * utils/rng.js —— 可复现随机源（挑战关卡「同一关每次题面一致」的地基）
 *
 * 为什么需要：
 *   B 类题库玩法原本是「每次打开随机出题」，接进挑战主线后会有两个问题 ——
 *   重玩刷星不公平（同一关每次难度不同）、没法分享复盘（好友进的不是同一套题）。
 *   用 seed 派生随机源，同一关永远得到同一串随机数。
 *
 * 实现：hashSeed 用 FNV-1a 把「学段+关卡」这类字符串揉成 32 位整数，
 *       makeRng 用 mulberry32 生成 [0,1) 序列（小巧、无依赖、跨端一致）。
 *
 * 注意：本模块**只依赖 Math.imul**，不依赖任何 wx API，可单测。
 */

'use strict';

/**
 * 字符串 → 32 位无符号整数种子（FNV-1a）。
 * @param {string} str 任意字符串，如 'challenge:primary34:7'
 * @returns {number} 0 ~ 4294967295
 */
function hashSeed(str) {
  var s = String(str === undefined || str === null ? '' : str);
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // h *= 16777619（用移位加法避免浮点误差，保持 32 位）
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * 由种子生成随机数发生器（mulberry32）。
 * @param {number|string} seed 数字种子或字符串（字符串会先 hash）
 * @returns {function(): number} 调用一次返回 [0,1)
 */
function makeRng(seed) {
  var a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 洗牌（Fisher-Yates）。不修改入参，返回新数组。
 * @param {Array} list
 * @param {function} [rnd] 随机源，默认 Math.random
 * @returns {Array}
 */
function shuffle(list, rnd) {
  var random = rnd || Math.random;
  var a = (list || []).slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * 取 [min, max] 闭区间整数。
 * @param {number} min
 * @param {number} max
 * @param {function} [rnd]
 * @returns {number}
 */
function randInt(min, max, rnd) {
  var random = rnd || Math.random;
  if (max < min) { var t = min; min = max; max = t; }
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * 从 list 里等概率取 n 个不重复元素（顺序 = 随机源决定的顺序，不是原顺序）。
 * n 超过列表长度时返回整个列表（不报错，调用方按实际长度开局）。
 * @param {Array} list
 * @param {number} n
 * @param {function} [rnd]
 * @returns {Array}
 */
function pickN(list, n, rnd) {
  var src = list || [];
  var want = Math.max(0, Math.min(parseInt(n, 10) || 0, src.length));
  if (!want) return [];
  return shuffle(src, rnd).slice(0, want);
}

module.exports = {
  hashSeed: hashSeed,
  makeRng: makeRng,
  shuffle: shuffle,
  randInt: randInt,
  pickN: pickN
};
