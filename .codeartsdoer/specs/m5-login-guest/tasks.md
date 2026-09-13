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

## P2 游客限制 ✅（2026-09-13：页面级直入守卫已补齐）

- [x] T2.1 `pages/index/*`：登录状态条（游客「微信登录」/已登录资料）+ 受限入口拦截
- [x] T2.2 `pages/level/*`：未登录仅第 1 关 unlocked + 游客横幅 + 点击引导登录
- [x] T2.3 受限入口拦截：入口（首页 go*）已拦截；**2026-09-13 补齐页面自身守卫** —— avatar / rank /
      wrong-book / checkin / achievement 五个页面 onShow/onLoad 调 `auth.requireLogin()`：
      未登录**不发请求**、页内展示门禁引导条，「去登录」走 `auth.loginFromGate()`，登录成功后自动补加载。
      为什么用页内引导条而不是进页面就 showModal：① 弹窗打断、取消后停在空列表上体验更差；
      ② 无登录态的页面渲染回归（verify-all-pages / verify-m2m4）会被弹窗挂住。
      实用工具在 `utils/auth.js`；样式 `app.wxss` 的 `.gate-bar`（6 页共用一份）；
      护栏：`e2e/structure-check.js` 第 6 节 + `tests/unit/auth-guard.test.js`（7 用例 / 25 断言）。
- [x] T2.4 `pages/result/*`：游客结算提示「登录保存成绩」—— 2026-09-13 落地：
      未登录时结算页顶部提示条 + 「登录保存」按钮，登录成功后把本局星星补同步进云端段位
      （游客态下 `rankSync` 原本被跳过，所以这条同时补上了"登录即入榜"）。

## P3 资料完善 + 合规 ✅（协议为最小实现）

- [x] T3.1 `pages/nickname/*`：登录后可保存，走 POST /api/user/profile（昵称+头像），本地镜像兜底
- [x] T3.2 首次登录 needProfile=true → promptLogin 自动引导跳 nickname
- [~] T3.3 隐私协议：首页首次进入 modal 同意（ww_agreed 持久化）；**TODO：完整协议文本页（审核前补）**
      —— 2026-09-13 复核：`pages/agreement/agreement.wxml` 已是**完整文本页**（用户协议 7 条 +
      隐私政策 7 条，含未成年人条款、注销与数据删除），首页/我的页都有入口。
      提审前仍建议补：开发者主体名称、联系方式（邮箱/客服）、数据删除的响应时限。

## P4 增强（部分）

- [x] T4.1 页面分享 onShareAppMessage：已加 index/level + 各玩法页；2026-09-13 补齐
      result / game / me / rank / rank-info / achievement / wrong-book / avatar / checkin
      （文案带各自数据，如结算页带星级与得分、签到页带连续天数）。
- [ ] T4.2 星级进度登录后云同步 —— **2026-09-13 复核后决定"先不做，等拍板口径"**：
      见 `docs/待办收尾与上线前清单.md` 第六节 —— 本地 ww_stars 是「每关历史最高星」的集合，
      云端 `rank_record.stars` 是**每次通关累加**的口径，两者语义不同；直接把本地总和覆盖上去
      会让段位跳变或回退（老玩家辛苦攒的星被"快照"打折）。要做必须先定口径（推荐
      「按学段取本地与云端较大值」而不是求和/覆盖），且要新接口 + 可能加字段。
- [x] T4.3 退出登录：nickname 页入口 → auth.logout()

## 收尾

- [x] T5.1 单测通过（npm test 全绿，无回归）；e2e smoke 需后端 + dev_ 测试码验证（见下）
- [x] T5.2 更新 `docs/CHANGELOG.md`
- [x] T5.3 提交推送 —— 2026-09-13 随本轮收尾批次一起提交推送

> e2e 冒烟：`POST /api/login { code: "dev_login_smoke1" }` 应返回 token；携带 `Authorization: Bearer <token>` 调 `GET /api/user/me` 应返回资料（本地/云托管均可测，需 WX_SECRET 或 dev_ 码）。
