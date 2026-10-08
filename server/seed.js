/**
 * server/seed.js —— 服务端可复现随机种子（与前端 utils/rng.js 同一算法）
 *
 * 为什么两端要各存一份：服务端镜像里不一定带 miniprogram/ 目录，运行时跨目录 require
 * 不可靠；但「每日挑战赛」「好友 PK」都要求**服务端与客户端算出同一套题**，
 * 两边种子算法必须逐位一致。
 * 因此这里复制 FNV-1a 实现，并用单测 `tests/unit/seed-parity.test.js`
 * 拿前端 rng.hashSeed 逐样本比对，防止两份实现悄悄漂移。
 */
'use strict';

/**
 * 字符串 → 32 位无符号整数种子（FNV-1a），与前端 rng.hashSeed 完全一致。
 * @param {string} str
 * @returns {number}
 */
function hashSeed(str) {
  var s = String(str === undefined || str === null ? '' : str);
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * 压到 MySQL INT（有符号 32 位）范围内。
 * pk_matches.seed 是 INT 列，超过 2147483647 会在严格模式下写入失败；
 * 这里是纯展示/出题用的种子，取模不损失可用性。
 */
var INT_MAX = 2147483647;

/** 每日挑战赛题目种子：同一天 + 同一学段 → 同一套题 */
function dailySeed(dateKey, grade) {
  return hashSeed('daily:' + String(dateKey || '') + ':' + String(grade || '')) % INT_MAX;
}

/** 好友 PK 题目种子：发起时定一次，双方共用 */
function pkSeed(openid, ts) {
  return hashSeed('pk:' + String(openid || '') + ':' + String(ts || Date.now())) % INT_MAX;
}

module.exports = { hashSeed: hashSeed, dailySeed: dailySeed, pkSeed: pkSeed };
