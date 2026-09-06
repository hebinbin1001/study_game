# 词力战士 M4 阶段任务列表

> 状态说明：`[ ]` 待办 | `[~]` 进行中 | `[x]` 完成
> 关联 spec：`spec.md`（六项功能：每日挑战 / 签到 / 成就 / 音效 / 学习报告 / 合规）
> 现状标注：M4 已落地代码为「签到打卡」「成就勋章」；其余四项（每日挑战/音效/学习报告/合规）spec 已规划但代码未落地。

---

## 实现状态总览

| spec 功能 | spec 章节 | 状态 |
|-----------|-----------|------|
| 每日挑战 | 二 | ❌ 未实现 |
| 签到打卡 | 三 | ✅ 已实现 |
| 成就勋章 | 四 | ✅ 已实现 |
| 音效/BGM | 五 | ⚠️ 仅占位（audio.js 空实现） |
| 学习报告 | 六 | ❌ 未实现 |
| 合规 | 七 | ❌ 未实现 |

---

## T1: 签到后端模型与路由（spec 三）

- [x] 创建 `server/models/checkin-record.js` 签到记录模型（recordId/openid/date/streak）
- [x] 在 `server/db.js` 注册 `CheckinRecord` 并建立 `User.hasMany(CheckinRecord)` 关联
- [x] 创建 `server/routes/checkin.js` 路由：POST 签到（幂等 + 连续天数 + 星数奖励）、GET 查询（按月过滤）
- [x] 在 `server/index.js` 挂载 `/api/checkin` 路由

## T2: 签到前端页面与入口（spec 三）

- [x] 创建 `miniprogram/pages/checkin/` 签到页（加载/签到/奖励展示）
- [x] 在 `miniprogram/app.json` 注册 `pages/checkin/checkin`
- [x] 在 `miniprogram/pages/index/index.js` 增加 `goCheckin` 首页入口

## T3: 成就后端模型与路由（spec 四）

- [x] 创建 `server/models/achievement.js` 成就定义模型（achievementId/name/description/icon/conditionType/conditionValue）
- [x] 创建 `server/models/user-achievement.js` 用户成就关联模型
- [x] 在 `server/db.js` 注册 `Achievement`、`UserAchievement` 并建立 `User.hasMany(UserAchievement)` 关联
- [x] 创建 `server/routes/achievement.js` 路由：GET list（懒初始化内置成就 + 解锁状态）、POST check（检查并解锁）
- [x] 在 `server/index.js` 挂载 `/api/achievement` 路由

## T4: 成就前端页面与入口（spec 四）

- [x] 创建 `miniprogram/pages/achievement/` 成就列表页（列表 + 解锁状态 + 检查解锁）
- [x] 在 `miniprogram/app.json` 注册 `pages/achievement/achievement`
- [x] 在 `miniprogram/pages/index/index.js` 增加 `goAchievement` 首页入口

## T5: 每日挑战（spec 二）

- [ ] 创建 `server/models/daily-challenge.js` 每日挑战模型（challengeId/date/grade/items/completed）
- [ ] 创建 `server/routes/daily-challenge.js` 路由（按学段随机出题 + 限时挑战 + 排行榜）
- [ ] 创建 `miniprogram/pages/daily-challenge/` 每日挑战页
- [ ] 前端入口与 `app.json` 注册

## T6: 音效/BGM（spec 五）

- [ ] 实现 `miniprogram/game/audio.js` 音效/BGM 播放（当前为空占位，静默降级）
- [ ] 答对/答错/爆炸/升级音效接入战斗引擎
- [ ] BGM 与音效独立音量控制

## T7: 学习报告（spec 六）

- [ ] 创建 `server/routes/report.js` 周报汇总接口
- [ ] 创建 `miniprogram/pages/report/` 学习报告页
- [ ] 周报海报生成与分享

## T8: 合规（spec 七）

- [ ] 青少年模式（时长限制）
- [ ] 隐私协议首次弹窗
- [ ] 防沉迷（实名认证 + 时段限制）

## T9: 测试与验证

- [ ] 单元测试：签到连续天数计算与奖励分档
- [ ] 单元测试：成就条件判断（各 conditionType 分支）
- [ ] 集成测试：签到（签到 → 查询 → 幂等）
- [ ] 集成测试：成就（列表 → 检查解锁 → 落库）
- [ ] 幂等性测试：重复签到 / 重复解锁

## T10: 联调与部署

- [ ] 本地联调：签到 + 成就前后端联调
- [ ] 部署：云托管部署（checkin_records / achievements / user_achievements 表）
- [ ] 真机测试：微信开发者工具预览（签到页 + 成就页）

---

## 任务依赖关系

```
T1（签到后端）→ T2（签到前端）     → T9（测试）→ T10（联调部署）
T3（成就后端）→ T4（成就前端）     →
T5（每日挑战）/ T6（音效）/ T7（报告）/ T8（合规）—— 待实现，独立可并行
```

## 验收标准

1. 签到：每日签到一次 + 连续奖励（1/3/7/14/30 天 → 10/30/100/200/500 星）+ 重复签到拦截（spec 三）—— 已实现 ✅
2. 成就：6 个内置成就 + 解锁状态展示 + 检查解锁（spec 四）—— 已实现 ✅
3. 每日挑战：每日题库 + 限时挑战 + 排行榜（spec 二）—— 待实现
4. 音效/BGM：背景音乐 + 音效 + 独立音量控制（spec 五）—— 待实现
5. 学习报告：周报生成 + 分享（spec 六）—— 待实现
6. 合规：青少年模式 + 隐私协议 + 防沉迷（spec 七）—— 待实现