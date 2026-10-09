/**
 * tools/dict/add-ipa.js —— 给英语词条补音标（构建期脚本，幂等）
 *
 * 为什么在构建期做：小程序端跑不了词典库，音标必须提前写进 data/*.js。
 * 数据源：`ipa-dict`（开发依赖，en_UK 主 / en_US 兜底）——
 *   国内教材（人教版 PEP、外研版）标注的多是英式音标，所以优先取英式，
 *   英式词典里查不到的（多为美式拼法或专有名词）再用美式兜底。
 *
 * 用法：
 *   node tools/dict/add-ipa.js --dry     # 只看覆盖率，不写文件
 *   node tools/dict/add-ipa.js           # 实际写入
 *
 * 说明：
 *   · 只处理英语类词条（w1/w2/trans/fill），汉字/成语/歇后语跳过；
 *   · 多词短语（hot dog、French fries）词典里查不到就跳过，不硬编；
 *   · 幂等：已有 ipa 的词条不动，重复执行结果一致。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'miniprogram', 'data');
const DRY = process.argv.indexOf('--dry') >= 0;
/** --force：忽略已有的 ipa 重新生成（改了规范化规则时用） */
const FORCE = process.argv.indexOf('--force') >= 0;

/** 英语类题型（这几类的 a 是英文单词） */
const EN_TYPES = ['w1', 'w2', 'trans', 'fill'];
const GRADES = ['kg', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12', 'college'];

/** 词典值可能是多个读音的数组，取第一个 */
function firstOf(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * 清掉零宽字符、去掉首尾的 /，并把 IPA 词典的写法换成**教材习惯写法**：
 *   · ɹ → r：同一个音位，国内教材（DJ 音标）一律写 r，学生按教材对照时不会困惑；
 *   · ɐ → ə：英式词典用 ɐ 标 near-open central（如 abundance 的首音节），
 *     教材里对应的是 ə，不改会让学生看到课本上不存在的符号。
 *   · 去掉 '.'：IPA 词典用它标音节边界（əbˈɪlət.i），教材音标不写这个点。
 */
function cleanIpa(raw) {
  let s = firstOf(raw);
  if (!s) return '';
  s = String(s).replace(/[\u200b-\u200d\ufeff]/g, '');
  s = s.replace(/ɹ/g, 'r').replace(/ɐ/g, 'ə');
  s = s.replace(/\./g, '');
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s.trim();
}

function loadDict(file) {
  const p = path.join(ROOT, 'node_modules', 'ipa-dict', 'lib', file);
  return require(p);
}

function loadGrade(grade) {
  const file = path.join(DATA_DIR, grade + '.js');
  const src = fs.readFileSync(file, 'utf8');
  const json = src.replace(/^\s*module\.exports\s*=\s*/, '').replace(/;\s*$/, '');
  return JSON.parse(json);
}

function saveGrade(grade, obj) {
  const file = path.join(DATA_DIR, grade + '.js');
  obj.count = obj.items.length;
  fs.writeFileSync(file, 'module.exports = ' + JSON.stringify(obj, null, 2) + ';\n', 'utf8');
}

function main() {
  const uk = loadDict('en_UK.js');
  const us = loadDict('en_US.js');
  const stat = { totalEn: 0, already: 0, filled: 0, miss: 0, fromUs: 0, byGrade: {} };
  const missSamples = [];

  GRADES.forEach(function (grade) {
    const obj = loadGrade(grade);
    let filled = 0;
    let miss = 0;

    obj.items.forEach(function (it) {
      if (EN_TYPES.indexOf(it.type) < 0) return;
      const word = String(it.a || '').trim().toLowerCase();
      if (!word) return;
      stat.totalEn++;

      if (it.ipa && !FORCE) { stat.already++; return; }

      let ipa = cleanIpa(uk.get(word));
      if (ipa) {
        it.ipa = ipa;
      } else {
        ipa = cleanIpa(us.get(word));
        if (ipa) {
          it.ipa = ipa;
          stat.fromUs++;
        }
      }

      if (it.ipa) {
        filled++;
        stat.filled++;
      } else {
        miss++;
        stat.miss++;
        if (missSamples.length < 20) missSamples.push(grade + ':' + word);
      }
    });

    stat.byGrade[grade] = { filled, miss };
    if (!DRY && filled) saveGrade(grade, obj);
  });

  const rate = stat.totalEn ? Math.round(((stat.filled + stat.already) / stat.totalEn) * 1000) / 10 : 0;
  console.log(DRY ? '[dry] 未写文件' : '已写入 miniprogram/data/*.js');
  console.log('英语词条 ' + stat.totalEn + ' 条：新补 ' + stat.filled
    + '（其中美式兜底 ' + stat.fromUs + '）、原有 ' + stat.already + '、未命中 ' + stat.miss
    + ' → 覆盖率 ' + rate + '%');
  console.log('未命中示例：' + (missSamples.length ? missSamples.join(', ') : '（无）'));
  console.log(JSON.stringify(stat.byGrade));
}

main();
