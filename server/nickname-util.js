/**
 * server/nickname-util.js —— 展示昵称的生成与兜底（2026-10-08）
 *
 * 背景：微信从 2022 年起不再返回用户真实昵称（getUserProfile 一律返回「微信用户」），
 * 唯一合规的采集方式是让用户主动点一次键盘上方的「使用微信昵称」—— 实测几乎没人点。
 * 于是原来那条「必须设了昵称才能上榜」的门槛，实际效果是把最活跃的那批人挡在了榜外
 * （线上 22 个用户里 16 个真人玩了几十局，一个都没上榜）。
 *
 * 现在的口径（主流小程序的通行做法）：**区分用户靠 openid，昵称只是展示层**。
 *   · 注册即给一个默认昵称（「战士 3F2A」，取 openid 里可读字符的后 4 位）；
 *   · 用户随时可以改成自己喜欢的；
 *   · 没改过的也照样有名、照样上榜，不会出现「未命名」。
 *
 * 纯函数，有单测：tests/unit/nickname-util.test.js
 */
'use strict';

/** 默认昵称前缀（与小程序名「词力战士」呼应） */
const DEFAULT_PREFIX = '战士';

/** openid 里能拿来当后缀的字符（去掉 - 和 _ 之类，避免「战士 A-_b」这种） */
const TAIL_KEEP = /[^0-9a-zA-Z]/g;

/**
 * 由 openid 生成默认昵称。
 * @param {string} openid
 * @returns {string} 形如「战士 3F2A」；openid 不合法时退回「战士 0000」
 */
function defaultNickname(openid) {
  const cleaned = String(openid == null ? '' : openid).replace(TAIL_KEEP, '');
  const tail = cleaned.slice(-4).toUpperCase();
  return DEFAULT_PREFIX + ' ' + (tail.length === 4 ? tail : ('0000' + tail).slice(-4));
}

/**
 * 展示用昵称：用户设过就用用户的，没设过就用默认昵称兜底。
 * 所有对外展示昵称的地方都该走这里，避免冒出「未命名」或空字符串。
 * @param {string} nickname users.nickname（可能是 null / ''）
 * @param {string} openid
 * @returns {string}
 */
function displayName(nickname, openid) {
  const n = String(nickname == null ? '' : nickname).trim();
  return n || defaultNickname(openid);
}

module.exports = {
  DEFAULT_PREFIX: DEFAULT_PREFIX,
  defaultNickname: defaultNickname,
  displayName: displayName
};
