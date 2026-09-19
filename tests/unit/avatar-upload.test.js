/**
 * avatar-upload.test.js —— 头像上传的格式判定（2026-09-19）
 *
 * 背景：用户反馈「编辑头像无法更换」。查明是两件事：
 *   ① chooseAvatar 给的是**微信临时路径**，直接存库 → 本机重启失效、别人手机裂图（本次修复主体）；
 *   ② 该能力同样受小程序「隐私保护指引」限制（未声明头像时面板弹不出来）。
 * 前端压到 160px 后转 base64 上传，格式由微信决定、不保证是 png，所以要按首字节猜 MIME。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('头像上传（avatar-upload）');

const up = require('../../miniprogram/utils/avatar-upload');

s.test('MIME 识别：PNG / JPEG / WEBP 各自的 magic', () => {
  s.assert.equal(up.mimeOfBase64('iVBORw0KGgoAAAANSUhEUg'), 'image/png');
  s.assert.equal(up.mimeOfBase64('/9j/4AAQSkZJRgABAQ'), 'image/jpeg');
  s.assert.equal(up.mimeOfBase64('UklGRiQAAABXRUJQ'), 'image/webp');
});

s.test('MIME 兜底：认不出的按 png（后端也只收这三种）', () => {
  s.assert.equal(up.mimeOfBase64(''), 'image/png');
  s.assert.equal(up.mimeOfBase64(null), 'image/png');
  s.assert.equal(up.mimeOfBase64('abc123'), 'image/png');
});

s.test('压缩目标宽度是 160px（排行榜 48px / 个人页 120px 都够用）', () => {
  s.assert.equal(up.TARGET_WIDTH, 160);
});

s.test('导出齐全（页面只依赖 uploadAvatar）', () => {
  s.assert.equal(typeof up.uploadAvatar, 'function');
  s.assert.equal(typeof up.mimeOfBase64, 'function');
});
