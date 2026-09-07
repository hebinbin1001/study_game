# 词力战士 M6 任务清单（按模块推进，每模块独立 commit）

## M6-A 账号注销（P0）
- [ ] A1 `server/routes/user.js`：POST /api/user/delete（事务删关联 + user）
- [ ] A2 前端 nickname 页「注销账号」入口（双重确认 + 清本地登录态回首页）
- [ ] A3 后端常量/文档更新

## M6-B 内容安全（P0）
- [ ] B1 `server/utils/wechat.js`：access_token 缓存 + msgSecCheck v2（缺 secret 跳过）
- [ ] B2 routes/user.js profile 昵称检测；routes/level.js 标题/描述/词条检测
- [ ] B3 验证：secret 未配置时不阻塞（本地敏感词兜底）

## M6-C 发音 TTS（P1）
- [ ] C1 app.json plugins 声明 WechatSI（同声传译）
- [ ] C2 game/audio.js speak/speakByItem 接插件 textToSpeech（降级安全）
- [ ] C3 答对/答错朗读接入点调用核对

## M6-D 学习统计与报告（P1）
- [ ] D1 后端 `routes/report.js`：GET /api/report/range?days=7（按天聚合 scores/wrong）
- [ ] D2 前端 pages/report（学习量/正确率/趋势/薄弱题型）+ app.json + 首页入口
- [ ] D3 计算与联调

## M6-E 每日目标 + 自动打卡（P1）
- [ ] E1 后端 `routes/checkin.js`：POST /api/checkin/auto（今日有成绩记录即视为打卡）
- [ ] E2 前端 result 结算成功后自动 auto（已登录）
- [ ] E3 checkin 页展示「今日已完成 N 题」目标态

## M6-F 遗忘曲线可视化（P1）
- [ ] F1 wrong-book 增加熟练度/到期分布视图（基于 ebbinghaus 数据）

## M6-G 多形态复习（P1）
- [ ] G1 wrong-review 增加 mode：原题/听音选义/中英选词/速刷
- [ ] G2 错题列表进入时选择模式

## M6-H 音效/BGM（P1）
- [ ] H1 game/audio.js 增加 WebAudio 合成音效接口（correct/wrong/combo/win/lose）
- [ ] H2 engine.js 正确/错误/连击/结算钩子接入

## M6-I 学习提醒（P2）
- [ ] I1 前端 requestSubscribeMessage 引导（设置页/报告页一次）
- [ ] I2 后端偏好记录接口 POST /api/reminder（推送实现标注 TODO）

## M6-J 分享激励（P2）
- [ ] J1 首页「邀请好友」引导 + 分享文案（每日一次奖励提示向）

## M6-K 分享卡（P2）
- [ ] K1 pages/share-card：canvas 战绩海报（昵称/段位/星）
- [ ] K2 成就/结算入口「生成分享卡」

## M6-L 新手引导（P2）
- [ ] L1 game 页首次入场 3 步蒙层引导（ww_tutorial_done 持久化）

## M6-M 词库扩展（P3）
- [ ] M1 parser/validator 支持第 6 段 ex（例句）字段（可选）
- [ ] M2 词库规范文档 v2 + data 示例；renderer 有例句则展示

## M6-N 个人中心（P3）
- [ ] N1 pages/me：资料/我的皮肤/成就/错题/签到 聚合入口
- [ ] N2 设置区：注销入口（迁入 M6-A2）/协议/提醒/深色跟随

## M6-O 深色/无障碍（P3）
- [ ] O1 app.json darkmode + 深色 token 覆盖（基础）
- [ ] O2 关键元素 aria-label / 可读字号

## 收尾
- [ ] T1 每模块跑 `node e2e/check-wxss.js` + `npm test`
- [ ] T2 更新 CHANGELOG；按模块分组 commit + push
