/**
 * game/config.js —— 词力战士游戏参数集中配置
 *
 * 职责：
 *   集中管理所有游戏魔法数字（下沉速度、逼近参数、画布几何、怪兽尺寸、
 *   炮弹速度、动画时长等），作为唯一调参与调难度入口。
 *   从 utils/constants.js 的 GAME_CONFIG 导入基础默认值并扩展布局参数。
 *
 * 平移来源：prototype/index.html 第 195-213 行 CONFIG 与几何常量。
 *
 * 关联需求：
 *   - REQ-NFR-5（参数可调、魔法数字集中）
 *   - REQ-GAME-3（关卡难度参数化）
 *   - REQ-GAME-6/7（答对/答错动画时长 approachTime/dyingTime）
 *   - REQ-NFR-1（粒子数量上限保帧率）
 */

const { GAME_CONFIG } = require('../utils/constants');

// ============ 一、画布几何（逻辑像素，与原型 W/H 完全一致） ============
// 小程序经 dpr 适配 + ctx.scale(dpr,dpr) 后，绘制坐标系仍以逻辑像素为准
const W = GAME_CONFIG.canvasW; // 390 画布逻辑宽
const H = GAME_CONFIG.canvasH; // 500 画布逻辑高

// ============ 二、怪兽几何 ============
const MON_W = 250; // 怪兽（题目卡片）宽
const MON_H = 118; // 怪兽（题目卡片）高

// ============ 三、派生坐标 ============
// 炮台 y：画布底部上方 46px（原型 cannonY = 500 - 46）
const CANNON_Y = H - 46;
// 怪兽下沉到此 y 判负（原型 dangerY = 500 - 160）
const DANGER_Y = H - 160;
// 怪兽初始 y
const MON_START_Y = 22;

// ============ 四、怪兽配色（6 种循环） ============
const MONSTER_COLORS = [
  '#ff8fae', '#7ec4ff', '#b79bff', '#8ce0a5', '#ffc46b', '#8ad4e8'
];

// ============ 五、动画/玩法参数 ============
// 炮弹飞行速度（px/秒），原型 fire() 中 speed:700
const BULLET_SPEED = 700;
// 答对后怪兽死亡动画时长（秒），原型 onBulletHit 中 setTimeout(nextQuestion, 700)
const DYING_TIME = 0.7;
// 答错逼近动画时长（秒），来自 GAME_CONFIG.approachTime
const APPROACH_TIME = GAME_CONFIG.approachTime;
// 连击提示触发的连击数阈值（原型 showCombo 在 combo>=2 时触发，3/5 加图标）
const COMBO_HINT_THRESHOLDS = [2, 3, 5];

// ============ 六、粒子/反馈参数（REQ-NFR-1 帧率保护） ============
// 粒子数量上限，超过则丢弃新增，保证 60fps
const MAX_PARTICLES = 200;
// 答对爆炸粒子数
const BURST_CORRECT_N = 26;
// 答错爆炸粒子数
const BURST_WRONG_N = 20;
// 冒星星粒子数范围（3~5 颗）
const STAR_PARTICLE_MIN = 3;
const STAR_PARTICLE_MAX = 5;
// ✓ 反馈存活时长（秒），原型 checkmark.life:0.3
const CHECKMARK_LIFE = 0.3;
// 弹字（+100/-1命）存活时长（秒），原型 popup life:1.1
const POPUP_LIFE = 1.1;

// ============ 七、计分参数 ============
const SCORE_PER_CORRECT = 100; // 答对一题得分

// ============ 八、CONFIG 聚合对象 ============
// 汇总所有配置，供 state/question/renderer/engine 统一引用
const CONFIG = {
  // 基础玩法（来自 GAME_CONFIG）
  totalQ: GAME_CONFIG.totalQ,           // 每关题数 10
  initLives: GAME_CONFIG.initLives,     // 初始命数 3
  sinkSpeed: GAME_CONFIG.sinkSpeed,     // 怪兽自然下沉速度 13 px/秒
  approach: GAME_CONFIG.approach,       // 答错逼近距离 58 px
  approachTime: APPROACH_TIME,          // 答错逼近动画时长 0.6 秒

  // 画布几何
  W, H,
  cannonY: CANNON_Y,
  dangerY: DANGER_Y,
  monStartY: MON_START_Y,

  // 怪兽
  monW: MON_W,
  monH: MON_H,
  monsterColors: MONSTER_COLORS,

  // 炮弹与动画
  bulletSpeed: BULLET_SPEED,
  dyingTime: DYING_TIME,

  // 连击
  comboHintThresholds: COMBO_HINT_THRESHOLDS,

  // 粒子与反馈
  maxParticles: MAX_PARTICLES,
  burstCorrectN: BURST_CORRECT_N,
  burstWrongN: BURST_WRONG_N,
  starParticleMin: STAR_PARTICLE_MIN,
  starParticleMax: STAR_PARTICLE_MAX,
  checkmarkLife: CHECKMARK_LIFE,
  popupLife: POPUP_LIFE,

  // 计分
  scorePerCorrect: SCORE_PER_CORRECT
};

module.exports = {
  CONFIG,
  // 同时导出常用几何常量别名，便于 renderer 直接解构
  W,
  H,
  MON_W,
  MON_H,
  CANNON_Y,
  DANGER_Y,
  MON_START_Y,
  MONSTER_COLORS
};