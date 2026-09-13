/**
 * 数字智力类的关卡表（第三批 · 第 4 条 a 的地基，2026-09-13）
 *
 * 用户拍板的口径：
 *   · 24 点 / 数独 / 华容道 / 一笔画：沿用各自现成关卡表（60 / 60 / 30 / 34 关）
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
  onestroke: 34,
  g2048: 0,
  sprint: constants.GRADES.length,
  balance: constants.GRADES.length,
  memory: 30
};

/**
 * 取某玩法（数字智力类）的关卡列表。
 * @param {string} key 玩法 key（与 utils/game-catalog.js 一致）
 * @returns {Array<{no:number,label:string,sub:string,params:Object}>}
 */
function levelsOf(key) {
  var k = String(key || '');
  if (k === 'sprint') {
    return gradeLevels(function (g, i) { return '60 秒 · 连击翻倍 · 难度 ' + (i + 1) + '/7'; });
  }
  if (k === 'balance') {
    return gradeLevels(function (g, i) { return '加减 → 乘 → 混合 · 难度 ' + (i + 1) + '/7'; });
  }
  if (k === 'memory') {
    return gridLevels(3, 5, [1, 2], 'memory');
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
