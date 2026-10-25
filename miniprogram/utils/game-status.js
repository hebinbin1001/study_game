/**
 * 玩法开放状态（管理端 stop switch 的端上只读入口）。
 *
 * 玩法 tab 会隐藏被暂停的入口，但分享卡片 / 收藏 / 历史消息仍可能带直链。
 * 新玩法页在开局前必须再读一次 /api/game-status，避免绕过入口继续开局。
 * 接口失败时沿用项目既有策略：降级为可玩，成绩上报端仍会二次拦截。
 */
'use strict';

var request = require('./request');

function isPaused(gameKey) {
  var key = String(gameKey || '').trim();
  if (!key) return Promise.resolve(false);
  return request.get('/api/game-status').then(function (data) {
    return ((data && data.paused) || []).indexOf(key) >= 0;
  }).catch(function () {
    return false;
  });
}

module.exports = { isPaused: isPaused };
