/**
 * avatar-skin-equip.test.js —— 「换皮肤 → 首页跟着变」的回归护栏
 *
 * 为什么需要（2026-10-19 用户报的真实 bug）：
 *   形象页 useAvatar 原来按 id 前缀分支（warrior_ / monster_），
 *   而美术到货后新增的 15 套战士叫 `skin-*`、8 套 Boss 叫 `boss_*` ——
 *   两个分支都进不去，**本地存储根本没写**，返回首页时首页读到的还是旧皮肤，
 *   表现就是「换了新皮肤，主页没跟着刷新」。
 *
 * 这里把三层钉住：
 *   ① skins.kindOf 对**清单里每一套**皮肤的判定都与清单 type 一致（新增皮肤自动覆盖）；
 *   ② 形象页「使用」能把 `skin-*` / `boss_*` 写进本地存储（前缀不再参与判定）；
 *   ③ 首页 _heroData 读装备皮肤出立绘；某张图加载失败后，换皮肤要能重新出图
 *      （否则一张图挂了 = 之后所有皮肤都被锁在 emoji，看起来同样像「没刷新」）。
 *
 * 运行：node tests/unit/avatar-skin-equip.test.js
 */

'use strict';

const { suite } = require('./_runner');
const fs = require('fs');
const path = require('path');

const s = suite('换皮肤 → 首页刷新（回归）');
const ROOT = path.join(__dirname, '../..');

const skins = require(path.join(ROOT, 'miniprogram/utils/skins'));
const storage = require(path.join(ROOT, 'miniprogram/utils/storage'));
const constants = require(path.join(ROOT, 'miniprogram/utils/constants'));

// —— 最小 wx 桩：只提供被调用到的 API（storage 会因缺 getStorageSync 走内存兜底） ——
const toasts = [];
global.wx = {
  showToast: function (o) { toasts.push((o && o.title) || ''); },
  showModal: function () {},
  navigateBack: function () {}
};

/** 按 'a.b' / 'a[0].c' 路径写值（setData 桩用） */
function setByPath(obj, key, val) {
  const parts = String(key).replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === undefined || cur[p] === null) cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = val;
}

/**
 * 加载一个 Page 模块并造出「实例」：拷 data + 方法，setData 直接写进 data。
 * 微信里 Page() 的配置会挂到页面实例上，这里用同样语义近似。
 */
function loadPage(relPath) {
  const abs = path.join(ROOT, relPath);
  delete require.cache[require.resolve(abs)];
  let cfg = null;
  const prev = global.Page;
  global.Page = function (o) { cfg = o; };
  require(abs);
  global.Page = prev;
  if (!cfg) throw new Error('模块没有调用 Page()：' + relPath);

  const inst = Object.assign({}, cfg);
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
  inst.setData = function (patch) {
    Object.keys(patch || {}).forEach(function (k) { setByPath(inst.data, k, patch[k]); });
  };
  return inst;
}

// ============ ① 类型判定：清单里每一套都要认对 ============

s.test('kindOf：清单里每一套皮肤的判定都与清单 type 一致', () => {
  let warriors = 0;
  let monsters = 0;
  skins.LOCAL_SKINS.forEach((item) => {
    s.assert.equal(skins.kindOf(item.avatarId), item.type,
      '皮肤 ' + item.avatarId + '（' + item.name + '）类型判定错了：清单写 ' + item.type);
    if (item.type === 'warrior') warriors++; else monsters++;
  });
  // 清单本身要有两类，避免断言在空数组上「全过」
  s.assert.ok(warriors >= 20 && monsters >= 10, '清单规模异常：战士 ' + warriors + ' / 怪兽 ' + monsters);
});

