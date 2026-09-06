# M2~M4 联调收尾与全量验证计划

> 文档状态：联调收尾计划（v1.0，已评审）
> 关联文档：`core-gameplay/`、`m2-avatar-rank/`、`m3-custom-level-review/`、`m4-daily-challenge-compliance/`
> 目标：把已开发但未联调的 M2~M4 功能真正落地为可交付状态。

---

## 一、背景与现状

- M1~M4 代码已全部开发完毕（git log 有 `feat(M2/M3/M4)` 提交，`specs/` 下四份 spec，`server/` 12 路由 12 模型，`miniprogram/` 13 页面全部注册）。
- 单元测试 11 个文件全绿（`node miniprogram/utils/__tests__/run-all.js` 退出码 0）。
- **但依赖后端 MySQL 的 M2~M4 功能从未联调验证**，属「代码写完、未跑通」。

## 二、联调缺口清单

| 编号 | 级别 | 问题 |
|---|---|---|
| A1 | P0 | `request.js` v2 契约（`resolve(data)`/`reject(err)`）与 8 个 M2~M4 前端页面旧契约（`res.code === 0 && res.data`）错位，数据加载全部失效 |
| A2 | P0 | 排行榜接口路径错位（前端 `/api/rank/world|me` vs 后端 `/api/ranklist/world|me`）+ 好友榜 `/friends` 后端缺失 |
| A3 | P1 | 自定义关卡分享码 `POST /api/level/share` 前端无调用，分享链路断裂 |
| A4 | P1 | 后端联调环境（云托管 + MySQL）未就绪 |
| A5 | P1 | e2e 脚本只覆盖 M1 game 页，M2~M4 页面无验证 |
| A6 | P2 | M4 只有 `spec.md`，缺 `design.md`/`tasks.md` |
| A7 | P2 | README 状态滞后（仍写「M1 进行中」） |

## 三、任务拆分

| 任务 | 内容 | 依赖 | 优先级 | 规模 |
|---|---|---|---|---|
| T1 | 固化前后端接口契约核对表（前端 25 处调用 vs 后端 29 条路由逐条对齐） | 无 | P0 | S |
| T2 | 修复 A1：8 个 M2~M4 前端页面适配 v2 契约 | T1 | P0 | L |
| T3 | 修复 A2：排行榜路径对齐 + 砍掉好友榜 | T1 | P0 | M |
| T4 | 修复 A3：补全 `/api/level/share` 分享链路 | T1 | P1 | S |
| T5 | 云托管联调环境准备（部署后端 + MySQL + 填真实 `API_BASE_URL`） | T2/T3/T4 | P1 | M |
| T6 | 后端 12 组接口冒烟验证 | T5 | P1 | M |
| T7 | 扩展 e2e 覆盖 M2~M4 页面，模拟器端到端验证 | T6 | P1 | L |
| T8 | 汇总修复验证中发现的问题并回归（单测 + e2e 全绿） | T7 | P1 | M |
| T9 | 补 M4 `design.md`/`tasks.md`，更新 README 状态 | 无 | P2 | S |

依赖链：`T1 → T2/T3/T4 → T5 → T6 → T7 → T8`；`T9` 可并行。

## 四、已评审决策（2026-09-06）

1. **A1 修复方向**：保持 `request.js` v2 契约不变，改 8 个 M2~M4 前端页面适配 `resolve(data)`/`reject(err)`。
2. **A2 好友榜**：砍掉 `friends` tab，只留「全服榜 + 我的排名」。
3. **T5 联调环境**：直接云托管联调（不搭本地 MySQL）。前置：云托管环境/域名就绪、`app.js` 填入真实 `API_BASE_URL`、openid 由云托管网关注入。

## 五、验证策略

- **单测**：`node miniprogram/utils/__tests__/run-all.js` 全绿（退出码 0）。
- **接口冒烟**：T6 用脚本逐接口验证 12 组后端路由返回 `{code,data}`。
- **e2e**：T7 扩展 `e2e/` 脚本，覆盖 rank / wrong-book / achievement / checkin / avatar / level-* 页面，模拟器端到端验证。