/**
 * tools/dict/add-pinyin.js —— 给词库补拼音字段（2026-10-08）
 *
 * 需求（用户）：「题库也应该按字母顺序和汉字拼音顺序排序」。
 *
 * 为什么要**预生成**而不是运行时算：
 *   小程序端跑不了拼音库（体积 + 兼容），所以必须在构建期把拼音写进词条。
 *
 * 规则：
 *   · 汉字 → 全拼、**不带声调**（`草` → `cao`，`苹果` → `pingguo`）——
 *     带声调排出来是怪序（按声调符号的 Unicode 排），不带才是大家习惯的拼音序；
 *   · 英文 → 拼音字段就是**小写本身**，这样英文按字母排、中文按拼音排，用同一个字段；
 *   · 词条里已有的 `py` 会被覆盖（脚本幂等，重复跑结果一致）。
 *
 * 字段名用 `py` 而不是 `pinyin`：每个词条都要存，1250 条省下来的字节是实打实的。
 *
 * ⚠️ pinyin-pro 是**开发依赖**（只在构建期用），不进小程序包。
 *
 * 用法：node tools/dict/add-pinyin.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pinyin } = require('pinyin-pro');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'miniprogram', 'data');

const LABELS = {
  kg: '幼儿园', g1: '一年级', g2: '二年级', g3: '三年级', g4: '四年级',
  g5: '五年级', g6: '六年级', g7: '初一', g8: '初二', g9: '初三',
  g10: '高一', g11: '高二', g12: '高三', college: '大学'
};

/**
 * 取排序用的拼音键。
 * @param {string} text 词条的题面（q）
 * @returns {string} 纯字母小写；取不到时返回空串
 */
function sortKey(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return '';
  // 纯 ASCII（英文单词等）→ 直接小写，按字母排
  if (/^[\x20-\x7e]+$/.test(s)) return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  // 含中文 → 全拼、去声调、去空格与标点
  try {
    return pinyin(s, { toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  } catch (e) {
    return '';
  }
}

let total = 0;
let missing = 0;
const sample = [];

Object.keys(LABELS).forEach(function (key) {
  const file = path.join(DATA_DIR, key + '.js');
  if (!fs.existsSync(file)) return;
  delete require.cache[require.resolve(file)];
  const mod = require(file);
  const items = (mod && mod.items) || [];

  let withPy = 0;
  items.forEach(function (it) {
    const py = sortKey(it.q);
    if (py) { it.py = py; withPy++; } else { delete it.py; missing++; }
  });

  const payload = { grade: key, label: LABELS[key], count: items.length, items: items };
  fs.writeFileSync(file, 'module.exports = ' + JSON.stringify(payload, null, 2) + ';\n', 'utf8');
  total += items.length;
  sample.push('  ' + key + '：' + withPy + '/' + items.length);
});

console.log('已补拼音，共 ' + total + ' 条：');
console.log(sample.join('\n'));
console.log('');
console.log('取不到拼音的（会排到末尾）：' + missing + ' 条');
