/**
 * 数字智力类的关卡表（第三批 · 第 4 条 a 的地基，2026-09-13）
 *
 * 用户拍板的口径：
 *   · 24 点 / 数独 / 华容道 / 一笔画 / 找规律：沿用各自现成关卡表（60 / 60 / 30 / 35 / 30 关）
 *   · 口算冲刺 / 算式天平：**按年级分档** —— 每学段一档，题量与数字范围随学段走
 *   · 记忆矩阵：按**格子数 × 数字位数**分档
 *   · 2048：按可达性扩关（不追 30 关），每关记最短用时（见 pages/g2048）
 *
 * 这个模块是纯数据/纯函数（不碰 wx.*），关卡页与单测共用；页面只管渲染与跳转。
 */
'use strict';

var constants = require('./constants');

/** 每个玩法的关卡表由「档位描述」生成：{ no, label, sub } */
function gridLevels(cols, rows, digitsList, prefix) {
  var out = [];
  var no = 0;
  digitsList.forEach(function (d) {
    for (var r = 1; r <= rows; r++) {
      for (var c = 1; c <= cols; c++) {
        no++;
        out.push({
          no: no,
          label: '第 ' + no + ' 关',
          sub: (r + 1) + '×' + (c + 1) + ' 格 · ' + (d === 1 ? '单个数字' : d + ' 位数字'),
          params: { rows: r + 1, cols: c + 1, digits: d }
        });
      }
    }
  });
  return out.slice(0, 30);
}

/** 按年级分档：每一个学段一关（口算冲刺 / 算式天平） */
function gradeLevels(subOf) {
  return constants.GRADES.map(function (g, i) {
    return {
      no: i + 1,
      label: g.label,
      sub: subOf(g, i),
      params: { grade: g.key, tier: i + 1 }
    };
  });
}

/** 关卡总数（有固定表的玩法；无尽玩法返回 0 表示不设上限） */
var COUNTS = {
  math24: 60,
  sudoku: 60,
  klotski: 30,
  onestroke: 35,
  g2048: 0,
  sprint: constants.GRADES.length,
  balance: constants.GRADES.length,
  memory: 30,
  pattern: 30,
  clock: 30,
  maze: 30,
  hanoi: 6
};

/**
 * 取某玩法（数字智力类）的关卡列表。
 * @param {string} key 玩法 key（与 utils/game-catalog.js 一致）
 * @returns {Array<{no:number,label:string,sub:string,params:Object}>}
 */
