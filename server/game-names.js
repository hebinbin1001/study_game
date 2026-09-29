/**
 * server/game-names.js —— 服务端玩法名称表（唯一数据源，2026-09-29）
 *
 * 为什么要有它：
 *   管理端要做「玩法热度」（哪个玩法被玩得最多），后端拿到的是 scores.game_type
 *   这种机器可读的 key（word_warrior / math24 …），直接显示给运营看不懂。
 *   在此之前这份「玩法清单」写在 routes/ranklist.js 的 SUMMARY_GAMES 里，
 *   现在抽到这里，排行榜与后台统计共用一份，新增玩法时不会两处漂移。
 *
 * 与端上的对应关系：
 *   miniprogram/utils/game-catalog.js（展示用目录）
 *   miniprogram/utils/challenge.js 的 MODES[].gameType（题库类玩法上报口径）
 *   三者必须一致 —— 有单测把关（tests/unit/game-names.test.js）。
 *
 * 顺序 = 端上展示顺序：题库类在前、数字智力在后。
 */
'use strict';

/** game_type → 中文名（顺序即展示顺序） */
const GAME_NAMES = {
  word_warrior: '字母射击',
  word_build: '字母拼词工坊',
  link: '词语连连看',
  match: '词义消消乐',
  idiom: '成语拼字',
  snake: '单词贪吃蛇',
  quiz: '限时抢答',
  math24: '算 24 点',
  sudoku: '数独',
  sprint: '口算冲刺',
  balance: '算式天平',
  g2048: '2048',
  memory: '记忆矩阵',
  onestroke: '一笔画',
  klotski: '华容道'
};

/** 全部玩法 key（顺序同 GAME_NAMES） */
const GAME_TYPES = Object.keys(GAME_NAMES);

/**
 * 取玩法中文名；未知 key 原样返回（便于后台一眼看出「冒出来的新玩法没登记」）。
 * @param {string} gameType
 * @returns {string}
 */
function nameOf(gameType) {
  const k = String(gameType || '').trim();
  return GAME_NAMES[k] || k;
}

module.exports = {
  GAME_NAMES: GAME_NAMES,
  GAME_TYPES: GAME_TYPES,
  nameOf: nameOf
};
