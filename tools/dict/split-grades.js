/**
 * tools/dict/split-grades.js —— 把 7 个粗学段词库拆成 14 个年级词库（2026-10-08）
 *
 * 背景：学段从「幼儿园 / 小学1-2 / 小学3-4 / 小学5-6 / 初中 / 高中 / 大学」7 档，
 * 改为按年级细分 14 档（幼儿园、一~六年级、初一~初三、高一~高三、大学）。
 *
 * 拆分规则：**按现有 items 的顺序平分**。
 *   现有词库本身是按「常见度 / 由易到难」大致排过的，所以按顺序切片不会出现
 *   「一年级的题比六年级还难」这种倒挂；比随机分配合理得多。
 *
 * 这是**一次性工具**：跑完就把旧的 7 个文件删掉（见文件末尾提示）。
 * 后续补词表（对接教材那一期）会再写新的导入脚本。
 *
 * 用法：node tools/dict/split-grades.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'miniprogram', 'data');

/** 新的档位与展示名（顺序即界面顺序） */
const LABELS = {
  kg: '幼儿园',
  g1: '一年级',
  g2: '二年级',
  g3: '三年级',
  g4: '四年级',
  g5: '五年级',
  g6: '六年级',
  g7: '初一',
  g8: '初二',
  g9: '初三',
  g10: '高一',
  g11: '高二',
  g12: '高三',
  college: '大学'
};

/** 旧档 → 拆成哪几个新档（平分） */
const PLAN = [
  { src: 'kindergarten', outs: ['kg'] },
  { src: 'primary12', outs: ['g1', 'g2'] },
  { src: 'primary34', outs: ['g3', 'g4'] },
  { src: 'primary56', outs: ['g5', 'g6'] },
  { src: 'junior', outs: ['g7', 'g8', 'g9'] },
  { src: 'senior', outs: ['g10', 'g11', 'g12'] },
  { src: 'college', outs: ['college'] }
];

/** 要删掉的旧词库文件（跑完由人确认后手动删，或看末尾提示） */
const LEGACY_FILES = ['kindergarten.js', 'primary12.js', 'primary34.js',
  'primary56.js', 'junior.js', 'senior.js'];

function writeGrade(key, items) {
  const payload = {
    grade: key,
    label: LABELS[key],
    count: items.length,
    items: items
  };
  const body = 'module.exports = ' + JSON.stringify(payload, null, 2) + ';\n';
  fs.writeFileSync(path.join(DATA_DIR, key + '.js'), body, 'utf8');
  return items.length;
}

function main() {
  let total = 0;
  const summary = [];

  PLAN.forEach(function (step) {
    const srcPath = path.join(DATA_DIR, step.src + '.js');
    if (!fs.existsSync(srcPath)) {
      console.error('跳过「' + step.src + '」：源文件不存在（可能已经拆过了）');
      return;
    }
    delete require.cache[require.resolve(srcPath)];
    const mod = require(srcPath);
    const items = (mod && mod.items) || [];
    if (!items.length) {
      console.error('跳过「' + step.src + '」：没有 items');
      return;
    }
    const per = Math.ceil(items.length / step.outs.length);
    step.outs.forEach(function (key, i) {
      const slice = items.slice(i * per, (i + 1) * per);
      const n = writeGrade(key, slice);
      total += n;
      summary.push('  ' + step.src + ' → ' + key + '（' + LABELS[key] + '）：' + n + ' 条');
    });
  });

  console.log('拆分完成，共 ' + total + ' 条：');
  console.log(summary.join('\n'));
  console.log('');
  console.log('旧文件（确认没问题后删掉）：' + LEGACY_FILES.join(' '));
}

main();
