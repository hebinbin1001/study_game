// 字号档位（2026-10-28）
//
// 只做一件事：把「小 / 标准 / 大」翻译成 page 根节点上的 `--fs-scale` 倍数。
// 五档字号本身不动（--fs-display/title/strong/body/cap 仍各差 4rpx），
// 否则「档位 × 字号档」会变成 15 个组合，改一次版式要验 15 遍。
//
// 为什么倍数不取整数：
//   · 大档 1.15 —— 32rpx → 36.8rpx。取 1.2 会到 38.4rpx，和 --fs-title 撞档，
//     卡片里「标题 38 / 正文 33.6」的层级会糊掉；而且按钮文字在 750rpx 宽里
//     多出 1.2 个字宽就折行。
//   · 小档 0.90 —— 24rpx → 21.6rpx。这是全站最小的说明文字，已经贴着可读下限，
//     再往下给一个 0.8 档就是「能选但看不清」，不如不给。
// 三档而不是四档，也是同一个理由：能选的值必须是真有区别、且都不坏事的。

var storage = require('./storage');
var constants = require('./constants');

var KEY = constants.STORAGE_KEYS.fontScale;

// 顺序即设置页展示顺序
var LEVELS = [
  { key: 's', label: '小', scale: 0.9, sample: '说明文字' },
  { key: 'm', label: '标准', scale: 1, sample: '说明文字' },
  { key: 'l', label: '大', scale: 1.15, sample: '说明文字' }
];

var DEFAULT_KEY = 'm';

function levelOf(key) {
  for (var i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].key === key) return LEVELS[i];
  }
  return null;
}

/** 当前档位 key；存储里是脏值（旧版本、手改）一律回落默认 */
function current() {
  var raw = storage.get(KEY);
  return levelOf(raw) ? raw : DEFAULT_KEY;
}

/**
 * 档位 → page 根节点的行内样式。
 * 标准档返回空串：不覆盖 page{} 里的默认值，行为和加这个功能之前完全一样。
 * 这样「没注入 page-meta 的页面」和「标准档」是同一套表现，不会出现两套基准。
 */
function styleOf(key) {
  var lv = levelOf(key) || levelOf(DEFAULT_KEY);
  if (lv.scale === 1) return '';
  // 两位小数足够：0.9 / 1.15；再多位是给自己找麻烦（calc 里浮点误差会进像素）
  return '--fs-scale: ' + lv.scale.toFixed(2);
}

function set(key) {
  if (!levelOf(key)) return false;
  storage.set(KEY, key);
  return true;
}

module.exports = {
  LEVELS: LEVELS,
  DEFAULT_KEY: DEFAULT_KEY,
  levelOf: levelOf,
  current: current,
  styleOf: styleOf,
  set: set
};
