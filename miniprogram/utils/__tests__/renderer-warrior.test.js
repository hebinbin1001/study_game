/**
 * renderer-warrior.test.js —— 战士（炮台）视觉尺寸护栏
 *
 * 背景：2026-09-12 用户反馈「字母射击里的战士太小了」—— 当时 emoji 只有 30px
 * （画布 390×500 的 6%），而怪兽卡片是 250×118，视觉分量完全不成比例。
 *
 * 这个用例守三件事：
 *   ① 尺寸下限：战士视觉高度 ≥ 画布高的 9%、底座宽 ≥ 怪兽卡片宽的 35%（防止又被改小）；
 *   ② 站位正确：战士「脚底」踩在底座顶面上、整体不越出画布、底座不越界；
 *   ③ 待机浮动是「呼吸」而不是「抖动」：幅度 ≤4px，且是连续的正弦（同一时刻结果可复现）。
 *
 * 运行：node miniprogram/utils/__tests__/renderer-warrior.test.js
 */

'use strict';

const { suite } = require('./_runner');
const s = suite('战士视觉尺寸（game/renderer.js）');

const renderer = require('../../game/renderer');
const { W, H, MON_W, MON_H, CANNON_Y } = require('../../game/config');

const WARRIOR = renderer.WARRIOR;

s.test('尺寸下限：战士与底座不能被改小到看不见', () => {
  s.assert.ok(WARRIOR.glyph >= 48, '战士字号应 ≥48px（画布逻辑宽 ' + W + '），实际 ' + WARRIOR.glyph);
  s.assert.ok(WARRIOR.glyph / H >= 0.09,
    '战士视觉高度应不少于画布高的 9%，实际 ' + (WARRIOR.glyph / H * 100).toFixed(1) + '%');
  s.assert.ok(WARRIOR.baseW >= MON_W * 0.35,
    '底座宽应 ≥ 怪兽卡片宽的 35%（' + (MON_W * 0.35).toFixed(0) + 'px），实际 ' + WARRIOR.baseW);
  s.assert.ok(WARRIOR.baseH >= 18, '底座不能太薄，实际 ' + WARRIOR.baseH);
});

s.test('站位：战士踩在底座顶面，整体不越出画布', () => {
  const L = renderer.warriorLayout(0);
  s.assert.equal(L.cx, W / 2, '战士水平居中');
  // 战士「脚底」= 中心 + 半个字高，应落在底座顶面（允许 1px 取整误差）
  const feet = L.cy + L.glyph / 2;
  s.assert.ok(Math.abs(feet - L.baseY) <= 1,
    '脚底(' + feet.toFixed(1) + ') 应贴着底座顶面(' + L.baseY.toFixed(1) + ')');
  // 战士头顶不越出画布上沿；底座底部不越出画布下沿
  s.assert.ok(L.cy - L.glyph / 2 > 0, '战士头顶出画布了：' + (L.cy - L.glyph / 2).toFixed(1));
  s.assert.ok(L.baseY + L.baseH <= H, '底座超出画布底部：' + (L.baseY + L.baseH).toFixed(1));
  s.assert.ok(L.baseX >= 0 && L.baseX + L.baseW <= W, '底座超出画布左右边界');
  s.assert.ok(L.baseY > CANNON_Y - 20, '底座不应离 CANNON_Y 太远（站位锚点漂移）');
});

s.test('待机浮动：是呼吸不是抖动（幅度小、可复现、连续）', () => {
  s.assert.ok(WARRIOR.bobAmp <= 4, '浮动幅度应 ≤4px，实际 ' + WARRIOR.bobAmp);
  const a = renderer.warriorLayout(1000);
  const b = renderer.warriorLayout(1000);
  s.assert.equal(a.cy, b.cy, '同一时间戳结果应一致（可复现）');
  s.assert.ok(Math.abs(a.bob) <= WARRIOR.bobAmp + 1e-9, '浮动幅度超限：' + a.bob);
  // 一个周期内应该既到过上方也到过下方（真的在呼吸）
  let min = Infinity;
  let max = -Infinity;
  for (let t = 0; t <= 2000; t += 50) {
    const y = renderer.warriorLayout(t).cy;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  s.assert.ok(max - min > WARRIOR.bobAmp, '浮动范围太小，看不出呼吸：' + (max - min).toFixed(2));
  s.assert.ok(max - min <= WARRIOR.bobAmp * 2 + 1e-6, '浮动范围超过振幅两倍：' + (max - min).toFixed(2));
  // 相邻采样点之间不应突变（连续性）
  let prev = renderer.warriorLayout(0).cy;
  for (let t = 50; t <= 2000; t += 50) {
    const y = renderer.warriorLayout(t).cy;
    s.assert.ok(Math.abs(y - prev) < 2, '相邻帧位移过大（会像抖动）：' + Math.abs(y - prev).toFixed(2));
    prev = y;
  }
});

s.test('不传时间戳时不浮动（供静态截图/单测使用）', () => {
  s.assert.equal(renderer.warriorLayout().bob, 0);
  s.assert.equal(renderer.warriorLayout(0).bob, 0);
});

s.done();
