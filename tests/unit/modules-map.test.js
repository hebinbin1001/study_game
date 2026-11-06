/**
 * modules-map.test.js —— 「改动 → 该跑什么」映射的护栏
 *
 * 为什么需要（2026-11-06 实测教训）：
 *   2026-10-28 把 21 个玩法页从 `pages/` 搬到 `pkg-games/`，但 e2e/lib/modules.js 的
 *   PATH_RULES 没跟着改；公共组件与半数 utils 也从来没进过表。结果改这些文件时
 *   `--changed` 只会打印「以下改动没有映射到模块」然后**只跑静态护栏**，单测与 E2E
 *   静默跳过 —— 实测 144/320 个打包文件推导不出模块，25 天没人发现，因为它不报错。
 *
 * 守护方式：遍历真实目录逐个断言。新增页面/组件/utils 不补映射当场红，
 * 而不是等到某次提交把红代码带上去才回头查。
 *
 * 运行：node tests/unit/modules-map.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('改动→模块映射');

const ROOT = path.resolve(__dirname, '../..');
// modules.js 只在函数内部用 child_process，require 本身安全（不会跑 git）
const modules = require(path.join(ROOT, 'e2e', 'lib', 'modules'));
const MP = path.join(ROOT, 'miniprogram');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'miniprogram_npm') return;
      walk(p, out);
      return;
    }
    if (/\.(js|wxml|wxss|json)$/.test(e.name)) out.push(p);
  });
  return out;
}

s.test('打包目录里每个文件都能推导出模块（漏映射 = --changed 静默漏跑）', () => {
  const files = walk(MP).map(rel);
  s.assert.ok(files.length > 250, '只扫到 ' + files.length + ' 个文件，扫描逻辑可能坏了');
  const missing = files.filter((f) => modules.modulesForPath(f) === null);
  s.assert.equal(missing.length, 0,
    '以下文件没有 PATH_RULES 映射（会静默不跑单测）：'
    + missing.slice(0, 8).join('、') + (missing.length > 8 ? ' 等 ' + missing.length + ' 个' : ''));
});

s.test('21 个玩法页所在的分包目录逐个都有模块', () => {
  const dirs = fs.readdirSync(path.join(MP, 'pkg-games')).filter((d) => {
    return fs.statSync(path.join(MP, 'pkg-games', d)).isDirectory();
  });
  s.assert.ok(dirs.length >= 20, 'pkg-games 下应有 20+ 个玩法目录，实际 ' + dirs.length);
  dirs.forEach((d) => {
    const js = 'miniprogram/pkg-games/' + d + '/' + d + '.js';
    s.assert.ok(modules.modulesForPath(js) !== null, d + ' 没有映射到任何模块');
  });
});

s.test('tests/unit 里每个用例都归属某个模块（--module 不会漏跑）', () => {
  const dir = path.join(ROOT, 'tests', 'unit');
  const files = fs.readdirSync(dir).filter((f) => /\.test\.js$/.test(f));
  s.assert.ok(files.length > 30, '只扫到 ' + files.length + ' 个用例文件');
  const orphan = files.filter((f) => modules.modulesOfUnitFile(f).length === 0);
  s.assert.equal(orphan.length, 0,
    '以下用例没有归到任何模块（跑模块时会漏掉，请补进 MODULES.unit）：' + orphan.join('、'));
});

s.test('公共组件 / 共享 utils 被映射到多个模块（改一个牵连多类玩法）', () => {
  // 抽查几个典型的共享件：只映射到一个模块，说明有人「顺手收窄」了
  ['miniprogram/components/game-pause/game-pause.js',
    'miniprogram/components/game-hud/game-hud.js',
    'miniprogram/utils/ui-icons.js',
    'miniprogram/utils/game-catalog.js'].forEach((f) => {
    s.assert.ok((modules.modulesForPath(f) || []).length >= 2, f + ' 应映射到 ≥2 个模块');
  });
});

s.done();
