/**
 * tests/unit/game-question-count.test.js —— 字母射击「打满题数必须结算」
 *
 * 背景（2026-10-18 用户反馈）：关卡做到超过 10 题还没通关。
 * 根因：_nextQuestion 只在 _pickItem() 返回 null 时结束 —— 那只能覆盖「挑战关固定题序用完」；
 * 自由练 / 题库关卡是随机取题，词库够大就永远取得到，于是无限出题、永不结算。
 *
 * 修复：_nextQuestion 开头判断 `_answered >= _totalQ` 就 _finish(true)。
 *
 * 覆盖：默认 10 题到顶即结算、自定义题量（如 3 题）按实际题量收尾、
 *       题不够时（_pickItem 返回 null）仍然提前结算、不会超过题量多打。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('pages/game 题量结算');

const store = {};
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showToast: () => {},
  navigateTo: () => {},
  redirectTo: () => {},
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 603, platform: 'devtools' })
};
global.getApp = () => ({ globalData: {} });

// 把出题逻辑打桩成「必失败题」：_nextQuestion 会走 invalid 分支 → answered++ → 递归下题，
// 正好能把「一直出题」的循环跑到收尾，验证计数守卫。
const shoot = require('../../miniprogram/game/shoot');
shoot.buildRound = function () { return { invalid: true }; };

let def = null;
const prevPage = global.Page;
global.Page = (o) => { def = o; };
require('../../miniprogram/pages/game/game');
global.Page = prevPage;

function makePage(totalQ) {
  const p = Object.create(def);
  p.data = JSON.parse(JSON.stringify(def.data));
  p.setData = function (patch) { Object.assign(p.data, patch); };
  p._totalQ = totalQ;
  p._answered = 0;
  p._over = false;
  p._busy = false;
  p._usedItems = [];
  p._perfect = 0;
  p._pickItem = function () { return { q: 'x', a: 'x', type: 'en' }; };
  p._finishCalls = [];
  p._finish = function (win) { p._finishCalls.push(win); p._over = true; };
  return p;
}

s.test('默认 10 题：打满第 10 题就结算，不会继续出题', () => {
  const p = makePage(10);
  p._nextQuestion();
  s.assert.equal(p._answered, 10, '应恰好完成 10 题');
  s.assert.equal(p._finishCalls.length, 1, '只结算一次');
  s.assert.equal(p._finishCalls[0], true, '打完题量算通关（win=true）');
});

s.test('自定义题量 3 题：按 3 题收尾，不套用 10', () => {
  const p = makePage(3);
  p._nextQuestion();
  s.assert.equal(p._answered, 3);
  s.assert.equal(p._finishCalls.length, 1);
});

s.test('题不够（_pickItem 返回 null）：提前结算，不卡住', () => {
  const p = makePage(10);
  let n = 0;
  p._pickItem = function () { return (n++ < 4) ? { q: 'x', a: 'x' } : null; };
  p._nextQuestion();
  s.assert.equal(p._answered, 4, '只答了 4 题就应结束');
  s.assert.equal(p._finishCalls.length, 1);
});

s.test('源码护栏：_nextQuestion 必须带题量守卫', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/game/game.js'), 'utf8');
  const m = src.match(/_nextQuestion: function[\s\S]*?\n  \},/);
  s.assert.ok(m, '应能找到 _nextQuestion');
  s.assert.contains(m[0], '_answered >= this._totalQ', '缺少题量守卫，会退化成无限出题');
});

s.done();
