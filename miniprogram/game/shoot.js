/**
 * game/shoot.js —— 字母射击（2026-09-18 改版）纯逻辑核心
 *
 * 改版背景：应产品要求，字母射击从「canvas 引擎」改为「WXML/CSS + 纯逻辑模块」
 * （玩法结构参考 demo/deepseek_html_20260918_d7a82c.html 的「词槽 + 字母面板 + Boss」）。
 * 这个模块**不碰渲染、不碰 wx API**，只负责一局的结构与判定，因此可单测。
 *
 * 一局的结构：
 *   · 一局 = N 题（默认 10，挑战 Boss 关由关卡参数覆盖）；
 *   · 一题 = 一个词，词里有若干字符被挖空（多空题来自 w2/c2 的 `*` 模板；
 *     词级题型 fill/trans/xhy/zc 是「整词一个空」）；
 *   · 玩家从底部面板点字母/词卡：点对就补进当前空位，点错触发 Boss 反击并扣 1 点护盾；
 *   · 所有空位填满 = 击破本题 Boss。
 *
 * 难度口径（刻意与旧引擎保持一致，避免已上线数值漂移）：
 *   · 护盾 = CONFIG.initLives（5），**每点错一次扣 1 点**，扣光判负 ——
 *     旧版是「答错一题扣一命」，容错次数同样是 5 次；
 *   · 星级 = 「零失误击破的题数 / 总题数」，沿用 constants.STAR_THRESHOLDS(90/70/60)，
 *     与旧版「按答对比例折星」的三档可达性完全一致（详见 tests/unit/shoot.test.js）。
 */

'use strict';

const question = require('./question');
const { CONFIG } = require('./config');
const { starsByRate } = require('../utils/constants');

// 随机源走 question.js 的可注入随机源：挑战关卡 setRandom(种子) 后，
// 「同关同题、同挖空、同面板顺序」的既有承诺继续成立（见 game/question.js 顶部注释）。
// 注意不能用模块加载时取一次 —— setRandom 是运行时调的。
function rnd() {
  const f = question.getRandom();
  return typeof f === 'function' ? f() : Math.random();
}
const rand = (n) => Math.floor(rnd() * n);

/** Fisher–Yates 洗牌（原地打乱并返回同一数组） */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// ============ 干扰字母池 ============
// 兜底字母/汉字：同段词库取不到（或取不够）时用来凑满面板
const EN_FALLBACK = 'abcdefghijklmnopqrstuvwxyz'.split('');
const CN_FALLBACK = '日月水火山石田土人口手足目耳大小多少上下左右'.split('');

/**
 * 从同段词库收集可用作干扰的字符（去重）。
 *
 * 为什么要传 bank：干扰项若凭空生成英文字母，中文题会混进无意义的字母，
 * 英文题也可能出现没学过的怪字。同段词库里取字符，难度与「同源」都更合理。
 *
 * @param {Array} bank 同段词库（可为空）
 * @param {RegExp} re 允许的字符范围（英文题只留字母、中文题只留汉字）
 * @returns {string[]} 去重后的候选字符
 */
function charPool(bank, re) {
  const out = [];
  const seen = {};
  (bank || []).forEach((it) => {
    const w = String(question.sourceWord(it) || '');
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (ch === '*' || ch === '_' || ch === ' ') continue;
      if (!re.test(ch)) continue;
      if (seen[ch]) continue;
      seen[ch] = 1;
      out.push(ch);
    }
  });
  return out;
}

/**
 * 组装面板：正确字母（按空位顺序各一份）+ 干扰字母，凑够 CONFIG.padMinCount 个后打乱。
 *
 * @param {string[]} needed 依次要填的字符
 * @param {Array} bank 同段词库
 * @returns {Array<{text:string, used:boolean}>} 面板格子（used = 已被打掉）
 */
function buildPad(needed, bank) {
  const isEn = needed.every((ch) => /[A-Za-z]/.test(ch));
  const re = isEn ? /[A-Za-z]/ : /[\u4e00-\u9fa5]/;
  const candidates = charPool(bank, re);
  const fallback = isEn ? EN_FALLBACK : CN_FALLBACK;
  const pool = needed.slice();
  const target = Math.max(needed.length + CONFIG.padMinDistractors, CONFIG.padMinCount);
  let guard = 0;
  while (pool.length < target && guard++ < 400) {
    const src = candidates.length ? candidates : fallback;
    const ch = src[rand(src.length)];
    // 英文题：同一字母最多比需要的多给一份，避免面板全是同一个字母
    if (isEn) {
      const already = pool.filter((c) => c.toLowerCase() === ch.toLowerCase()).length;
      const need = needed.filter((c) => c.toLowerCase() === ch.toLowerCase()).length;
      if (already > need) continue;
    }
    pool.push(ch);
  }
  // k = 稳定唯一键：面板会出现重复字母（如 elephant 要两个 e），
  // wx:for 不能用文本做 key，否则重复项会被复用导致「点了没反应」。
  return shuffle(pool).map((text, i) => ({ k: 'p' + i, text, used: false }));
}

