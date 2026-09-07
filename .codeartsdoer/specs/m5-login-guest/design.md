# 词力战士 M5 阶段技术设计：微信登录注册 + 游客限制 + 资料完善

> 关联文档：`spec.md`（M5 需求）、`README.md`、`server/`、`miniprogram/`
> 决策（已确认）：标准登录（wx.login + code2session + token）；手机号本次仅预留字段/接口；实施范围 P1~P4。

---

## 一、总体架构

```
小程序前端                                  后端（云托管 Express）
wx.login() → code ──POST /api/login──▶ code2session(微信API) → openid
                                           findOrCreate users → 签发 token
  存 token ──── 后续请求 Authorization: Bearer <token> ──▶ openid 中间件解析 → req.openid
```

- 登录即注册：`openid` 唯一，首次出现自动建档（users 表）。
- **游客（未登录）**：可玩第 1 关 + 首页浏览；第 2+ 关及形象/排行/错题/签到/成就等用户维度功能锁定，点击弹登录引导。
- 兼容保留：`x-wx-source` + `x-wx-openid` 头（云托管网关注入）仍作为身份来源之一（兜底/联调）。

## 二、数据模型

### users 表扩展（models/user.js 修改）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 既有 |
| openid | STRING(64) unique | 既有，唯一用户标识 |
| nickname | STRING(32) | 既有（云镜像），登录后必填才视为「注册完成」 |
| avatar_url | STRING(255) | 既有（头像 URL/本地临时路径） |
| token | STRING(64) unique nullable | **新增**：登录态令牌（单用户单 token，重新登录刷新） |
| phone | STRING(20) nullable | **新增（预留）**：手机号，本期不开放绑定流程 |
| createdAt / updatedAt | | 既有 |

> 说明：本期不引入 Redis/额外 session 表，token 直接存 users，满足「一设备登录、重登顶号」的简化模型；后续多端可迁移独立 sessions 表。

## 三、接口契约（统一 `{ code, data, message }`，code=0 成功）

### 新增/改造

| 接口 | 方法 | 语义 | 入参 | 出参 |
|---|---|---|---|---|
| POST /api/login | POST | 静默登录（code2session）| `{ code }` | `{ token, isNew, needProfile, nickname, avatarUrl }` |
| GET /api/user/me | GET | 当前用户资料 | （token） | `{ openid, nickname, avatarUrl, isNew, needProfile, phone }` |
| PUT /api/user/profile | PUT/POST | 保存昵称/头像 | `{ nickname?, avatarUrl? }` | 更新后 user 资料 |
| POST /api/user/logout | POST | 退出登录（清 token） | （token） | `{ success }` |

**needProfile 判定**：`nickname` 为空 → `needProfile=true`（需引导完善资料，视为未完成注册）。

**校验规则复用**：昵称 2~12 字（去首尾空白）沿用 `server/routes/nickname.js` 的 `isValidNickname`。

### code2session 配置与降级

- 从环境变量读取：`WX_APPID`、`WX_SECRET`（云托管控制台注入）。
- 调用：`GET https://api.weixin.qq.com/sns/jscode2session?appid=&secret=&js_code=&grant_type=authorization_code`（Node 内置 https，无需新依赖）。
- **降级策略（本地/联调无 secret 时）**：`WX_SECRET` 未配置时，接口对 code 为 `dev_<8位>` 形态的测试码放行（映射 openid=`test_openid_<code>`），便于 e2e 与本地联调；真实 code 在无 secret 时返回明确业务错误 `code=4011「登录服务未配置」`。

## 四、鉴权与 openid 中间件改造（middlewares/openid.js）

解析优先级（按序命中即用）：

1. `Authorization: Bearer <token>` → 查 users.token → `req.openid = user.openid`（标准登录态）
2. `x-wx-source` ∈ 白名单 且 `x-wx-openid` 合法 → `req.openid = openid`（网关注入 / e2e 兜底，保留现状）
3. 均未命中 → `req.openid = null`（匿名，业务路由按 code=1001 处理）

