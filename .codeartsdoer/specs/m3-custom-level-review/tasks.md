# 词力战士 M3 阶段任务列表

> 状态说明：`[ ]` 待办 | `[~]` 进行中 | `[x]` 完成

---

## T1: 后端模型与数据初始化

- [ ] 创建 `server/models/custom-level.js` 自定义关卡模型
- [ ] 创建 `server/models/level-review.js` 审核记录模型
- [ ] 创建 `server/models/wrong-record.js` 错题记录模型
- [ ] 更新 `server/db.js` 同步模型与关联

## T2: 后端路由与接口

- [ ] 创建 `server/routes/level.js` 关卡路由
- [ ] 创建 `server/routes/level-review.js` 审核路由
- [ ] 创建 `server/routes/wrong.js` 错题本路由
- [ ] 更新 `server/index.js` 挂载路由

## T3: 前端工具与算法

- [ ] 创建 `miniprogram/utils/ebbinghaus.js` 艾宾浩斯算法
- [ ] 创建 `miniprogram/utils/level.js` 关卡工具
- [ ] 单元测试：艾宾浩斯算法

## T4: 前端页面与组件

- [ ] 创建 `miniprogram/pages/level-editor/` 关卡编辑器页
- [ ] 创建 `miniprogram/pages/level-share/` 分享导入页
- [ ] 创建 `miniprogram/pages/wrong-book/` 错题本列表页
- [ ] 创建 `miniprogram/pages/wrong-review/` 复习页
- [ ] 创建 `miniprogram/components/question-item/` 题目列表项组件
- [ ] 创建 `miniprogram/components/review-card/` 复习卡片组件

## T5: 测试与验证

- [ ] 单元测试：艾宾浩斯算法
- [ ] 集成测试：关卡创建 → 审核 → 通过
- [ ] 集成测试：错题记录 → 复习 → 间隔递增
- [ ] 幂等性测试：重复提交/复习

## T6: 联调与部署

- [ ] 本地联调：前后端联调
- [ ] 部署：云托管部署
- [ ] 真机测试：微信开发者工具预览

---

## 任务依赖关系

```
T1（模型）→ T2（路由）→ T3（工具）→ T4（页面）→ T5（测试）→ T6（部署）
```

## 验收标准

1. 关卡编辑器：创建/编辑/保存草稿/提交审核可用
2. 分享码：生成 + 导入可用
3. 审核后台：待审核列表 + 通过/拒绝可用
4. 错题本：记录 + 艾宾浩斯复习 + 复习页可用
5. 真机预览正常