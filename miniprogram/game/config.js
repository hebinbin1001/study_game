/**
 * game/config.js —— 字母射击参数集中配置
 *
 * 2026-09-18 改版：字母射击从「canvas 引擎」改为「WXML/CSS + game/shoot.js 纯逻辑」，
 * 画布几何（W/H/怪兽坐标/炮弹速度/粒子参数）随之全部删除 —— 那些常量只服务于
 * 已移除的 renderer。这里只保留**玩法数值**（题量、护盾、计分、错题回流概率）。
 *
 * 数值口径刻意不动（避免已上线难度漂移）：
 *   · 每题一次判定的容错次数 = initLives（5）；
 *   · 新版「每个空位点错扣 1 盾」，累计点错 5 次判负 —— 与旧版「答错 5 题判负」容错一致。
 */

const { GAME_CONFIG } = require('../utils/constants');
const { DEFAULT_REVIEW_RATE } = require('../utils/review');

// ============ 一、计分参数 ============
// ⚠️ 必须与服务端 server/constants.js 的 SCORE_PER_QUESTION 保持一致：
//    服务端**忽略客户端自报的 score**，用 `答对数 × SCORE_PER_QUESTION` 反推分数
//    （见 server/routes/score.js）。所以前端「得分」只能是同一个口径 ——
//    新版把「答对」定义为「零失误击破一题」，得分 = 零失误题数 × 10。
const SCORE_PER_CORRECT = 10;

// ============ 二、字母面板参数 ============
// 面板最少几个子弹（正确字母之外再补干扰字母，凑够这个数量）
const PAD_MIN_COUNT = 8;
// 正确字母之外最少多给几个干扰字母
const PAD_MIN_DISTRACTORS = 4;

// ============ 三、动画时长（毫秒，页面层用） ============
const FLY_MS = 220;        // 字母子弹飞行
const COUNTER_MS = 300;    // Boss 反击弹飞行
const CHARGE_MS = 140;     // Boss 蓄力
const CLEAR_MS = 720;      // 击破 Boss → 下一题
const DEFEAT_MS = 900;     // 勇士倒下 → 结算

// ============ 四、CONFIG 聚合对象 ============
const CONFIG = {
  // 基础玩法（来自 GAME_CONFIG）
  totalQ: GAME_CONFIG.totalQ,           // 每关题数 10
  initLives: GAME_CONFIG.initLives,     // 初始护盾 5（与星级阈值联动，见 utils/constants.js 注释）

  // 计分（零失误击破一题的得分；必须与服务端 SCORE_PER_QUESTION 相同）
  scorePerCorrect: SCORE_PER_CORRECT,

  // 字母面板
  padMinCount: PAD_MIN_COUNT,
  padMinDistractors: PAD_MIN_DISTRACTORS,

  // 动画时长（毫秒）
  flyMs: FLY_MS,
  counterMs: COUNTER_MS,
  chargeMs: CHARGE_MS,
  clearMs: CLEAR_MS,
  defeatMs: DEFEAT_MS,

  // 错题回流概率（R2）
  reviewRate: DEFAULT_REVIEW_RATE
};

module.exports = { CONFIG };
