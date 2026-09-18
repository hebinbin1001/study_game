/**
 * skins-trim.test.js —— 对局立绘「不许留大块透明边」（2026-09-19）
 *
 * 背景：用户两次反馈「字母射击的战士和 boss 太小」。量了素材才发现根因不在布局：
 *   战士图（skin-*.png）角色只占画布 40%×65% —— 一大圈透明边，显示框再大也白搭。
 * 处理：e2e/trim-skins.py 按 alpha 包围盒裁边（原图备份在 assets-src/skins-orig/）。
 *
 * 这条护栏守的是「别再换成没裁边的素材」：裁边后的图会明显变小/变窄 ——
 *   战士从 192×192 变成约 70~96 × 112~161；怪物本来就是满幅（340×195~235）。
 * 只要读 PNG 头（IHDR 宽高）就能判断，不必解码像素。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('对局立绘裁边');

const SKIN_DIR = path.resolve(__dirname, '../../miniprogram/assets/skins');

/** 读 PNG 的宽高（IHDR 固定在第 16~24 字节） */
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const files = fs.readdirSync(SKIN_DIR).filter((f) => f.endsWith('.png'));
const warriors = files.filter((f) => f.indexOf('skin-') === 0);
const monsters = files.filter((f) => f.indexOf('monster_') === 0);

s.test('素材齐全（战士 >= 24 张、怪物 >= 4 张）', () => {
  s.assert.ok(warriors.length >= 24, '战士皮肤张数 = ' + warriors.length);
  s.assert.ok(monsters.length >= 4, '怪物皮肤张数 = ' + monsters.length);
});

s.test('战士立绘已裁边：宽度不超过 120px（未裁边时是 192px 满画布）', () => {
  warriors.forEach((f) => {
    const sz = pngSize(path.join(SKIN_DIR, f));
    s.assert.ok(sz, f + ' 应是合法 PNG');
    s.assert.ok(sz.w <= 120,
      f + ' 看起来没裁边（宽 ' + sz.w + 'px）——请跑 python e2e/trim-skins.py');
    s.assert.ok(sz.h <= 180, f + ' 高度异常：' + sz.h);
  });
});

s.test('怪物立绘是满幅横构图（宽 320~360、高 180~260）', () => {
  monsters.forEach((f) => {
    const sz = pngSize(path.join(SKIN_DIR, f));
    s.assert.ok(sz, f + ' 应是合法 PNG');
    s.assert.ok(sz.w >= 320 && sz.w <= 360, f + ' 宽度应在 320~360，实际 ' + sz.w);
    s.assert.ok(sz.h >= 180 && sz.h <= 260, f + ' 高度应在 180~260，实际 ' + sz.h);
  });
});
