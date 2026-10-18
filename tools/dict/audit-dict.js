/**
 * tools/dict/audit-dict.js —— 题库与教材同步情况一览（只读，一条命令复查）
 *
 * 为什么要有：题库是内容资产，出问题不会报错，只会悄悄"孩子做到别的年级的题"。
 * 2026-10-18 全量审计就是靠这份口径查出三类问题（通用词越级 / 音标重音错位 /
 * 教材版本覆盖被误读）。以后补词表、跑 add-ipa、改 apply-book-words 之后，
 * 跑一遍这个脚本就知道有没有把老问题带回来。
 *
 * 用法：
 *   node tools/dict/audit-dict.js          # 打印报告
 *   node tools/dict/audit-dict.js --strict # 有问题时退出码 1（可挂 CI）
 */
'use strict';

const dict = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');
const pep = require('./book-words-pep');
const wys = require('./book-words-wys');
const { countNuclei, normalizeStress, normalizeSymbols } = require('./ipa-normalize');

const G = constants.GRADES.map(function (g) { return g.key; });
const idx = {};
G.forEach(function (g, i) { idx[g] = i; });
const STRICT = process.argv.indexOf('--strict') >= 0;

/** 教材词 → 最早出现年级 */
const first = {};
function mark(w, g) {
  const k = String(w || '').toLowerCase();
  if (!k) return;
  if (!first[k] || idx[g] < idx[first[k]]) first[k] = g;
}
['g3', 'g4', 'g5', 'g6'].forEach(function (g) { (pep[g] || []).forEach(function (p) { mark(p[0], g); }); });
['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].forEach(function (g) { (wys[g] || []).forEach(function (p) { mark(p[0], g); }); });

const problems = [];

// ============ 一、各年级 × 教材版本词条数 ============
console.log('\n【一】各年级词条与教材版本覆盖');
console.log('年级\t总数\t通用\tPEP\t外研');
G.forEach(function (g) {
  const items = dict.loadBuiltin(g);
  const gen = items.filter(function (x) { return !x.book; }).length;
  const p = items.filter(function (x) { return x.book === 'pep'; }).length;
  const w = items.filter(function (x) { return x.book === 'wys'; }).length;
  console.log(g + '\t' + items.length + '\t' + gen + '\t' + p + '\t' + w);
});

// ============ 二、通用词越级 ============
console.log('\n【二】通用英语词越级（教材更晚才教，却出现在低年级）');
let overCount = 0;
['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].forEach(function (g) {
  const over = dict.loadBuiltin(g).filter(function (it) {
    if (it.book || it.type !== 'w1') return false;
    const f = first[String(it.a || '').toLowerCase()];
    return f && idx[f] > idx[g];
  });
  if (over.length) {
    overCount += over.length;
    console.log(g + '  ' + over.length + ' 条：' + over.map(function (x) { return x.a + '(' + first[x.a.toLowerCase()] + ')'; }).join(', '));
    problems.push(g + ' 有 ' + over.length + ' 条通用词越级');
  }
});
if (!overCount) console.log('（无）');

// ============ 三、音标 ============
console.log('\n【三】音标（教材 DJ 写法）');
const ipaBad = [];
const ipaMiss = [];
G.forEach(function (g) {
  dict.loadBuiltin(g).forEach(function (it) {
    if (['w1', 'w2', 'trans', 'fill'].indexOf(it.type) < 0) return;
    if (!it.ipa) { ipaMiss.push(g + ':' + it.a); return; }
    const again = normalizeStress(normalizeSymbols(it.ipa));
    if (again !== it.ipa) ipaBad.push(g + ':' + it.a + ' ' + it.ipa + '→' + again);
    else if (countNuclei(it.ipa.replace(/[ˈˌ]/g, '')) <= 1 && it.ipa.indexOf('ˈ') >= 0) {
      ipaBad.push(g + ':' + it.a + ' ' + it.ipa + '（单音节不该标重音）');
    }
  });
});
console.log('待规整 ' + ipaBad.length + ' 条（跑 node tools/dict/fix-ipa-stress.js 修）');
if (ipaBad.length) console.log('  ' + ipaBad.slice(0, 8).join('\n  '));
console.log('缺音标 ' + ipaMiss.length + ' 条（多为多词短语/变形，词典查不到属正常）');
if (ipaMiss.length) console.log('  ' + ipaMiss.join(', '));
if (ipaBad.length) problems.push('音标 ' + ipaBad.length + ' 条未按教材写法');

// ============ 四、玩法可用题量 ============
console.log('\n【四】各年级玩法可用题量（纯字母 w1 供消消乐/连连看，带 * 供拼词）');
console.log('年级\t纯字母w1\t带*题\t成语c2\t句子fill');
G.forEach(function (g) {
  const items = dict.loadBuiltin(g);
  const en = items.filter(function (x) { return x.type === 'w1' && /^[A-Za-z]+$/.test(String(x.q)); }).length;
  const masked = items.filter(function (x) { return String(x.q).indexOf('*') >= 0; }).length;
  const c2 = items.filter(function (x) { return x.type === 'c2'; }).length;
  const fill = items.filter(function (x) { return x.type === 'fill'; }).length;
  console.log(g + '\t' + en + '\t\t' + masked + '\t' + c2 + '\t' + fill);
  if (en < 8) problems.push(g + ' 纯字母词不足 8 个，消消乐/连连看会缺题');
});

// ============ 结论 ============
console.log('\n' + (problems.length ? '⚠️  待处理 ' + problems.length + ' 项：\n  ' + problems.join('\n  ') : '✅ 题库与教材一致，未发现问题'));
if (STRICT && problems.length) process.exitCode = 1;
