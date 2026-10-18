/**
 * tools/dict/fix-ipa-stress.js —— 修正存量音标的重音位置（幂等）
 *
 * 背景（2026-10-18 全量审计）：
 *   音节库里的音标是 add-ipa.js 从 ipa-dict 抄来的，而 ipa-dict 把重音符写在
 *   **重读元音之前**：cat /kˈæt/、blue /blˈuː/、brother /bɹˈʌðɐ/。
 *   教材（DJ 音标）的写法是标在**音节起首前**，且单音节不标：
 *   cat /kæt/、blue /bluː/、brother /ˈbrʌðə/。
 *   家长/老师拿课本对照会直接看到「重音符错位一格」，属于必须修的硬错误。
 *
 * 规则见 ipa-normalize.js（与 add-ipa.js 入库时用的是同一套，不会出现
 * 「新补的对、老数据还错」）。
 *
 * 用法：
 *   node tools/dict/fix-ipa-stress.js --dry   # 只统计会改多少条
 *   node tools/dict/fix-ipa-stress.js         # 实际写入 data/*.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeStress, normalizeSymbols } = require('./ipa-normalize');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'miniprogram', 'data');
const GRADES = ['kg', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12', 'college'];
const EN_TYPES = ['w1', 'w2', 'trans', 'fill'];
const DRY = process.argv.indexOf('--dry') >= 0;

function loadGrade(grade) {
  const src = fs.readFileSync(path.join(DATA_DIR, grade + '.js'), 'utf8');
  return JSON.parse(src.replace(/^\s*module\.exports\s*=\s*/, '').replace(/;\s*$/, ''));
}

function saveGrade(grade, obj) {
  obj.count = obj.items.length;
  fs.writeFileSync(path.join(DATA_DIR, grade + '.js'),
    'module.exports = ' + JSON.stringify(obj, null, 2) + ';\n', 'utf8');
}

let changed = 0;
const samples = [];
const byGrade = {};

GRADES.forEach(function (grade) {
  const obj = loadGrade(grade);
  let n = 0;
  obj.items.forEach(function (it) {
    if (EN_TYPES.indexOf(it.type) < 0 || !it.ipa) return;
    const next = normalizeStress(normalizeSymbols(it.ipa));
    if (next === it.ipa) return;
    n++;
    changed++;
    if (samples.length < 12) samples.push(it.a + ': ' + it.ipa + ' → ' + next);
    it.ipa = next;
  });
  byGrade[grade] = n;
  if (!DRY && n) saveGrade(grade, obj);
});

console.log(DRY ? '[dry] 未写文件' : '已写入 miniprogram/data/*.js');
console.log('修正 ' + changed + ' 条音标');
console.log(JSON.stringify(byGrade));
console.log('样例：' + samples.join(' | '));
