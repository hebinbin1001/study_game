/**
 * 云端成绩恢复关卡记录。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('云端关卡记录恢复');
const recovery = require('../../miniprogram/utils/star-recovery');
const storage = require('../../miniprogram/utils/storage');

const ROOT = path.resolve(__dirname, '../..');

s.test('历史成绩映射到当前本地星级键', () => {
  s.assert.equal(recovery.restoreKeyOf({
    gameType: 'math24', grade: 'g1', level: 5
  }), 'math24_5');
  s.assert.equal(recovery.restoreKeyOf({
    gameType: 'word_build', grade: 'g1', level: 3, typeKey: ''
  }), 'g1@challenge@3');
  s.assert.equal(recovery.restoreKeyOf({
    gameType: 'word_build', grade: 'g1', level: 4, typeKey: ''
  }), 'g1@mode_wordBuild@4');
  s.assert.equal(recovery.restoreKeyOf({
    gameType: 'link', grade: 'g1', level: 2, typeKey: 'mode_link'
  }), 'g1@mode_link@2');
  s.assert.equal(recovery.restoreKeyOf({
    gameType: 'quiz', grade: 'g1', level: 1, typeKey: ''
  }), 'g1@mode_quiz@1');
});

s.test('恢复只增不减，并忽略 0 星记录', () => {
  const merged = recovery.mergeHistory(
    { 'g1@challenge@1': 3, math24_1: 1 },
    [
      { gameType: 'word_warrior', grade: 'g1', level: 1, stars: 2 },
      { gameType: 'math24', grade: 'g1', level: 1, stars: 2 },
      { gameType: 'math24', grade: 'g1', level: 2, stars: 0 },
    ]
  );
  s.assert.equal(merged.stars['g1@challenge@1'], 3);
  s.assert.equal(merged.stars.math24_1, 2);
  s.assert.equal(merged.stars.math24_2, undefined);
  s.assert.equal(merged.restored, 1);
  s.assert.equal(merged.scanned, 2);
});

s.test('服务端提供历史接口，页面上报开始保留主线/玩法线命名空间', () => {
  const score = fs.readFileSync(path.join(ROOT, 'server/routes/score.js'), 'utf8');
  const report = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/play-report.js'), 'utf8');
  const result = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/result/result.js'), 'utf8');
  s.assert.contains(score, 'router.get("/history"');
  s.assert.contains(score, 'typeKey: row.type_key');
  s.assert.contains(report, 'type: d.typeKey');
  s.assert.contains(result, 'this._line || challenge.STAR_KEY');
});

s.test('自动化测试运行期间跳过云端恢复，避免污染测试存档', async () => {
  storage.set(recovery.E2E_FLAG_KEY, Date.now() + 60000);
  const result = await recovery.restoreFromCloud();
  storage.remove(recovery.E2E_FLAG_KEY);
  s.assert.equal(result.skipped, true);
  s.assert.equal(result.e2e, true);
});

s.done();
