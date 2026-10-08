/**
 * tools/dict/rename-grade-keys.js —— 把测试与用例里的旧学段 key 换成新 key（2026-10-08）
 *
 * 只处理 tests/unit/ 与 e2e/ 下的 JS —— 这两处全是**字面量**（参数、断言），
 * 机械替换是安全的；miniprogram/ 下面有注释和映射表（LEGACY_GRADE_MAP 里必须保留旧 key），
 * 所以那里一律手工改，不交给脚本。
 *
 * 用法：node tools/dict/rename-grade-keys.js [--dry]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['tests/unit', 'e2e'];
const DRY = process.argv.indexOf('--dry') >= 0;

/** 旧 key → 新 key（college 没变，不用进来） */
const MAP = {
  kindergarten: 'kg',
  primary12: 'g1',
  primary34: 'g3',
  primary56: 'g5',
  junior: 'g7',
  senior: 'g10'
};

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); return; }
    if (/\.js$/.test(e.name)) out.push(p);
  });
  return out;
}

function replaceKeys(text) {
  let next = text;
  let hits = 0;
  Object.keys(MAP).forEach(function (oldKey) {
    // 用单词边界，避免把 primary12x 这种误伤（实际不存在，但保险）
    const re = new RegExp('\\b' + oldKey + '\\b', 'g');
    const m = next.match(re);
    if (m) { hits += m.length; next = next.replace(re, MAP[oldKey]); }
  });
  return { text: next, hits: hits };
}

function main() {
  let files = 0;
  let hits = 0;
  DIRS.forEach(function (d) {
    walk(path.join(ROOT, d), []).forEach(function (file) {
      const before = fs.readFileSync(file, 'utf8');
      const r = replaceKeys(before);
      if (!r.hits) return;
      files++;
      hits += r.hits;
      console.log((DRY ? '[dry] ' : '') + path.relative(ROOT, file) + '  ' + r.hits + ' 处');
      if (!DRY) fs.writeFileSync(file, r.text, 'utf8');
    });
  });
  console.log('');
  console.log((DRY ? '（干跑，未写入）' : '已改写') + ' ' + files + ' 个文件，共 ' + hits + ' 处');
}

main();
