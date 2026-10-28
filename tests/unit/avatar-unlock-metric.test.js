/**
 * avatar-unlock-metric.test.js —— 皮肤解锁「两端同口径」护栏
 *
 * 背景（2026-10-28 修的真实 bug）：
 *   服务端解锁读 RankRecord.stars 原始值，前端「还差几星」读 /api/rank/info 的封顶值，
 *   而那行注释还写着「与后端判定同口径」—— 被封顶的玩家会看到「还差 131 星」，
 *   点下去却直接解锁成功。
 *
 * 定下的口径（用户拍板）：
 *   · 星星类皮肤 → 按**真实累计星**（晋级考试只封顶段位，不封顶皮肤奖励）；
 *   · 段位类皮肤 → 按**封顶后的段位**（段位在全站只有这一个口径，皮肤不能另算）。
 *
 * 这里用源码契约 + 数值推演把两条都钉住，避免以后又有人「顺手统一」到错的一边。
 *
 * 运行：node tests/unit/avatar-unlock-metric.test.js
 */

'use strict';

const { suite } = require('./_runner');
const fs = require('fs');
const path = require('path');

const s = suite('皮肤解锁口径（星星看累计 · 段位看封顶）');
const ROOT = path.join(__dirname, '../..');

const routeSrc = fs.readFileSync(path.join(ROOT, 'server/routes/avatar.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/avatar/avatar.js'), 'utf8');
const pageWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/avatar/avatar.wxml'), 'utf8');

const examGate = require(path.join(ROOT, 'server/exam-gate'));
const ladder = require(path.join(ROOT, 'server/rank-ladder'));
const rankRouter = require(path.join(ROOT, 'server/routes/rank'));
const { avatars } = require(path.join(ROOT, 'server/seeders/avatar-seed'));

/** 截取某个 unlockType 分支的源码（到下一个分支为止） */
function branch(src, type, nextType) {
  const start = src.indexOf('unlockType === "' + type + '"') >= 0
    ? src.indexOf('unlockType === "' + type + '"')
    : src.indexOf("unlockType === '" + type + "'");
  if (start < 0) return '';
  const end = nextType
    ? src.indexOf('unlockType === "' + nextType + '"', start + 1) >= 0
      ? src.indexOf('unlockType === "' + nextType + '"', start + 1)
      : src.indexOf("unlockType === '" + nextType + "'", start + 1)
    : src.length;
  return src.slice(start, end < 0 ? src.length : end);
}

// ============ ① 服务端：星星分支读原始值，段位分支读封顶值 ============

s.test('服务端星星解锁：读 RankRecord.stars 原始值，不得掺入封顶', () => {
  const b = branch(routeSrc, 'stars', 'rank');
  s.assert.ok(b.length > 0, '找不到 unlockType === "stars" 分支');
  s.assert.ok(b.indexOf('rankRecord.stars') !== -1, '星星解锁应读 RankRecord.stars（真实累计）');
  s.assert.ok(b.indexOf('cappedStars') === -1, '星星解锁不该用封顶值 —— 封顶只卡段位，不卡皮肤奖励');
});

s.test('服务端段位解锁：按封顶后的段位判定（不能再读 RankRecord.rankId）', () => {
  const b = branch(routeSrc, 'rank', 'level');
  s.assert.ok(b.length > 0, '找不到 unlockType === "rank" 分支');
  s.assert.ok(b.indexOf('examClearedTier') !== -1, '段位分支要现算「已通过考试的最高大段」');
  s.assert.ok(b.indexOf('cappedStars') !== -1, '段位分支要先封顶再取段位');
  s.assert.ok(b.indexOf('ladder.rankOf') !== -1, '封顶后的星数要换算成 rankId 才能比');
  s.assert.ok(
    b.indexOf('attributes: ["rankId"]') === -1,
    'RankRecord.rankId 是按真实累计星写的，直接读会让被封顶的人解锁钻石皮肤'
  );
});

s.test('rank 路由把 examClearedTier 暴露给 avatar 复用（别悄悄删掉）', () => {
  s.assert.equal(typeof rankRouter.examClearedTier, 'function', 'avatar.js 靠它现算封顶，删了段位皮肤会 500');
});

// ============ ② 前端提示：读同一批数 ============

s.test('前端星星提示读 rawStars（原来的封顶值会让「还差 N 星」是假的）', () => {
  const b = branch(pageSrc, 'stars', 'rank');
  s.assert.ok(b.length > 0, '找不到 unlockType === \'stars\' 分支');
  s.assert.ok(b.indexOf('info.rawStars') !== -1, '星星提示应读 /api/rank/info 的 rawStars');
  s.assert.ok(
    b.indexOf('var curStars = info.stars || 0;') === -1,
    '别再用封顶后的 info.stars 算「还差几星」'
  );
});

s.test('前端段位提示用 info.rankId（它已是封顶后的段位，与服务端一致）', () => {
  const b = branch(pageSrc, 'rank', 'level');
  s.assert.ok(b.indexOf('info.rankId') !== -1, '段位提示应读 info.rankId');
  s.assert.ok(b.indexOf('rawStars') === -1, '段位提示不能拿真实累计星换算段位（会和服务端对不上）');
});

s.test('皮肤页把星星标成「累计星」，被封顶时给出解释', () => {
  s.assert.ok(pageWxml.indexOf('累计星') !== -1, '页头应写「累计星」—— 皮肤就是按它解锁的');
  s.assert.ok(pageWxml.indexOf('rankInfo.rawStars') !== -1, '页头数值应取 rawStars');
  s.assert.ok(pageWxml.indexOf('rankInfo.needExam') !== -1, '被封顶时应出现一句说明，解释段位名与星数对不上');
});

// ============ ③ 数值推演：同一个玩家，两种皮肤的答案 ============

s.test('未考过试的玩家（300 星）：星星皮肤给，段位皮肤不给', () => {
  const raw = 300;
  const cleared = '';
  const capped = examGate.cappedStars(raw, cleared);

  s.assert.ok(capped < raw, '没考过试的玩家展示星数应被封顶');
  s.assert.equal(ladder.rankOf(capped).rankId, 1, '封顶后应停在第一个大段');

  const starSkin = avatars.filter((a) => a.unlockType === 'stars' && a.unlockValue <= 300)
    .sort((a, b) => b.unlockValue - a.unlockValue)[0];
  s.assert.ok(!!starSkin, '皮肤目录里应有 300 星档的星星皮肤');
  s.assert.ok(raw >= starSkin.unlockValue, '星星皮肤按真实累计星 → 条件已满足（这是拍板口径）');

  const rankSkin = avatars.filter((a) => a.unlockType === 'rank' && a.unlockValue >= 5)[0];
  s.assert.ok(!!rankSkin, '皮肤目录里应有钻石及以上的段位皮肤');
  s.assert.ok(
    ladder.rankOf(capped).rankId < rankSkin.unlockValue,
    '段位皮肤按封顶段位 → 还得去考晋级试，不能靠真实星数绕过'
  );
});

s.test('考过青铜后：封顶线抬高，但不会直接跳到钻石', () => {
  const raw = 300;
  const before = examGate.cappedStars(raw, '');
  const after = examGate.cappedStars(raw, 'bronze');
  s.assert.ok(after > before, '通过青铜考试后应允许涨到白银区间');
  s.assert.ok(ladder.rankOf(after).rankId < 5, '只考过青铜不该直接解锁钻石皮肤');
});

s.done();
