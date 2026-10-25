/**
 * 固定操作按钮图标：统一资源映射、暂停弹层与结算弹层接入。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('固定操作按钮图标');
const icons = require('../../miniprogram/utils/ui-icons');

const ROOT = path.resolve(__dirname, '../..');

s.test('8 个固定动作均有稳定映射且使用包内小图', () => {
  s.assert.deepEqual(icons.NAMES.slice().sort(),
    ['back', 'confirm', 'hint', 'home', 'next', 'pause', 'resume', 'retry']);
  icons.NAMES.forEach(function (name) {
    const url = icons.url(name);
    s.assert.equal(url, '/assets/ui-buttons/' + name + '.png');
    s.assert.contains(url, '/assets/ui-buttons/' + name + '.png');
  });
  s.assert.equal(icons.url('bad'), '');
});

s.test('包内目录已落盘 8 枚 128×128 PNG', () => {
  const dir = path.join(ROOT, 'miniprogram/assets/ui-buttons');
  icons.NAMES.forEach(function (name) {
    const file = path.join(dir, name + '.png');
    s.assert.ok(fs.existsSync(file), '缺少 ' + name + '.png');
    const b = fs.readFileSync(file);
    s.assert.equal(b.readUInt32BE(16), 128, name + ' 宽度应为 128');
    s.assert.equal(b.readUInt32BE(20), 128, name + ' 高度应为 128');
    s.assert.ok(fs.statSync(file).size < 200 * 1024, name + '.png 超过 200KB');
  });
});

s.test('暂停层与结算层使用统一图标并有文字兜底', () => {
  const pause = fs.readFileSync(path.join(ROOT, 'miniprogram/components/game-pause/game-pause.wxml'), 'utf8');
  const settle = fs.readFileSync(path.join(ROOT, 'miniprogram/components/settle-pop/settle-pop.wxml'), 'utf8');
  s.assert.contains(pause, 'src="{{icons.pause}}"');
  s.assert.contains(pause, 'src="{{icons.resume}}"');
  s.assert.contains(pause, 'src="{{icons.retry}}"');
  s.assert.contains(settle, 'src="{{icons.next}}"');
  s.assert.contains(settle, 'src="{{icons.retry}}"');
  s.assert.contains(settle, '<text');
});

s.done();
