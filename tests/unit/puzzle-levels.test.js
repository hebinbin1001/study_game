/**
 * puzzle-levels.test.js —— 数字智力关卡表（第三批 · 第 4 条地基）
 *
 * 口径（用户 2026-09-13 拍板）：
 *   · 口算冲刺 / 算式天平：按年级分档（每学段一关）
 *   · 记忆矩阵：按格子数 × 数字位数分档
 *   · 24点/数独/华容道/一笔画：沿用现成关卡表的数量
 *   · 2048：不设上限（0），按可达性扩关
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('数字智力关卡表');

const lv = require('../../miniprogram/utils/puzzle-levels');
const constants = require('../../miniprogram/utils/constants');

s.test('口算冲刺 / 算式天平：14 档、分母与真实档数一致', () => {
  ['sprint', 'balance'].forEach(function (k) {
    const list = lv.levelsOf(k);
    // 2026-10-09 修：原来断言是 `list.length === constants.GRADES.length`（两边同源、永远成立），
    // 消息还写着「应有 7 档」。学段 7→14 档它不会红，分母写死 /7 就是这么漏过去的。
    s.assert.equal(list.length, 14, k + ' 应有 14 档（学段按年级细分后）');
    [0, 6, 13].forEach(function (i) {
      s.assert.equal(list[i].params.grade, constants.GRADES[i].key, k + ' 第 ' + (i + 1) + ' 档学段不符');
    });
    list.forEach(function (it, i) {
      s.assert.equal(it.no, i + 1);
      s.assert.ok(!!it.sub, k + ' 第 ' + it.no + ' 关要有难度说明');
      s.assert.contains(it.sub, '难度 ' + (i + 1) + '/' + constants.GRADES.length,
        k + ' 第 ' + it.no + ' 关难度分母写死了：' + it.sub);
    });
  });
});

s.test('记忆矩阵：描述与引擎口径同源（不是另一套格子×位数）', () => {
  // 2026-10-09 修：这里原来断言「params.rows/cols/digits 递增」，但那套参数**引擎根本不读**
  // （memory-grid 固定 5×5，难度来自亮格数与展示时长），关卡页描述与玩法完全对不上。
  // 现在按引擎真实口径断言，两边同源，以后调难度也不会漂移。
  const mg = require('../../miniprogram/game/memory-grid');
  const list = lv.levelsOf('memory');
  s.assert.equal(list.length, 30);
  list.forEach(function (it, i) {
    const no = i + 1;
    s.assert.contains(it.sub, String(mg.targetCount(no)), '第 ' + no + ' 关亮格数与引擎不一致');
    s.assert.contains(it.sub, (mg.showMs(no) / 1000).toFixed(1), '第 ' + no + ' 关展示时长与引擎不一致');
  });
});

s.test('固定关卡表玩法：数量与现成数据一致', () => {
  s.assert.equal(lv.levelsOf('math24').length, 60);
  s.assert.equal(lv.levelsOf('sudoku').length, 60);
  s.assert.equal(lv.levelsOf('klotski').length, 30);
  s.assert.equal(lv.levelsOf('onestroke').length, 35);
  s.assert.equal(lv.totalOf('onestroke'), 35);
  s.assert.equal(lv.levelsOf('pattern').length, 30);
  s.assert.equal(lv.totalOf('pattern'), 30);
});

s.test('找规律：关卡页描述与引擎档位同源（不接年级）', () => {
  const pat = require('../../miniprogram/game/pattern');
  const list = lv.levelsOf('pattern');
  list.forEach(function (it, i) {
    const info = pat.tierOf(i + 1);
    s.assert.contains(it.label, info.name, '第 ' + (i + 1) + ' 关档位名与引擎不一致');
    s.assert.contains(it.sub, info.desc, '第 ' + (i + 1) + ' 关题型描述与引擎不一致');
    s.assert.contains(it.sub, String(pat.QUESTIONS_PER_LEVEL), '题量与引擎不一致');
    // 关卡页的 params 里不能出现 grade —— 数字智力按关号出题，不按年级
    s.assert.equal(Object.prototype.hasOwnProperty.call(it.params, 'grade'), false);
  });
});

s.test('一笔画：关卡名/难度/线数取自引擎（2026-10-18 换成 demo 的 35 关）', () => {
  const os = require('../../miniprogram/game/one-stroke');
  const list = lv.levelsOf('onestroke');
  list.forEach(function (it, i) {
    const raw = os.LEVELS[i];
    s.assert.contains(it.label, raw.name, '第 ' + (i + 1) + ' 关名字与引擎不一致');
    s.assert.contains(it.sub, String(raw.edges.length), '第 ' + (i + 1) + ' 关线数与引擎不一致');
    s.assert.contains(it.sub, raw.tier, '第 ' + (i + 1) + ' 关难度档与引擎不一致');
  });
});

s.test('2048：关卡表来自 data/g2048-levels.js（14 关），但不设上限', () => {
  s.assert.equal(lv.totalOf('g2048'), 0, '0 = 不设上限（可继续扩关）');
  const list = lv.levelsOf('g2048');
  s.assert.equal(list.length, 14);
  s.assert.contains(list[0].label, '目标');
  s.assert.contains(String(list[13].sub), '步内');
});

s.test('未知玩法：返回空数组而不是抛错', () => {
  s.assert.deepEqual(lv.levelsOf('not-a-game'), []);
  s.assert.deepEqual(lv.levelsOf(''), []);
  s.assert.deepEqual(lv.levelsOf(null), []);
});