s.test('kindOf：新前缀（skin-* / boss_*）不再漏判', () => {
  s.assert.equal(skins.kindOf('skin-fox-scout'), 'warrior');
  s.assert.equal(skins.kindOf('skin-page-soldier'), 'warrior');
  s.assert.equal(skins.kindOf('boss_mallow_king'), 'monster');
  s.assert.equal(skins.kindOf('boss_dark_sage'), 'monster');
  // 老 id 仍按原样
  s.assert.equal(skins.kindOf('warrior_02'), 'warrior');
  s.assert.equal(skins.kindOf('milestone_30'), 'warrior');
  s.assert.equal(skins.kindOf('monster_03'), 'monster');
  // 认不出的一律空串（调用方据此提示，而不是静默吞掉）
  s.assert.equal(skins.kindOf(''), '');
  s.assert.equal(skins.kindOf('unknown_skin'), '');
  s.assert.equal(skins.kindOf(null), '');
});

s.test('getWarriorSkin：新皮肤不再静默回退成默认战士', () => {
  const fox = skins.getWarriorSkin('skin-fox-scout');
  s.assert.equal(fox.id, 'skin-fox-scout');
  s.assert.ok(!!fox.image, '应该带出图片地址');
  // 怪兽 id 传进战士接口仍要回退默认战士（不串类）
  s.assert.equal(skins.getWarriorSkin('boss_mallow_king').id, 'warrior_01');
  // 新 Boss 传进怪兽接口要拿到自己，不是默认小怪兽
  s.assert.equal(skins.getMonsterSkin('boss_mallow_king').id, 'boss_mallow_king');
});

// ============ ② 形象页「使用」要写本地存储 ============

s.test('形象页 useAvatar：新战士皮肤（skin-*）写进 ww_warrior_skin', () => {
  storage.setWarriorSkin('');
  const page = loadPage('miniprogram/pages/avatar/avatar.js');
  page.useAvatar({ currentTarget: { dataset: { avatarId: 'skin-fox-scout' } } });
  s.assert.equal(storage.get(constants.STORAGE_KEYS.warriorSkin), 'skin-fox-scout',
    '使用 skin-* 皮肤没写本地存储 → 首页读不到，就是用户报的「没刷新」');
  s.assert.equal(page.data.currentWarrior, 'skin-fox-scout', '页面内的「使用中」标记也要跟着走');
});

s.test('形象页 useAvatar：新 Boss（boss_*）写进 ww_boss_skin', () => {
  storage.setBossSkin('');
  const page = loadPage('miniprogram/pages/avatar/avatar.js');
  page.useAvatar({ currentTarget: { dataset: { avatarId: 'boss_mallow_king' } } });
  s.assert.equal(storage.get(constants.STORAGE_KEYS.bossSkin), 'boss_mallow_king',
    '使用 boss_* 皮肤没写本地存储');
  s.assert.equal(page.data.currentMonster, 'boss_mallow_king');
});

s.test('形象页 useAvatar：认不出的 id 要提示，不能假装成功', () => {
  const page = loadPage('miniprogram/pages/avatar/avatar.js');
  toasts.length = 0;
  page.useAvatar({ currentTarget: { dataset: { avatarId: 'unknown_skin' } } });
  s.assert.ok(toasts.indexOf('该形象暂不可用') >= 0, '认不出的 id 应提示「该形象暂不可用」');
});

s.test('形象页源码：不允许再自己按前缀判类型（否则新前缀又漏）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/avatar/avatar.js'), 'utf8');
  s.assert.ok(src.indexOf("indexOf('warrior_')") === -1,
    'avatar 页又出现按 warrior_ 前缀判断的代码 —— 请改用 skins.kindOf()');
  s.assert.ok(src.indexOf("indexOf('monster_')") === -1,
    'avatar 页又出现按 monster_ 前缀判断的代码 —— 请改用 skins.kindOf()');
  s.assert.contains(src, 'skins.kindOf', 'avatar 页应通过 skins.kindOf 判定皮肤类型');
});

// ============ ③ 首页读装备皮肤 + 加载失败标记跟着 URL 走 ============

