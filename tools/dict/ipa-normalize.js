/**
 * tools/dict/ipa-normalize.js —— 把 ipa-dict 的重音写法改成教材（DJ）写法
 *
 * 背景（2026-10-18 全量审计发现）：
 *   ipa-dict 的重音符是标在**重读元音前**的：cat → /kˈæt/、blue → /blˈuː/、
 *   brother → /bɹˈʌðɐ/、important → /ɪmpˈɔːtənt/。
 *   而国内教材（人教版 PEP / 外研版用的 DJ 音标）是标在**重读音节的起首**：
 *   cat /kæt/、blue /bluː/、brother /ˈbrʌðə/、important /ɪmˈpɔːtənt/。
 *
 *   直接沿用词典写法，学生拿课本对照会发现重音符整体错位一格（教材里
 *   单音节词干脆不标重音）。所以入库前统一做两件事：
 *     ① 单音节词：去掉重音符（教材不标）；
 *     ② 多音节词：把 ˈ 从「元音前」挪到「音节起首前」——
 *        起点是ˈ左边那串辅音里**最长的合法英文音节首（onset）**，
 *        而不是无脑跨过全部辅音（否则 important 会被挪成 ɪˈmpɔːtənt）。
 *
 * 为什么单独成模块：入库（add-ipa.js）与存量修复（fix-ipa-stress.js）要走
 * 同一套规则，避免"新补的是对的、老数据还是错的"。
 */
'use strict';

/** 元音音素（不含 ː 长音符号与重音符号） */
const VOWELS = 'aeiouæɑɒɔəɜɛɪʊʌɐɝɚ';
/** 组合成双元音的两个元音（算一个音节核） */
const DIPHTHONGS = ['eɪ', 'aɪ', 'ɔɪ', 'aʊ', 'əʊ', 'ɪə', 'eə', 'ʊə', 'ɑɪ', 'ɑʊ', 'oʊ'];

/**
 * 符号级归一（在动重音之前做）：
 *   · ɹ → r、ɫ → l：同一个音位，教材一律写 r / l；
 *   · ɐ → ə：近开央元音，教材对应 ə；
 *   · ɝ → ɜː：美式卷舌元音，教材（DJ）写作 ɜː（mother /ˈmʌðə/ 这类）；
 *   · 去掉 IPA 词典的音节分隔点与零宽字符。
 * @param {string} raw
 * @returns {string}
 */
function normalizeSymbols(raw) {
  let s = String(raw || '');
  s = s.replace(/[\u200b-\u200d\ufeff]/g, '');
  s = s.replace(/ɹ/g, 'r').replace(/ɫ/g, 'l').replace(/ɐ/g, 'ə').replace(/ɝ/g, 'ɜː');
  s = s.replace(/\./g, '');
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s.trim();
}


/**
 * 合法英文音节首（onset）。
 * 只收真正会出现在词首/音节首的辅音丛，宁可少收（少收只会让 ˈ 留在原地，
 * 不会把重音挪错位置）。
 */
const ONSETS = new Set([
  // 单辅音
  'p', 'b', 't', 'd', 'k', 'ɡ', 'g', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ',
  'h', 'm', 'n', 'l', 'r', 'j', 'w', 'tʃ', 'dʒ',
  // 塞音 + 流音/滑音
  'pl', 'pr', 'pj', 'bl', 'br', 'bj', 'tr', 'tw', 'tj', 'dr', 'dw', 'dj',
  'kl', 'kr', 'kw', 'kj', 'ɡl', 'ɡr', 'ɡw', 'fl', 'fr', 'fj', 'vj',
  // s + 塞音 / 鼻音 / 流音
  'sp', 'st', 'sk', 'sm', 'sn', 'sl', 'sw', 'sf', 'θr', 'ʃr', 'hj',
  // 三辅音
  'spl', 'spr', 'str', 'skr', 'skw', 'spj', 'stj', 'skj'
]);

function isVowel(ch) {
  return VOWELS.indexOf(ch) >= 0;
}

/**
 * 数音节核数量（双元音算一个，长音 ː 不单独成核）。
 * 只用于判断「单音节 / 多音节」，不追求语言学完备。
 * @param {string} s 不含重音符号的音标
 */
function countNuclei(s) {
  let n = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (isVowel(ch)) {
      n++;
      // 双元音（两个元音相邻）算一个音节核，跳过第二个
      const pair = s.slice(i, i + 2);
      if (DIPHTHONGS.indexOf(pair) >= 0) i += 2;
      else i += 1;
      // 吃掉长音符号
      if (s[i] === 'ː') i++;
      continue;
    }
    i++;
  }
  return n;
}

/** 取辅音串 run 末尾最长的合法 onset；没找到返回空串 */
function longestOnset(run) {
  for (let len = Math.min(3, run.length); len >= 1; len--) {
    if (ONSETS.has(run.slice(run.length - len))) return run.slice(run.length - len);
  }
  return '';
}

/**
 * 规范化单个音标字符串（不含首尾斜杠）。
 * @param {string} raw
 * @returns {string}
 */
function normalizeStress(raw) {
  const s = String(raw || '');
  if (!s) return s;
  const pos = s.indexOf('ˈ');
  if (pos < 0) return s;

  // ① 单音节：教材不标重音（cat /kæt/，不是 /kˈæt/）
  if (countNuclei(s.replace(/[ˈˌ]/g, '')) <= 1) return s.replace(/ˈ/g, '');

  // ② 已经标在音节起首前的，不要再动（幂等关键）
  //    判断依据：ˈ 右边紧跟的是辅音，就说明 onset 已经在重音符之后了。
  //    例外 j / w：词典把 /juː/、/wʌ/ 当成一个音节核，ˈ 后面仍可出现 j/w
  //    （music = mˈjuːzɪk），这种情况仍要往左挪。
  const after = s[pos + 1] || '';
  if (after && !isVowel(after) && after !== 'j' && after !== 'w' && after !== 'ː') return s;

  // ③ 把 ˈ 从「元音前」挪到「音节起首（onset）前」
  const pre = s.slice(0, pos);
  // 紧贴在 ˈ 左边的辅音串（遇到元音就停）
  let j = pre.length;
  while (j > 0) {
    const ch = pre[j - 1];
    if (isVowel(ch) || ch === 'ː' || ch === 'ˈ' || ch === 'ˌ') break;
    j--;
  }
  const run = pre.slice(j);
  if (!run) return s;                     // 重音本来就在元音前，无需处理
  const onset = longestOnset(run);        // 最长合法音节首（可能是空串）
  const stem = pre.slice(0, j);
  const keep = run.slice(0, run.length - onset.length);
  return stem + keep + 'ˈ' + onset + s.slice(pos + 1);
}

module.exports = {
  normalizeStress: normalizeStress,
  normalizeSymbols: normalizeSymbols,
  countNuclei: countNuclei
};
