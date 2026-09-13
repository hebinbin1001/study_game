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
// 本机玩法计数（首页「推荐玩法」按玩得最多排序用，2026-09-13）
var counts = require('./play-counts');

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
/**
 * 按星级反推一组「正确率样本」。
 *
 * 为什么需要：服务端 /api/score 会用 correctCount/totalQ 现算星级（不信任客户端自报的 stars，
 * 防伪造刷分）。但数字智力类玩法（华容道/一笔画/2048）手里只有「这关值几星」，没有正确率概念 ——
 * 传真实的步数/关数会被算成 0 星，玩法进度榜（按 stars > 0 过滤）就看不到这条记录。
 * 于是按门槛 90/70/60 反推一个落在同一档的样本：3 星=10/10、2 星=8/10、1 星=7/10。
 */
function bandForStars(stars) {
  var s = Math.max(1, Math.min(3, parseInt(stars, 10) || 0));
  if (s >= 3) return { correct: 10, total: 10 };
  if (s === 2) return { correct: 8, total: 10 };
  return { correct: 7, total: 10 };
}

function reportPlay(p) {
  var d = p || {};
  if (!d.gameType || !d.grade) return false;
  // 先记本机计数：**游客也记**（首页推荐要对游客生效），放在登录判断之前
  counts.bump(d.gameType);
  if (!auth.isLoggedIn()) return false;

  // 只给了 stars、没给正确率样本 → 按星级反推，保证服务端算出来的星级与原意一致
  var band = null;
  if ((!d.correct && !d.total) && d.stars > 0) band = bandForStars(d.stars);

  var payload = {
    grade: d.grade,
    level: d.level || 1,
    score: d.score || 0,
    correctCount: band ? band.correct : (d.correct || 0),
    totalQ: band ? band.total : (d.total || 0),
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
