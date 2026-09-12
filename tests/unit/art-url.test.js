/**
 * art-url.test.js —— 美术资源 URL 转换（utils/art.js）
 *
 * 背景（2026-09-12）：微信上传时的检测项「图片和音频资源大小超过 200K」判的是
 * **代码包内图片/音频的总量**，官方建议超了就把资源放 CDN、用 URL 引入。
 * 于是成就图标（40 张）与段位徽章（80 张）移出代码包，改由云托管静态托管、
 * 端上用 utils/art.js 拼完整 URL。这个用例守住转换规则本身。
 *
 * 运行：node tests/unit/art-url.test.js
 */

'use strict';

const { suite } = require('./_runner');
const fs = require('fs');
const path = require('path');
const s = suite('美术资源 URL（utils/art.js）');

const art = require('../../miniprogram/utils/art');

s.test('artUrl：把服务端给的 /assets 路径拼成云托管地址', () => {
  s.assert.equal(art.artUrl('/assets/ranks/rank-gold-3-256.png'),
    art.ART_BASE + '/assets/ranks/rank-gold-3-256.png');
  s.assert.equal(art.artUrl('/assets/achievements/answer_100.png'),
    art.ART_BASE + '/assets/achievements/answer_100.png');
  // 少了前导斜杠也要能拼对（后端字段万一写成相对路径）
  s.assert.equal(art.artUrl('assets/ranks/bronze.png'),
    art.ART_BASE + '/assets/ranks/bronze.png');
});

s.test('artUrl：已是完整 URL / 空值 的兜底', () => {
  s.assert.equal(art.artUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
  s.assert.equal(art.artUrl('http://cdn.example.com/a.png'), 'http://cdn.example.com/a.png');
  // 空值返回空串 → 模板里 wx:if 直接跳过渲染，不产生裂图
  s.assert.equal(art.artUrl(''), '');
  s.assert.equal(art.artUrl(null), '');
  s.assert.equal(art.artUrl(undefined), '');
});

s.test('ART_BASE：必须是 https 的云托管域名', () => {
  s.assert.ok(art.ART_BASE.indexOf('https://') === 0, '必须 https：' + art.ART_BASE);
  s.assert.ok(/sh\.run\.tcloudbase\.com$/.test(art.ART_BASE), '应为云托管公网域名：' + art.ART_BASE);
});

s.test('这两类图确实不在代码包里（包内总量必须留有余量）', () => {
  const pkg = path.resolve(__dirname, '..', '..', 'miniprogram', 'assets');
  ['achievements', 'ranks'].forEach(function (kind) {
    s.assert.ok(!fs.existsSync(path.join(pkg, kind)),
      kind + ' 不应再出现在代码包里（应放仓库根 art/，由云托管托管）');
  });
  ['achievements', 'ranks'].forEach(function (kind) {
    const dir = path.resolve(__dirname, '..', '..', 'art', kind);
    s.assert.ok(fs.existsSync(dir), 'art/' + kind + ' 应存在（服务端静态托管的源）');
    s.assert.ok(fs.readdirSync(dir).length > 0, 'art/' + kind + ' 不能是空的');
  });
  // 代码包里保留的只有对局立绘 + tabbar 图标
  s.assert.ok(fs.existsSync(path.join(pkg, 'skins')), '战士/怪兽立绘应仍在包内（对局 canvas 直接绘制）');
  s.assert.ok(fs.existsSync(path.join(pkg, 'tab')), 'tabbar 图标属必要资源，应留在包内');
});
