/**
 * utils/play-report.js —— 「一局战绩」统一上报（2026-09-12 挑战主线 P2 抽出来）
 *
 * 背景：原来只有字母射击（结算页）会上报成绩，其它玩法打完什么都不报 —— 于是
 *   · 「玩法进度榜」（/api/ranklist/progress 按 game_type 聚合）长期只有射击的数据；
 *   · 玩法类成就（如「贪吃蛇通关 3 次」）没法判定，美术交付的 4 张玩法图标也用不上。
 *
 * 这里把「上报成绩 + 同步段位」收敛成一处，各玩法结算时调一次即可：
 *   · 游客不报（与结算页一致：登录才进排行榜）；
 *   · 网络/业务失败静默（上报是非关键路径，绝不能打断玩家）；
 *   · `gameType` 必须是小写 snake_case（服务端 /^[a-z0-9_]{1,24}$/ 校验，
 *     见 utils/challenge.js 的 MODES[].gameType）。
 *
 * 关联：pages/{match,idiom-build,snake,word-build,link}（挑战模式结算）、pages/result（字母射击沿用原逻辑）
 */

'use strict';

var request = require('./request');
var auth = require('./auth');

/**
 * 上报一局成绩（玩法维度）并在拿到星时同步段位。
 * @param {Object} p
 * @param {string} p.gameType 玩法标识（小写，如 'snake' / 'word_build'）
 * @param {string} p.grade 学段 key
 * @param {number} p.level 关卡号
 * @param {number} [p.score] 得分
 * @param {number} [p.correct] 答对/完成数
 * @param {number} [p.total] 总题数
 * @param {number} [p.stars] 本局星级（>0 时同步段位）
 * @param {number} [p.maxCombo] 最高连击（没有就传 0）
 * @returns {boolean} 是否发起了上报（游客或参数缺失返回 false）
 */
function reportPlay(p) {
  var d = p || {};
  if (!auth.isLoggedIn()) return false;
  if (!d.gameType || !d.grade) return false;

  var payload = {
    grade: d.grade,
    level: d.level || 1,
    score: d.score || 0,
    correctCount: d.correct || 0,
    totalQ: d.total || 0,
    stars: d.stars || 0,
    maxCombo: d.maxCombo || 0,
    type: '',
    game_type: d.gameType
  };
  request.post('/api/score', payload).catch(function () {
    // 静默：成绩上报失败不影响本局结算
  });
  if (payload.stars > 0) {
    request.post('/api/rank/sync', { stars: payload.stars }).catch(function () {
      // 静默：下次通关自动补
    });
  }
  return true;
}

module.exports = { reportPlay: reportPlay };
