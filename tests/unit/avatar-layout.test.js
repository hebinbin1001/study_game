/**
 * avatar-layout.test.js —— 战士/怪兽皮肤墙的布局护栏
 *
 * 用户实测反馈：皮肤墙最后几行的名称和按钮互相挤压，靠近底部时还会被
 * Home 指示条遮挡。皮肤数据本身没有问题，问题在卡片没有固定的纵向节奏。
 * 这里钉住两列卡片、名称最多两行、提示最多两行、底部操作区固定高度和安全区。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('皮肤墙布局');

const root = path.join(__dirname, '../../miniprogram/pages/avatar');
const wxml = fs.readFileSync(path.join(root, 'avatar.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(root, 'avatar.wxss'), 'utf8');
const bare = wxss.replace(/\/\*[\s\S]*?\*\//g, '');

s.test('战士和怪兽都使用统一的立绘容器与底部操作区', () => {
  const arts = wxml.match(/class="avatar-art"/g) || [];
  const actions = wxml.match(/class="avatar-action"/g) || [];
  s.assert.equal(arts.length, 2, '战士/怪兽各应有一个统一立绘区');
  s.assert.equal(actions.length, 2, '战士/怪兽各应有一个固定操作区');
  s.assert.contains(wxml, 'avatar-emoji avatar-emoji--ph');
});

s.test('皮肤卡两列布局，名称与解锁说明都限制两行', () => {
  s.assert.match(bare, /\.avatar-item\s*\{[^}]*width:\s*335rpx/);
  s.assert.match(bare, /\.avatar-item\s*\{[^}]*min-height:\s*500rpx/);
  s.assert.match(bare, /\.avatar-name\s*\{[^}]*-webkit-line-clamp:\s*2/);
  s.assert.match(bare, /\.avatar-unlock-note\s*\{[^}]*-webkit-line-clamp:\s*2/);
  s.assert.ok(bare.indexOf('white-space: nowrap') === -1,
    '皮肤名称不应强制单行，否则长名称会被截断');
});

s.test('底部操作区固定高度，页面底部保留安全区', () => {
  s.assert.match(bare, /\.avatar-action\s*\{[^}]*min-height:\s*70rpx/);
  s.assert.match(bare, /\.btn-use,\s*\.btn-unlock\s*\{[^}]*height:\s*64rpx/);
  s.assert.match(bare, /\.safe-gap\s*\{[^}]*safe-area-inset-bottom/);
  s.assert.match(bare, /\.safe-gap\s*\{[^}]*96rpx/);
});

s.test('解锁提示不再散落内联字号，避免长文案把按钮挤出卡片', () => {
  s.assert.ok(wxml.indexOf('font-size:20rpx') === -1,
    'WXML 里仍有内联小字号解锁提示');
});

s.done();
