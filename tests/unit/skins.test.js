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

// 2026-09-19：立绘迁到 CDN（包内只留默认战士 + 默认怪物两张兜底）。
// 断言从「图在包里」改成「图能落到真实文件上」——默认两张看包内，其余看 art/skins/。
// 这样仍然能抓到「写了路径但图根本没备好 → 真机白块」这类问题。
// 注意：本文件的 ROOT 已经是 miniprogram/（见文件顶部），art/ 在仓库根，所以要往上一层
const ART_SKINS_DIR = path.join(ROOT, '..', 'art', 'skins');
const CDN_BASE_RE = /^https?:\/\/[^/]+\/assets\/skins\//;

/** 把皮肤 image 解析成磁盘上的真实文件；解析不出来返回 null */
function skinFileOf(image) {
  if (!image) return null;
  if (CDN_BASE_RE.test(image)) {
    return path.join(ART_SKINS_DIR, image.split('/assets/skins/')[1]);
  }
  if (image.charAt(0) === '/') return path.join(ROOT, image.replace(/^\//, ''));
  return null;
}

s.test('战士皮肤：共 30 套（24 原有 + 6 元素新增），且每套都指向真实存在的立绘图', () => {
  const warriors = skins.LOCAL_SKINS.filter((x) => x.type === 'warrior');
  // 2026-09-19：豆包出了 6 款元素主题战士（火/水/风/雷/光/暗）→ 24 → 30
  s.assert.equal(warriors.length, 30, '战士皮肤应为 30 套，实际 ' + warriors.length);
  let withImage = 0;
  warriors.forEach((w) => {
    s.assert.ok(!!w.image, w.avatarId + ' 缺图片路径');
    const abs = skinFileOf(w.image);
    s.assert.ok(abs, w.avatarId + ' 图片路径无法解析：' + w.image);
    s.assert.ok(fs.existsSync(abs), w.avatarId + ' 的图片不存在：' + w.image
      + '（写了路径但图没备好 → 真机白块）');
    s.assert.ok(fs.statSync(abs).size > 1024, w.avatarId + ' 图片过小（可能是占位）：' + w.image);
    withImage++;
  });
  s.assert.equal(withImage, 30);
});

s.test('怪兽皮肤：10 套真图已接入（4 原有 + 6 新增 Boss），图片文件真实存在', () => {
  const monsters = skins.LOCAL_SKINS.filter((x) => x.type === 'monster');
  // 2026-09-19：豆包出了 6 款 Boss（像素吞噬者/赤鬼将军/翡翠龙王/深海梦魇/机械领主/熔岩巨兽）→ 4 → 10
  s.assert.equal(monsters.length, 10);
  monsters.forEach((m) => {
    s.assert.ok(!!m.image, m.avatarId + ' 缺图片路径');
    const abs = skinFileOf(m.image);
    s.assert.ok(abs, m.avatarId + ' 图片路径无法解析：' + m.image);
    s.assert.ok(fs.existsSync(abs), m.avatarId + ' 的图片不存在：' + m.image + '（路径写了但图没进包 → 真机白块）');
    s.assert.ok(fs.statSync(abs).size > 1024, m.avatarId + ' 图片过小（可能是占位）：' + m.image);
    // 包内那两张要守住单文件 200KB（用户明确要求）；CDN 图不受包体限制，但仍别超过 300KB
    const limit = CDN_BASE_RE.test(m.image) ? 300 : 200;
    s.assert.ok(fs.statSync(abs).size / 1024 <= limit, m.avatarId + ' 超过 ' + limit + 'KB');
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
  // 2026-09-19：立绘走 CDN，这里断言「指向正确的图」而不是具体前缀
  s.assert.contains(w.image, '/assets/skins/skin-bunny-scholar.png');
  // 新增的美术 id 也要能当战士皮肤用
  const n = skins.getWarriorSkin('skin-fox-scout');
  s.assert.equal(n.id, 'skin-fox-scout');
  s.assert.contains(n.image, '/assets/skins/skin-fox-scout.png');
});

s.test('getMonsterSkin：正确返回怪兽皮肤', () => {
  const m = skins.getMonsterSkin('monster_04');
  s.assert.equal(m.id, 'monster_04');
  s.assert.equal(m.emoji, '⚡');
  s.assert.equal(m.color, '#ffc24d');
  // 契约：必须把 image 带出去 —— 引擎靠它预加载真图，漏了就会静默退回 emoji
  // （2026-09-12 真踩过：SKIN_RENDER 加了 image、这个函数没返回 → 对局里还是 emoji）
  s.assert.contains(m.image, '/assets/skins/monster_04.png', 'getMonsterSkin 必须带上 image');
  ['monster_01', 'monster_02', 'monster_03'].forEach((id) => {
    s.assert.ok(!!skins.getMonsterSkin(id).image, id + ' 的 image 缺失');
  });
  // 战士那条通路同理（历史实现是对的，这里一起钉住防回退）
  s.assert.ok(!!skins.getWarriorSkin('warrior_01').image, 'getWarriorSkin 必须带上 image');
});

s.test('默认皮肤回退：没选过皮肤时也必须带 image（否则对局里只剩 emoji）', () => {
  // 玩家从没主动选过皮肤时，storage.getBossSkin() 返回空串 → 走这里的默认回退。
  // 2026-09-12 真机 bug：DEFAULT_MONSTER 手写漏了 image，于是**默认情况下怪兽立绘永远不显示**，
  // 只有玩家去形象页选过一次才有图（由 verify-game 的「怪兽真图已被 canvas 解码」断言抓到）。
  ['', undefined, null].forEach(function (bad) {
    const m = skins.getMonsterSkin(bad);
    s.assert.ok(!!m.image, '默认怪兽（入参 ' + JSON.stringify(bad) + '）必须带 image');
    s.assert.equal(m.id, 'monster_01');
    const w = skins.getWarriorSkin(bad);
    s.assert.ok(!!w.image, '默认战士（入参 ' + JSON.stringify(bad) + '）必须带 image');
  });
  // 未知 id 走的也是同一个默认回退
  s.assert.ok(!!skins.getMonsterSkin('not-exist').image, '未知 id 回退的默认怪兽也要带 image');
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

s.test('后端目录：战士 30 套 + 怪兽 10 套，id 不超长', () => {
  const { avatars } = require('../../server/seeders/avatar-seed');
  const warriors = avatars.filter((a) => a.type === 'warrior');
  const monsters = avatars.filter((a) => a.type === 'monster');
  // 2026-09-19：+6 元素战士 / +6 Boss
  s.assert.equal(warriors.length, 30, '战士皮肤应 30 套，实际 ' + warriors.length);
  s.assert.equal(monsters.length, 10, '怪兽皮肤应 10 套，实际 ' + monsters.length);
  s.assert.equal(new Set(avatars.map((a) => a.avatarId)).size, avatars.length, 'avatarId 不能重复');
  avatars.forEach((a) => {
    s.assert.ok(a.avatarId.length <= 32, a.avatarId + ' 超过字段上限 32');
  });
});

s.done();
