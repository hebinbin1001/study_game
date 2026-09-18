/**
 * shoot.test.js —— 字母射击改版（2026-09-18）纯逻辑用例
 *
 * 覆盖：出题结构（单空 / 多空 / 词级整词）、面板组装、命中与失误判定、
 * 填槽顺序、星级与计分口径，以及全量真实词库的健壮性冒烟。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('字母射击（shoot.js）');

const shoot = require('../../miniprogram/game/shoot');
const question = require('../../miniprogram/game/question');
const dict = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');
const { CONFIG } = require('../../miniprogram/game/config');

// ============ 出题结构 ============

s.test('字符级单空题：只挖一格，槽位其余字符原样显示', () => {
  const item = { type: 'w1', q: 'cat', a: 'a', hint: '猫' };
  const r = shoot.buildRound(item, []);
  s.assert.equal(r.kind, 'letter');
  s.assert.equal(r.wordLevel, false);
  s.assert.equal(r.word, 'cat');
  s.assert.equal(r.hidden.length, 1, '单空题只能有 1 个空');
  s.assert.equal(r.needed.length, 1);
  s.assert.equal(r.slots.length, 3);
  const blanks = r.slots.filter((x) => !x.on);
  s.assert.equal(blanks.length, 1, '恰好 1 个空槽');
  s.assert.ok(r.pad.some((c) => c.text === r.needed[0]), '面板必须含正确字母');
});

s.test('模板多空题（w2）：* 的位置全挖，空数 = 模板星号数', () => {
  const item = { type: 'w2', q: '*l*ph*nt', a: 'elephant', hint: '大象' };
  const r = shoot.buildRound(item, []);
  s.assert.equal(r.word, 'elephant');
  s.assert.equal(r.hidden.join(','), '0,2,5', '挖空位置应为模板星号的位置');
  // elephant 的第 0/2/5 位分别是 e / e / a
  s.assert.equal(r.needed.join(''), 'eea');
  s.assert.equal(r.slots.filter((x) => !x.on).length, 3);
  s.assert.equal(r.slots[1].ch, 'l', '非空位保留原字符');
  s.assert.equal(r.slots[1].on, true);
});

s.test('模板多空题（c2 成语）：挖空数 = 星号数', () => {
  const item = { type: 'c2', q: '*心*意', a: '一心一意', hint: '形容专心' };
  const r = shoot.buildRound(item, []);
  s.assert.equal(r.word, '一心一意');
  s.assert.equal(r.hidden.length, 2);
  s.assert.equal(r.needed.join(''), '一一');
});

s.test('词级题型：整词一个空，面板是 4 张词卡且含唯一正确项', () => {
  const bank = [
    { type: 'trans', q: '苹果', a: 'apple', hint: '水果' },
    { type: 'trans', q: '香蕉', a: 'banana', hint: '水果' },
    { type: 'trans', q: '橙子', a: 'orange', hint: '水果' }
  ];
  const item = { type: 'trans', q: '苹果', a: 'apple', hint: '水果' };
  const r = shoot.buildRound(item, bank);
  s.assert.equal(r.kind, 'word');
  s.assert.equal(r.wordLevel, true);
  s.assert.equal(r.needed.length, 1);
  s.assert.equal(r.needed[0], 'apple');
  s.assert.equal(r.pad.length, 4, '词级题固定 4 个候选');
  s.assert.equal(r.pad.filter((c) => c.text === 'apple').length, 1, '正确项恰好出现一次');
  s.assert.allDistinct(r.pad.map((c) => c.text), '候选互不重复');
});

s.test('面板规模：正确字母之外至少再给若干干扰，且总数不低于下限', () => {
  const item = { type: 'w2', q: '*l*ph*nt', a: 'elephant', hint: '大象' };
  const r = shoot.buildRound(item, []);
  s.assert.ok(r.pad.length >= CONFIG.padMinCount, '面板数量应 ≥ ' + CONFIG.padMinCount);
});

// ============ 判定 ============

s.test('点对：消耗该格、填进第一个空槽、filled 递增', () => {
  const item = { type: 'w1', q: 'cat', a: 'a', hint: '猫' };
  const r = shoot.buildRound(item, []);
  const idx = r.pad.findIndex((c) => c.text === r.needed[0]);
  const res = shoot.tap(r, idx);
  s.assert.equal(res.ok, true);
  s.assert.equal(res.done, true, '单空题填完即击破');
  s.assert.equal(r.pad[idx].used, true, '点对的格子应被消耗');
  s.assert.equal(r.filled, 1);
  s.assert.equal(r.slots.filter((x) => !x.on).length, 0, '没有剩余空槽');
});

s.test('点错：不消耗格子、不填空、只返回 ok=false（供页面扣护盾）', () => {
  const item = { type: 'w1', q: 'cat', a: 'a', hint: '猫' };
  const r = shoot.buildRound(item, []);
  const wrongIdx = r.pad.findIndex((c) => c.text !== r.needed[0]);
  s.assert.ok(wrongIdx >= 0, '面板里应存在错误选项');
  const res = shoot.tap(r, wrongIdx);
  s.assert.equal(res.ok, false);
  s.assert.equal(r.pad[wrongIdx].used, false, '错字母留在面板上，允许再试');
  s.assert.equal(r.filled, 0);
  s.assert.equal(r.slots.filter((x) => !x.on).length, 1);
});

s.test('多空题：按 needed 顺序依次填，填满才算击破', () => {
  const item = { type: 'w2', q: '*l*ph*nt', a: 'elephant', hint: '大象' };
  const r = shoot.buildRound(item, []);
  s.assert.equal(r.needed.join(''), 'eea');
  for (let k = 0; k < r.needed.length; k++) {
    const idx = r.pad.findIndex((c) => c.text === r.needed[k] && !c.used);
    s.assert.ok(idx >= 0, '第 ' + (k + 1) + ' 个空应有可用的正确字母');
    const res = shoot.tap(r, idx);
    s.assert.equal(res.ok, true);
    const expectDone = k === r.needed.length - 1;
    s.assert.equal(!!res.done, expectDone, '第 ' + (k + 1) + ' 次后 done 应为 ' + expectDone);
  }
  // 槽位按从左到右填：第 0、2、5 位被填上（其余原字符不动）
  s.assert.equal(r.slots[0].ch, 'e');
  s.assert.equal(r.slots[2].ch, 'e');
  s.assert.equal(r.slots[5].ch, 'a');
  s.assert.equal(r.slots[1].ch, 'l');
});

s.test('已消耗的格子再点无效（ignored）；填完后继续点也无效', () => {
  const item = { type: 'w1', q: 'cat', a: 'a', hint: '猫' };
  const r = shoot.buildRound(item, []);
  const idx = r.pad.findIndex((c) => c.text === r.needed[0]);
  shoot.tap(r, idx);
  s.assert.equal(!!shoot.tap(r, idx).ignored, true, '同一格不能打两次');
  const other = r.pad.findIndex((c) => !c.used);
  if (other >= 0) {
    s.assert.equal(!!shoot.tap(r, other).ignored, true, '已完成后不再接受输入');
  }
});

s.test('边界：空词条 / 越界下标不抛异常', () => {
  const r = shoot.buildRound({ type: 'w1', q: '', a: '' }, []);
  s.assert.ok(r && Array.isArray(r.pad), '空词条也要返回结构而不是崩');
  s.assert.equal(!!shoot.tap(r, 999).ignored, true);
  s.assert.equal(!!shoot.tap(null, 0).ignored, true);
  s.assert.equal(shoot.expectedText(null), null);
});

// ============ 计分与星级 ============

s.test('计分口径：零失误击破一题 10 分，且与服务端 SCORE_PER_QUESTION 同值', () => {
  const server = require('../../server/constants');
  s.assert.equal(shoot.scorePerCorrect(), CONFIG.scorePerCorrect);
  s.assert.equal(CONFIG.scorePerCorrect, server.SCORE_PER_QUESTION,
    '前后端每题得分必须一致（服务端按答对数 × 该值反推分数）');
});

s.test('星级：零失误题数比例套 90/70/60 三档', () => {
  s.assert.equal(shoot.starsOf(10, 10), 3);
  s.assert.equal(shoot.starsOf(9, 10), 3);
  s.assert.equal(shoot.starsOf(8, 10), 2);
  s.assert.equal(shoot.starsOf(7, 10), 2);
  s.assert.equal(shoot.starsOf(6, 10), 1);
  s.assert.equal(shoot.starsOf(5, 10), 0);
  s.assert.equal(shoot.starsOf(0, 0), 0, '题量为 0 不能崩');
  s.assert.equal(constants.STAR_THRESHOLDS[0].minRate, 90, '三星阈值口径不变');
  s.assert.equal(constants.STAR_THRESHOLDS[1].minRate, 70, '二星阈值口径不变');
  s.assert.equal(constants.STAR_THRESHOLDS[2].minRate, 60, '一星阈值口径不变');
});

s.test('星级可达性不变：容错 5 次时 1/2/3 星都拿得到', () => {
  const total = CONFIG.totalQ;
  const lives = CONFIG.initLives;
  // 1 星要 ≥60% 零失误题 → 最多 4 题有失误；护盾 5 次点错足够覆盖
  s.assert.ok(lives >= total - Math.ceil(total * 0.6), '1 星可达');
  s.assert.ok(lives >= total - Math.ceil(total * 0.7), '2 星可达');
  s.assert.ok(lives >= total - Math.ceil(total * 0.9), '3 星可达');
});

// ============ 真实词库冒烟 ============

s.test('全量内置词库：每个学段每道题都能组出合法局面', () => {
  let n = 0;
  constants.GRADES.forEach((g) => {
    const bank = dict.loadByGrade(g.key);
    s.assert.ok(bank.length > 0, g.label + ' 词库不应为空');
    bank.forEach((item) => {
      const r = shoot.buildRound(item, bank);
      n++;
      s.assert.ok(r.needed.length > 0, '必须有至少一个空：' + JSON.stringify(item));
      s.assert.ok(r.needed.every((c) => c && c !== '*'), '答案里不能残留挖空占位符：' + JSON.stringify(item));
      s.assert.ok(r.pad.length >= r.needed.length, '面板格子数不能少于空数');
      if (r.kind === 'letter') {
        s.assert.equal(r.slots.length, r.word.length, '槽位数 = 词长');
        // 面板里必须能找到每个空所需的字符（否则这道题无解）
        const avail = {};
        r.pad.forEach((c) => { avail[c.text] = (avail[c.text] || 0) + 1; });
        const need = {};
        r.needed.forEach((c) => { need[c] = (need[c] || 0) + 1; });
        Object.keys(need).forEach((ch) => {
          s.assert.ok((avail[ch] || 0) >= need[ch], '面板字母不足以补全：' + JSON.stringify(item));
        });
      } else {
        s.assert.ok(r.pad.some((c) => c.text === r.needed[0]), '词级题必须含正确整词');
      }
    });
  });
  s.assert.ok(n > 500, '应覆盖全部内置词条（实际 ' + n + ' 条）');
});
