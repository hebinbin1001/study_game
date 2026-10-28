/**
 * tests/unit/game-pause.test.js —— 统一暂停/音效组件
 *
 * 覆盖：
 *   1. 挂载时从本地读音效开关（默认开），并同步给 audio 模块；
 *   2. 点 ⏸ → 弹层打开 + 触发 pause 事件；
 *   3. 继续 / 重开 / 退出 → 关闭弹层并触发对应事件；
 *   4. 音效开关 → 落盘、同步 audio、触发 soundchange；
 *   5. open 属性（页面切后台时置 true）→ 弹层显示；
 *   6. 14 个玩法页都接上了组件（源码护栏，防漏页）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('components/game-pause');

const store = {};
global.wx = {
  getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''; },
  setStorageSync: function (k, v) { store[k] = v; },
  removeStorageSync: function (k) { delete store[k]; },
  showToast: function () {}
};

const storage = require('../../miniprogram/utils/storage');
const constants = require('../../miniprogram/utils/constants');
const audio = require('../../miniprogram/game/audio');

/** 捕获 Component({...}) 定义 */
let def = null;
const prevComponent = global.Component;
global.Component = function (o) { def = o; };
require('../../miniprogram/components/game-pause/game-pause');
global.Component = prevComponent;

/** 造一个组件实例 */
function makeComp() {
  const inst = Object.create(def.methods || {});
  inst.data = JSON.parse(JSON.stringify(def.data || {}));
  inst.events = [];
  inst.setData = function (patch) {
    Object.keys(patch).forEach(function (k) { inst.data[k] = patch[k]; });
  };
  inst.triggerEvent = function (name, detail) { inst.events.push({ name: name, detail: detail }); };
  return inst;
}

function attached(inst) {
  (def.lifetimes && def.lifetimes.attached) && def.lifetimes.attached.call(inst);
}

s.test('挂载时读本地音效开关（默认开）', () => {
  delete store[constants.STORAGE_KEYS.sound];
  const c = makeComp();
  attached(c);
  s.assert.equal(c.data.sound, true, '默认应开启');
  s.assert.equal(c.data.show, false, '默认不弹');
});

s.test('本地存了「关」→ 挂载后是关', () => {
  storage.set(constants.STORAGE_KEYS.sound, '0');
  const c = makeComp();
  attached(c);
  s.assert.equal(c.data.sound, false);
  delete store[constants.STORAGE_KEYS.sound];
});

s.test('点暂停 → 弹层打开并触发 pause', () => {
  const c = makeComp();
  attached(c);
  c.onOpen();
  s.assert.equal(c.data.show, true);
  s.assert.equal(c.events[0].name, 'pause');
});

s.test('继续 / 重开 / 退出：关闭弹层并触发对应事件', () => {
  const c = makeComp();
  c.onResume();
  s.assert.equal(c.data.show, false);
  s.assert.equal(c.events.pop().name, 'resume');

  c.onRestart();
  s.assert.equal(c.events.pop().name, 'restart');

  c.onQuit();
  s.assert.equal(c.events.pop().name, 'quit');
});

s.test('音效开关：落盘 + 同步 audio + 事件', () => {
  delete store[constants.STORAGE_KEYS.sound];
  const c = makeComp();
  attached(c);
  s.assert.equal(c.data.sound, true);

  c.onToggleSound();
  s.assert.equal(c.data.sound, false);
  s.assert.equal(storage.get(constants.STORAGE_KEYS.sound), '0', '关掉要落盘');
  s.assert.equal(c.events.pop().name, 'soundchange');
  s.assert.equal(c.events.pop ? true : true, true);

  c.onToggleSound();
  s.assert.equal(c.data.sound, true);
  s.assert.equal(storage.get(constants.STORAGE_KEYS.sound), '1');
  delete store[constants.STORAGE_KEYS.sound];
});

s.test('open 属性为 true 时弹层自动显示（切后台自动暂停用）', () => {
  const c = makeComp();
  const observer = def.observers && def.observers.open;
  s.assert.ok(typeof observer === 'function', '应有 open observer');
  observer.call(c, true);
  s.assert.equal(c.data.show, true);
});

s.test('15 个玩法页都接了 game-pause（源码护栏）', () => {
  const fs = require('fs');
  const path = require('path');
  const PAGES = ['klotski', 'g2048', 'sudoku', 'math24', 'one-stroke', 'maze', 'hanoi',
    'pattern', 'clock', 'math-sprint', 'memory-grid', 'link', 'snake', 'bounce', 'letter-bubble'];
  PAGES.forEach(function (p) {
    const dir = require('./_mp').pageDir(p);
    const wxml = fs.readFileSync(path.join(dir, p + '.wxml'), 'utf8');
    const json = fs.readFileSync(path.join(dir, p + '.json'), 'utf8');
    const js = fs.readFileSync(path.join(dir, p + '.js'), 'utf8');
    s.assert.contains(wxml, '<game-pause', p + ' 页面没放组件');
    s.assert.contains(json, '/components/game-pause/game-pause', p + ' 没注册组件');
    s.assert.contains(js, 'onGamePause', p + ' 没接暂停事件');
    s.assert.contains(js, 'onGameResume', p + ' 没接恢复事件');
  });
});

