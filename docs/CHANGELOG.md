# 变更日志（CHANGELOG）

> 记录项目迭代过程中的关键修复与功能进展，便于回顾与追溯。
> 关联文档：`README.md`、`.codeartsdoer/specs/`。

---

## 2026-09-06

### 修复：小程序 UI 布局溢出与底部安全区适配

**现象**：游戏画面最下方内容超出界面、选项按钮被推出屏幕；全面屏底部内容被 Home 指示条遮挡。

**根因**：
1. 游戏页 Canvas 使用固定 `px`（`390px × 500px`），不随屏宽缩放，小屏机型超宽超高；
2. 游戏页 `disableScroll: true`，内容超出后无法滚动，底部按钮不可见；
3. 渲染坐标系（390×500）与画布 CSS 尺寸未做等比缩放，画面会拉伸/留白；
4. 各页面缺少底部安全区（`env(safe-area-inset-bottom)`）适配。

**改动**（commit `34e2344`）：
- `miniprogram/pages/game/game.wxss`：Canvas 改为响应式（`width: 100%; height: 900rpx`，保持 390:500 比例）；页面底部加安全区 padding。
- `miniprogram/pages/game/game.json`：移除 `disableScroll`，内容超屏时可滚动兜底。
- `miniprogram/pages/game/game.js`：`onReady` 增加 `ctx.scale(dpr * scale)` 等比缩放，让 390×500 渲染坐标系精确填充响应式画布。
- `miniprogram/app.wxss`：`page` 全局加底部安全区 padding。
- `miniprogram/pages/level/level.wxss`、`miniprogram/pages/index/index.wxss`：页面底部加安全区 padding。

### 修复：`x-wx-source` 前后端取值不一致导致的接口批量 1003 拒绝

**现象**：控制台反复出现「未取得 openid，请求不携带 x-wx-openid 头」warning，用户维度接口（成绩/昵称/形象/排行/错题/签到/成就）被后端拒绝。

**根因**：
1. 前端 `request.js` 的 `SOURCE_HEADER = 'miniprogram'`，与后端 `middlewares/openid.js` 可信白名单（默认 `weixin,wechat`）不一致，所有非健康检查请求被后端以 `code=1003「不受信任的请求来源」`拒绝；
2. 「无 openid」在云托管方案下属正常降级（openid 由微信网关自动注入），却被当成 warning 反复打印。

**改动**（commit `40f475b`，文件 `miniprogram/utils/request.js`）：
- `SOURCE_HEADER` 由 `miniprogram` → `weixin`，对齐后端白名单。
- 仅在「已取得 openid」时才附带 `x-wx-source` + `x-wx-openid`；无 openid 时不带身份头，走后端「匿名放行」路径（业务返回 `code=1001` 由前端本地降级），而非被 `1003` 拒绝。
- 移除 openid 误报 warning 及 `_warnedNoOpenid` 防刷屏变量。

> 备注：若后端仍返回 `code=1001`（未识别用户），需检查云托管控制台是否开启「微信登录 / openid 注入」能力，属部署侧配置。

---

## 2026-09-06（同日 · M5 微信登录注册 + 游客限制）

规划与设计文档：`.codeartsdoer/specs/m5-login-guest/`（spec.md / design.md / tasks.md）
已确认决策：标准登录（wx.login + code2session + token）；手机号仅预留字段/接口；范围 P1~P4（P4 部分完成）。

### P1 登录闭环
- 后端：`models/user.js` 扩展 `token/phone`；新增 `routes/login.js`（code → code2session → findOrCreate → 签发 token，含 `dev_` 测试码降级）；`middlewares/openid.js` 支持 `Authorization: Bearer <token>`（优先于 x-wx-openid）；`routes/user.js` 新增 `/me` `/profile` `/logout`；`constants.js` 新增 4010/4011。
- 前端：新增 `utils/auth.js`（静默登录/登录态判定/登出/promptLogin）；`utils/storage.js` + `constants.js` 增 token/user 缓存；`utils/request.js` 自动附带 Bearer token；`app.js` onLaunch 静默登录（失败降级游客）。
- 配置：云托管需注入 `WX_APPID / WX_SECRET`（缺省时仅 `dev_` 测试码可登录，真实登录返回 `code=4011`）。

### P2 游客限制
- 未登录游客：首页「游客模式」登录条（微信登录入口）；关卡页仅第 1 关可玩，第 2+ 关锁定点击引导登录 + 游客横幅；形象/排行/错题/签到/成就入口未登录先引导登录（REQ-GUEST-1/2）。
- TODO：受限页自身 onLoad 直入守卫、结算页游客「登录保存成绩」提示。

### P3 资料完善 + 合规
- 昵称/头像登录后云端保存（POST /api/user/profile），本地镜像兜底（离线可保存）；首登 needProfile=true 自动引导设昵称；`isProfileComplete` 判定注册完成。
- 隐私协议：首页首次进入 modal 同意（`ww_agreed` 持久化，最小实现）；完整协议文本页 TODO（提审前补）。

### P4 增强（部分）
- 分享：index / level 页 `onShareAppMessage`；退出登录（nickname 页入口 → auth.logout()）。
- TODO：result/错题/形象/排行等页分享、星级云同步、受限页 URL 守卫。

> 部署注意：云托管环境变量需新增 `WX_APPID`、`WX_SECRET`（小程序 AppID 与 AppSecret），否则真实登录返回 `code=4011`。