/**
 * 组装一道题（页面层拿到它就能渲染词槽与面板）。
 *
 * @param {Object} item 词条 { type, q|w, a, hint }
 * @param {Array} [bank] 同段词库（干扰字符来源）
 * @returns {Object} round
 *   kind        'letter'（字符级，可能多个空）| 'word'（词级，整词一个空）
 *   item        词条原引用（答错上报错题本要用）
 *   word        完整词（用于展示与发音）
 *   wordLevel   是否词级题型
 *   chars       字符数组（词级为整词单元素）
 *   hidden      被挖空的下标数组
 *   slots       [{ index, ch, on }] on=false 即还空着（ch 为空串）
 *   needed      [String] 依次要填的答案
 *   filled      已填几个
 *   pad         [{ text, used }]
 *   head/tail   词级题的题干前后缀（字符级为 ''）
 *   hintText    提示/引导语
 */
function buildRound(item, bank) {
  if (question.isWordLevel(item)) {
    const answer = String(question.wordAnswer(item) || item.a || '');
    const qn = question.genWordLevelQuestion(item, bank);
    return {
      kind: 'word',
      item,
      word: answer,
      wordLevel: true,
      chars: [answer],
      hidden: [0],
      slots: [{ index: 0, ch: '', on: false }],
      needed: [answer],
      filled: 0,
      pad: shuffle((qn.options || []).slice()).map((text, i) => ({ k: 'p' + i, text, used: false })),
      head: qn.head || '',
      tail: qn.tail || '',
      hasSlot: !!qn.hasSlot,
      hintText: qn.hintSafe || qn.guide || ''
    };
  }

  const word = String(question.sourceWord(item) || '');
  const chars = word.split('');
  // 防御：词条异常（空词/只有占位符）时给一个「空局面」而不是崩，
  // 页面层见到 invalid 会跳过这道题继续下一题。
  if (!chars.length) {
    return {
      kind: 'letter',
      item,
      word: '',
      wordLevel: false,
      invalid: true,
      chars: [],
      hidden: [],
      slots: [],
      needed: [],
      filled: 0,
      pad: [],
      head: '',
      tail: '',
      hasSlot: false,
      hintText: ''
    };
  }
  const hidden = question.hiddenIndexes(item).filter((i) => i >= 0 && i < chars.length);
  const safeHidden = hidden.length ? hidden : [0];
  const needed = safeHidden.map((i) => chars[i]);
  const slots = chars.map((ch, i) => {
    const isBlank = safeHidden.indexOf(i) >= 0;
    return { index: i, ch: isBlank ? '' : ch, on: !isBlank };
  });
  return {
    kind: 'letter',
    item,
    word,
    wordLevel: false,
    chars,
    hidden: safeHidden,
    slots,
    needed,
    filled: 0,
    pad: buildPad(needed, bank),
    head: '',
    tail: '',
    hasSlot: true,
    hintText: ''
  };
}

/** 当前该填的字符（全部填完返回 null） */
function expectedText(round) {
  if (!round || round.filled >= round.needed.length) return null;
  return round.needed[round.filled];
}

/**
 * 玩家点面板第 index 个格子。
 *
 * 设计要点：
 *   · 点错**不消耗**那个格子（demo 同款：错字母留在面板上，可以再试），只扣护盾；
 *   · 点对消耗该格，并自动填进「第一个还空着的槽」——
 *     槽位顺序与 needed 顺序一致（hidden 升序），所以不会错位。
 *
 * @param {Object} round
 * @param {number} index 面板下标
 * @returns {{ignored?:boolean, ok?:boolean, index?:number, slotIndex?:number, done?:boolean, text?:string}}
 */
function tap(round, index) {
  if (!round) return { ignored: true };
  const cell = round.pad[index];
  if (!cell || cell.used) return { ignored: true };
  const need = expectedText(round);
  if (need === null) return { ignored: true };

  if (cell.text !== need) {
    return { ok: false, index, text: cell.text };
  }

  cell.used = true;
  let slotIndex = -1;
  for (let i = 0; i < round.slots.length; i++) {
    if (!round.slots[i].on) {
      slotIndex = i;
      break;
    }
  }
  if (slotIndex >= 0) {
    round.slots[slotIndex].ch = cell.text;
    round.slots[slotIndex].on = true;
  }
  round.filled += 1;
  return {
    ok: true,
    index,
    slotIndex,
    text: cell.text,
    done: round.filled >= round.needed.length
  };
}

/**
 * 「零失误击破一题」的得分。
 *
 * 为什么不是「每填对一个空就加分」：服务端由 `答对数 × SCORE_PER_QUESTION` 反推得分
 * （忽略客户端自报 score），前端若用另一套加法，结算页与「我的」页的分数会对不上。
 */
function scorePerCorrect() {
  return CONFIG.scorePerCorrect;
}

/**
 * 星级：零失误击破的题数 / 总题数 → constants.STAR_THRESHOLDS(90/70/60)。
 * @param {number} perfect 零失误击破的题数
 * @param {number} total 总题数
 */
function starsOf(perfect, total) {
  const t = parseInt(total, 10) || 0;
  if (!t) return 0;
  return starsByRate((parseInt(perfect, 10) || 0) / t * 100);
}

module.exports = {
  buildRound,
  expectedText,
  tap,
  scorePerCorrect,
  starsOf,
  shuffle,
  charPool,
  buildPad
};