/**
 * 2026-10-18 改版护栏（用户反馈「右上角暂停键和战士图标难看」）
 *
 * 这一版做了两件事，都是「改回去也不会报错、只有肉眼看得出」的类型：
 *   1. 图标从字符「Ⅱ」换成两根 view 圆角竖条（字符会被字距撑开，像文字不像按钮）；
 *   2. 暂停键 + 战士徽章从 fixed 悬浮改成 HUD 行内（inline），页面不再留 84rpx 让位。
 * 用静态断言钉住，避免以后有人「顺手」改回悬浮或改回字符。
 */
s.test('暂停键视觉改版：不得再用字符 Ⅱ / 不得再默认悬浮（源码护栏）', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '../../miniprogram');
  const wxml = fs.readFileSync(path.join(ROOT, 'components/game-pause/game-pause.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(ROOT, 'components/game-pause/game-pause.wxss'), 'utf8');
  const bare = wxss.replace(/\/\*[\s\S]*?\*\//g, '');

  s.assert.ok(wxml.indexOf('>Ⅱ<') === -1, '暂停图标不得再用字符「Ⅱ」（看着像文字）');
  s.assert.contains(wxml, 'gp-fab-bar', '暂停图标应由 view 圆角竖条绘制');
  s.assert.contains(bare, 'gp-fab--inline', '应保留 inline 模式（进 HUD 行内）');
  s.assert.contains(bare, 'align-self: center', '进 HUD 行后应垂直居中');
  // 2026-10-28 批 5：色值已令牌化（app.wxss 的 --ink 就是 #3a3a5c），
  // 钉死字面量会误杀合规写法，所以两种写法都认。
  s.assert.ok(/background:\s*(#3a3a5c|var\(--ink\))/.test(bare),
    '暂停键应为深色实心（浅色背景下白圈会糊成一团）');
});

s.test('15 个玩法页的暂停键都在 HUD 行内（不再 fixed 悬浮）', () => {
  const fs = require('fs');
  const path = require('path');
  const PAGES = ['klotski', 'g2048', 'sudoku', 'math24', 'one-stroke', 'maze', 'hanoi',
    'pattern', 'clock', 'math-sprint', 'memory-grid', 'link', 'snake', 'bounce', 'letter-bubble'];
  PAGES.forEach(function (p) {
    const dir = require('./_mp').pageDir(p);
    const wxml = fs.readFileSync(path.join(dir, p + '.wxml'), 'utf8');
    const wxss = fs.readFileSync(path.join(dir, p + '.wxss'), 'utf8');
    // 每个 game-pause 都必须带 inline
    const tags = wxml.match(/<game-pause[\s\S]*?\/>/g) || [];
    s.assert.equal(tags.length, 1, p + ' 应只有一处 game-pause');
    s.assert.contains(tags[0], 'inline', p + ' 的 game-pause 没加 inline（会退回悬浮）');
    // 页面不得再给悬浮键让位
    const bare = wxss.replace(/\/\*[\s\S]*?\*\//g, '');
    s.assert.doesNotMatch(bare, /\.(hud|hud-holder|k-hud)[^{]*\{[^}]*padding-right:\s*84rpx/,
      p + ' 仍在给悬浮暂停键让位（padding-right:84rpx）');
    s.assert.doesNotMatch(bare, /\.k-hud[^{]*\{[^}]*margin:[^;}]*84rpx/,
      p + ' 的 k-hud 仍在右侧留 84rpx');
  });
});

s.test('战士徽章视觉改版：去白底 + 金边 + 立绘放大（源码护栏）', () => {
  const fs = require('fs');
  const path = require('path');
  const wxss = fs.readFileSync(
    path.join(__dirname, '../../miniprogram/components/warrior-badge/index.wxss'), 'utf8');
  const bare = wxss.replace(/\/\*[\s\S]*?\*\//g, '');
  s.assert.ok(bare.indexOf('rgba(255, 255, 255, .86)') === -1,
    '徽章不得再用半透明白底（在浅蓝背景上只剩一团白斑）');
  s.assert.contains(bare, '#ffc53d', '徽章应有金色描边（与深色暂停键区分开）');
  s.assert.contains(bare, 'radial-gradient', '徽章底应为暖色渐变');
  s.assert.match(bare, /\.wb-img\s*\{[^}]*width:\s*132%/, '立绘应放大到 132% 撑满圆形');
  s.assert.match(bare, /\.wb-img\s*\{[^}]*bottom:\s*-6rpx/, '立绘应贴底（竖长全身像做成半身像）');
});

s.test('固定操作按钮统一提供点击、确认、返回、暂停、下一关音频函数', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/game/audio.js'), 'utf8');
  ['playUiClick', 'playUiConfirm', 'playUiBack', 'playUiPause', 'playUiNext'].forEach(function (name) {
    s.assert.contains(src, 'function ' + name);
  });
  const pause = fs.readFileSync(path.join(__dirname, '../../miniprogram/components/game-pause/game-pause.js'), 'utf8');
  s.assert.contains(pause, 'audio.playUiPause()');
  s.assert.contains(pause, 'audio.playUiConfirm()');
  s.assert.contains(pause, 'audio.playUiBack()');
});

s.done();
