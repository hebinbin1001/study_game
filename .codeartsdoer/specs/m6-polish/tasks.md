# 词力战士 M6 任务清单（按模块推进，每模块独立 commit）

> 状态：全部模块已实现并提交推送（含 P2/P3 由子代理实现、父代理核验）。

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
- [x] D1 后端 `routes/report.js`：GET /api/report/range?days=N
- [x] D2 前端 pages/report + app.json + 首页「报告」入口
- [x] D3 语法/单测/check-wxss 通过（错误态点击重试已修）

## M6-E 每日目标 + 自动打卡（P1）✅
- [x] E1 后端 POST /api/checkin/auto（今日有成绩即打卡）
- [x] E2 前端 result 结算成功后自动 auto
- [x] E3 doCheckin 公共函数重构

## M6-F 遗忘曲线可视化（P1）✅（报告页覆盖）
- [x] F1 报告页错题掌握 + wrong-book 到期展示（最小可视化达成）

## M6-G 多形态复习（P1）✅
- [x] G1 wrong-review：原题 / 听音选义 / 看中文选词
- [x] G2 模式切换条 + 作答仍上报复习结果

## M6-H 音效/BGM（P1）✅
- [x] H1 WebAudio 合成 correct/wrong/combo/win
- [x] H2 engine 钩子接入（含通关音修复）

## M6-I 学习提醒（P2）✅（推送留 TODO）
- [x] I1 首页订阅引导（模板 ID 占位 TODO，后端推送未做）

## M6-J 分享激励（P2）✅（奖励逻辑 TODO）
- [x] J1 首页「分享」入口 + showShareMenu 引导

## M6-K 勋章/段位分享卡（P2）✅
- [x] K1 pages/share-card：Canvas 战绩海报（600×900）→ 保存/转发
- [x] K2 achievement 页「生成战绩分享卡」入口

## M6-L 新手引导（P2）✅
- [x] L1 game 首次 3 步蒙层引导（ww_tutorial_done）

## M6-M 词库扩展（P3）✅
- [x] M1 parser/validator 支持第 6 段 ex（例句，可选、向后兼容）
- [x] M2 docs/词库格式规范 v2 补充 ex（渲染展示后续做）

## M6-N 个人中心（P3）✅
- [x] N1 pages/me：资料/菜单聚合入口
- [x] N2 危险区（退出/注销）+ 首页登录条改跳 me

## M6-O 深色/无障碍（P3）✅（基础）
- [x] O1 app.json darkmode + theme.json + 基础暗色覆盖（index/全局）
- [x] O2 覆盖范围说明（其余页按需适配）

## 收尾 ✅
- [x] T1 每模块 node --check + e2e/check-wxss.js（17 wxss）+ npm test 全绿
- [x] T2 CHANGELOG 追加 M6；各模块分 commit 已推送
