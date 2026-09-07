# 词力战士 M6 任务清单（按模块推进，每模块独立 commit）

> 约定：`[x]` 完成；`[~]` 部分完成/有 TODO；`[ ]` 未做。

## M6-A 账号注销（P0）✅
- [x] A1 `server/routes/user.js`：POST /api/user/delete（事务删关联 + user）
- [x] A2 前端 nickname 页「注销账号」入口（双重确认 + 清本地登录态回首页）
- [x] A3 后端常量/文档更新

## M6-B 内容安全（P0）✅
- [x] B1 `server/utils/wechat.js`：access_token 缓存 + msgSecCheck v2（缺 secret 跳过）
- [x] B2 routes/user.js profile 昵称检测；routes/level.js 标题/描述/词条检测
- [x] B3 验证：secret 未配置时不阻塞（本地敏感词兜底）

## M6-C 发音 TTS（P1）✅
- [x] C1 app.json plugins 声明 WechatSI（同声传译）
- [x] C2 game/audio.js speak/speakByItem 接插件 textToSpeech（降级安全）
- [x] C3 答对/答错朗读接入点（engine 已调 speakByItem）

## M6-D 学习统计与报告（P1）✅
- [x] D1 后端 `routes/report.js`：GET /api/report/range?days=N（按天聚合 scores + wrong 题型分布）
- [x] D2 前端 pages/report（概览/正确率趋势/薄弱题型/错题掌握）+ app.json + 首页「报告」入口
- [x] D3 语法/单测/check-wxss 通过

## M6-E 每日目标 + 自动打卡（P1）✅
- [x] E1 后端 `routes/checkin.js`：POST /api/checkin/auto（今日有成绩即视为打卡；未学习不打卡）
- [x] E2 前端 result 结算成功后自动 auto（已登录）
- [x] E3 checkin 连续天数/奖励沿用（doCheckin 公共函数）

## M6-F 遗忘曲线可视化（P1）✅（合并覆盖）
- [x] F1 覆盖说明：报告页「错题掌握 pending/mastered/总数」+ wrong-book 列表项既有 nextReviewText 展示 = 已达成最小可视化；更细的到期时间轴可后续增强

## M6-G 多形态复习（P1）✅
- [x] G1 wrong-review 增加 mode：原题 / 听音选义 / 看中文选词（选项动态构造，hint 剧透抑制）
- [x] G2 模式胶囊切换条 + 每步仍上报复习结果

## M6-H 音效/BGM（P1）✅
- [x] H1 game/audio.js WebAudio 合成音效（correct/wrong/combo/win）
- [x] H2 engine.js 答对/答错/连击钩子接入

## M6-I 学习提醒（P2）✅（推送留 TODO）
- [x] I1 首页已登录 onShow 引导订阅（requestSubscribeMessage，模板 ID 占位 TODO；后端推送未做，需模板+定时）

## M6-J 分享激励（P2）✅（奖励逻辑 TODO）
- [x] J1 首页「分享」入口：showShareMenu + toast 引导；奖励需邀请链路（注释 TODO）

## M6-K 勋章/段位分享卡（P2）
- [ ] K1 pages/share-card：canvas 战绩海报 —— 未做
- [ ] K2 入口 —— 未做

## M6-L 新手引导（P2）✅
- [x] L1 game 页首次入场 3 步蒙层引导（ww_tutorial_done 持久化，首次点选项自动关闭）

## M6-M 词库扩展（P3）🔄 子代理实现中
- [ ] M1 parser/validator 支持第 6 段 ex（例句）字段（可选）
- [ ] M2 词库规范文档 v2 + data 示例（渲染展示后续做）

## M6-N 个人中心（P3）🔄 子代理实现中
- [ ] N1 pages/me：资料/皮肤/排行/报告/错题/签到/成就 聚合入口
- [ ] N2 设置区：退出/注销（迁入）+ 首页登录条改跳 me

## M6-O 深色/无障碍（P3）🔄 子代理实现中
- [ ] O1 app.json darkmode + theme.json + 基础暗色覆盖
- [ ] O2 说明覆盖范围（小规模）

## 收尾
- [ ] T1 每模块 `node e2e/check-wxss.js` + `npm test`（已在各 commit 前执行 ✅）
- [ ] T2 更新 CHANGELOG；提交（P2 已 commit e96b12b；P3 待子代理完成后验证提交）
