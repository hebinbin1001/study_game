/**
 * skins-cdn.test.js —— 对局立绘的「包内兜底 + CDN 托管」口径（2026-09-19）
 *
 * 背景（两件事叠在一起）：
 *   1. 用户两次反馈「战士和 boss 太小」→ 查出来是素材问题：战士图角色只占画布 40%×65%，
 *      一圈透明边（z 已于 e2e/trim-skins.py 处理）；同时放大后包内图分辨率不够，会糊。
 *   2. 微信上传检测项判的是**包内图片/音频总量 ≤200KB**，28 张立绘已占 173KB，
 *      新出的 12 张（6 Boss + 6 元素战士）根本塞不进去。
 *
 * 所以定下这条分工，本用例把它钉住：
 *   · 包内**只留 2 张**：默认战士 skin-recruit + 默认怪物 monster_01（离线首屏兜底）；
 *   · 其余立绘走云托管 CDN（仓库 art/skins/，由 /assets/** 静态托管）；
 *   · 各页面已有的 emoji 兜底继续生效（图挂了不裂图）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('立绘：包内兜底 + CDN 托管');

const ROOT = path.resolve(__dirname, '../..');
const PKG_SKINS = path.join(ROOT, 'miniprogram/assets/skins');
const ART_SKINS = path.join(ROOT, 'art/skins');

/** 读 PNG 宽高（IHDR 固定在第 16~24 字节） */
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const pkgFiles = fs.readdirSync(PKG_SKINS).filter((f) => f.endsWith('.png'));
const artFiles = fs.readdirSync(ART_SKINS).filter((f) => f.endsWith('.png'));

s.test('包内只留两张默认立绘（离线兜底），其余不再进包', () => {
  s.assert.deepEqual(pkgFiles.slice().sort(), ['monster_01.png', 'skin-recruit.png'],
    '包内应恰好是默认战士 + 默认怪物这两张，实际 = ' + JSON.stringify(pkgFiles));
});

s.test('CDN 目录 art/skins 备齐全部立绘（28 旧 + 12 新 = 40）', () => {
  s.assert.ok(artFiles.length >= 40, 'art/skins 应至少 40 张，实际 ' + artFiles.length);
  // 12 张新立绘必须都在
  ['boss_pixel_devourer', 'boss_jade_dragon', 'boss_crimson_ogre', 'boss_abyss_kraken',
    'boss_mech_lord', 'boss_magma_titan', 'skin-flame-berserker', 'skin-tide-druid',
    'skin-gale-ninja', 'skin-thunder-lancer', 'skin-radiant-paladin', 'skin-void-assassin'
  ].forEach((n) => {
    s.assert.ok(artFiles.indexOf(n + '.png') >= 0, 'art/skins 缺少 ' + n + '.png');
  });
});

s.test('CDN 立绘尺寸合规：最长边 ≤512（没有把图放大，也没有超规格）', () => {
  artFiles.forEach((f) => {
    const sz = pngSize(path.join(ART_SKINS, f));
    s.assert.ok(sz, f + ' 应是合法 PNG');
    s.assert.ok(Math.max(sz.w, sz.h) <= 512, f + ' 最长边超 512：' + sz.w + 'x' + sz.h);
    s.assert.ok(Math.min(sz.w, sz.h) >= 64, f + ' 尺寸过小：' + sz.w + 'x' + sz.h);
  });
});

s.test('skins.js：非默认立绘一律走 http(s) CDN，默认两张保持包内路径', () => {
  const skins = require('../../miniprogram/utils/skins');
  s.assert.equal(skins.DEFAULT_WARRIOR.image, '/assets/skins/skin-recruit.png', '默认战士留在包内');
  s.assert.equal(skins.DEFAULT_MONSTER.image, '/assets/skins/monster_01.png', '默认怪物留在包内');

  let cdn = 0;
  let local = 0;
  skins.LOCAL_SKINS.forEach((it) => {
    if (/^https?:\/\//.test(it.image)) cdn++;
    else local++;
  });
  s.assert.equal(local, 2, '只有默认两张用包内路径，实际 ' + local);
  s.assert.equal(cdn, skins.LOCAL_SKINS.length - 2, '其余都应走 CDN');

  // 随机抽查几条：能拿到 CDN 完整地址
  s.assert.ok(/^https?:\/\/.+\.png$/.test(skins.getWarriorSkin('skin-bronze-warrior').image));
  s.assert.ok(/^https?:\/\/.+\.png$/.test(skins.getMonsterSkin('monster_03').image));
});
