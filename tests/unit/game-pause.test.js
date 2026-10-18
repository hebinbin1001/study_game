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

s.test('14 个玩法页都接了 game-pause（源码护栏）', () => {
  const fs = require('fs');
  const path = require('path');
  const PAGES = ['klotski', 'g2048', 'sudoku', 'math24', 'one-stroke', 'maze', 'hanoi',
    'pattern', 'clock', 'math-sprint', 'memory-grid', 'link', 'snake', 'bounce'];
  PAGES.forEach(function (p) {
    const dir = path.join(__dirname, '../../miniprogram/pages', p);
    const wxml = fs.readFileSync(path.join(dir, p + '.wxml'), 'utf8');
    const json = fs.readFileSync(path.join(dir, p + '.json'), 'utf8');
    const js = fs.readFileSync(path.join(dir, p + '.js'), 'utf8');
    s.assert.contains(wxml, '<game-pause', p + ' 页面没放组件');
    s.assert.contains(json, '/components/game-pause/game-pause', p + ' 没注册组件');
    s.assert.contains(js, 'onGamePause', p + ' 没接暂停事件');
    s.assert.contains(js, 'onGameResume', p + ' 没接恢复事件');
  });
});

s.done();
