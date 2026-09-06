# 词力战士 M2 阶段任务列表

> 状态说明：`[ ]` 待办 | `[~]` 进行中 | `[x]` 完成

---

## T1: 后端模型与数据初始化

- [ ] 创建 `server/models/avatar.js` 形象模型
- [ ] 创建 `server/models/user-avatar.js` 用户形象关联模型
- [ ] 创建 `server/models/rank.js` 段位模型
- [ ] 创建 `server/models/rank-record.js` 段位记录模型
- [ ] 创建 `server/seeders/avatar-seed.js` 内置形象数据初始化
- [ ] 创建 `server/seeders/rank-seed.js` 内置段位数据初始化
- [ ] 更新 `server/db.js` 同步模型

## T2: 后端路由与接口

- [ ] 创建 `server/routes/avatar.js` 形象路由
- [ ] 创建 `server/routes/rank.js` 段位路由
- [ ] 创建 `server/routes/ranklist.js` 排行榜路由
- [ ] 更新 `server/index.js` 挂载路由

## T3: 前端页面与组件

- [ ] 创建 `miniprogram/pages/avatar/` 形象选择页
- [ ] 创建 `miniprogram/pages/rank/` 世界排行榜页
- [ ] 创建 `miniprogram/components/rank-badge/` 段位徽章组件
- [ ] 创建 `miniprogram/components/avatar-item/` 形象列表项组件
- [ ] 创建 `miniprogram/components/rank-item/` 排行榜列表项组件

## T4: 前端工具与状态

- [ ] 扩展 `miniprogram/utils/storage.js` 添加 avatar/rank 本地存储
- [ ] 创建 `miniprogram/utils/rank.js` 段位计算工具
- [ ] 更新 `miniprogram/app.js` 全局状态

## T5: 测试与验证

- [ ] 单元测试：段位晋升逻辑
- [ ] 单元测试：形象解锁逻辑
- [ ] 集成测试：形象接口
- [ ] 集成测试：段位接口
- [ ] 集成测试：排行榜接口
- [ ] 幂等性测试：重复上报

## T6: 联调与部署

- [ ] 本地联调：前后端联调
- [ ] 部署：云托管部署
- [ ] 真机测试：微信开发者工具预览

---

## 任务依赖关系

```
T1（模型）→ T2（路由）→ T3（页面）→ T4（工具）→ T5（测试）→ T6（部署）
```

## 验收标准

1. 形象列表正确展示 + 解锁状态正确
2. 段位晋升逻辑正确（累计胜场 → 段位）
3. 排行榜分页查询正确
4. 幂等 upsert 正确（重复上报不重复计分）
5. 真机预览正常