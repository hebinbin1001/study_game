/**
 * tools/dict/apply-book-words.js —— 把教材词表合并进内置词库（幂等）
 *
 * 做什么：
 *   1. 读 tools/dict/book-words-pep.js / book-words-wys.js（教材版词表）与 general-words.js（中学通用补充）；
 *   2. 把每个词写进对应年级的 miniprogram/data/<grade>.js：
 *      · 同名单词已存在 → 补/修正 book 标签（不重复添加）；
 *      · 不存在 → 生成一条标准 w1 词条（q=a=单词，hint=释义，py=单词）；
 *   3. **被两个版本都收录的词标成「通用」**（book 留空）—— 这类基础词本来就跨版本通用，
 *      标成任一版本都会让另一个版本的用户缺词。
 *
 * 用法：
 *   node tools/dict/apply-book-words.js --dry     # 只看统计，不写文件
 *   node tools/dict/apply-book-words.js           # 实际写入
 *
 * 注意：这是**构建期脚本**，生成物进 data/*.js（随小程序打包）。
 *       词表本身要人工抽查（规划文档 §6.2：公开整理版 + 人工抽查 2~3 个年级）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'miniprogram', 'data');
const pep = require('./book-words-pep');
const wys = require('./book-words-wys');
const general = require('./general-words');

const DRY = process.argv.indexOf('--dry') >= 0;

/** 读 data/<grade>.js 成对象 */
function loadGrade(grade) {
  const file = path.join(DATA_DIR, grade + '.js');
  const src = fs.readFileSync(file, 'utf8');
  const json = src
    .replace(/^\s*module\.exports\s*=\s*/, '')
    .replace(/;\s*$/, '');
  return JSON.parse(json);
}

/** 写回 data/<grade>.js（保持项目现有格式：module.exports = <JSON 2 空格>; ） */
function saveGrade(grade, obj) {
  const file = path.join(DATA_DIR, grade + '.js');
  obj.count = obj.items.length;
  fs.writeFileSync(file, 'module.exports = ' + JSON.stringify(obj, null, 2) + ';\n', 'utf8');
}

/**
 * (年级 + 词) → 出现在哪些版本里（用于判断「同一年的跨版本通用词」）。
 *
 * ⚠️ 必须带上年级：同一个词在「PEP 三年级」和「外研版一年级」都出现，
 * 不代表这两个版本在**同一年级**上重复 —— 如果不分年级，g1 的词会因为
 * 出现在 PEP 高年级词表里而被误判成「通用」，导致外研版一年级几乎没有专属词条。
 */
function buildBookIndex() {
  const index = new Map();
  function add(book, grade, list) {
    list.forEach(function (pair) {
      const key = String(grade) + '|' + String(pair[0]).toLowerCase();
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(book);
    });
  }
  Object.keys(pep).forEach(function (g) { add('pep', g, pep[g]); });
  Object.keys(wys).forEach(function (g) { add('wys', g, wys[g]); });
  return index;
}

function main() {
  const bookIndex = buildBookIndex();
  const stat = {};

  /** 处理一个 (年级 → 词表) 分组 */
  function apply(grade, list, book) {
    const obj = loadGrade(grade);
    const byWord = new Map();
    obj.items.forEach(function (it) {
      const key = String(it.a || it.q || '').toLowerCase();
      if (key && !byWord.has(key)) byWord.set(key, it);
    });

    let added = 0;
    let tagged = 0;
    let kept = 0;
    list.forEach(function (pair) {
      const word = String(pair[0]);
      const hint = String(pair[1]);
      const key = word.toLowerCase();
      const books = bookIndex.get(grade + '|' + key) || new Set([book]);
      // 两个版本都收录 → 通用；只被一个版本收录 → 标该版本
      const target = books.size >= 2 ? '' : book;
      const hit = byWord.get(key);
      if (hit) {
        if (String(hit.book || '') !== target) {
          if (target) hit.book = target; else delete hit.book;
          tagged++;
        } else {
          kept++;
        }
        return;
      }
      const item = { type: 'w1', q: word, a: word, hint: hint, py: word };
      if (target) item.book = target;
      obj.items.push(item);
      byWord.set(key, item);
      added++;
    });

    if (!DRY) saveGrade(grade, obj);
    const key = (book || 'general') + ':' + grade;
    const prev = stat[key] || { added: 0, tagged: 0, kept: 0 };
    stat[key] = {
      added: prev.added + added,
      tagged: prev.tagged + tagged,
      kept: prev.kept + kept,
      total: obj.items.length
    };
  }

  Object.keys(pep).forEach(function (g) { apply(g, pep[g], 'pep'); });
  Object.keys(wys).forEach(function (g) { apply(g, wys[g], 'wys'); });
  Object.keys(general).forEach(function (g) { apply(g, general[g], ''); });

  console.log(DRY ? '[dry] 未写文件' : '已写入 miniprogram/data/*.js');
  console.log(JSON.stringify(stat, null, 2));
}

main();
