/**
 * game/letter-bubble.js —— Boss 补字母泡泡龙纯逻辑
 *
 * 一局只处理一个词：Boss 周围的字母泡泡组成护盾，玩家找出缺失字母并命中。
 * 该模块不碰 wx / 页面渲染，便于单测和复现：
 *   · 同一学段、同一关卡使用固定随机源；
 *   · 正确答案恰好一个，干扰字母不重复；
 *   · 泡泡位置只由数量决定，文字排列另做洗牌。
 */
'use strict';

var constants = require('../utils/constants');

var EN_WORD = /^[A-Za-z]{3,}$/;
var ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
var TONES = ['coral', 'sky', 'mint', 'violet', 'gold', 'rose', 'teal', 'lilac', 'amber'];

function wordOf(item) {
  return String((item && (item.q || item.a)) || '').trim();
}

function usableItem(item) {
  return !!(item
    && item.type === 'w1'
    && EN_WORD.test(wordOf(item))
    && String(item.hint || '').trim());
}

function usableItems(list) {
  var seen = {};
  return (list || []).filter(function (item) {
    if (!usableItem(item)) return false;
    var key = wordOf(item).toLowerCase();
    if (seen[key]) return false;
    seen[key] = 1;
    return true;
  });
}

function shuffle(list, random) {
  var rnd = typeof random === 'function' ? random : Math.random;
  var out = (list || []).slice();
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/**
 * 泡泡按椭圆环分布（百分比坐标）。
 * 从正上方开始顺时针排列，确保不同屏幕下都能围住 Boss。
 */
function positions(count) {
  var n = Math.max(5, Math.min(9, parseInt(count, 10) || 7));
  var out = [];
  var cx = 50;
  var cy = 45;
  var rx = 34;
  var ry = 22;
  for (var i = 0; i < n; i++) {
    var angle = -Math.PI / 2 + i * Math.PI * 2 / n;
    out.push({
      x: Math.round((cx + Math.cos(angle) * rx) * 10) / 10,
      y: Math.round((cy + Math.sin(angle) * ry) * 10) / 10
    });
  }
  return out;
}

function buildBubbles(missing, count, random) {
  var answer = String(missing || '').toLowerCase();
  var n = Math.max(5, Math.min(9, parseInt(count, 10) || 7));
  var letters = [answer];
  var decoys = shuffle(ALPHABET.filter(function (ch) { return ch !== answer; }), random);
  for (var i = 0; i < decoys.length && letters.length < n; i++) letters.push(decoys[i]);
  var order = shuffle(letters, random);
  var pos = positions(n);
  return order.map(function (letter, index) {
    return {
      id: 'bubble-' + index,
      letter: letter.toUpperCase(),
      lower: letter,
      correct: letter === answer,
      tone: index % TONES.length,
      color: TONES[index % TONES.length],
      x: pos[index].x,
      y: pos[index].y
    };
  });
}

/**
 * 组装当前词题面。
 * @param {Object} item 题库词条
 * @param {Object} [options] { bubbleCount, random }
 */
function buildRound(item, options) {
  var opts = options || {};
  var random = typeof opts.random === 'function' ? opts.random : Math.random;
  var word = wordOf(item).toLowerCase();
  var blankIndex = Math.floor(random() * word.length);
  if (blankIndex >= word.length) blankIndex = word.length - 1;
  var missing = word.charAt(blankIndex);
  var letters = word.split('').map(function (ch, index) {
    return {
      key: 'letter-' + index,
      ch: ch,
      blank: index === blankIndex,
      filled: index !== blankIndex
    };
  });
  return {
    item: item,
    word: word,
    meaning: String(item.hint || ''),
    ipa: String(item.ipa || ''),
    blankIndex: blankIndex,
    missing: missing,
    letters: letters,
    bubbles: buildBubbles(missing, opts.bubbleCount, random)
  };
}

function resolve(round, bubbleId) {
  if (!round || !bubbleId) return { ok: false, reason: 'missing' };
  var bubble = null;
  for (var i = 0; i < round.bubbles.length; i++) {
    if (round.bubbles[i].id === bubbleId) {
      bubble = round.bubbles[i];
      break;
    }
  }
  if (!bubble) return { ok: false, reason: 'not-found' };
  return {
    ok: !!bubble.correct,
    reason: bubble.correct ? 'correct' : 'wrong',
    bubble: bubble,
    missing: round.missing,
    word: round.word
  };
}

/** 按「零失误完成词数 / 总词数」折星，与服务端 90/70/60 口径一致。 */
function starsOf(perfect, total) {
  var t = parseInt(total, 10) || 0;
  if (!t) return 0;
  return constants.starsByRate((parseInt(perfect, 10) || 0) / t * 100);
}

/** 题量越大命数同步增加，保证 1/2/3 星三档都可达。 */
function livesForCount(count) {
  var n = Math.max(6, parseInt(count, 10) || 10);
  return Math.max(5, Math.ceil(n * 0.4) + 1);
}

module.exports = {
  EN_WORD: EN_WORD,
  TONES: TONES,
  wordOf: wordOf,
  usableItem: usableItem,
  usableItems: usableItems,
  shuffle: shuffle,
  positions: positions,
  buildBubbles: buildBubbles,
  buildRound: buildRound,
  resolve: resolve,
  starsOf: starsOf,
  livesForCount: livesForCount
};
