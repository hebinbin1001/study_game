// 结构性回归：app.json 页面完整性 / 玩法 tab 一致性 / 关键配置
const fs = require('fs');

let fail = 0;
function check(ok, label) {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + label);
  if (!ok) fail++;
}

// 1) app.json 可解析 + 页面四件套
const app = JSON.parse(fs.readFileSync('miniprogram/app.json', 'utf8'));
app.pages.forEach((p) => {
  const core = ['js', 'wxml', 'wxss'].every((e) => fs.existsSync(`miniprogram/${p}.${e}`));
  check(core, `页面 ${p} 三件套齐全`);
});
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

// 3) 玩法 tab：8 款，跳转 URL 存在，弹弹球为未解锁占位
const src = fs.readFileSync('miniprogram/pages/playlist/playlist.js', 'utf8');
const urls = [...src.matchAll(/url: '(\/pages\/[^']+)'/g)].map((m) => m[1]);
const missing = urls.filter((u) => !fs.existsSync(`miniprogram${u}.js`));
check(missing.length === 0, `玩法跳转 ${urls.length} 个 URL 均存在` + (missing.length ? ' 缺:' + missing : ''));
const unlocked = (src.match(/unlocked: true/g) || []).length;
check(unlocked >= 6, `已解锁玩法 ${unlocked} 款`);
const bounceUnlocked = /key: 'bounce',[^}]*unlocked: false/.test(src.replace(/\s+/g, ' '));
check(bounceUnlocked, '弹弹球为未解锁占位(维持现状)');
const bounceGoesToPage = src.includes("'/pages/bounce/bounce'");
check(!bounceGoesToPage || !/key: 'bounce'[^}]*url:/.test(src), '弹弹球无 url(不可进入)');

// 4) 每日一题 / checkin / 排行榜 / 自定义 关键页存在
['daily-question', 'checkin', 'rank', 'custom-levels', 'sudoku', 'match', 'link', 'snake', 'math24', 'g2048', 'agreement'].forEach((pg) => {
  check(fs.existsSync(`miniprogram/pages/${pg}/${pg}.js`), `关键页 pages/${pg} 存在`);
});

// 5) auth/app/index 关键改动痕迹（协议前置/无自动登录）
const authSrc = fs.readFileSync('miniprogram/utils/auth.js', 'utf8');
check(authSrc.includes('ensureAgreement'), 'auth.ensureAgreement 存在');
const appSrc = fs.readFileSync('miniprogram/app.js', 'utf8');
check(!appSrc.includes('loginSilently'), 'app.js 无自动静默登录(onLaunch)');
const idxSrc = fs.readFileSync('miniprogram/pages/index/index.js', 'utf8');
check(idxSrc.includes('_doLogin') && idxSrc.includes('ensureAgreement'), '首页登录走协议前置');

console.log(fail ? `\n=== ${fail} 项失败 ===` : '\n=== 全部通过 ===');
process.exit(fail ? 1 : 0);
