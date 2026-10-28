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
 * ── 2026-10-28（用户拍板 A）：取消「按星级反推正确率」 ──────────────────
 * 数独/华容道/2048 这类玩法手里只有「这关值几星」，没有逐题正确率。原来的做法是按
 * 3 星=10/10、2 星=8/10、1 星=7/10 编一组样本上报 —— 好处是服务端能算出同一档星级，
 * 坏处是往学习报告里凭空塞进「答对 10 题」：正确率、答题数、全对成就全被污染。
 *
 * 现在改为：休闲玩法（见 CASUAL_GAME_TYPES）只报星级，题量写 0；服务端见到 total_q=0
 * 就按「非答题记录」落库（星级取客户端自报值，服务端校验 0~3）。字词类玩法必须给
 * 真实 correct/total，学习报告只统计这些。
 *
 * 关联：pkg-games/{match,idiom-build,snake,word-build,link,…}（玩法结算）
 */

'use strict';

var request = require('./request');
var auth = require('./auth');
// 本机玩法计数（首页「推荐玩法」按玩得最多排序用，2026-09-13）
var counts = require('./play-counts');

/**
 * 休闲玩法（数字智力 + 街机式抢接）：没有「题目」概念，只上报星级、不写题量。
 *
 * 收录口径 —— 看这一局能不能说清「答对几题 / 共几题」：
 *   · sudoku / klotski / g2048 / hanoi / onestroke / memory：纯操作型，无题量；
 *   · math24 / sprint / balance / pattern / clock：有对错，但都是算术或常识题，
 *     不属于「字词学习」，写进学习报告的正确率里只会稀释分母；
 *   · bounce（单词弹弹球）：街机式抢接，星级由得分档位决定，同样没有逐题正确率。
 *
 * 注意 maze（词义迷宫）虽然目录里归在休闲区，但它是「看词选义」逐题作答、有真实
 * 正确率的字词玩法，所以**不在**这张表里；新增玩法时按上面这条口径判断，别照抄目录分类。
 */
var CASUAL_GAME_TYPES = [
  'sudoku', 'klotski', 'g2048', 'hanoi', 'onestroke', 'memory',
  'math24', 'sprint', 'balance', 'pattern', 'clock', 'bounce'
];

/** 该玩法是否属于「非答题类」（不写题量、星级自报） */
function isCasualGame(gameType) {
  return CASUAL_GAME_TYPES.indexOf(String(gameType || '')) !== -1;
}

/**
 * 上报一局成绩（玩法维度）并在拿到星时同步段位。
 * @param {Object} p
 * @param {string} p.gameType 玩法标识（小写，如 'snake' / 'word_build'）
 * @param {string} p.grade 学段 key
 * @param {number} p.level 关卡号
 * @param {number} [p.score] 得分
 * @param {number} [p.correct] 答对/完成数（字词类必传）
 * @param {number} [p.total] 总题数（字词类必传）
 * @param {number} [p.stars] 本局星级（>0 时同步段位；休闲玩法这是服务端唯一依据）
 * @param {number} [p.maxCombo] 最高连击（没有就传 0）
 * @param {string} [p.typeKey] 题型分类 key（挑战玩法线用）
 * @returns {boolean} 是否发起了上报（游客或参数缺失返回 false）
 */
function reportPlay(p) {
  var d = p || {};
  if (!d.gameType || !d.grade) return false;
  // 先记本机计数：**游客也记**（首页推荐要对游客生效），放在登录判断之前
  counts.bump(d.gameType);
  if (!auth.isLoggedIn()) return false;

  var casual = isCasualGame(d.gameType);

  var payload = {
    grade: d.grade,
    level: d.level || 1,
    score: d.score || 0,
    // 休闲玩法：题量恒为 0（服务端据此判定「非答题记录」，题量/正确率不计入学习报告）
    correctCount: casual ? 0 : (d.correct || 0),
    totalQ: casual ? 0 : (d.total || 0),
    stars: d.stars || 0,
    maxCombo: casual ? 0 : (d.maxCombo || 0),
    type: d.typeKey || '',
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

module.exports = {
  reportPlay: reportPlay,
  isCasualGame: isCasualGame,
  CASUAL_GAME_TYPES: CASUAL_GAME_TYPES
};