function levelsOf(key) {
  var k = String(key || '');
  if (k === 'g2048') {
    // 2048 关卡表在 data/g2048-levels.js（与 2048 页共用）。
    // 2026-10-18 取消步数上限：par 只是「3★ 参考步数」，不再是通关门槛。
    return require('../data/g2048-levels').levels.map(function (lv) {
      return {
        no: lv.no,
        label: '第 ' + lv.no + ' 关 · 目标 ' + lv.target,
        sub: lv.tier + ' · ' + lv.par + ' 步内 3★',
        params: { target: lv.target, par: lv.par, tier: lv.tier }
      };
    });
  }
  if (k === 'sprint') {
    // 2026-10-09 修：分母原来写死 /7（7 档学段时代的残留），学段细分到 14 档后
    // 关卡页会显示「难度 8/7 … 14/7」。改成取真实档数，以后加学段也不会再错。
    return gradeLevels(function (g, i) {
      return '60 秒 · 连击翻倍 · 难度 ' + (i + 1) + '/' + constants.GRADES.length;
    });
  }
  if (k === 'balance') {
    return gradeLevels(function (g, i) {
      return '加减 → 乘 → 混合 · 难度 ' + (i + 1) + '/' + constants.GRADES.length;
    });
  }
  if (k === 'onestroke') {
    // 2026-10-18：关卡表换成 demo 的 35 关手绘图形，关卡名/难度/线数直接从引擎取，
    // 关卡页就能显示「第 7 关 · 五角星 / 简单 · 5 条线」，不再是清一色「第 N 关」。
    var os = require('../game/one-stroke');
    return os.LEVELS.map(function (lv, i) {
      return {
        no: i + 1,
        label: '第 ' + (i + 1) + ' 关 · ' + lv.name,
        sub: (lv.tier || '') + ' · ' + (lv.edges || []).length + ' 条线',
        params: {}
      };
    });
  }
  if (k === 'pattern') {
    // 2026-10-18：找规律的档位/题型名直接从引擎取（与出题同源），
    // 关卡页才会显示「第 13 关 · 中等 / 乘 2 与平方数 · 10 题」而不是清一色「第 N 关」。
    // 注意这里**不读年级**：数字智力的难度只由关卡序号决定。
    var pat = require('../game/pattern');
    var pout = [];
    for (var pi = 1; pi <= pat.TOTAL_LEVELS; pi++) {
      var pInfo = pat.tierOf(pi);
      pout.push({
        no: pi,
        label: '第 ' + pi + ' 关 · ' + pInfo.name,
        sub: pInfo.desc + ' · ' + pat.QUESTIONS_PER_LEVEL + ' 题',
        params: {}
      });
    }
    return pout;
  }
  if (k === 'clock') {
    // 2026-10-18：档位/题型名与出题同源（game/clock.js 的 tierOf），
    // 关卡页显示「第 28 关 · 跨小时 / 24 时制与跨小时 · 10 题」。同样不读年级。
    var ck = require('../game/clock');
    var cout = [];
    for (var ci = 1; ci <= ck.TOTAL_LEVELS; ci++) {
      var cinfo = ck.tierOf(ci);
      cout.push({
        no: ci,
        label: '第 ' + ci + ' 关 · ' + cinfo.name,
        sub: cinfo.desc + ' · ' + ck.QUESTIONS_PER_LEVEL + ' 题',
        params: {}
      });
    }
    return cout;
  }
  if (k === 'maze') {
    // 2026-10-21：词义迷宫，档位/门数与出题同源（game/maze.js 的 tierOf），
    // 关卡页显示「第 20 关 · 挑战 / 成语 · 词义辨析 · 6 道门 · 6×6」。
    var mz = require('../game/maze');
    var mout = [];
    for (var mi = 1; mi <= mz.TOTAL_LEVELS; mi++) {
      var minfo = mz.tierOf(mi);
      mout.push({
        no: mi,
        label: '第 ' + mi + ' 关 · ' + minfo.name,
        sub: minfo.desc + ' · ' + minfo.gates + ' 道门 · 6×6',
        params: { size: mz.SIZE }
      });
    }
    return mout;
  }
  if (k === 'hanoi') {
    // 2026-10-18：6 关小品（3~8 盘），关卡表与引擎同源
    return require('../game/hanoi').levelsForPage();
  }
  if (k === 'memory') {
    // 2026-10-09 修：这里的描述原本是「2×2 格 · 单个数字」这类，但引擎 game/memory-grid.js
    // 实际是**固定 5×5**、难度来自「亮格数 3→8 + 展示时长 1.5s→0.65s」，
    // 页面从来不读 rows/cols/digits —— 描述与玩法完全不符（玩家照描述选关会被误导）。
    // 现在直接从引擎取，描述与玩法同源，以后调难度也不会再漂移。
    var mg = require('../game/memory-grid');
    var out = [];
    var total = COUNTS.memory;
    for (var mi = 1; mi <= total; mi++) {
      out.push({
        no: mi,
        label: '第 ' + mi + ' 关',
        sub: '亮 ' + mg.targetCount(mi) + ' 格 · ' + (mg.showMs(mi) / 1000).toFixed(1) + ' 秒',
        params: {}
      });
    }
    return out;
  }
  // 其余玩法沿用各自现成关卡表：这里只给出数量，具体题目由各页自己按关卡号取
  var total = COUNTS[k] || 0;
  var out = [];
  for (var i = 1; i <= total; i++) {
    out.push({ no: i, label: '第 ' + i + ' 关', sub: '', params: {} });
  }
  return out;
}

function totalOf(key) {
  if (key === 'g2048') return 0;          // 0 = 不设上限（按故事线扩关）
  return levelsOf(key).length;
}

module.exports = {
  COUNTS: COUNTS,
  levelsOf: levelsOf,
  totalOf: totalOf
};
