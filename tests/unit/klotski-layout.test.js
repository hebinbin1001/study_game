/**
 * tests/unit/klotski-layout.test.js —— 华容道棋盘自适应（保证方向键在一屏内）
 *
 * 背景（2026-10-18 用户第二次反馈「上下左右按键没用」）：
 *   方向键逻辑没问题，是**布局**问题：页面 disableScroll，375×667 上内容比可视区高 100px，
 *   整个方向键被挤到屏幕外 —— 点的是屏幕外，当然没反应。
 *
 * 现在两件事一起做：
 *   1. 方向键从「十字块 200rpx 高」改成「单行 76rpx」；
 *   2. 棋盘按「可视高 − 其它块 − 固定间距」自适应（_fitBoard）。
 *
 * 覆盖：常规屏算出正确尺寸、极小屏不把棋盘压没（维持默认）、尺寸没变不重复 setData。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('pages/klotski 自适应布局');

let mockWin = { windowWidth: 375, windowHeight: 603 };
let mockBlocks = [43, 28, 47];   // .k-hud / .k-tip / .k-ops 的高度（px）

const store = {};
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showToast: () => {},
  navigateBack: () => {},
  getWindowInfo: () => mockWin,
  createSelectorQuery: () => {
    const q = {
      _i: 0,
      select: () => q,
      boundingClientRect: function () { return q; },
      exec: function (cb) {
        cb(mockBlocks.map((h) => ({ height: h })));
      }
    };
    return q;
  }
};

let def = null;
const prevPage = global.Page;
global.Page = (o) => { def = o; };
require('../../miniprogram/pkg-games/klotski/klotski');
global.Page = prevPage;

function makePage() {
  const p = Object.create(def);
  p.data = JSON.parse(JSON.stringify(def.data));
  p.setData = function (patch, cb) { Object.assign(p.data, patch); if (cb) cb(); };
  p._measureBoard = function () {};
  return p;
}

s.test('375×667：棋盘按剩余高度收缩，整页落在一屏内', () => {
  mockWin = { windowWidth: 375, windowHeight: 603 };
  mockBlocks = [43, 28, 47];
  const p = makePage();
  p._fitBoard();

  // rpx = 375/750 = 0.5；gaps = 86rpx = 43px；其它块合计 118px
  // 可用高 = 603 − 118 − 43 = 442 → 按 4:5 算宽 353.6，但内容宽上限 351 → 取 351
  s.assert.contains(p.data.boardStyle, 'width:351px', '棋盘应铺满内容宽 351px，实际：' + p.data.boardStyle);
  s.assert.contains(p.data.boardStyle, 'height:439px', '高度按 4:5 应为 439px');
  s.assert.contains(p.data.boardStyle, 'padding-top:0', '必须清掉 125% 的 padding-top，否则尺寸会叠加');

  // 总高校验：439 + 118 + 43 = 600 ≤ 603
  s.assert.ok(439 + 118 + 43 <= 603, '总高不能超过可视区');
});

s.test('390×844：大屏用满内容宽度', () => {
  mockWin = { windowWidth: 390, windowHeight: 760 };
  mockBlocks = [45, 29, 49];
  const p = makePage();
  p._fitBoard();
  // 内容宽 = 390 − 48*0.52 ≈ 365；按高度算出的宽会超过它 → 夹到 365 左右
  const m = /width:(\d+)px/.exec(p.data.boardStyle);
  s.assert.ok(m, '应写入宽度：' + p.data.boardStyle);
  const w = parseInt(m[1], 10);
  s.assert.ok(w >= 360 && w <= 366, '大屏应铺满内容宽（约 365px），实际 ' + w);
});

s.test('320×568 小屏：棋盘等比缩小但仍可玩', () => {
  mockWin = { windowWidth: 320, windowHeight: 504 };
  mockBlocks = [40, 26, 44];
  const p = makePage();
  p._fitBoard();
  const m = /width:(\d+)px/.exec(p.data.boardStyle);
  s.assert.ok(m, '应写入宽度：' + p.data.boardStyle);
  const w = parseInt(m[1], 10);
  // 可用高 = 504 − 110 − 86*0.4267(≈37) = 357 → 宽 285；不超过内容宽 300
  s.assert.ok(w >= 270 && w <= 300, '小屏棋盘应在 270~300px，实际 ' + w);
  s.assert.ok(Math.round(w * 1.25) + 110 + 37 <= 504, '总高仍要在可视区内');
});

s.test('取不到窗口信息时不写样式（老环境/单测桩防御）', () => {
  const winFn = global.wx.getWindowInfo;
  const sysFn = global.wx.getSystemInfoSync;
  delete global.wx.getWindowInfo;
  delete global.wx.getSystemInfoSync;
  const p = makePage();
  p._fitBoard();
  s.assert.equal(p.data.boardStyle, '', '拿不到窗口尺寸就保持 CSS 默认，不要算出一个瞎尺寸');
  global.wx.getWindowInfo = winFn;
  global.wx.getSystemInfoSync = sysFn;
});

s.test('尺寸没变时不重复 setData（避免无谓渲染）', () => {
  mockWin = { windowWidth: 375, windowHeight: 603 };
  mockBlocks = [43, 28, 47];
  const p = makePage();
  p._fitBoard();
  const first = p.data.boardStyle;
  let calls = 0;
  const raw = p.setData;
  p.setData = function (patch, cb) { calls++; raw.call(p, patch, cb); };
  p._fitBoard();
  s.assert.equal(calls, 0, '同样的尺寸不应再次 setData');
  s.assert.equal(p.data.boardStyle, first);
});

s.test('方向键已删除（页面不再有 nudge / .k-pad）', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = require('./_mp').pageDir('klotski');
  const wxml = fs.readFileSync(path.join(dir, 'klotski.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'klotski.js'), 'utf8');
  const wxss = fs.readFileSync(path.join(dir, 'klotski.wxss'), 'utf8');
  s.assert.false(wxml.indexOf('bindtap="nudge"') >= 0, 'wxml 不应再绑 nudge');
  s.assert.false(js.indexOf('nudge: function') >= 0, 'js 不应再有 nudge');
  s.assert.false(wxss.indexOf('.k-pad') >= 0, 'wxss 不应再留 .k-pad');
  s.assert.contains(wxml, '拖动棋子滑到尽头', '提示条应回到「拖动」口径');
});

s.test('通关结算不再出现「再玩一次 + 重玩本关」两个同义按钮', () => {
  const fs = require('fs');
  const path = require('path');
  const wxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pkg-games/klotski/klotski.wxml'), 'utf8');
  s.assert.contains(wxml, 'custom-ops="{{true}}"', '页面自备按钮时必须关掉组件默认按钮');
  const pop = fs.readFileSync(path.join(__dirname, '../../miniprogram/components/settle-pop/settle-pop.wxml'), 'utf8');
  s.assert.contains(pop, '!customOps && win && !showNext', '组件的「再玩一次」要能被 customOps 关掉');
});

s.done();
