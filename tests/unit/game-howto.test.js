/**
 * game-howto.test.js —— 玩法操作引导（2026-10-28）
 *
 * 为什么值得测：
 *   · 文案是「每款玩法 3 句话」，最容易出现的是「新玩法上线忘了写文案」——
 *     那种情况不报错，只是新用户看不到任何提示，属于静默失效；
 *   · 组件挂载是 21 个页面各改两处（json 注册 + wxml 挂标签），漏一个也是静默失效；
 *   · 卡片一屏放不下就会盖住按钮，所以条数与长度都要卡住。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const { ROOT, pageDir } = require('./_mp');
const s = suite('玩法操作引导');

const howto = require('../../miniprogram/utils/game-howto');
const catalog = require('../../miniprogram/utils/game-catalog');

/** 目录名 → 玩法 key（与页面挂载时的 game 属性一致） */
const PAGE_KEY = {
  game: 'shoot',
  match: 'match',
  link: 'link',
  'word-build': 'wordbuild',
  'idiom-build': 'idiombuild',
  snake: 'snake',
  quiz: 'quiz',
  'letter-bubble': 'letterBubble',
  sudoku: 'sudoku',
  math24: 'math24',
  'math-sprint': 'sprint',
  'math-balance': 'balance',
  g2048: 'g2048',
  'memory-grid': 'memory',
  'one-stroke': 'onestroke',
  klotski: 'klotski',
  pattern: 'pattern',
  clock: 'clock',
  maze: 'maze',
  hanoi: 'hanoi',
  bounce: 'bounce'
};

s.test('玩法目录里每一款都有操作说明（新增玩法忘了写文案会红）', () => {
  catalog.forEach(function (g) {
    s.assert.ok(howto.get(g.key), '缺文案：' + g.key + '（' + g.name + '）');
  });
});

s.test('文案结构：有图标/标题，1~3 条提示，单条不超过 60 字', () => {
  howto.keys().forEach(function (k) {
    const h = howto.get(k);
    s.assert.ok(h.ic && h.ic.length > 0, k + ' 缺图标');
    s.assert.ok(h.t && h.t.length > 0, k + ' 缺标题');
    s.assert.ok(Array.isArray(h.tips), k + ' 的 tips 不是数组');
    s.assert.ok(h.tips.length >= 1 && h.tips.length <= 3, k + ' 的提示应为 1~3 条，实际 ' + h.tips.length);
    h.tips.forEach(function (tx, i) {
      s.assert.ok(tx && tx.length > 0, k + ' 第 ' + i + ' 条为空');
      s.assert.ok(tx.length <= 60, k + ' 第 ' + i + ' 条过长（' + tx.length + ' 字）');
    });
  });
});

s.test('未登记的 key 返回 null（组件据此不弹空卡）', () => {
  s.assert.equal(howto.get('not-a-game'), null);
  s.assert.equal(howto.get(''), null);
  s.assert.equal(howto.get(null), null);
});

s.test('每个玩法页都挂了引导，且 key 与页面一一对应', () => {
  Object.keys(PAGE_KEY).forEach(function (dir) {
    const key = PAGE_KEY[dir];
    const base = pageDir(dir);
    const wxml = fs.readFileSync(path.join(base, dir + '.wxml'), 'utf8');
    const json = JSON.parse(fs.readFileSync(path.join(base, dir + '.json'), 'utf8'));

    // 字母射击例外：它在 game.js 里已有 3 步内嵌教程（TUTORIAL_STEPS），
    // 再弹一张卡片就是同一个信息讲两遍。
    if (dir === 'game') {
      s.assert.equal(wxml.indexOf('<how-to-play'), -1, '字母射击不该再挂组件（已有内嵌教程）');
      return;
    }
    s.assert.contains(wxml, '<how-to-play game="' + key + '"', dir + ' 未挂引导组件');
    s.assert.ok(json.usingComponents && json.usingComponents['how-to-play'],
      dir + ' 的 json 未注册 how-to-play');
  });
});

s.test('组件四件套齐全', () => {
  const dir = path.join(ROOT, 'components', 'how-to-play');
  ['js', 'json', 'wxml', 'wxss'].forEach(function (ext) {
    s.assert.ok(fs.existsSync(path.join(dir, 'how-to-play.' + ext)), '缺 how-to-play.' + ext);
  });
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'how-to-play.json'), 'utf8'));
  s.assert.equal(json.component, true);
});

s.test('每款玩法只提示一次：storage key 按玩法隔离', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'how-to-play', 'how-to-play.js'), 'utf8');
  s.assert.contains(src, "'ww_howto_' + key");
  // 标记必须写在「展示时」，不能写在 close 里 —— 否则用户看到卡片直接退出，下次还会弹
  const showIdx = src.indexOf('self.setData({ show: true');
  const setIdx = src.indexOf('storage.set(doneKey');
  s.assert.ok(showIdx >= 0 && setIdx > showIdx, '标记应在展示之后立即写入');
});

s.done();
