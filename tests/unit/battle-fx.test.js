/** 统一战斗反馈层：触发协议、动画覆盖与核心玩法接入护栏。 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('components/battle-fx');
const battleFx = require('../../miniprogram/utils/battle-fx');

// 2026-10-28：玩法页已迁进分包 pkg-games，读源码统一走 _mp.readMp 自动定位
const { readMp } = require('./_mp');
function read(rel) {
  return readMp(rel);
}

s.test('trigger 递增并同步模式与飘字', () => {
  const page = {
    data: { fxSeq: 2, fxMode: '', fxText: '' },
    setData: function (patch) { Object.assign(page.data, patch); }
  };
  battleFx.play(page, 'attack', '-1 护盾');
  s.assert.equal(page.data.fxSeq, 3);
  s.assert.equal(page.data.fxMode, 'attack');
  s.assert.equal(page.data.fxText, '-1 护盾');
  battleFx.play(page, 'finish', '击破');
  s.assert.equal(page.data.fxSeq, 4);
  s.assert.equal(page.data.fxMode, 'finish');
});

s.test('页面可传入 Boss 与玩家实时坐标，Boss 反击有独立冲刺层', () => {
  const page = {
    data: {},
    setData: function (patch) { Object.assign(this.data, patch); }
  };
  battleFx.play(page, 'counter', '-1 ♥', { x: 190, y: 340 }, { x: 190, y: 720 });
  s.assert.equal(page.data.fxTargetX, 190);
  s.assert.equal(page.data.fxTargetY, 340);
  s.assert.equal(page.data.fxPlayerX, 190);
  s.assert.equal(page.data.fxPlayerY, 720);
  const comp = read('miniprogram/components/battle-fx/index.wxml');
  s.assert.contains(comp, 'bfx-boss-attacker');
});

s.test('未知模式回退为普通攻击，缺页面安全返回 false', () => {
  const page = {
    data: {},
    setData: function (patch) { Object.assign(this.data, patch); }
  };
  battleFx.play(page, 'bad-mode', '');
  s.assert.equal(page.data.fxMode, 'bad-mode');
  // 组件内部会把未知模式安全降级为 attack
  const comp = read('miniprogram/components/battle-fx/index.js');
  s.assert.contains(comp, "var safeMode = ['attack', 'counter', 'finish']");
  s.assert.equal(battleFx.play(null, 'attack'), false);
});

s.test('反馈层包含冲刺、刀光、冲击、反击与终结技', () => {
  const wxml = read('miniprogram/components/battle-fx/index.wxml');
  const wxss = read('miniprogram/components/battle-fx/index.wxss');
  ['bfx-hero', 'bfx-slash-a', 'bfx-impact'].forEach(function (cls) {
    s.assert.contains(wxml, cls);
  });
  ['bfx-hero-dash', 'bfx-slash', 'bfx-finish', 'bfx-counter'].forEach(function (cls) {
    s.assert.contains(wxss, cls);
  });
});

s.test('全局注册并在泡泡龙、字母射击接入正确与反击反馈', () => {
  const app = JSON.parse(read('miniprogram/app.json'));
  s.assert.equal(app.usingComponents['battle-fx'], '/components/battle-fx/index');

  const bubbleJs = read('miniprogram/pkg-games/letter-bubble/letter-bubble.js');
  const bubbleWxml = read('miniprogram/pkg-games/letter-bubble/letter-bubble.wxml');
  s.assert.contains(bubbleJs, "this._playBattleFx(this._pendingAction === 'win' ? 'finish' : 'attack'");
  s.assert.contains(bubbleJs, "this._playBattleFx('counter'");
  s.assert.contains(bubbleJs, 'rect.top + rect.height * 0.45');
  s.assert.contains(bubbleWxml, 'target-x="{{fxTargetX}}"');

  const gameJs = read('miniprogram/pkg-games/game/game.js');
  const gameWxml = read('miniprogram/pkg-games/game/game.wxml');
  s.assert.contains(gameJs, "this._playBattleFx((this._answered + 1 >= this._totalQ) ? 'finish' : 'attack'");
  s.assert.contains(gameJs, "self._playBattleFx('counter'");
  s.assert.contains(gameJs, "select('.gs-boss')");
  s.assert.contains(gameWxml, 'target-x="{{fxTargetX}}"');
});

s.test('皮肤按元素分为不同攻击视觉', () => {
  const js = read('miniprogram/components/battle-fx/index.js');
  const wxss = read('miniprogram/components/battle-fx/index.wxss');
  ['beast', 'wind', 'thunder', 'flame', 'nature', 'arcane', 'shine'].forEach(function (kind) {
    s.assert.contains(js, "fx = '" + kind + "'");
    s.assert.contains(wxss, '.skin-' + kind);
  });
});

s.test('终结技按八元素加载独立透明特效，普通命中不加载大图', () => {
  const js = read('miniprogram/components/battle-fx/index.js');
  const wxml = read('miniprogram/components/battle-fx/index.wxml');
  const wxss = read('miniprogram/components/battle-fx/index.wxss');
  s.assert.contains(js, "'/assets/fx/finisher/' + fx + '.png'");
  s.assert.contains(wxml, "modeClass === 'finish' && finisherImg");
  s.assert.contains(wxml, 'binderror="onFinisherImgError"');
  s.assert.contains(wxss, '@keyframes bfx-finisher');
  ['steel', 'beast', 'wind', 'thunder', 'flame', 'nature', 'arcane', 'shine'].forEach(function (kind) {
    const file = path.join(__dirname, '../../art/fx/finisher/' + kind + '.png');
    s.assert.ok(fs.existsSync(file), '缺少终结技素材 ' + kind + '.png');
  });
});

s.test('对抗型字词玩法接入战斗反馈层', () => {
  const catalog = require('../../miniprogram/utils/game-catalog');
  const PAGE_OF = {
    shoot: 'game/game',
    match: 'match/match',
    link: 'link/link',
    wordbuild: 'word-build/word-build',
    idiombuild: 'idiom-build/idiom-build',
    snake: 'snake/snake',
    quiz: 'quiz/quiz',
    letterBubble: 'letter-bubble/letter-bubble',
    bounce: 'bounce/bounce'
  };
  catalog.filter(function (g) {
    return g.unlocked && PAGE_OF[g.key];
  }).forEach(function (game) {
    const page = PAGE_OF[game.key];
    s.assert.ok(page, game.key + ' 未登记战斗反馈映射');
    if (!page) return;
    const js = read('miniprogram/pages/' + page + '.js');
    const wxml = read('miniprogram/pages/' + page + '.wxml');
    s.assert.contains(js, "require('../../utils/battle-fx')", game.key + ' 未引入战斗反馈');
    s.assert.contains(js, 'battleFx.play', game.key + ' 未触发战斗反馈');
    s.assert.contains(wxml, '<battle-fx', game.key + ' 未挂载战斗反馈层');
  });
});

s.test('数字智力玩法不出现战士/反击战斗层', () => {
  const PAGES = [
    'math24/math24',
    'math-sprint/math-sprint',
    'math-balance/math-balance',
    'memory-grid/memory-grid',
    'one-stroke/one-stroke',
    'pattern/pattern',
    'clock/clock',
    'maze/maze',
    'hanoi/hanoi',
    'sudoku/sudoku',
    'g2048/g2048',
    'klotski/klotski'
  ];
  PAGES.forEach(function (page) {
    const js = read('miniprogram/pages/' + page + '.js');
    const wxml = read('miniprogram/pages/' + page + '.wxml');
    s.assert.ok(js.indexOf("require('../../utils/battle-fx')") === -1,
      page + ' 仍在引入战斗反馈');
    s.assert.ok(wxml.indexOf('<battle-fx') === -1,
      page + ' 仍在渲染战斗反馈层');
  });
});

s.test('有真实角色节点的页面移动角色本体，不显示虚影副本', () => {
  const wxml = read('miniprogram/components/battle-fx/index.wxml');
  s.assert.contains(wxml, "modeClass !== 'counter' && !useOwnHero");
  s.assert.contains(wxml, "modeClass === 'counter' && !useOwnBoss");

  const bubbleWxml = read('miniprogram/pkg-games/letter-bubble/letter-bubble.wxml');
  const bubbleWxss = read('miniprogram/pkg-games/letter-bubble/letter-bubble.wxss');
  s.assert.contains(bubbleWxml, 'use-own-hero="{{true}}"');
  s.assert.contains(bubbleWxml, 'use-own-boss="{{true}}"');
  s.assert.contains(bubbleWxml, 'heroAttacking');
  s.assert.contains(bubbleWxml, 'bossCountering');
  s.assert.contains(bubbleWxss, '@keyframes lb-warrior-strike');
  s.assert.contains(bubbleWxss, '@keyframes lb-boss-counter');

  const gameWxml = read('miniprogram/pkg-games/game/game.wxml');
  const gameWxss = read('miniprogram/pkg-games/game/game.wxss');
  s.assert.contains(gameWxml, 'use-own-hero="{{true}}"');
  s.assert.contains(gameWxml, 'use-own-boss="{{true}}"');
  s.assert.contains(gameWxss, '@keyframes gsHeroStrike');
  s.assert.contains(gameWxss, '@keyframes gsBossCounterRun');
});

s.done();