s.test('首页 _heroData：装备新皮肤后立绘/名称跟着换', () => {
  storage.setWarriorSkin('skin-fox-scout');
  const page = loadPage('miniprogram/pages/index/index.js');
  const d = page._heroData(0, 0);
  const expect = skins.getWarriorSkin('skin-fox-scout');
  s.assert.equal(d.warriorName, '狐狸侦察兵', '首页显示的皮肤名没跟着换');
  s.assert.equal(d.warriorImg, expect.image, '首页立绘没跟着换');
  s.assert.equal(d.warriorEmoji, expect.emoji);
  s.assert.false(d.warriorImgErr, '首次进首页不该预先标记加载失败');

  // 再换一套 → 必须继续跟着换（不能记住上一套）
  storage.setWarriorSkin('skin-lion-cub');
  const d2 = page._heroData(0, 0);
  s.assert.equal(d2.warriorName, '小狮子学徒');
  s.assert.equal(d2.warriorImg, skins.getWarriorSkin('skin-lion-cub').image);
});

s.test('首页：某张图加载失败后，换皮肤要能重新出图（失败标记按 URL 记）', () => {
  storage.setWarriorSkin('skin-owl-sage');
  const page = loadPage('miniprogram/pages/index/index.js');
  const first = page._heroData(0, 0);
  s.assert.false(first.warriorImgErr);

  // 模拟这张 404：立绘加载失败
  page.data.warriorImg = first.warriorImg;
  page.onWarriorImgError();
  s.assert.true(page.data.warriorImgErr, '加载失败后应回退 emoji');
  s.assert.true(page._heroData(0, 0).warriorImgErr, '同一张图重算仍是失败态（不闪图）');

  // 换成另一套皮肤 → 新图没失败过，必须重新展示立绘
  storage.setWarriorSkin('skin-wolf-ranger');
  const after = page._heroData(0, 0);
  s.assert.equal(after.warriorImg, skins.getWarriorSkin('skin-wolf-ranger').image);
  s.assert.false(after.warriorImgErr,
    '换皮肤后仍被上一张的失败标记钉在 emoji 上（第二个「没刷新」的坑）');
});

s.test('首页：收集条第一格必须是身上这套（云端解锁的也算）', () => {
  // 狼牙游侠本地要 330⭐，这里星星给 0 —— 本地判定是「未解锁」，
  // 但玩家既然穿着它（云端发放/已解锁过），第一格就不该退回布衣学徒。
  storage.setWarriorSkin('skin-wolf-ranger');
  const page = loadPage('miniprogram/pages/index/index.js');
  const d = page._heroData(0, 0);
  s.assert.ok(d.skinCells.length > 0, '收集条不该是空的');
  s.assert.equal(d.skinCells[0].id, 'skin-wolf-ranger', '收集条第一格与立绘不一致');
  s.assert.false(d.skinCells[0].locked, '身上这套不该标成未解锁');
  s.assert.equal(d.warriorName, '狼牙游侠');
});

s.test('首页 refresh：Boss 立绘失败标记同样按 URL 记', () => {
  const page = loadPage('miniprogram/pages/index/index.js');
  page._imgErr = {};
  page.data.bossImg = 'https://cdn.example.com/nope.png';
  page.onBossImgError();
  s.assert.true(!!page._imgErr['https://cdn.example.com/nope.png'], '应记录这个 URL 失败');
});

s.test('皮肤页提供战士 / Boss 双页签，切换后只展示对应列表', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/avatar/avatar.wxml'), 'utf8');
  s.assert.contains(wxml, 'data-tab="warrior"');
  s.assert.contains(wxml, 'data-tab="monster"');
  s.assert.contains(wxml, "activeTab === 'warrior'");
  s.assert.contains(wxml, "activeTab === 'monster'");
  const page = loadPage('miniprogram/pages/avatar/avatar.js');
  page.switchSkinTab({ currentTarget: { dataset: { tab: 'monster' } } });
  s.assert.equal(page.data.activeTab, 'monster');
});

s.done();
