/**
 * skins.test.js —— utils/skins.js 皮肤渲染清单单测
 *
 * 覆盖（2026-09-12 战士皮肤美术到货后扩充）：
 *   1. 渲染清单完整性：4 怪兽 + 24 战士（含旧 id 兼容）都有 emoji/color；
 *   2. **图片资源真的存在**：凡是有 image 的皮肤，对应的 /assets/skins/*.png 必须能在仓库里找到
 *      （防「写了路径但图没进包」，这在真机上只会表现为白块，很难查）；
 *   3. 战士/怪兽查询、未知 id 回退、稀有度回退、LOCAL_SKINS 与渲染表一一对应；
 *   4. 旧 id（warrior_0X / milestone_XX）必须保留 —— 已拥有它们的玩家不能丢皮肤。
 *
 * 运行：node tests/unit/skins.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/skins.js');

const skins = require('../../miniprogram/utils/skins');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../miniprogram');   // miniprogram/

s.test('SKIN_RENDER：每个形象都有 emoji + 主色（颜色格式合法）', () => {
  const ids = Object.keys(skins.SKIN_RENDER);
  s.assert.ok(ids.length >= 28, '渲染清单应覆盖全部形象，实际 ' + ids.length);
  for (const id of ids) {
    const r = skins.SKIN_RENDER[id];
    s.assert.ok(r !== undefined, '缺少 ' + id);
    s.assert.ok(r.emoji.length > 0, id + ' 缺 emoji');
    s.assert.ok(/^#[0-9a-fA-F]{6}$/.test(r.color), id + ' 颜色非法');
  }
});

s.test('旧 id 保留：warrior_0X 与 milestone_XX 不能被删（玩家已拥有的皮肤）', () => {
  ['warrior_01', 'warrior_02', 'warrior_03', 'warrior_04',
    'milestone_30', 'milestone_60', 'milestone_100', 'milestone_250', 'milestone_365'].forEach((id) => {
    s.assert.ok(!!skins.SKIN_RENDER[id], '旧 id 丢失：' + id);
    s.assert.ok(!!skins.SKIN_RENDER[id].image, id + ' 应指向新的美术图');
  });
});

s.test('战士皮肤：共 24 套，且图片文件都真实存在于包内', () => {
  const warriors = skins.LOCAL_SKINS.filter((x) => x.type === 'warrior');
  s.assert.equal(warriors.length, 24, '战士皮肤应为 24 套，实际 ' + warriors.length);
  let withImage = 0;
  warriors.forEach((w) => {
    s.assert.ok(!!w.image, w.avatarId + ' 缺图片路径');
    const rel = w.image.replace(/^\//, '');
    const abs = path.join(ROOT, rel);
    s.assert.ok(fs.existsSync(abs), w.avatarId + ' 的图片不存在：' + w.image
      + '（写了路径但图没进包 → 真机白块）');
    s.assert.ok(fs.statSync(abs).size > 1024, w.avatarId + ' 图片过小（可能是占位）：' + w.image);
    withImage++;
  });
  s.assert.equal(withImage, 24);
});

s.test('怪兽皮肤：4 套真图已接入，图片文件真实存在于包内（2026-09-12 到货）', () => {
  const monsters = skins.LOCAL_SKINS.filter((x) => x.type === 'monster');
  s.assert.equal(monsters.length, 4);
  monsters.forEach((m) => {
    s.assert.ok(!!m.image, m.avatarId + ' 缺图片路径');
    const abs = path.join(ROOT, m.image.replace(/^\//, ''));
    s.assert.ok(fs.existsSync(abs), m.avatarId + ' 的图片不存在：' + m.image + '（路径写了但图没进包 → 真机白块）');
    s.assert.ok(fs.statSync(abs).size > 1024, m.avatarId + ' 图片过小（可能是占位）：' + m.image);
    // 单文件 200KB 上限（用户明确要求，见 e2e/check-assets.js）
    s.assert.ok(fs.statSync(abs).size / 1024 <= 200, m.avatarId + ' 超过 200KB');
    s.assert.ok(/^#[0-9a-fA-F]{6}$/.test(m.color), m.avatarId + ' 颜色非法');
    s.assert.ok(!!m.emoji, m.avatarId + ' 仍要保留 emoji（真图加载失败时兜底）');
  });
});

s.test('解锁条件：新增皮肤沿用免费/星星/段位/里程碑/关卡 五类，且阈值合理', () => {
  const byType = {};
  skins.LOCAL_SKINS.forEach((x) => {
    s.assert.ok(['free', 'stars', 'rank', 'level', 'milestone'].indexOf(x.unlockType) >= 0,
      x.avatarId + ' unlockType 非法：' + x.unlockType);
    (byType[x.unlockType] = byType[x.unlockType] || []).push(x);
  });
  s.assert.ok(byType.free.length >= 3, '至少 3 套免费皮肤，实际 ' + (byType.free || []).length);
  s.assert.ok((byType.stars || []).length >= 5, '星星解锁应 ≥5 套');
  s.assert.ok((byType.rank || []).length >= 6, '段位解锁应 ≥6 套');
  s.assert.ok((byType.milestone || []).length >= 5, '里程碑应 ≥5 套');
});

s.test('avatarId：长度不超过后端字段上限（32 字符）', () => {
  skins.LOCAL_SKINS.forEach((x) => {
    s.assert.ok(x.avatarId.length <= 32, x.avatarId + ' 超过 32 字符（avatars.avatarId 字段上限）');
    s.assert.ok(/^[a-z0-9_-]+$/.test(x.avatarId), x.avatarId + ' 命名不规范');
  });
});

s.test('getWarriorSkin：正确返回战士皮肤（含图片）', () => {
  const w = skins.getWarriorSkin('warrior_02');
  s.assert.equal(w.id, 'warrior_02');
  s.assert.equal(w.emoji, '🐰');
  s.assert.equal(w.color, '#F7B6C8');
  s.assert.equal(w.image, '/assets/skins/skin-bunny-scholar.png');
  // 新增的美术 id 也要能当战士皮肤用
  const n = skins.getWarriorSkin('skin-fox-scout');
  s.assert.equal(n.id, 'skin-fox-scout');
  s.assert.equal(n.image, '/assets/skins/skin-fox-scout.png');
});

s.test('getMonsterSkin：正确返回怪兽皮肤', () => {
  const m = skins.getMonsterSkin('monster_04');
  s.assert.equal(m.id, 'monster_04');
  s.assert.equal(m.emoji, '⚡');
  s.assert.equal(m.color, '#ffc24d');
  // 契约：必须把 image 带出去 —— 引擎靠它预加载真图，漏了就会静默退回 emoji
  // （2026-09-12 真踩过：SKIN_RENDER 加了 image、这个函数没返回 → 对局里还是 emoji）
  s.assert.equal(m.image, '/assets/skins/monster_04.png', 'getMonsterSkin 必须带上 image');
  ['monster_01', 'monster_02', 'monster_03'].forEach((id) => {
    s.assert.ok(!!skins.getMonsterSkin(id).image, id + ' 的 image 缺失');
  });
  // 战士那条通路同理（历史实现是对的，这里一起钉住防回退）
  s.assert.ok(!!skins.getWarriorSkin('warrior_01').image, 'getWarriorSkin 必须带上 image');
});

s.test('getWarriorSkin：未知 id / 怪兽 id 回退默认战士', () => {
  s.assert.equal(skins.getWarriorSkin('nope').id, 'warrior_01');
  s.assert.equal(skins.getWarriorSkin('monster_02').id, 'warrior_01');
  s.assert.equal(skins.getWarriorSkin('').id, 'warrior_01');
});

s.test('getMonsterSkin：未知 id / 战士 id 回退默认怪兽', () => {
  s.assert.equal(skins.getMonsterSkin('nope').id, 'monster_01');
  s.assert.equal(skins.getMonsterSkin('warrior_03').id, 'monster_01');
  s.assert.equal(skins.getMonsterSkin(undefined).id, 'monster_01');
});

s.test('getSkinRender：未知 id 回退默认怪兽', () => {
  s.assert.equal(skins.getSkinRender('bad_id').emoji, '👾');
});

s.test('getRarity：已知/未知稀有度正确映射与回退', () => {
  s.assert.equal(skins.getRarity('common').label, '普通');
  s.assert.equal(skins.getRarity('legend').color, '#ffc24d');
  s.assert.equal(skins.getRarity('nope').label, '普通');
  s.assert.equal(skins.getRarity('nope').color, '#8a9bb5');
});

s.test('LOCAL_SKINS：与 SKIN_RENDER 的 avatarId 一一对应、字段齐全', () => {
  const ids = skins.LOCAL_SKINS.map((x) => x.avatarId).sort();
  s.assert.deepEqual(ids, Object.keys(skins.SKIN_RENDER).sort());
  for (const sk of skins.LOCAL_SKINS) {
    s.assert.ok(sk.name.length > 0, sk.avatarId + ' 缺名称');
    s.assert.ok(sk.type === 'warrior' || sk.type === 'monster', sk.avatarId + ' type 非法');
    s.assert.ok(sk.emoji.length > 0, sk.avatarId + ' 缺 emoji');
    s.assert.ok(['free', 'stars', 'rank', 'level', 'milestone'].indexOf(sk.unlockType) >= 0, sk.avatarId + ' unlockType 非法');
    s.assert.equal(sk.emoji, skins.SKIN_RENDER[sk.avatarId].emoji);
    s.assert.equal(sk.color, skins.SKIN_RENDER[sk.avatarId].color);
    // 图片路径也必须两张表一致：2026-09-12 出现过「LOCAL_SKINS 加了 image、
    // SKIN_RENDER 忘了加」→ 对局里静默退回 emoji，只有这条能当场抓住。
    s.assert.equal(sk.image || '', skins.SKIN_RENDER[sk.avatarId].image || '',
      sk.avatarId + ' 的两张表图片路径不一致（LOCAL_SKINS 与 SKIN_RENDER 必须同步）');
  }
});

s.test('两端目录一致：后端 seeders/avatar-seed.js 与前端 LOCAL_SKINS 必须完全对齐', () => {
  const { avatars } = require('../../server/seeders/avatar-seed');
  const backIds = avatars.map((a) => a.avatarId).sort();
  const frontIds = skins.LOCAL_SKINS.map((x) => x.avatarId).sort();
  s.assert.deepEqual(frontIds, backIds,
    '前端皮肤清单与后端目录不一致（会出现"看得到但解锁不了"或"解锁了但页面没有"）');

  // 解锁条件也要一致：否则玩家达标了后端不给解锁 / 或反之
  const backMap = {};
  avatars.forEach((a) => { backMap[a.avatarId] = a; });
  skins.LOCAL_SKINS.forEach((sk) => {
    const b = backMap[sk.avatarId];
    s.assert.equal(sk.unlockType, b.unlockType, sk.avatarId + ' unlockType 两端不一致');
    s.assert.equal(sk.unlockValue, b.unlockValue, sk.avatarId + ' unlockValue 两端不一致');
    s.assert.equal(sk.type, b.type, sk.avatarId + ' type 两端不一致');
    s.assert.equal(sk.rarity, b.rarity, sk.avatarId + ' rarity 两端不一致');
  });
});

s.test('后端目录：战士 24 套 + 怪兽 4 套，id 不超长', () => {
  const { avatars } = require('../../server/seeders/avatar-seed');
  const warriors = avatars.filter((a) => a.type === 'warrior');
  const monsters = avatars.filter((a) => a.type === 'monster');
  s.assert.equal(warriors.length, 24, '战士皮肤应 24 套，实际 ' + warriors.length);
  s.assert.equal(monsters.length, 4, '怪兽皮肤应 4 套，实际 ' + monsters.length);
  s.assert.equal(new Set(avatars.map((a) => a.avatarId)).size, avatars.length, 'avatarId 不能重复');
  avatars.forEach((a) => {
    s.assert.ok(a.avatarId.length <= 32, a.avatarId + ' 超过字段上限 32');
  });
});

s.done();
