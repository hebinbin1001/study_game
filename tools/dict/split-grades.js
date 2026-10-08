/**
 * tools/dict/split-grades.js —— 把 7 个粗学段词库拆成 14 个年级词库（2026-10-08）
 *
 * 背景：学段从「幼儿园 / 小学1-2 / 小学3-4 / 小学5-6 / 初中 / 高中 / 大学」7 档，
 * 改为按年级细分 14 档（幼儿园、一~六年级、初一~初三、高一~高三、大学）。
 *
 * 拆分规则（2026-10-08 第二版，修第一版的坑）：
 *
 *   ⚠️ 第一版是「按 items 顺序整体平分」，跑完发现 g3/g5/g8/g9/g12 这些年级
 *   **一个英语单词都没有**（原词库的排列不是英汉交替的，某些切片整段都是汉字），
 *   结果贪吃蛇、字母拼词这些依赖英语词条的玩法在那些年级**出不了题**（E2E 直接报
 *   `Cannot read properties of undefined`）。
 *
 *   现在改成：**先把词条按大类分组（英语类 / 汉字类），每组各自平分到各年级，再合并** ——
 *   这样每个年级都同时有英语题和汉字题，玩法不会再「缺料」。
 *   组内仍然按原顺序切，保留「由易到难」的大致排布。
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

/** 英语类题型码（依赖它们的玩法：字母射击 / 拼词 / 贪吃蛇 / 抢答） */
const EN_TYPES = ['w1', 'w2', 'trans', 'en'];

/** 要删掉的旧词库文件（跑完由人确认后手动删，或看末尾提示） */
const LEGACY_FILES = ['kindergarten.js', 'primary12.js', 'primary34.js',
  'primary56.js', 'junior.js', 'senior.js'];

/**
 * 把一组词条平分给 n 份，返回二维数组。
 * 除不尽时**余数摊给靠前的年级**。注意：英语组和汉字组是**各自平分**的，
 * 两个余数叠加后合计数可能差 1~2 条（比如一年级 76 / 二年级 74）—— 这个偏差
 * 可以接受，不值得为了凑绝对均衡去打乱题型配比。
 */
function splitEven(items, n) {
  const base = Math.floor(items.length / n);
  const rest = items.length % n;
  const out = [];
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const take = base + (i < rest ? 1 : 0);
    out.push(items.slice(idx, idx + take));
    idx += take;
  }
  return out;
}

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
    // 先按大类分组，各自平分，再合并 —— 保证每个年级英语题和汉字题都有
    const en = items.filter(function (it) { return EN_TYPES.indexOf(it.type) >= 0; });
    const cn = items.filter(function (it) { return EN_TYPES.indexOf(it.type) < 0; });
    const enParts = splitEven(en, step.outs.length);
    const cnParts = splitEven(cn, step.outs.length);

    step.outs.forEach(function (key, i) {
      // 合并时英语在前、汉字在后：出题侧会自己按题型筛，这里只要保证两类都在
      const slice = enParts[i].concat(cnParts[i]);
      const n = writeGrade(key, slice);
      total += n;
      summary.push('  ' + step.src + ' → ' + key + '（' + LABELS[key] + '）：' + n
        + ' 条（英语 ' + enParts[i].length + ' / 汉字 ' + cnParts[i].length + '）');
    });
  });

  console.log('拆分完成，共 ' + total + ' 条：');
  console.log(summary.join('\n'));
  console.log('');
  console.log('旧文件（确认没问题后删掉）：' + LEGACY_FILES.join(' '));
}

main();
