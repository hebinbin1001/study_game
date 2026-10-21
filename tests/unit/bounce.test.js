/** 单词弹弹球：题库过滤、可读节奏与“不能靠颜色作弊”护栏。 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('单词弹弹球');

global.wx = {
  getStorageSync: function () { return ''; },
  setStorageSync: function () {},
  showToast: function () {}
};

let def = null;
const prevPage = global.Page;
global.Page = function (o) { def = o; };
require('../../miniprogram/pages/bounce/bounce');
global.Page = prevPage;

s.test('只从纯英文 w1 词条出题，并带可用释义', () => {
  const p = Object.create(def);
  p.data = JSON.parse(JSON.stringify(def.data));
  p.setData = function (patch) { Object.assign(p.data, patch); };
  const words = p._loadWords();
  s.assert.ok(words.length >= 8, '可出题词条不足：' + words.length);
  words.forEach(function (w) {
    s.assert.equal(w.type, 'w1');
    s.assert.match(w.q, /^[A-Za-z]+$/);
    s.assert.ok(String(w.hint || '').trim().length > 0);
  });
});

s.test('下落节奏不短于 3 秒，生成间隔不短于 1.5 秒', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/bounce/bounce.js'), 'utf8');
  const fall = parseInt((/FALL_MS\s*=\s*(\d+)/.exec(src) || [])[1], 10);
  const spawn = parseInt((/SPAWN_MS\s*=\s*(\d+)/.exec(src) || [])[1], 10);
  const step = parseFloat((/b\.y\s*\+=\s*([\d.]+)/.exec(src) || [])[1]);
  const fallMs = (104 / step) * fall;
  s.assert.ok(fallMs >= 3000, '从顶部落到底不足 3 秒：' + Math.round(fallMs));
  s.assert.ok(spawn >= 1500, '新球间隔太短：' + spawn);
});

s.test('正确球与错误球同色，避免靠颜色作答', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/bounce/bounce.wxss'), 'utf8');
  s.assert.contains(css, '.ball.ok, .ball.bad');
  s.assert.ok(!/\.ball\.ok\s*\{[^}]*#7bd389/.test(css), '正确球仍有专属绿色');
  s.assert.ok(!/\.ball\.bad\s*\{[^}]*#ff8fae/.test(css), '错误球仍有专属红色');
});

s.done();
