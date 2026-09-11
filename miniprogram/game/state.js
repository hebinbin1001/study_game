/**
 * game/state.js —— 词力战士游戏状态机与全局状态工厂
 *
 * 职责：
 *   1. 定义状态常量 IDLE / FLYING / APPROACHING / DYING / FAILED；
 *   2. createInitialState() 返回一局初始全局状态 G；
 *   3. resetGame() 复位一局状态（供 engine 开始/重开调用）。
 *
 * 平移来源：prototype/index.html 第 323-325 行 G 初始化、
 *   第 705-707 行 startGame 重置。
 *
 * 关联需求：
 *   - REQ-GAME-6（答对状态流转 IDLE→FLYING→DYING）
 *   - REQ-GAME-7（答错状态流转 IDLE→APPROACHING）
 *   - REQ-GAME-8（怪兽下沉判负视同答错）
 *   - REQ-GAME-3（initLives 见 utils/constants.js、计分从 0 开始）
 */

const { CONFIG } = require('./config');

// ============ 状态常量 ============
// 与原型 G.state 取值集合一致（idle/flying/approaching/dying/failed）
const IDLE = 'idle';           // 待答题：怪兽下沉中，等待玩家点选项
const FLYING = 'flying';       // 炮弹飞行中：玩家选对，炮弹飞向挖空格
const APPROACHING = 'approaching'; // 答错逼近中：怪兽向下逼近+抖动+红闪
const DYING = 'dying';         // 怪兽死亡动画中：炮弹命中后约 0.7s
const FAILED = 'failed';       // 防御性失败态（实际答错走 APPROACHING）

// 状态集合（供校验/调试）
const STATES = { IDLE, FLYING, APPROACHING, DYING, FAILED };

// ============ 全局状态工厂 ============
/**
 * 创建一局初始全局状态 G。
 * 字段与原型 G 完全对齐，并补充 monster/bullet 等子对象的空值约定。
 *
 * @returns {Object} G 全局状态对象
 */
function createInitialState() {
  return {
    // ---- 状态机 ----
    state: IDLE,          // 当前状态
    over: false,          // 本局是否结束（停止主循环 update/render）

    // ---- 计分 ----
    score: 0,             // 当前得分
    lives: CONFIG.initLives, // 剩余命数（初值取自 constants.GAME_CONFIG.initLives）
    answered: 0,          // 已作答题数（含对错）
    correctCount: 0,      // 答对题数
    combo: 0,             // 当前连击数
    maxCombo: 0,          // 本局历史最高连击

    // ---- 当前题目 ----
    question: null,       // { item, w, blankIdx, correct, letters, filled, filledColor }
    options: [],          // [{ letter, correct, used, colorClass }]

    // ---- 场景对象 ----
    monster: null,        // { x, y, color, blinkSeed, shake, anger?, approachStart?, approachTarget?, approachT?, explode? }
    bullet: null,         // { x, y, tx, ty, speed, correct, letter } 或 null

    // ---- 皮肤（由 engine.start 注入已解析的 { emoji, color }，渲染层读取） ----
    warriorSkin: null,    // 当前战士皮肤 { id, emoji, color } 或 null（渲染回退默认）
    monsterSkin: null,    // 当前怪兽皮肤 { id, emoji, color } 或 null（渲染回退默认）
    particles: [],        // 粒子数组（爆炸/星星，上限 MAX_PARTICLES）
    popups: [],           // 弹字数组（+100/-1命/连击提示）
    checkmark: null       // ✓ 反馈 { x, y, t, life } 或 null
  };
}

// ============ 复位一局状态 ============
/**
 * 复位一局状态：将 G 恢复到初始值，供开始/重开调用。
 * 直接复用 createInitialState() 保证字段完整。
 *
 * @param {Object} [G] 待复位的状态对象；缺省时新建一个
 * @returns {Object} 复位后的 G
 */
function resetGame(G) {
  const fresh = createInitialState();
  if (!G) return fresh;
  // 原地复位：清空所有键并写入初始值，保持引用不变（engine 持有同一 G）
  for (const key of Object.keys(G)) {
    delete G[key];
  }
  Object.assign(G, fresh);
  return G;
}

module.exports = {
  // 状态常量
  IDLE,
  FLYING,
  APPROACHING,
  DYING,
  FAILED,
  STATES,
  // 状态工厂与复位
  createInitialState,
  resetGame
};
