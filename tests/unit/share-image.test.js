/**
 * tests/unit/share-image.test.js —— 分享图卡工具（utils/share-image.js）的纯函数部分
 *
 * 画布本身只能在模拟器/真机里验证（见 e2e 的截图人工复核），这里钉住容易写错的逻辑：
 *   · 尺寸必须是 5:4（微信分享图推荐比例，被裁切最少）；
 *   · 文字超宽要截断加省略号，不能溢出卡片；
 *   · 圆角矩形路径闭合、四角都用 arcTo（手画路径最容易漏一个角）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('分享图卡（utils/share-image）');

const shareImage = require('../../miniprogram/utils/share-image');

/** 假 2D context：按「字号 × 字数」估算宽度，足够验证截断逻辑 */
function fakeCtx(fontWidthPerChar) {
  const calls = { arcTo: 0, moveTo: 0, lineTo: 0, closePath: 0 };
  return {
    _calls: calls,
    font: '',
    measureText(str) {
      return { width: String(str).length * (fontWidthPerChar || 10) };
    },
    beginPath() {},
    moveTo() { calls.moveTo++; },
    lineTo() { calls.lineTo++; },
    arcTo() { calls.arcTo++; },
    closePath() { calls.closePath++; }
  };
}

s.test('分享图尺寸是 5:4（500×400）', () => {
  s.assert.equal(shareImage.SIZE.width, 500);
  s.assert.equal(shareImage.SIZE.height, 400);
  s.assert.equal(shareImage.SIZE.width / shareImage.SIZE.height, 1.25);
});

s.test('fitText：放得下就原样返回', () => {
  const ctx = fakeCtx(10);
  s.assert.equal(shareImage._fitText(ctx, '词力战士', 200, '20px'), '词力战士');
  s.assert.equal(shareImage._fitText(ctx, '', 100, '20px'), '');
  s.assert.equal(shareImage._fitText(ctx, null, 100, '20px'), '');
});

s.test('fitText：超宽截断并补省略号，且结果不超宽', () => {
  const ctx = fakeCtx(10);
  const out = shareImage._fitText(ctx, '一二三四五六七八九十', 40, '20px');
  s.assert.ok(out.slice(-1) === '…', '应补省略号：' + out);
  s.assert.ok(ctx.measureText(out).width <= 40, '截断后仍超宽：' + out);
  s.assert.ok(out.length < '一二三四五六七八九十'.length, '必须真的截断了');
});

s.test('roundRect：四角 arcTo + 路径闭合', () => {
  const ctx = fakeCtx(10);
  shareImage._roundRect(ctx, 0, 0, 100, 60, 12);
  s.assert.equal(ctx._calls.moveTo, 1);
  s.assert.equal(ctx._calls.arcTo, 4);
  s.assert.equal(ctx._calls.closePath, 1);
});

s.test('build 是函数且不依赖 wx 也能安全调用（拿不到 canvas 就静默放弃）', () => {
  s.assert.equal(typeof shareImage.build, 'function');
  const page = {};
  shareImage.build(page, 'result', { stars: 3 }); // Node 环境没有 wx：直接返回，不能抛
  s.assert.ok(!page._shareImage);
});

s.done();
