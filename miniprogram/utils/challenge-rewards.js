/**
 * utils/challenge-rewards.js —— 挑战主线里程碑宝箱（P3）
 *
 * 用户 2026-09-12 批准：「每 10 关一个宝箱 / 每通一个学段解锁一套皮肤」。
 *   · 每通 10 关 → 一个宝箱，奖励**额外星星**（10/20/30 关分别 +10/+20/+30 星）——
 *     星星是段位货币，正好补上「爬到段位中间级没收益」的体感；
 *   · 学段皮肤（学者之王）走服务端 `unlockType='level'`（累计通关 30 次解锁）✓ 已实现；
 *   · 领取是**幂等**的：已领过再点只返回 already，不会重复加星；
 *   · 奖励记录存本地（`ww_chest_claimed`，键 = 学段 + 关数），登录玩家领取时另同步段位。
 *
 * 说明（已知取舍，已在交接单标注）：游客领取只记本地，之后登录不会补记段位——
 * 若要「登录后补发」，需要把宝箱记录搬到服务端（当前不做，避免为小奖励加表）。
 *
 * 关联：pages/level（宝箱行与领取）、utils/challenge.js（主线关卡表）
 */

'use strict';

var storage = require('./storage');

var CLAIM_KEY = 'ww_chest_claimed';

/** 里程碑（每通 N 关一个宝箱） */
var CHESTS = [
  { at: 10, stars: 10, label: '10 关宝箱' },
  { at: 20, stars: 20, label: '20 关宝箱' },
  { at: 30, stars: 30, label: '30 关 · 学段毕业宝箱' }
];

// 挑战关卡星的存档命名空间（与 utils/challenge.js 的 STAR_KEY 一致）
var STAR_KEY = 'challenge';

function keyOf(gradeKey, at) {
  return String(gradeKey) + ':' + at;
}

function claimedMap() {
  var v = storage.get(CLAIM_KEY);
  return (v && typeof v === 'object') ? v : {};
}

/**
 * 该学段挑战主线「已通关（≥1 星）」的关卡数。
 * @param {string} gradeKey 学段 key
 * @returns {number}
 */
function clearedCount(gradeKey) {
  var all = storage.getAllStars();
  var prefix = gradeKey + '@' + STAR_KEY + '@';
  var n = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(prefix) === 0 && (all[k] || 0) >= 1) n++;
  });
  return n;
}

/**
 * 宝箱状态列表（关卡页渲染用）。
 * @param {string} gradeKey 学段 key
 * @returns {Array<{at:number, stars:number, label:string, cleared:number, reached:boolean, claimed:boolean, claimable:boolean}>}
 */
function chestState(gradeKey) {
  var cleared = clearedCount(gradeKey);
  var claimed = claimedMap();
  return CHESTS.map(function (c) {
    var isClaimed = !!claimed[keyOf(gradeKey, c.at)];
    var reached = cleared >= c.at;
    return {
      at: c.at,
      stars: c.stars,
      label: c.label,
      cleared: cleared,
      reached: reached,
      claimed: isClaimed,
      claimable: reached && !isClaimed
    };
  });
}

/**
 * 领取宝箱（幂等）。
 * @param {string} gradeKey 学段 key
 * @param {number} at 里程碑关数（10/20/30）
 * @returns {{ok:boolean, stars:number, already:boolean, reason:string}}
 */
function claim(gradeKey, at) {
  var chest = null;
  for (var i = 0; i < CHESTS.length; i++) {
    if (CHESTS[i].at === at) { chest = CHESTS[i]; break; }
  }
  if (!chest) return { ok: false, stars: 0, already: false, reason: '没有这个宝箱' };
  if (clearedCount(gradeKey) < chest.at) {
    return { ok: false, stars: 0, already: false, reason: '还没通到 ' + chest.at + ' 关' };
  }
  var claimed = claimedMap();
  var k = keyOf(gradeKey, chest.at);
  if (claimed[k]) return { ok: true, stars: 0, already: true, reason: '这个宝箱已经领过了' };
  claimed[k] = Date.now();
  storage.set(CLAIM_KEY, claimed);
  return { ok: true, stars: chest.stars, already: false, reason: '' };
}

module.exports = {
  CHESTS: CHESTS,
  CLAIM_KEY: CLAIM_KEY,
  clearedCount: clearedCount,
  chestState: chestState,
  claim: claim
};
