# 词力战士 M6 打磨规划：合规 · 学习闭环 · 留存 · 体验

> 范围（用户确认）：P0 注销+内容安全；P1 全做；P2 除好友榜/对战全做；P3 除商业化全做。
> 关联：`.codeartsdoer/specs/` 既有 M1~M5、`docs/CHANGELOG.md`。
> 里程碑拆分见 `tasks.md`；每模块落 spec 时再细化字段/接口。

## 模块与优先级映射

| 编号 | 内容 | 来源 |
|---|---|---|
| M6-A 账号注销 | 后端删除用户全量数据 + 前端入口（双重确认） | P0 |
| M6-B 内容安全 | 后端 msgSecCheck（昵称/自定义关卡文案），未配置 secret 时跳过 | P0 |
| M6-C 发音 | audio.js 接微信同声传译 TTS（插件未授权自动降级）+ 朗读时机 | P1 |
| M6-D 学习统计与报告 | 后端聚合成绩/错题 → 周/月学习报告页（学习量/正确率/趋势） | P1 |
| M6-E 每日目标+自动打卡 | 通关后自动签到（学习打卡），checkin 展示连续/奖励 | P1 |
| M6-F 遗忘曲线可视化 | 错题页展示熟练度/下次复习时间轴 | P1 |
| M6-G 多形态复习 | 错题复习增加听音选义/中英选词/速刷模式 | P1 |
| M6-H 音效/BGM | WebAudio 合成轻量音效（答对/答错/连击），无资源文件依赖 | P1 |
| M6-I 学习提醒 | wx.requestSubscribeMessage 引导 + 后端偏好记录（推送需模板/定时，留 TODO） | P2 |
| M6-J 分享激励 | 分享引导入口与文案（无可靠回调，做"每日分享任务"提示向） | P2 |
| M6-K 勋章/段位分享卡 | Canvas 生成分享海报 → 保存/转发 | P2 |
| M6-L 新手引导 | 游戏页首次三步入场引导（存 ww_tutorial_done） | P2 |
| M6-M 词库扩展 | 词库 v2 可选例句字段 ex；parser/validator 兼容；出题渲染例句 | P3 |
| M6-N 个人中心 | pages/me 汇总：资料/我的皮肤/成就/错题/设置（注销/协议/提醒） | P3 |
| M6-O 深色/无障碍 | 基础深色适配 + 关键元素 aria-label/字号 | P3 |

## 设计要点（详见各模块实现时补充）

- M6-A：`POST /api/user/delete`，事务删除 users 关联行（user_avatars/rank_records/scores/wrong_records/checkin_records/user_achievements/custom_levels）后删 user；前端 nickname 页「注销账号」二次确认 → 清本地态回首页。
- M6-B：`server/utils/wechat.js`（access_token 缓存 + msgSecCheck v2，需 openid）；`routes/user.js profile` 与 `routes/level.js` 保存/提交时校验，返回 4002「内容不合规」。
- M6-C：app.json 声明插件 WechatSI；audio.js `speak` 用插件 textToSpeech，未授权/失败静默降级。
- M6-D：`GET /api/report/weekly|monthly` 聚合 scores（天数/题量/正确率/星）与 wrong（错题分布）；前端 pages/report。
- M6-E：result 结算成功后（已登录）自动 `POST /api/checkin/auto`；后端复用签到逻辑加今日已完成判定。
- M6-G：wrong-review 增加 mode（原题/听音/中英选词/速刷），读 wrong_records 快照生成。
- M6-H：`wx.createWebAudioContext` 合成 beep（基频/包络），engine 答对/答错/连击钩子播放。
- M6-K：pages/share-card 用 canvas 2d 画图（昵称/段位/战绩/二维码占位）。
- M6-M：parser/validator 允许第 6 段 `ex`（例句）；renderer/提示区展示（有则展示）。
- M6-N：个人中心聚合入口 + 设置项（深色跟随系统、协议、注销、订阅提醒）。
