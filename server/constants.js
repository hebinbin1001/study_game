/**
 * server/constants.js —— 后端共享常量与业务规则
 *
 * 与前端 miniprogram/utils/constants.js 的推导规则保持一致
 * （每题得分、星级阈值 90/70/40），保证服务端可对客户端自报成绩
 * 做“服务端推导 + 校正”，防止成绩伪造（REQ-GAME-12、REQ-API-4）。
 */

// ============ 一、统一业务错误码（响应结构 { code, data, message }） ============
// 约定：HTTP 恒为 200，业务结果以 code 表达，code=0 成功（与 design.md 2.2.1 一致）
const CODE = {
  OK: 0, // 成功
  USER_UNKNOWN: 1001, // 未识别用户 / openid 缺失（业务层兜底）
  OPENID_INVALID: 1002, // openid 缺失或格式非法（有可信来源但内容不合法）
  SOURCE_UNTRUSTED: 1003, // x-wx-source 不受信任（伪造/未知来源）
  NICKNAME_INVALID: 2001, // 昵称非法（长度或为空）
  SCORE_INVALID: 3001, // 成绩上报字段缺失/非法
  LOGIN_CODE_INVALID: 4010, // 登录 code 缺失/非法或 code2session 失败
  LOGIN_NOT_CONFIGURED: 4011, // 登录服务未配置（缺 WX_SECRET）
  INTERNAL_ERROR: 5000, // 服务内部错误 / 数据库异常
  HEALTH_DB_DOWN: 5001, // 健康检查：数据库不可用
};

// ============ 二、OpenID 合法性（REQ-API-5） ============
// 微信 OpenID 合法字符集：URL-safe base64 形态 [A-Za-z0-9_-]，
// 典型为 28 字符且以 'o' 开头；长度下限取 8 以兼容本地联调测试串，
// 上限 64 与 users.openid STRING(64) 字段一致，超长拒绝。
const OPENID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// ============ 三、成绩服务端推导规则（与前端算法一致） ============

// 每题答对得分（前端 engine.js 答对 +100 的累加规则，分高无法脱离答对数伪造）
const SCORE_PER_QUESTION = 100;

// 星级阈值：正确率(百分比) >= 90 → 3 星；>= 70 → 2 星；>= 40 → 1 星；否则 0 星
const STAR_THRESHOLDS = [
  { minRate: 90, stars: 3 },
  { minRate: 70, stars: 2 },
  { minRate: 40, stars: 1 },
];

/**
 * 由正确率百分比（0~100 数值）计算星级，算法与前端 constants.starsByRate 一致。
 * @param {number} ratePct 正确率百分比
 * @returns {number} 0~3 星
 */
function starsByRate(ratePct) {
  for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
    if (ratePct >= STAR_THRESHOLDS[i].minRate) {
      return STAR_THRESHOLDS[i].stars;
    }
  }
  return 0;
}

/**
 * 计算一局正确率百分比（四舍五入），与前端 engine.js 的 rate 计算保持一致。
 * @param {number} correctCount 答对题数
 * @param {number} totalQ 总题数
 * @returns {number} 0~100
 */
function ratePercent(correctCount, totalQ) {
  if (!totalQ || totalQ <= 0) return 0;
  return Math.round((correctCount / totalQ) * 100);
}

module.exports = {
  CODE,
  OPENID_RE,
  SCORE_PER_QUESTION,
  STAR_THRESHOLDS,
  starsByRate,
  ratePercent,
};