/**
 * 触发统一战斗反馈层。
 *
 * 页面只递增 trigger，动画完全由 components/battle-fx 的 CSS 播放，
 * 不在 setData 中逐帧更新，避免拖慢答题和动画。
 */
'use strict';

function play(page, mode, text, target, player) {
  if (!page || typeof page.setData !== 'function') return false;
  var current = page.data || {};
  var patch = {
    fxSeq: (parseInt(current.fxSeq, 10) || 0) + 1,
    fxMode: mode || 'attack',
    fxText: text || ''
  };
  if (target && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
    patch.fxTargetX = Number(target.x);
    patch.fxTargetY = Number(target.y);
  }
  if (player && Number.isFinite(Number(player.x)) && Number.isFinite(Number(player.y))) {
    patch.fxPlayerX = Number(player.x);
    patch.fxPlayerY = Number(player.y);
  }
  page.setData(patch);
  return true;
}

module.exports = { play: play };
