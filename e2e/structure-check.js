// 结构性回归：app.json 页面完整性 / 玩法 tab 一致性 / 关键配置
const fs = require('fs');

let fail = 0;
function check(ok, label) {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + label);
  if (!ok) fail++;
}

// 1) app.json 可解析 + 页面四件套（含 page.json，缺一不可）
//
// 为什么 page.json 也必须是硬要求（2026-09-12 真机踩坑）：
//   开启「组件按需注入」(lazyCodeLoading: requiredComponents) 后，框架靠编译产物里的
//   __wxAppCode__["<页面路径>.json"] 去找页面的 usingComponents；页面缺 json 时该条目
//   缺失，页面会被解析成 wx://not-found 占位 —— 表现就是真机点进去黑屏 / 进不去
//   （排行榜、错题本当年就是这么挂的），而开发者工具里因为注入时机不同看不出来。
const app = JSON.parse(fs.readFileSync('miniprogram/app.json', 'utf8'));
app.pages.forEach((p) => {
  const miss = ['js', 'wxml', 'wxss', 'json'].filter((e) => !fs.existsSync(`miniprogram/${p}.${e}`));
  check(miss.length === 0, `页面 ${p} 四件套齐全` + (miss.length ? `（缺 ${miss.join('/')}）` : ''));
});
check(app.lazyCodeLoading === 'requiredComponents',
  'app.json 已开启组件按需注入（lazyCodeLoading: requiredComponents）');
check(Array.isArray(app.pages) && app.pages.length >= 20, `页面总数 ${app.pages.length}`);
check(!!app.tabBar && app.tabBar.list.length === 4, 'tabBar 4 项');
const tabPaths = app.tabBar.list.map((t) => t.pagePath);
check(tabPaths.every((p) => app.pages.includes(p)), 'tabBar 页面均在 pages 中');
const iconOk = app.tabBar.list.every(
  (t) => fs.existsSync(`miniprogram/${t.iconPath}`) && fs.existsSync(`miniprogram/${t.selectedIconPath}`)
);
check(iconOk, 'tabBar 图标文件存在');

// 2) 组件文件（B5）
['game-hud', 'settle-pop'].forEach((c) => {
  const ok = ['js', 'json', 'wxml', 'wxss'].every((e) => fs.existsSync(`miniprogram/components/${c}/${c}.${e}`));
  check(ok, `组件 ${c} 四件套齐全`);
});

// 3) 玩法 tab：14 款（含华容道），跳转 URL 存在，弹弹球为未解锁占位
// 玩法目录已抽到 utils/game-catalog.js（2026-09-13）：清单断言看目录文件，
// 再单独校验玩法 tab 确实引用这份公共目录（防止两处又各写一份）。
const src = fs.readFileSync('miniprogram/utils/game-catalog.js', 'utf8');
const playlistSrc = fs.readFileSync('miniprogram/pages/playlist/playlist.js', 'utf8');
check(playlistSrc.indexOf('utils/game-catalog') >= 0, '玩法 tab 使用公共玩法目录（utils/game-catalog.js）');
const urls = [...src.matchAll(/url: '(\/pages\/[^']+)'/g)].map((m) => m[1]);
// 允许带 query（如 /pages/level/level?mode=link）：校验时只看路径部分
const missing = urls.filter((u) => !fs.existsSync(`miniprogram${u.split('?')[0]}.js`));
check(missing.length === 0, `玩法跳转 ${urls.length} 个 URL 均存在` + (missing.length ? ' 缺:' + missing : ''));
const unlocked = (src.match(/unlocked: true/g) || []).length;
check(unlocked >= 13, `已解锁玩法 ${unlocked} 款`);
check(/key: 'klotski'[^}]*puzzle-level\?mode=klotski/.test(src.replace(/\s+/g, ' ')),
  '玩法 tab 含华容道且指向 pages/klotski');
// 第三批 · 第 4 条 a：数字智力类统一「先关卡页、再进游戏」
const casualEntries = src.match(/section: 'casual'[^}]*url: '([^']+)'/g) || [];
check(casualEntries.length >= 8, '数字智力类至少 8 款有 url（实际 ' + casualEntries.length + '）');
check(casualEntries.every((e) => e.indexOf('url: \'/pages/puzzle-level/puzzle-level?mode=') >= 0),
  '数字智力类全部走关卡页 puzzle-level', casualEntries.length + ' 款');
const bounceUnlocked = /key: 'bounce',[^}]*unlocked: false/.test(src.replace(/\s+/g, ' '));
check(bounceUnlocked, '弹弹球为未解锁占位(维持现状)');
const bounceGoesToPage = src.includes("'/pages/bounce/bounce'");
check(!bounceGoesToPage || !/key: 'bounce'[^}]*url:/.test(src), '弹弹球无 url(不可进入)');

