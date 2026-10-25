/**
 * 数字智力玩法图标：目录、CDN 文件与页面兜底。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('数字智力玩法图标');

const ROOT = path.resolve(__dirname, '../..');
const KEYS = [
  'math24', 'sudoku', 'sprint', 'balance', 'g2048', 'memory',
  'onestroke', 'klotski', 'pattern', 'clock', 'maze', 'hanoi'
];
const catalog = require('../../miniprogram/utils/game-catalog');

s.test('12 款数字智力玩法均使用独立 CDN 图标', () => {
  KEYS.forEach(function (key) {
    const game = catalog.find(function (g) { return g.key === key; });
    s.assert.ok(game, '目录缺少玩法 ' + key);
    s.assert.ok(/^https?:\/\/.+\.png$/.test(game.iconSrc || ''), key + ' 缺少 iconSrc');
    s.assert.contains(game.iconSrc, '/assets/game-icons/' + key + '.png');
  });
});

s.test('玩法页与首页优先加载图标，失败时回退 emoji', () => {
  const playlistWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/playlist/playlist.wxml'), 'utf8');
  const playlistJs = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/playlist/playlist.js'), 'utf8');
  const indexWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8');
  const indexJs = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.js'), 'utf8');
  s.assert.contains(playlistWxml, 'class="pic-img"');
  s.assert.contains(playlistWxml, 'binderror="onGameIconError"');
  s.assert.contains(playlistJs, 'onGameIconError');
  s.assert.contains(indexWxml, 'class="hot-card__img"');
  s.assert.contains(indexWxml, 'binderror="onHotIconError"');
  s.assert.contains(indexJs, 'onHotIconError');
});

s.test('CDN 目录已包含全部 12 张合规 PNG', () => {
  const dir = path.join(ROOT, 'art/game-icons');
  s.assert.ok(fs.existsSync(dir), '缺少 art/game-icons');
  KEYS.forEach(function (key) {
    const file = path.join(dir, key + '.png');
    s.assert.ok(fs.existsSync(file), '缺少 ' + key + '.png');
    const b = fs.readFileSync(file);
    s.assert.equal(b.toString('ascii', 1, 4), 'PNG', key + ' 不是 PNG');
    s.assert.ok(fs.statSync(file).size < 200 * 1024, key + '.png 超过 200KB');
  });
});

s.done();
