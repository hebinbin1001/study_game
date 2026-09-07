# 词力战士 M5 任务清单（P1~P4）

> 约定：`[x]` 完成；`[~]` 部分完成/有 TODO；`[ ]` 未做。验收要求标注在任务内。

## P1 登录闭环 ✅

- [x] T1.1 `server/models/user.js`：扩展 token / phone 字段
- [x] T1.2 `server/constants.js`：新增错误码 4010 / 4011
- [x] T1.3 `server/routes/login.js`（新）：POST /api/login —— code2session + findOrCreate + 签发 token（含 dev_ 测试码降级）
- [x] T1.4 `server/middlewares/openid.js`：支持 `Authorization: Bearer <token>` 解析（优先于 x-wx-openid）
- [x] T1.5 `server/routes/user.js`：新增 GET /api/user/me、POST /api/user/profile、POST /api/user/logout
- [x] T1.6 `server/index.js`：挂载 /api/login
- [x] T1.7 `miniprogram/utils/auth.js`（新）：loginSilently/isLoggedIn/logout/promptLogin/refreshMe
- [x] T1.8 `miniprogram/utils/storage.js` + `utils/constants.js`：token / user 缓存读写
- [x] T1.9 `miniprogram/utils/request.js`：自动附带 Authorization: Bearer token（无 token 时回退 openid 头）
- [x] T1.10 `miniprogram/app.js`：onLaunch 静默登录（失败降级游客）+ globalData.token/user

## P2 游客限制 ✅（页面级直入守卫为 TODO）

- [x] T2.1 `pages/index/*`：登录状态条（游客「微信登录」/已登录资料）+ 受限入口拦截
- [x] T2.2 `pages/level/*`：未登录仅第 1 关 unlocked + 游客横幅 + 点击引导登录
- [~] T2.3 受限入口拦截：入口（首页 go*）已拦截；**TODO：avatar/rank/wrong-book/checkin/achievement 页面自身 onLoad 守卫（防直接 URL 进入）**
- [ ] T2.4 `pages/result/*`：游客结算提示「登录保存成绩」—— **TODO（未做）**

## P3 资料完善 + 合规 ✅（协议为最小实现）

- [x] T3.1 `pages/nickname/*`：登录后可保存，走 POST /api/user/profile（昵称+头像），本地镜像兜底
- [x] T3.2 首次登录 needProfile=true → promptLogin 自动引导跳 nickname
- [~] T3.3 隐私协议：首页首次进入 modal 同意（ww_agreed 持久化）；**TODO：完整协议文本页（审核前补）**

## P4 增强（部分）

- [~] T4.1 页面分享 onShareAppMessage：已加 index/level；**TODO：result/错题/形象/排行等页**
- [ ] T4.2 星级进度登录后云同步 —— **TODO（最小实现可后续补：登录后把 ww_stars 合并上报）**
- [x] T4.3 退出登录：nickname 页入口 → auth.logout()

## 收尾

- [x] T5.1 单测通过（npm test 全绿，无回归）；e2e smoke 需后端 + dev_ 测试码验证（见下）
- [x] T5.2 更新 `docs/CHANGELOG.md`
- [ ] T5.3 提交推送 —— 待执行

> e2e 冒烟：`POST /api/login { code: "dev_login_smoke1" }` 应返回 token；携带 `Authorization: Bearer <token>` 调 `GET /api/user/me` 应返回资料（本地/云托管均可测，需 WX_SECRET 或 dev_ 码）。
