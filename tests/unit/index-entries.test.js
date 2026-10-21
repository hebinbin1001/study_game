/**
 * index-entries.test.js —— 首页入口兼容护栏（UI 重做一期 · 2026-10-17）
 *
 * 为什么需要：首页从「入口大厅」改成「战士舞台」后，主题区（立绘 / 收集条 / Boss 预告 /
 * 出战按钮）占掉了大半首屏，功能入口整体下沉。漏掉一个入口，页面**不会报错**——
 * 只是玩家少了一条路，开发者工具里完全看不出来。所以把入口写成清单钉住。
 *
 * 守三条：
 *   ① 清单里的入口方法必须仍绑在 index.wxml 上（bindtap / catchtap）；
 *   ② 每个入口方法必须在 index.js 里真实定义（防方法名拼错 → 点了没反应）；
 *   ③ index.js 里出现的所有 /pages/xxx 跳转路径必须已在 app.json 注册（防 404）。
 *
 * 维护：以后新增入口，往 ENTRIES 里加一行即可；删除入口会立刻红，逼着人确认是不是
 * 真的不要了（而不是重做布局时顺手丢了）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');

const ROOT = path.join(__dirname, '..', '..');
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); };

const wxml = read('miniprogram/pages/index/index.wxml');
const js = read('miniprogram/pages/index/index.js');
const appJson = JSON.parse(read('miniprogram/app.json'));

// 2026-10-17 重做前的首页入口基线（一个都不能少），加号后为重做新增
const ENTRIES = [
  { method: 'toggleSound',      desc: '声音开关（原 Header 喇叭）' },
  { method: 'onProfileTap',     desc: '头像/登录（原 Hero 头像 + 游客条）' },
  { method: 'goAgreement',      desc: '协议全文（游客条下方）' },
  { method: 'goRankInfo',       desc: '段位详情（原资产条「段位」格）' },
  { method: 'goRank',           desc: '排行榜（原排行榜行）' },
  { method: 'goDaily',          desc: '每日一题 / 签到（原每日一题行）' },
  { method: 'goContinue',       desc: '继续挑战（原大卡 → 出战按钮）' },
  { method: 'goLevel',          desc: '换关卡 / Boss 预告卡' },
  { method: 'goDailyChallenge', desc: '每日挑战（三件套）' },
  { method: 'goSeason',         desc: '赛季（三件套）' },
  { method: 'goPk',             desc: '好友 PK（三件套）' },
  { method: 'goReco',           desc: '推荐玩法（两张卡）' },
  // —— 重做新增 ——
  { method: 'goAvatarSkin',     desc: '战士立绘 / 皮肤行 → 皮肤图鉴' },
  // —— 2026-10-18 二期：四宫格第四格 ——
  // —— 2026-10-18 全局年级：HUD 最左胶囊 ——
  { method: 'openGradePicker',  desc: '年级胶囊 → 全局年级选择器' }
];

const s = suite('首页入口兼容（UI 重做一期）');

s.test('入口方法全部仍绑定在首页 wxml 上（bindtap / catchtap）', function () {
  const missing = [];
  ENTRIES.forEach(function (e) {
    const re = new RegExp('(bindtap|catchtap)="' + e.method + '"');
    if (!re.test(wxml)) missing.push(e.method + '（' + e.desc + '）');
  });
  s.assert.deepEqual(missing, [], '首页丢了这些入口：' + missing.join('；'));
});

s.test('每个入口方法都在 index.js 里真实定义（方法名拼错 = 点了没反应）', function () {
  const missing = [];
  ENTRIES.forEach(function (e) {
    const re = new RegExp('\\n\\s*' + e.method + '\\s*:\\s*function');
    if (!re.test(js)) missing.push(e.method);
  });
  s.assert.deepEqual(missing, [], 'index.js 缺少方法定义：' + missing.join(', '));
});

s.test('index.js 里所有 /pages/xxx 跳转目标都已在 app.json 注册', function () {
  const declared = new Set(appJson.pages);
  const re = /\/pages\/[a-z0-9\-]+\/[a-z0-9\-]+/g;
  const bad = [];
  let m;
  while ((m = re.exec(js))) {
    const p = m[0].slice(1);       // 去掉前导 /
    if (!declared.has(p) && bad.indexOf(p) < 0) bad.push(p);
  }
  s.assert.deepEqual(bad, [], '跳转到未注册页面（会 404）：' + bad.join(', '));
});

s.test('主题区结构仍在（立绘 / 等级进度 / 皮肤一行 / 下一战），别被后续改动删掉', function () {
  ['w-stage', 'lv-inline', 'skin-line', 'battle', 'boss-pill', 'battle-row'].forEach(function (cls) {
    s.assert.ok(wxml.indexOf(cls) !== -1, '首页缺少主题模块：' + cls);
  });
});

s.test('主题区不吞掉功能入口：每个 tab 之外的重点页面至少有一条首页入口', function () {
  // 「玩家高频到达的页面」清单 —— 必须能从首页一步进（或 tab 一步进）
  const mustFromHome = ['rank', 'rank-info', 'daily-question', 'daily-challenge', 'season', 'pk', 'level'];
  const homeSources = js + wxml;
  mustFromHome.forEach(function (key) {
    s.assert.ok(homeSources.indexOf('/pages/' + key + '/') !== -1,
      '首页没有通往 pages/' + key + ' 的入口');
  });
});

// ============ 其余三个 tab + 关卡页的入口清单（2026-10-17 布局调整后新增） ============
// 布局收敛会动筛选层级与菜单分组，最容易出的问题是「入口没了但页面不报错」。
// 这里把每个页面的入口写成清单，删一个就红。
const PAGES = [
  {
    name: '玩法页',
    dir: 'playlist',
    entries: ['openGradePicker', 'pickSection', 'pickCat', 'onGameTap']
  },
  {
    name: '关卡页',
    dir: 'level',
    // 2026-10-18：pickType 随「玩法/题型切换条」一起删除（玩法已在玩法 tab 选过）
    entries: ['openGradePicker', 'tapContinue', 'onLevelTap', 'claimChest', 'guestLogin', 'goCustomLevel']
  },
  {
    name: '学习页',
    dir: 'study',
    entries: ['goReport', 'goWrongBook', 'goDaily', 'goCheckin', 'goBank', 'goCustom']
  },
  {
    name: '我的页',
    dir: 'me',
    entries: ['onProfileTap', 'goRankInfo', 'onMenuTap', 'goAgreement', 'onVersionTap', 'goLogout', 'goDeleteAccount']
  }
];

PAGES.forEach(function (p) {
  s.test(p.name + '：入口仍绑定在 wxml 上，且方法在 js 里真实定义', function () {
    const w = read('miniprogram/pages/' + p.dir + '/' + p.dir + '.wxml');
    const j = read('miniprogram/pages/' + p.dir + '/' + p.dir + '.js');
    const missBind = [];
    const missDef = [];
    p.entries.forEach(function (m) {
      if (!new RegExp('(bindtap|catchtap)="' + m + '"').test(w)) missBind.push(m);
      if (!new RegExp('\\n\\s*' + m + '\\s*:\\s*function').test(j)) missDef.push(m);
    });
    s.assert.deepEqual(missBind, [], p.name + ' 丢了这些入口绑定：' + missBind.join(', '));
    s.assert.deepEqual(missDef, [], p.name + ' 缺少方法定义：' + missDef.join(', '));
  });
});

s.test('关卡页保留 Boss 主题与继续入口所需的字段渲染', function () {
  const w = read('miniprogram/pages/level/level.wxml');
  ['continue-bar', 'lvrow', 'lv-boss', 'chest-chip'].forEach(function (cls) {
    s.assert.ok(w.indexOf(cls) !== -1, '关卡页缺少模块：' + cls);
  });
});

s.test('我的页菜单仍有分组容器（分组丢了会退回 9 行平铺）', function () {
  const w = read('miniprogram/pages/me/me.wxml');
  s.assert.ok(w.indexOf('menuGroups') !== -1, '我的页菜单未按 menuGroups 渲染');
  s.assert.ok(w.indexOf('menu-group-title') !== -1, '我的页缺少分组标题');
});

// ============ 玩法页外壳护栏（2026-10-17） ============
// 这一批改的是「每个玩法页的头部」：删掉与原生导航栏重复的页内返回/标题，
// 并把战士徽章从 fixed 悬浮改成 HUD 行内。两条都容易被后续改动加回去，钉住。
const PLAY_PAGES = ['match', 'link', 'snake', 'math24', 'sudoku', 'g2048', 'klotski', 'bounce', 'quiz'];
const BADGE_PAGES = PLAY_PAGES.concat(['word-build', 'idiom-build', 'math-sprint', 'math-balance', 'memory-grid', 'one-stroke']);

s.test('玩法页不再有页内「返回 + 标题」（原生导航栏已提供，重复会白吃一屏）', function () {
  const bad = [];
  PLAY_PAGES.forEach(function (d) {
    const w = read('miniprogram/pages/' + d + '/' + d + '.wxml');
    // 注意：btn-back 类名也被「关卡列表」这类页内跳转复用（数独），
    // 所以这里只看文案是不是真的「返回」。
    const re = /class="btn-back"[^>]*>([^<]*)</g;
    let m;
    while ((m = re.exec(w))) {
      if ((m[1] || '').indexOf('返回') !== -1) bad.push(d + '(btn-back 返回)');
    }
    if (w.indexOf('class="g-title"') !== -1) bad.push(d + '(g-title)');
    if (w.indexOf('class="k-title"') !== -1) bad.push(d + '(k-title)');
    if (w.indexOf('class="bn-title"') !== -1) bad.push(d + '(bn-title)');
  });
  s.assert.deepEqual(bad, [], '仍有重复头部：' + bad.join(', '));
});

s.test('战士徽章不再用 fixed 悬浮（会压住 HUD / 题目卡）', function () {
  const bad = [];
  BADGE_PAGES.forEach(function (d) {
    const w = read('miniprogram/pages/' + d + '/' + d + '.wxml');
    if (/warrior-badge[^>]*fixed=/.test(w)) bad.push(d);
  });
  s.assert.deepEqual(bad, [], '这些页仍用 fixed 徽章：' + bad.join(', '));
});

// ============ 入口收敛：主线只从首页进（2026-10-18） ============
// 规则（用户拍板）：主线只能从首页进入；玩法页进去的都是自由玩。
// 落地方式：关卡页不再提供「主线 / 自由练」横跳，视图由入口的 ?mode= 决定。
s.test('关卡页不再提供「主线 / 自由练」横跳，也不再有「想自由玩」入口', function () {
  const w = read('miniprogram/pages/level/level.wxml');
  const js = read('miniprogram/pages/level/level.js');
  s.assert.ok(w.indexOf('view-seg') === -1, '关卡页仍有分段容器 view-seg');
  s.assert.ok(w.indexOf('pickView') === -1, '关卡页仍有分段切换 pickView');
  s.assert.ok(js.indexOf('pickView') === -1, 'level.js 仍保留 pickView 死方法');
  s.assert.ok(w.indexOf('goFreePlay') === -1, '关卡页仍有「想自由玩」入口');
  s.assert.ok(w.indexOf('free-entry') === -1, '关卡页仍渲染自由玩卡片');
});

s.test('主线入口唯一：除首页外，跳关卡页必须带 ?mode=（否则会落到主线）', function () {
  ['pages/playlist/playlist.js', 'utils/game-catalog.js'].forEach(function (f) {
    const src = read('miniprogram/' + f);
    const bad = src.match(/\/pages\/level\/level(?!\?mode=)/g) || [];
    s.assert.equal(bad.length, 0, f + ' 存在无 mode 的关卡页跳转（会进入主线）');
  });
});

// ============ 年级收敛：全局设置（2026-10-18） ============
// 年级从「关卡页 14 tab / 玩法页 chips / 词库页 tab」各选一次，收敛成一个全局设置：
// 只在「我的 → 当前年级」和页面里的年级文字处用同一个 grade-picker 修改。
s.test('年级收敛：五个页面都接同一套 grade-picker，且不再有页面级年级 tab', function () {
  ['level', 'playlist', 'bank', 'me', 'index'].forEach(function (d) {
    const w = read('miniprogram/pages/' + d + '/' + d + '.wxml');
    s.assert.ok(w.indexOf('grade-picker') !== -1, d + ' 未接入 grade-picker');
  });
  ['level', 'playlist', 'bank'].forEach(function (d) {
    const w = read('miniprogram/pages/' + d + '/' + d + '.wxml');
    s.assert.ok(w.indexOf('grade-tabs') === -1, d + ' 仍有 grade-tabs 年级表');
    s.assert.ok(w.indexOf('pg-grades') === -1, d + ' 仍有 pg-grades 年级 chips');
  });
});

// ============ 关卡页去掉「二次选玩法」（2026-10-18） ============
// 玩法在玩法 tab 已经选过一次；带 ?mode= 进来的关卡页不该再列 7 条玩法线。
s.test('关卡页不再有玩法/题型切换条（避免二次选玩法）', function () {
  const w = read('miniprogram/pages/level/level.wxml');
  const js = read('miniprogram/pages/level/level.js');
  s.assert.ok(w.indexOf('type-tabs') === -1, '关卡页仍有 type-tabs 切换条');
  s.assert.ok(w.indexOf('bindtap="pickType"') === -1, '关卡页 wxml 仍绑 pickType');
  s.assert.ok(js.indexOf('pickType: function') === -1, 'level.js 仍保留 pickType 死方法');
  s.assert.ok(js.indexOf('freeGroups') === -1, 'level.js 仍构建 freeGroups');
});

s.test('关卡页顶部按入口显示视图名（主线 / 玩法名 · 30 关）', function () {
  const js = read('miniprogram/pages/level/level.js');
  const w = read('miniprogram/pages/level/level.wxml');
  s.assert.ok(js.indexOf('viewLabel') !== -1, '缺少 viewLabel');
  s.assert.ok(w.indexOf('{{viewLabel}}') !== -1, '顶部没有渲染 viewLabel');
  s.assert.ok(js.indexOf("'主线 30 关'") !== -1, '主线视图文案缺失');
});

// ============ 主页去掉「全部玩法」重复入口（2026-10-18） ============
// 底部 tabBar 已有「玩法」，主页再放一格「全部玩法」只是 switchTab，纯重复。
s.test('主页不再有「全部玩法」入口（tabBar 已有玩法）', function () {
  const w = read('miniprogram/pages/index/index.wxml');
  const js = read('miniprogram/pages/index/index.js');
  s.assert.ok(w.indexOf('bindtap="goPlaylist"') === -1, '主页仍绑定 goPlaylist');
  s.assert.ok(w.indexOf('全部玩法</view>') === -1, '主页仍渲染「全部玩法」卡片');
  s.assert.ok(js.indexOf('goPlaylist: function') === -1, 'index.js 仍保留 goPlaylist 死方法');
});

s.test('主页入口格仍保留排行榜 / 赛季 / 好友 PK 三项', function () {
  const w = read('miniprogram/pages/index/index.wxml');
  ['goRank', 'goSeason', 'goPk'].forEach(function (m) {
    s.assert.ok(w.indexOf('bindtap="' + m + '"') !== -1, '缺少入口 ' + m);
  });
});

s.done();