// 4) 每日一题 / checkin / 排行榜 / 自定义 关键页存在
['daily-question', 'checkin', 'rank', 'custom-levels', 'bank', 'sudoku', 'match', 'link', 'snake', 'math24', 'g2048', 'klotski', 'agreement'].forEach((pg) => {
  check(fs.existsSync(`miniprogram/pages/${pg}/${pg}.js`), `关键页 pages/${pg} 存在`);
});

// 5) auth/app/index 关键改动痕迹（协议前置/无自动登录）
const authSrc = fs.readFileSync('miniprogram/utils/auth.js', 'utf8');
check(authSrc.includes('ensureAgreement'), 'auth.ensureAgreement 存在');
const appSrc = fs.readFileSync('miniprogram/app.js', 'utf8');
check(!appSrc.includes('loginSilently'), 'app.js 无自动静默登录(onLaunch)');
const idxSrc = fs.readFileSync('miniprogram/pages/index/index.js', 'utf8');
check(idxSrc.includes('_doLogin') && idxSrc.includes('ensureAgreement'), '首页登录走协议前置');

// 6) 受限页门禁 + 结算页游客提示 + 关键页分享（M5 T2.3 / T2.4 / T4.1）
//
// 为什么要有这条护栏：这三项都是「不做也不会报错」的补齐型需求 ——
//   门禁漏了 = 分享链接能直接进排行榜/错题本（空列表或别人的数据）；
//   结算页漏了 = 游客打完一局不知道成绩没上云；
//   分享漏了 = 右上角转发不出去。静态断言把它们钉住，改页面时不会悄悄丢。
const GATED_PAGES = ['avatar', 'rank', 'wrong-book', 'checkin', 'achievement', 'bank'];
GATED_PAGES.forEach((pg) => {
  const js = fs.readFileSync(`miniprogram/pages/${pg}/${pg}.js`, 'utf8');
  const wxml = fs.readFileSync(`miniprogram/pages/${pg}/${pg}.wxml`, 'utf8');
  check(js.includes('auth.requireLogin'), `受限页 pages/${pg} 已接门禁（auth.requireLogin）`);
  check(wxml.includes('class="gate-bar"') && wxml.includes('bindtap="onGateLogin"'),
    `受限页 pages/${pg} 有登录引导条 + 「去登录」按钮`);
});
const resultJs = fs.readFileSync('miniprogram/pages/result/result.js', 'utf8');
const resultWxml = fs.readFileSync('miniprogram/pages/result/result.wxml', 'utf8');
check(resultWxml.includes('class="gate-bar"') && resultJs.includes('onLoginTap'),
  '结算页有游客「登录保存成绩」提示条（M5 T2.4）');
const appWxssSrc = fs.readFileSync('miniprogram/app.wxss', 'utf8');
check(appWxssSrc.includes('.gate-bar'), '门禁引导条样式统一在 app.wxss（6 页共用一份）');

// 分享：关键页必须能转发（M5 T4.1）
['result', 'game', 'me', 'rank', 'rank-info', 'achievement', 'wrong-book', 'avatar', 'checkin', 'bank'].forEach((pg) => {
  const js = fs.readFileSync(`miniprogram/pages/${pg}/${pg}.js`, 'utf8');
  check(js.includes('onShareAppMessage'), `pages/${pg} 支持分享（onShareAppMessage）`);
});

// 7) 微信名采集（2026-09-18 用户反馈「管理员拿不到微信昵称」）
//
// 约束：微信从 2022 年起不允许静默读取昵称，唯一合规通道是「昵称填写」组件
// （<input type="nickname">，用户点「使用微信昵称」时才有值）。
// 踩过的坑：原来保存时把**游戏昵称**同时当微信名存（wxNickname: nick），
// 用户一旦改成自定义昵称，管理员就永远看不到微信名了 —— 所以微信名必须是独立字段。
const nickWxml = fs.readFileSync('miniprogram/pages/nickname/nickname.wxml', 'utf8');
const nickJs = fs.readFileSync('miniprogram/pages/nickname/nickname.js', 'utf8');
check(nickWxml.includes('bindinput="onWxNicknameInput"'), '昵称页有独立的微信名输入（昵称填写组件）');
check(nickJs.includes('wxNickname: wxNick'),
  '保存时微信名取独立字段（不能再用游戏昵称 wxNickname: nick 覆盖）');
check(!/wxNickname:\s*nick\b/.test(nickJs),
  '回归护栏：微信名不得再被游戏昵称直接赋值');
const userRouteSrc = fs.readFileSync('server/routes/user.js', 'utf8');
check(userRouteSrc.includes('/wx-nickname'), '后端提供「取本人微信名」接口（昵称页回填用）');

console.log(fail ? `\n=== ${fail} 项失败 ===` : '\n=== 全部通过 ===');
process.exit(fail ? 1 : 0);
