/**
 * avatar-unlock.test.js —— 皮肤解锁条件「两端契约」护栏
 *
 * 为什么需要（2026-09-12 真实踩坑）：
 *   上架 24 套战士皮肤时给「学者之王」用了 unlockType='level'，
 *   但 **服务端 POST /api/avatar/unlock 只实现了 free/stars/rank 三个分支**，
 *   'level' 落到「条件未满足」→ 这套皮肤永远解锁不了（线上只能看到锁）。
 *   单测/端到端都不查解锁接口的语义分支，所以当时没被发现。
 *
 * 这里用静态契约把三条钉住：
 *   ① 服务端必须为每个 unlockType 提供判定分支（free 直接可解锁；milestone 禁止手动解锁）；
 *   ② 前端 avatar 页的解锁文案必须覆盖同一套 unlockType；
 *   ③ 皮肤目录里出现的 unlockType 必须都在服务端支持列表内（否则就是解锁不了的死皮肤）。
 *
 * 运行：node miniprogram/utils/__tests__/avatar-unlock.test.js
 */

'use strict';

const { suite } = require('./_runner');
const fs = require('fs');
const path = require('path');

const s = suite('皮肤解锁条件契约（前后端）');
const ROOT = path.join(__dirname, '..', '..', '..');   // study_game/
const routeSrc = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'avatar.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'avatar', 'avatar.js'), 'utf8');
const { avatars } = require(path.join(ROOT, 'server', 'seeders', 'avatar-seed'));

// 服务端支持手动解锁判定的类型（milestone 由每日一题自动发放，禁止手动解锁）
const MANUAL_TYPES = ['free', 'stars', 'rank', 'level'];

s.test('服务端：每个可手动解锁的类型都有判定分支', () => {
  MANUAL_TYPES.forEach((t) => {
    if (t === 'free') return;   // free 在代码里是初始值（canUnlock = unlockType === 'free'）
    s.assert.ok(routeSrc.indexOf('unlockType === "' + t + '"') !== -1,
      '服务端缺少 unlockType=' + t + ' 的判定分支 → 该类型皮肤永远解锁不了');
  });
  s.assert.ok(/unlockType === "milestone"/.test(routeSrc), '服务端应显式拒绝手动解锁 milestone');
});

s.test('前端：解锁文案覆盖同一套类型', () => {
  MANUAL_TYPES.forEach((t) => {
    if (t === 'free') return;
    s.assert.ok(pageSrc.indexOf("unlockType === '" + t + "'") !== -1,
      'avatar 页缺少 unlockType=' + t + ' 的解锁说明文案');
  });
  s.assert.ok(pageSrc.indexOf("unlockType === 'milestone'") !== -1, 'avatar 页应说明 milestone 皮肤的来源');
});

s.test('皮肤目录：出现的 unlockType 必须都被服务端支持（否则是解锁不了的死皮肤）', () => {
  const seen = {};
  avatars.forEach((a) => { seen[a.unlockType] = (seen[a.unlockType] || 0) + 1; });
  Object.keys(seen).forEach((t) => {
    s.assert.ok(MANUAL_TYPES.indexOf(t) !== -1 || t === 'milestone',
      '目录里出现未支持的解锁类型：' + t + '（' + seen[t] + ' 套会解锁不了）');
  });
  // 至少用上 stars / rank / free / milestone 四类（皮肤解锁条件要有多样性）
  s.assert.ok(seen.stars >= 5 && seen.rank >= 6 && seen.free >= 3 && seen.milestone >= 5,
    '解锁条件分布异常：' + JSON.stringify(seen));
});

s.done();