错误码沿用：`1003`（来源不受信）、`1002`（openid 非法）。token 查无/过期视为匿名（不报错，业务 1001）。

## 五、前端登录态设计

### 新增 utils/auth.js（登录态封装）

- `loginSilently()`：wx.login → POST /api/login → 存 token + 更新 `getApp().globalData.user`
- `isLoggedIn()`：有 token 且有 needProfile=false
- `logout()`：调后端清 token + 本地清除
- `ensureLogin(cb)`：游客点击受限功能时触发：弹确认 → wx.login 登录 → 若 needProfile 跳昵称页

### request.js 改造

- 自动附加 `Authorization: Bearer <token>`（有 token 时）。
- 保留 `x-wx-source`（仅携带身份时发，见上轮修复）——token 与 openid 头二选一：**有 token 用 token，否则尝试 openid 头**。
- 对 `/api/login` 不加身份头。
- 401 类业务码不自动重试（登录态由 auth.js 管理），避免风暴。

### storage.js 新增

- `ww_token` / `ww_user`：token 与用户资料缓存（get/set/clear）。

### app.js

- `onLaunch`：`auth.loginSilently()`（失败/游客降级不阻塞）。
- `globalData` 增加 `user / token`。

## 六、游客限制（P2）

| 位置 | 规则 |
|---|---|
| 首页 index | 未登录显示「微信登录」入口 + 游客提示；登录后显示云端昵称/头像 |
| 关卡页 level | 未登录：第 1 关可进，第 2+ 关 locked，点击 toast「登录后解锁全部关卡」并弹登录引导 |
| 其余入口（形象/排行/错题/签到/成就）| 未登录点击 → 登录引导（modal → 静默登录 → 未填昵称则跳 nickname） |
| 游戏/结算 | 游戏页不阻断（游客可玩第 1 关）；结算提示「登录保存成绩」（游客成绩仅本地，登录后引导合并为可选增强） |

- 关卡锁定逻辑：`level.js` 中 `unlocked = isLoggedIn() ? storage.isLevelUnlocked(...) : (level === 1)`。

## 七、资料完善与合规（P3）

- nickname 页：需登录才可保存；保存走 `PUT /api/user/profile`；头像沿用 `chooseAvatar`（临时路径存 avatar_url；本期不做云存储上传，标 TODO）。
- 首次登录 `needProfile=true` → 自动跳 nickname 页引导设置（可跳过，但跳过时 isLoggedIn 视为未完成，受限功能仍锁定或按游客处理）。
- 隐私协议：app.json 弹窗或独立页 `pages/agreement/agreement`，首次进入展示「用户协议 + 隐私政策」同意；本地存 `ww_agreed`。

## 八、增强项（P4）

| 项 | 做法 |
|---|---|
| 页面分享 | 各页 `onShareAppMessage`（首页/关卡/结算/错题等） |
| 进度云同步 | 星级/错题本地数据在登录后上传合并（可选后台任务，本期做星级合并到 rank sync 的最小实现或标记 TODO） |
| 排行榜真实化 | 依赖 P1：ranklist 已读 users.nickname，前端登录后上报即真实昵称，自动生效 |
| 退出登录 | 首页入口 → auth.logout() |

## 九、错误码新增（server/constants.js）

```
4010 LOGIN_CODE_INVALID    // code 缺失/非法
4011 LOGIN_NOT_CONFIGURED  // WX_SECRET 未配置
```

## 十、影响文件清单

- server：`models/user.js`、`middlewares/openid.js`、`constants.js`、`routes/login.js`（新）、`routes/user.js`（/me、/profile、/logout）、`index.js`（挂载）
- miniprogram：`utils/auth.js`（新）、`utils/request.js`、`utils/storage.js`、`app.js`、`pages/index/*`、`pages/level/*`、`pages/nickname/*`、`pages/agreement/*`（新）、各功能页入口拦截、各页 onShareAppMessage
- docs：`CHANGELOG.md` 追加
