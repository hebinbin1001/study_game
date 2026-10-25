/**
 * 错题复习「十题一关」流程护栏（2026-10-25）。
 *
 * 守两件事：
 *   1. 关内**全自动推进** —— 答对也不能再用模态弹窗打断（原来答对后弹「是否移出错题本」，
 *      必须点一下才继续，用户反馈「一道题完了应该直接下一道」）；
 *   2. **架构红线** —— 错题复习不得进入关卡/成绩体系（见 docs/错题复习流程规划-待确认.md §四）：
 *      不写星级存档、不上报成绩，否则会污染玩法进度榜 / 段位星 / 成就统计。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('错题复习十题一关');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
}

// 去掉注释后再做「源码里不许出现 X」的断言，避免注释里提到关键词就误红
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const JS = read('miniprogram/pages/wrong-review/wrong-review.js');
const WXML = read('miniprogram/pages/wrong-review/wrong-review.wxml');
const JS_CODE = stripComments(JS);

s.test('一关固定 10 题，取关时按 LEVEL_SIZE 切片', () => {
  s.assert.contains(JS, 'var LEVEL_SIZE = 10');
  s.assert.contains(JS_CODE, 'slice(0, LEVEL_SIZE)');
});

s.test('本会话已答过的题要排重（pending 口径是熟练度<100，答对后仍会出现）', () => {
  s.assert.contains(JS_CODE, '_doneIds');
  s.assert.contains(JS_CODE, '!self._doneIds[String(it.recordId)]');
});

s.test('答对不再弹阻塞弹窗：走自动下一题', () => {
  // 旧的「答对后询问是否移出错题本」必须彻底移除（含方法名与调用）
  s.assert.equal(JS_CODE.indexOf('_askRemoveAfterCorrect'), -1, '答对后的模态弹窗必须移除');
  // 答对/答错都要 setTimeout 推进下一题
  s.assert.contains(JS_CODE, 'self.nextQuestion()');
  s.assert.contains(JS, 'FEEDBACK_MS_CORRECT = 800');
  s.assert.contains(JS, 'FEEDBACK_MS_WRONG = 1500');
});

s.test('本关结束要收起反馈层并算出正确率（否则反馈浮层会盖住结算页）', () => {
  s.assert.contains(JS_CODE, 'levelRate');
  s.assert.contains(JS_CODE, 'showFeedback: false');
  // 结算时不自动续关：onShow 里对 completed 有守卫
  s.assert.contains(JS_CODE, 'this.data.completed) return');
});

s.test('「移出错题本」入口保留（结算页批量 + 接口幂等）', () => {
  s.assert.contains(JS_CODE, 'askBulkRemove');
  s.assert.contains(JS_CODE, '/api/wrong/remove');
  s.assert.contains(WXML, 'askBulkRemove');
});

s.test('架构红线：不写星级、不上报成绩（否则污染榜单/段位/成就）', () => {
  s.assert.equal(JS_CODE.indexOf('saveStars'), -1, '错题复习不许写星级存档');
  s.assert.equal(JS_CODE.indexOf('play-report'), -1, '错题复习不许接成绩上报');
  s.assert.equal(JS_CODE.indexOf('/api/score'), -1, '错题复习不许调 /api/score');
  s.assert.equal(JS_CODE.indexOf('challenge'), -1, '错题复习不属于关卡体系，不许引用 challenge');
});

s.test('结算页展示本关正确率与「再来一关」', () => {
  s.assert.contains(WXML, 'levelRate');
  s.assert.contains(WXML, 'nextLevel');
  s.assert.contains(WXML, '本关完成');
});
