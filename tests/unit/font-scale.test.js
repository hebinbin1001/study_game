/**
 * font-scale.test.js —— 三档字号（2026-10-28）
 *
 * 为什么值得测：
 *   · 标准档必须「零样式」—— 这是「加功能前后页面完全一样」的唯一保证。
 *     一旦有人让标准档也返回 `--fs-scale: 1`，本来没注入 page-meta 的页面
 *     （组件、以后新加的页）就会和主页面差一个基准，出来是「有的地方大一号」；
 *   · 档位是字符串 key，拼错就是「点了没反应」，而且存储里存的是旧值也要能回落；
 *   · 覆盖必须是全站性的：漏一个页面 = 那个页面字号永远不动。52 个页面靠人肉
 *     记不可能，所以把「每个页面都有 page-meta」也测进来；
 *   · 五档字号的 calc 是这功能的根，被顺手改回字面值就全废了，比的是源码。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('三档字号');

const fontScale = require('../../miniprogram/utils/font-scale');
const storage = require('../../miniprogram/utils/storage');
const constants = require('../../miniprogram/utils/constants');

const ROOT = path.join(__dirname, '../..');
const KEY = constants.STORAGE_KEYS.fontScale;

s.test('三档定义合法且单调：小 < 标准(=1) < 大', () => {
  s.assert.equal(fontScale.LEVELS.length, 3);
  s.assert.deepEqual(
    fontScale.LEVELS.map(function (l) { return l.key; }),
    ['s', 'm', 'l']
  );
  fontScale.LEVELS.forEach(function (l) {
    s.assert.true(!!l.label, '档位 ' + l.key + ' 缺中文名');
    s.assert.true(l.scale > 0 && l.scale < 2, '档位 ' + l.key + ' 倍数越界：' + l.scale);
  });
  // 标准档必须是 1：它是唯一基准，改了这个数全站比例全错
  s.assert.equal(fontScale.levelOf('m').scale, 1);
  s.assert.true(fontScale.levelOf('s').scale < 1);
  s.assert.true(fontScale.levelOf('l').scale > 1);
  // 小档不能低于可读下限（最小的 --fs-cap 是 24rpx，0.8 以下就糊了）
  s.assert.true(fontScale.levelOf('s').scale >= 0.85, '小档压得太狠');
  // 大档不能撞档：32rpx * 1.15 = 36.8 < --fs-title 的 38rpx
  s.assert.true(32 * fontScale.levelOf('l').scale < 38, '大档把按钮字撑到和标题同级');
});

s.test('标准档返回空串：不覆盖 page{} 默认值（加功能前后完全一致）', () => {
  s.assert.equal(fontScale.styleOf('m'), '');
  // 脏值也落到标准档，不是落到「小」——降级要往「和以前一样」的方向降
  s.assert.equal(fontScale.styleOf('xx'), '');
  s.assert.equal(fontScale.styleOf(''), '');
});

s.test('小/大档生成的行内样式能被 page-style 直接吃掉', () => {
  const small = fontScale.styleOf('s');
  const large = fontScale.styleOf('l');
  s.assert.equal(small, '--fs-scale: 0.90');
  s.assert.equal(large, '--fs-scale: 1.15');
  // 只写自定义属性，不能混进别的声明（page-style 是整段行内样式）
  [small, large].forEach(function (v) {
    s.assert.equal(v.split(':').length, 2, '出现了多条声明：' + v);
    s.assert.true(/^--fs-scale: \d\.\d{2}$/.test(v), '格式不是两位小数：' + v);
  });
});

s.test('set 只接受合法档位，且非法值不污染当前值', () => {
  s.assert.true(fontScale.set('l'));
  s.assert.equal(fontScale.current(), 'l');
  s.assert.equal(fontScale.styleOf(fontScale.current()), '--fs-scale: 1.15');

  s.assert.false(fontScale.set('huge'));
  s.assert.false(fontScale.set(''));
  s.assert.false(fontScale.set(undefined));
  // 非法写入被拒后，当前值必须还是上一次成功的那个
  s.assert.equal(fontScale.current(), 'l');

  s.assert.true(fontScale.set('m'));
  s.assert.equal(fontScale.current(), 'm');
});

s.test('存储里是脏值（旧版本/手改）时 current() 回落标准档', () => {
  storage.set(KEY, '2x');
  s.assert.equal(fontScale.current(), 'm');
  storage.set(KEY, '');
  s.assert.equal(fontScale.current(), 'm');
  storage.remove(KEY);
  s.assert.equal(fontScale.current(), 'm');
});

s.test('全站覆盖：每个页面 wxml 都有 page-meta 且绑的是 fsStyle', () => {
  // 组件不用挂：page-meta 只能在页面根节点，组件里的字跟随所在页面的倍数，天然生效
  const roots = ['miniprogram/pages', 'miniprogram/pkg-games'];
  const missing = [];
  const wrong = [];
  let total = 0;

  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (!e.name.endsWith('.wxml')) return;
      total++;
      const src = fs.readFileSync(p, 'utf8');
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (src.indexOf('page-meta') === -1) missing.push(rel);
      else if (src.indexOf('page-style="{{fsStyle}}"') === -1) wrong.push(rel);
    });
  }
  roots.forEach(function (r) { walk(path.join(ROOT, r)); });

  s.assert.true(total >= 50, '页面数异常：' + total);
  s.assert.deepEqual(missing, [], '这些页面没挂 page-meta，字号不会跟着变');
  s.assert.deepEqual(wrong, [], '这些页面的 page-style 没绑 fsStyle');
});

s.test('五档字号都乘了 --fs-scale，且默认倍数是 1', () => {
  const appWxss = fs.readFileSync(path.join(ROOT, 'miniprogram/app.wxss'), 'utf8');
  // 默认值必须是 1：页面没注入 page-meta 时靠它保持原样
  s.assert.contains(appWxss, '--fs-scale: 1;');
  ['display', 'title', 'strong', 'body', 'cap'].forEach(function (n) {
    const decl = '--fs-' + n + ': calc(';
    s.assert.contains(appWxss, decl);
  });
  // 反向：不允许还有一档是裸字面值（只改一半等于只缩放一半）
  const bare = appWxss.match(/--fs-(display|title|strong|body|cap): \d+rpx/g) || [];
  s.assert.deepEqual(bare, [], '这些字号档还没接倍数：' + bare.join(', '));
});

s.done();
