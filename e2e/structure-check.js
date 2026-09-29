// 结构性回归：app.json 页面完整性 / 玩法 tab 一致性 / 关键配置
const fs = require('fs');
const path = require('path');

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

// 7) 微信名采集（2026-09-29 口径修正）
//
// 约束：微信从 2022 年起不允许静默读取昵称，唯一合规通道是「昵称填写」组件
// （<input type="nickname">，用户点「使用微信昵称」时才有值）。
// 玩家侧**不展示任何「微信名」字样**（用户要求）。
//
// ⚠️ 2026-09-29 修：旧实现是「昵称框有输入就先到先得记成微信名」，
// 结果绝大多数用户手打自定义昵称 → 把**游戏昵称**存成了微信名，管理端看到的是错的。
// 现在只认 `bindnicknamereview`（微信侧审完昵称）这一个信号，pass/timeout 时才采集。
const nickWxml = fs.readFileSync('miniprogram/pages/nickname/nickname.wxml', 'utf8');
const nickJs = fs.readFileSync('miniprogram/pages/nickname/nickname.js', 'utf8');
const meWxmlSrc = fs.readFileSync('miniprogram/pages/me/me.wxml', 'utf8');
check(nickWxml.indexOf('微信名') < 0, '玩家资料页不出现「微信名」字样（仅管理员侧可见）');
check(meWxmlSrc.indexOf('微信名') < 0, '「我的」页不出现「微信名」字样');
check(nickWxml.includes('bindnicknamereview="onNicknameReview"'),
  '昵称输入框接了微信昵称审核回调（唯一的采集时机）');
check(/d\.pass !== true && d\.timeout !== true/.test(nickJs),
  '只在 pass / timeout 时才把昵称记为微信名');
// 反向护栏：onNicknameInput 里不许再写 wxNickname（否则又会把游戏昵称当微信名）
const inputFn = nickJs.slice(nickJs.indexOf('onNicknameInput: function'),
  nickJs.indexOf('onNicknameReview: function'));
check(inputFn.indexOf('wxNickname') < 0,
  '回归护栏：昵称输入回调里不得写 wxNickname（避免把游戏昵称存成微信名）');
check(!/wxNickname:\s*nick\b/.test(nickJs),
  '回归护栏：微信名不得再被游戏昵称直接赋值');
const userRouteSrc = fs.readFileSync('server/routes/user.js', 'utf8');
check(userRouteSrc.includes('/wx-nickname'), '后端提供「取本人微信名」接口（昵称页回填用）');

// 7.5) 管理后台 + 采集引导（2026-09-29）：用户要求「管理员界面还缺少什么，一起做了」
//
// 这批能力很容易被后续改动悄悄改没（页面重构、字段改名、重构时顺手删一行），
// 用静态护栏钉住 —— 尤其是「昵称页的采集引导卡」：微信不允许静默读昵称，
// 那块卡是采集率的**全部**依赖，删掉采集率就归零。
const adminWxml = fs.readFileSync('miniprogram/pages/admin/admin.wxml', 'utf8');
const adminJs = fs.readFileSync('miniprogram/pages/admin/admin.js', 'utf8');
const adminRouteSrc = fs.readFileSync('server/routes/admin.js', 'utf8');
check(nickWxml.includes('wx-guide'), '昵称页有微信昵称采集引导卡（采集率全靠它）');
check(nickWxml.includes('使用微信昵称'), '引导卡点明「使用微信昵称」这个动作');
check(adminWxml.includes('sort-chip') && adminJs.includes('onSortTap'), '管理页有用户排序切换');
check(adminWxml.includes('u-avatar'), '管理页用户行有头像位（此前查了 avatar_url 却没返回）');
check(adminWxml.includes('wxCollectRate') && adminRouteSrc.includes('wxCollectRate'),
  '管理页展示微信名采集率（端上字段 ← 后端同名字段）');
check(adminWxml.includes('gameHeatTop') && adminRouteSrc.includes('gameHeat'),
  '管理页有玩法热度（后端聚合 → 端上条形）');
check(adminJs.includes('rel-time'), '管理页时间用相对文案（不是裸时间戳）');
check(adminRouteSrc.includes('admin-query') && adminRouteSrc.includes('searchOpenids'),
  '管理端搜索覆盖昵称 / 微信名 / openid');

// 8) WXML 表达式里不许调用方法（2026-09-29）
//
// 小程序的 `{{}}` 只支持简单运算，**不支持函数调用** —— 页面方法（`{{getRankEmoji(x)}}`）、
// 数组/字符串方法（`{{item.nums.join(' ')}}`、`{{item.date.slice(5)}}`）都会**静默渲染成空**，
// 不报错、不警告，只有肉眼或截图才看得出来。2026-09-29 一次抓到 3 处（排行榜排名徽章整列空白、
// 算 24 点关卡列表的数字组合空白、学习报告的日期空白）。
// 正确写法：在 JS 里算好字段，WXML 只做 `{{item.xxx}}` 绑定。
// 例外：项目没有用 WXS（wxs 模块调用在 WXML 里是合法的）；若将来引入 wxs，这条规则要放行对应写法。
(function checkWxmlNoMethodCall() {
  const bad = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); return; }
      if (!/\.wxml$/.test(e.name)) return;
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const m = /\{\{[^}]*[A-Za-z_$][\w$]*\s*\(/.exec(line);
        if (m) bad.push(p + ':' + (i + 1) + '  ' + m[0].trim());
      });
    });
  };
  walk('miniprogram');
  check(bad.length === 0,
    'WXML 的 {{}} 里不能调用方法（会静默渲染成空，需改成 JS 里算好再绑定）：\n      '
      + bad.slice(0, 6).join('\n      '));
})();

console.log(fail ? `\n=== ${fail} 项失败 ===` : '\n=== 全部通过 ===');
process.exit(fail ? 1 : 0);
