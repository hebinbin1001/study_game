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
 * 运行：node tests/unit/renderer-warrior.test.js
 */

'use strict';

const { suite } = require('./_runner');
const s = suite('战士视觉尺寸（game/renderer.js）');

const renderer = require('../../miniprogram/game/renderer');
const { W, H, MON_W, MON_H, CANNON_Y } = require('../../miniprogram/game/config');

const WARRIOR = renderer.WARRIOR;

s.test('尺寸下限：战士与底座不能被改小到看不见', () => {
  s.assert.ok(WARRIOR.glyph >= 48, '战士字号应 ≥48px（画布逻辑宽 ' + W + '），实际 ' + WARRIOR.glyph);
  s.assert.ok(WARRIOR.glyph / H >= 0.09,
    '战士视觉高度应不少于画布高的 9%，实际 ' + (WARRIOR.glyph / H * 100).toFixed(1) + '%');
  s.assert.ok(WARRIOR.baseW >= MON_W * 0.35,
    '底座宽应 ≥ 怪兽卡片宽的 35%（' + (MON_W * 0.35).toFixed(0) + 'px），实际 ' + WARRIOR.baseW);
  s.assert.ok(WARRIOR.baseH >= 18, '底座不能太薄，实际 ' + WARRIOR.baseH);
  // 真图展示区（美术到货后走图片分支）应比 emoji 更大，且不越出画布
  s.assert.ok(WARRIOR.image > WARRIOR.glyph,
    '真图展示高度应大于 emoji 字号，实际 ' + WARRIOR.image + ' vs ' + WARRIOR.glyph);
  s.assert.ok(WARRIOR.image < H * 0.33, '真图不应高到挤占战场，实际 ' + WARRIOR.image);
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

// ============ 开火反馈（2026-09-12：皮肤动态展示 遗留 B） ============
// 设计取舍：效果不用时间戳驱动，而是按「炮弹离炮口的距离」算 ——
// 小程序 canvas 的 rAF 时间戳在模拟器/后台会节流甚至停摆（项目里踩过），
// 按距离算则与游戏状态严格同步，`_testStep` 手动步进也能复现。

s.test('后坐力：没有炮弹时战士纹丝不动', () => {
  const idle = renderer.warriorRecoil(null);
  s.assert.equal(idle.dy, 0, '空状态不应有后坐力');
  s.assert.equal(idle.t, 0, '空状态闪光强度应为 0');
  const noBullet = renderer.warriorRecoil({ bullet: null });
  s.assert.equal(noBullet.dy, 0, '无炮弹不应有后坐力');
  // 坏数据不能把画面算崩（NaN 会污染整个 canvas 变换）
  const bad = renderer.warriorRecoil({ bullet: { x: 'a', y: 'b' } });
  s.assert.equal(bad.dy, 0, '炮弹字段非法时应回退为 0');
});

s.test('后坐力：刚出膛最强，飞远归零，中间单调衰减', () => {
  const atMuzzle = renderer.warriorRecoil({ bullet: { x: W / 2, y: CANNON_Y } });
  s.assert.ok(atMuzzle.t > 0.99, '刚出膛闪光强度应接近 1，实际 ' + atMuzzle.t.toFixed(3));
  s.assert.ok(Math.abs(atMuzzle.dy - WARRIOR.recoilMax) < 1e-6,
    '刚出膛后坐力应为上限 ' + WARRIOR.recoilMax + '，实际 ' + atMuzzle.dy);

  // 单调衰减 + 有界：沿炮口正上方逐点采样
  let prevDy = atMuzzle.dy;
  for (let d = 5; d <= WARRIOR.recoilDist + 20; d += 5) {
    const r = renderer.warriorRecoil({ bullet: { x: W / 2, y: CANNON_Y - d } });
    s.assert.ok(r.dy <= prevDy + 1e-9, '距离 ' + d + ' 处后坐力不应反弹：' + r.dy + ' > ' + prevDy);
    s.assert.ok(r.dy >= 0 && r.dy <= WARRIOR.recoilMax, '后坐力越界：' + r.dy);
    s.assert.ok(r.t >= 0 && r.t <= 1, '闪光强度越界：' + r.t);
    prevDy = r.dy;
  }
  const far = renderer.warriorRecoil({ bullet: { x: W / 2, y: CANNON_Y - WARRIOR.recoilDist - 1 } });
  s.assert.equal(far.dy, 0, '飞出作用范围后应完全没有后坐力');
  s.assert.equal(far.t, 0, '飞出作用范围后不应有闪光');
});

s.test('后坐力：距离按炮口算，方向不影响强度', () => {
  const up = renderer.warriorRecoil({ bullet: { x: W / 2, y: CANNON_Y - 10 } });
  const down = renderer.warriorRecoil({ bullet: { x: W / 2, y: CANNON_Y + 10 } });
  const side = renderer.warriorRecoil({ bullet: { x: W / 2 + 10, y: CANNON_Y } });
  s.assert.ok(Math.abs(up.dy - down.dy) < 1e-9, '正上方与正下方同距应等强');
  s.assert.ok(Math.abs(up.dy - side.dy) < 1e-9, '正上方与正侧方同距应等强');
});

s.test('后坐力：只压战士本体，底座不动且不越出画布', () => {
  const rest = renderer.warriorLayout(0);
  const max = renderer.warriorRecoil({ bullet: { x: W / 2, y: CANNON_Y } });
  const sunk = renderer.warriorLayout(0, max.dy);
  s.assert.equal(sunk.baseY, rest.baseY, '底座不应跟着下沉');
  s.assert.equal(sunk.baseX, rest.baseX, '底座不应左右移动');
  s.assert.ok(sunk.cy > rest.cy, '战士应被压得比静止时更低');
  s.assert.ok(Math.abs((sunk.cy - rest.cy) - max.dy) < 1e-9, '下沉量应等于后坐力值');
  // 脚底允许沉到台面以下（这就是后坐力的观感），但头顶不能压出画布
  s.assert.ok(sunk.cy - sunk.glyph / 2 > 0, '最大后坐力下战士头顶出画布了：' + (sunk.cy - sunk.glyph / 2).toFixed(1));
  s.assert.ok(sunk.baseY + sunk.baseH <= H, '底座被带出画布底部');
});

// ============ 怪兽真图叠放（2026-09-12 美术到货） ============
// 设计：真图画在题目卡片**之前**，被卡片挡住下半身，看起来像怪兽举着卡片。
// 关键不变量：只位移不缩放（缩放会把角色压扁）、不顶出画布上沿、左右与卡片同心。

const { MON_START_Y, DANGER_Y } = require('../../miniprogram/game/config');
const MON_ART = renderer.MON_ART;

s.test('怪兽真图：高度固定、宽度按原图比例（绝不拉伸变形）', () => {
  s.assert.ok(MON_ART.h > MON_H,
    '怪兽图应比卡片高（头要探到卡片上方），实际 ' + MON_ART.h + ' vs 卡片 ' + MON_H);
  const wide = renderer.monsterArtLayout(340, 170, 70, 300);
  s.assert.equal(wide.h, MON_ART.h, '高度应取固定值');
  s.assert.ok(Math.abs(wide.w - MON_ART.h * 340 / 170) < 1e-9,
    '宽度应按原图比例算，实际 ' + wide.w);
  const square = renderer.monsterArtLayout(340, 340, 70, 300);
  s.assert.ok(Math.abs(square.w - MON_ART.h) < 1e-9, '正方形原图宽度应等于高度');
  // 坏数据不能算出 NaN（NaN 会让整帧 canvas 失效）
  [renderer.monsterArtLayout(0, 0, 70, 100),
    renderer.monsterArtLayout(undefined, undefined, 70, 100)].forEach((r) => {
    s.assert.ok(isFinite(r.x) && isFinite(r.y) && isFinite(r.w) && isFinite(r.h),
      '原始尺寸非法时应兜底成正方形，不能产生 NaN');
  });
});

s.test('怪兽真图：左右与卡片同心', () => {
  const mx = 70;                                   // 卡片左边距
  const r = renderer.monsterArtLayout(340, 200, mx, 120);
  s.assert.ok(Math.abs((r.x - mx) - (MON_W - r.w) / 2) < 1e-9, '应在卡片内水平居中');
  // 跟随震屏：卡片左移时图片一起动（同一个 mx）
  const shaken = renderer.monsterArtLayout(340, 200, mx - 7, 120);
  s.assert.ok(Math.abs((shaken.x - r.x) - (-7)) < 1e-9, '震屏偏移应 1:1 传递');
});

s.test('怪兽真图：底边对齐卡片底边、顶边不越出画布', () => {
  // 开局位置（卡片贴顶）最容易顶出画布上沿
  const atStart = renderer.monsterArtLayout(340, 235, 70, MON_START_Y);
  s.assert.equal(atStart.bottom, MON_START_Y + MON_H, '图片底边应对齐卡片底边');
  s.assert.ok(atStart.y >= MON_ART.topMin - 1e-9,
    '顶边不得超出画布上沿，实际 y = ' + atStart.y);
  // 一路下沉到底都不越界、不形变
  for (let y = MON_START_Y; y <= DANGER_Y; y += 20) {
    const r = renderer.monsterArtLayout(340, 235, 70, y);
    s.assert.ok(r.y >= MON_ART.topMin - 1e-9, 'y=' + y + ' 处顶边越界：' + r.y);
    s.assert.equal(r.h, MON_ART.h, 'y=' + y + ' 处高度被改（会变形）');
    s.assert.equal(r.bottom, y + MON_H, 'y=' + y + ' 处底边没跟上卡片');
  }
});

// ============ 题目名牌（2026-09-12 用户反馈「单词挡住怪兽」后改版） ============
// 改版前：题目画在 250×118 的整张卡片上，怪兽只在卡片上方露个小脑袋 →「被单词挡住」。
// 改版后：怪兽当主体（h 比卡片高），题目改成挂在兽肚上的小名牌 —— 名牌必须
// **明显窄于怪兽**、**盖住题目文字与底部提示行**，否则又会被挡住或看不清。

s.test('题目名牌：宽度跟着文字走，且明显窄于怪兽', () => {
  const short = renderer.monsterPlateLayout(100, 70, 100);
  const long = renderer.monsterPlateLayout(200, 70, 100);
  s.assert.ok(short.w < long.w, '文字越长名牌越宽');
  s.assert.equal(short.w, MON_ART.plateMinW, '极短文字时取最小宽度');
  s.assert.equal(long.w, MON_ART.plateMaxW, '超长文字时封顶（不能再宽下去）');
  s.assert.ok(MON_ART.plateMaxW <= MON_W - 40,
    '名牌最大宽度要比卡片明显窄，实际 ' + MON_ART.plateMaxW);
  // 名牌必须比「最窄的那只怪兽」还窄，否则侧边一点都露不出来
  const narrowest = renderer.monsterArtLayout(340, 235, 70, 200).w;   // 目前最窄的一只（约 1.45 宽高比）
  s.assert.ok(MON_ART.plateMaxW < narrowest,
    '名牌(' + MON_ART.plateMaxW + ') 必须窄于最窄的怪兽(' + narrowest.toFixed(0) + ')，否则又把怪兽盖住了');
  // 坏数据兜底
  const bad = renderer.monsterPlateLayout(undefined, 70, 100);
  s.assert.ok(isFinite(bad.x) && isFinite(bad.y) && isFinite(bad.w) && isFinite(bad.h), '坏输入不能产生 NaN');
});

s.test('题目名牌：位置盖住题目文字与底部提示行', () => {
  const my = 100;
  const p = renderer.monsterPlateLayout(160, 70, my);
  s.assert.equal(p.y, my + MON_ART.plateTop, '名牌顶部相对卡片顶固定');
  // 字符级题目文字在 m.y + MON_H*0.62，底部提示行在 m.y + MON_H - 16
  const charTextY = my + MON_H * 0.62;
  const hintY = my + MON_H - 16;
  s.assert.ok(p.y <= charTextY - 20, '名牌顶部要留出题目文字的高度');
  s.assert.ok(p.y + p.h >= hintY + 6, '名牌底部要盖住底部提示行（否则白字落在兽身上看不清）');
  s.assert.ok(p.y + p.h <= my + MON_H, '名牌不能超出卡片底边（会挡住战士）');
  s.assert.ok(p.x >= 70 && p.x + p.w <= 70 + MON_W, '名牌不能超出卡片左右边界');
});

s.test('题目名牌：水平居中且跟卡片同心（含震屏）', () => {
  const mx = 70;
  const p = renderer.monsterPlateLayout(160, mx, 120);
  s.assert.ok(Math.abs((p.x - mx) - (MON_W - p.w) / 2) < 1e-9, '应在卡片内水平居中');
  const shaken = renderer.monsterPlateLayout(160, mx - 7, 120);
  s.assert.ok(Math.abs((shaken.x - p.x) - (-7)) < 1e-9, '震屏偏移应 1:1 传递');
});

s.done();
