# 变更日志（CHANGELOG）

> 记录项目迭代过程中的关键修复与功能进展，便于回顾与追溯。
> 关联文档：`README.md`、`.codeartsdoer/specs/`、`docs/需求对齐-6合1.md`、`docs/规划-UI对齐与落地草案.md`。

---

## 2026-09-12（贪吃蛇改为相对转向 + 两份待确认文档）

### 贪吃蛇：点方向改为「相对转向」（用户拍板：以蛇头为中心线，点左右 = 转 90°）

- `pages/snake/snake.js` 的 `onCellTap` 重写：把「蛇头 → 被点格子」的向量投影到**蛇头朝向轴**上，
  用 `atan2(cross, dot)` 得到点击相对朝向的夹角，再判定：
  - 前方 ±45° 内 → 直行（不改朝向）
  - 前/后 ±45°~135° → 朝**被点的那一侧拐 90°**（新朝向 = 点的那一侧；左拐 `(d+3)%4`、右拐 `(d+1)%4`）
  - 正后方 ±135° 以外 → 不掉头（保持朝向，避免一步撞上自己的身体）
  - 点蛇头自己 → 忽略
- 与旧版「主轴绝对方向」的差别：点击只看**方向**不看**距离**（点远处和点相邻格一个样），
  语义从「指哪走哪」变成「转向操控」；连点同一侧两次仍可掉头（与改造前一致）。
- 文案同步：网格提示与页脚提示改成「点蛇头轴线哪一侧，就朝那一侧拐 90°」。

### E2E 同步（`e2e/verify-snake.js`，50 → 52 条断言）

- 转向助手改成相对转向语义：`tapStep(stepDir)`（点蛇头朝 stepDir 的相邻格 = 拐 90°）、
  `tapDir(targetDir)`（按差值拆成 1~2 次点击，`delta=2` 用连点同侧两次掉头）；
  `resetAndFreeze` 不再依赖可能残留/为空的 `data.dir`，改用「startGame 后内部朝向恒为右 → 点正下方一格」确定性归位。
- 新增断言：点正前方直行、点轴线两侧各拐 90°、点远处正前方仍直行（只看方向不看距离）、
  点正后方不掉头、斜着点前侧仍按侧向判定、点蛇头自己忽略、连点可把朝向转回目标方向。

### 新增两份待确认文档（本轮交付物）

- `docs/美术素材需求与豆包提示词.md`：段位徽章 72 枚 / 战士皮肤 24 套 / 成就图标 32 张的
  **交付规格（尺寸·格式·命名·目录）**＋**可直接复制给豆包的四段提示词**＋色板与主题清单。
  备注：现有 6 个成就的图标文件本来就是缺的（后端给路径、前端目前用 emoji），这批一并做掉。
- `docs/挑战关卡规划-待确认.md`：把「继续挑战」从「字母射击 10 关」升级为
  **每学段 30 关的主线关卡带（一关 = 玩法 + 学段题库 + 参数）**，含关卡表样例、按年级生成规则、
  每关固定题面（种子）、星级折算表、存档与解锁迁移、三期落地顺序，以及 5 条待用户拍板的问题。

验证：`node e2e/run-all.js` 全量 **11/11 通过**（325s），含贪吃蛇 52/52。

---

## 2026-09-12（贪吃蛇操控收敛：去掉滑动转向，只留「点方向」）

> 用户反馈：滑动没啥用就去掉（上一轮同时保留了点击与滑动两套操控）。

- **移除滑动转向**：删掉 `onTouchStart/onTouchEnd` 与 wxml 上的 `bindtouchstart/bindtouchend`，网格只保留 `catchtap="onCellTap"`。
  - 理由：有了「点蛇头上/下/左/右哪一侧就往哪边走」之后，滑动既多余又容易误触（点一下不小心划到就转向）。
  - 文案同步：网格上方提示改为「点蛇头四周的格子转向」，页脚去掉「也可滑动」。
  - 样式类 `.swipe-hint` 顺带改名 `.tap-hint`，避免名字与行为不符。
- **E2E 用例同步重写**（`e2e/verify-snake.js`，33 条 → 50 条断言）：
  - 删除全部 touchstart/touchend 注入，转向改走真实 `onCellTap`。
  - 新增点方向断言 6 条：点正右方 → 右；点正后方（180° 反向）被拒绝；竖向更远取竖向；横向更远取横向；点蛇头自己忽略；点出来的朝向能真实驱动移动。
  - 新增**穿墙回归** 5 条：清空蛇头向右的跑道后连走 7 步，断言蛇头从同排最左侧穿出（53 → 50）、**不扣命**、不结算、且能继续沿原朝向前进。

验证：`node e2e/run-all.js --no-e2e` 全绿；`node e2e/run-all.js` 全量 **11/11 通过**（含贪吃蛇 50/50、24 点 29/29、连连看 26/26、18 页 + 8 页渲染回归），总耗时 297s。

---

## 2026-09-10（总体规划落地 B1–B6 + 登录/合规/玩法成熟化 + 回归）

> 本轮把拍板后的「8+ 款玩法合集」规划分批全部落地真实小程序（详见 `docs/规划-UI对齐与落地草案.md`）。
> 全部代码已推送 `origin/main`；`docs/*` 按约定仅本地更新不入 git。

### B1 · 4 Tab 架构 + O1 全机型自适应（commit 4fa2074）
- app.json 加 tabBar（🏠首页 / 🎮玩法 / 📊学习 / 👤我的），4 组纯色占位 PNG 图标（`e2e/gen-tab-icons.js` 生成）。
- 首页去「功能宫格」→ demo 大厅：Hero / 游客引导条 / 资产条 / 排行榜行 / 今日目标 / 每日一题 / 继续挑战 / 推荐玩法。
- 新增玩法 tab（8 款合集 + 分类筛选）、学习 tab（周概览+报告+错题+每日一题·签到+签到日历+自定义题库）。
- me 页对齐 demo（资料卡两态/游客说明卡/统计/菜单/危险区，注销/退出改 switchTab）。
- O1：对局 Canvas `flex:1` 占剩余高 + `scale=min(宽比,高比)` 居中缩放（先 translate 后 scale）；关卡地图行距/节点按可用高动态收缩。

### B2 · 每日一题 = 签到（双轨）（2e66b0a）
- 后端：`milestone_claims` 表 + avatars 支持 `unlockType='milestone'` + 5 里程碑皮肤种子（30/60/100/250/365 天）；`routes/daily.js`（status/answer 幂等：答对→轨道A签到送星 + 轨道B皮肤发放）。
- 前端：每日一题页（看词选义，每人随机 1 题，本地词库）；移除 result 任意闯关自动打卡；checkin 页改**只读签到日历**；avatar 里程碑皮肤禁手动解锁。

### B3 · 排行榜双榜真实（97d4bdb）
- scores 加 `game_type`/`type_key`；`/api/ranklist/progress` 玩法进度榜（按玩法/学段/题型聚合 MAX 进度）；rank 页重做 demo 双榜 UI（⭐总榜·星星 / 🎮按玩法·进度，学段+题型筛选 + 我的名次）。

### B4 · 自定义题库 10 个一组 + 打通游玩 + 公开广场（8d81810）
- `/api/level/submit` 服务端强校验 totalQ===10；`/api/level/public` approved 全量列表；game 消费 `customLevel`（断链修复，固定 items 出题）；result 自定义关不写系统星级/不入字词榜；custom-levels 中心页（我的题库/公开广场/新建/输码导入）。

### B6 · demo 8 款玩法全覆盖（83ccd5c / e183686 / b17c8d3 / bcbf0ab / 0994415 / 2107e54 / 344e311）
- 新增独立玩法页：数独（20 关 4×4→9×9）、词义消消乐、2048（7 关目标递增）、算24点、词语连连看、单词贪吃蛇、单词弹弹球；引擎模块 `game/{sudoku,tw2048,math24,link}.js`。玩法 tab 逐一点亮「已解锁」。

### B5 · 公共对局外壳抽取（31f1868）
- 组件 `components/game-hud`（生命/分数/附加）、`components/settle-pop`（结算弹层+插槽+retry 事件）；数独/消消乐试点迁移。

### 登录 / 合规 / 体验收尾（06e47e8 / 8f9e59a / 0b76732 / 2d7fb00 / 02bdc3d 等）
- O2 登录规范化：**首次=游客主页不弹协议**；点「登录/注册」才先弹《用户协议》，同意后 wx.login 建档；拒绝保持游客（`auth.ensureAgreement`、app.js 移除 onLaunch 自动登录）。
- 完整《用户协议与隐私政策》文本页 `pages/agreement`（首页/我的可进）。
- 游客有本地成绩 → 温和提醒一次「登录同步」。
- 修复登录无反应/卡死：登录 Promise 卡死（_loginPromise 悬挂）改 `_loggingIn` 防重入 + wx.login 5s 超时；loading 后置防遮弹窗；nudge 弹窗顶掉协议弹窗（modal 互顶 → agreed=false）已修（点击登录先取消 nudge + busy 标志 + 延时 900ms + onHide 清理）。
- 首页「游客引导条」加 `wx:if !loggedIn`——登录后不再残留游客条（4b loggedIn=true 仍见游客的根因）。

### 玩法成熟化重做（699dabf / 355679d）
- 单词贪吃蛇 → 成熟玩法（对齐《单词贪吃蛇》）：给目标词+释义，蛇按顺序吃到字母拼完该词过关换词；触屏滑动控制（去方向键）。
- 算 24 点 → 成熟交互（对齐经典）：点数字牌+运算符/括号构造带括号算式，`＝校验24`；引擎新增 `evaluateExpr`（递归下降、精确分数）；四张牌各用一次校验。
- 单词弹弹球：无成熟先例，玩法页下线为占位（代码保留）。

### 回归工具（4edc712）
- `e2e/syntax-check-all.js`（全量 JS 语法）、`e2e/structure-check.js`（app.json/组件/tabBar/玩法一致性/登录链痕迹 50+ 断言）。本次全绿：npm test、check-wxss 29/29、103 js 0 失败、结构 50+ 全过。

### 生产环境需人工执行（部署注意）
- 新增表 `milestone_claims`；`scores` 加列 `game_type`、`type_key`；`avatars` 插 5 条里程碑皮肤（非生产 sync({alter:true}) 自动完成，生产需手动 SQL/seed）。
- O1 机型矩阵（320×568→430×932）逐机型人工验收待真机执行。

---

## 2026-09-06

### 修复：小程序 UI 布局溢出与底部安全区适配

**现象**：游戏画面最下方内容超出界面、选项按钮被推出屏幕；全面屏底部内容被 Home 指示条遮挡。

**根因**：
1. 游戏页 Canvas 使用固定 `px`（`390px × 500px`），不随屏宽缩放，小屏机型超宽超高；
2. 游戏页 `disableScroll: true`，内容超出后无法滚动，底部按钮不可见；
3. 渲染坐标系（390×500）与画布 CSS 尺寸未做等比缩放，画面会拉伸/留白；
4. 各页面缺少底部安全区（`env(safe-area-inset-bottom)`）适配。

**改动**（commit `34e2344`）：
- `miniprogram/pages/game/game.wxss`：Canvas 改为响应式（`width: 100%; height: 900rpx`，保持 390:500 比例）；页面底部加安全区 padding。
- `miniprogram/pages/game/game.json`：移除 `disableScroll`，内容超屏时可滚动兜底。
- `miniprogram/pages/game/game.js`：`onReady` 增加 `ctx.scale(dpr * scale)` 等比缩放，让 390×500 渲染坐标系精确填充响应式画布。
- `miniprogram/app.wxss`：`page` 全局加底部安全区 padding。
- `miniprogram/pages/level/level.wxss`、`miniprogram/pages/index/index.wxss`：页面底部加安全区 padding。

### 修复：`x-wx-source` 前后端取值不一致导致的接口批量 1003 拒绝

**现象**：控制台反复出现「未取得 openid，请求不携带 x-wx-openid 头」warning，用户维度接口（成绩/昵称/形象/排行/错题/签到/成就）被后端拒绝。

**根因**：
1. 前端 `request.js` 的 `SOURCE_HEADER = 'miniprogram'`，与后端 `middlewares/openid.js` 可信白名单（默认 `weixin,wechat`）不一致，所有非健康检查请求被后端以 `code=1003「不受信任的请求来源」`拒绝；
2. 「无 openid」在云托管方案下属正常降级（openid 由微信网关自动注入），却被当成 warning 反复打印。

**改动**（commit `40f475b`，文件 `miniprogram/utils/request.js`）：
- `SOURCE_HEADER` 由 `miniprogram` → `weixin`，对齐后端白名单。
- 仅在「已取得 openid」时才附带 `x-wx-source` + `x-wx-openid`；无 openid 时不带身份头，走后端「匿名放行」路径（业务返回 `code=1001` 由前端本地降级），而非被 `1003` 拒绝。
- 移除 openid 误报 warning 及 `_warnedNoOpenid` 防刷屏变量。

> 备注：若后端仍返回 `code=1001`（未识别用户），需检查云托管控制台是否开启「微信登录 / openid 注入」能力，属部署侧配置。

---

## 2026-09-06（同日 · M5 微信登录注册 + 游客限制）

规划与设计文档：`.codeartsdoer/specs/m5-login-guest/`（spec.md / design.md / tasks.md）
已确认决策：标准登录（wx.login + code2session + token）；手机号仅预留字段/接口；范围 P1~P4（P4 部分完成）。

### P1 登录闭环
- 后端：`models/user.js` 扩展 `token/phone`；新增 `routes/login.js`（code → code2session → findOrCreate → 签发 token，含 `dev_` 测试码降级）；`middlewares/openid.js` 支持 `Authorization: Bearer <token>`（优先于 x-wx-openid）；`routes/user.js` 新增 `/me` `/profile` `/logout`；`constants.js` 新增 4010/4011。
- 前端：新增 `utils/auth.js`（静默登录/登录态判定/登出/promptLogin）；`utils/storage.js` + `constants.js` 增 token/user 缓存；`utils/request.js` 自动附带 Bearer token；`app.js` onLaunch 静默登录（失败降级游客）。
- 配置：云托管需注入 `WX_APPID / WX_SECRET`（缺省时仅 `dev_` 测试码可登录，真实登录返回 `code=4011`）。

### P2 游客限制
- 未登录游客：首页「游客模式」登录条（微信登录入口）；关卡页仅第 1 关可玩，第 2+ 关锁定点击引导登录 + 游客横幅；形象/排行/错题/签到/成就入口未登录先引导登录（REQ-GUEST-1/2）。
- TODO：受限页自身 onLoad 直入守卫、结算页游客「登录保存成绩」提示。

### P3 资料完善 + 合规
- 昵称/头像登录后云端保存（POST /api/user/profile），本地镜像兜底（离线可保存）；首登 needProfile=true 自动引导设昵称；`isProfileComplete` 判定注册完成。
- 隐私协议：首页首次进入 modal 同意（`ww_agreed` 持久化，最小实现）；完整协议文本页 TODO（提审前补）。

### P4 增强（部分）
- 分享：index / level 页 `onShareAppMessage`；退出登录（nickname 页入口 → auth.logout()）。
- TODO：result/错题/形象/排行等页分享、星级云同步、受限页 URL 守卫。

> 部署注意：云托管环境变量需新增 `WX_APPID`、`WX_SECRET`（小程序 AppID 与 AppSecret），否则真实登录返回 `code=4011`。

---

## 2026-09-06（同日 · M6 打磨：合规 · 学习闭环 · 留存 · 体验）

规划与任务清单：`.codeartsdoer/specs/m6-polish/`（spec.md / tasks.md）。范围：P0 注销+内容安全；P1 全做；P2 除好友榜/对战；P3 除商业化。

### P0 合规
- **账号注销**：`POST /api/user/delete`（事务删除成绩/形象/段位/关卡/错题/签到/成就后删用户，幂等）；nickname 页「注销账号」双重确认 + 清空本地。
- **内容安全**：`server/utils/wechat.js`（access_token 缓存 + msgSecCheck v2，未配置 secret 自动放行）；昵称与自定义关卡保存接入检测。

### P1 学习闭环
- **发音 TTS**：`game/audio.js` 接微信同声传译插件（app.json 声明 WechatSI；未授权静默降级），答对/答错回执朗读。
- **合成音效**：WebAudio 合成 答对/答错/连击/通关音（engine 钩子接入）。
- **学习报告**：`GET /api/report/range` 按天聚合 + `pages/report`（学习天数/闯关/答题/正确率/每日趋势/薄弱题型/错题掌握）；首页「报告」入口。
- **每日目标自动打卡**：通关后 `POST /api/checkin/auto` 自动签到（今日有成绩才打卡）；重构公共 doCheckin。
- **多形态复习**：wrong-review 增加 原题/听音选义/看中文选词（选项动态构造，hint 剧透抑制）。
- 遗忘曲线可视化：报告页错题掌握 + 错题列表到期展示（覆盖）。

### P2 留存
- 新手引导（game 首次 3 步蒙层）、分享激励入口、学习提醒订阅引导（模板 ID 占位）、**战绩分享卡**（`pages/share-card` Canvas 海报 → 保存/转发，成就页入口）。
- TODO：订阅推送需后台模板+定时；分享奖励需邀请链路（微信无可靠回调）。

### P3 体验
- **词库例句**：导入格式支持可选第 6 段 `ex`（parser/validator 向后兼容；渲染展示后续做）。
- **个人中心**：`pages/me`（资料卡/聚合菜单/退出/注销危险区），首页登录条已登录改跳 me。
- **深色模式基础**：darkmode + theme.json + 全局/index 暗色覆盖（其余页按需）。

> 部署/配置注意：TTS 需在小程序后台添加「同声传译」插件；订阅消息需申请模板 ID；深色跟随系统设置生效。

---

## 2026-09-06（会话收工记录）

### 当日交付汇总（已全部提交并推送 origin/main）
- 历史修复：UI 布局（Canvas 响应式/安全区）、openid 请求链、x-wx-source 对齐。
- M5 登录注册：登录闭环（code2session+token）、游客限制（仅第 1 关）、昵称云端化、隐私协议（最小）。
- M6 打磨（14 模块全交付）：见上方 M6 段；末尾补充 TTS 降级修复（commit `ead8123`）。
- 全部验证：`npm test` 全绿、`node e2e/check-wxss.js` 通过（17 wxss）、逐模块语法检查。

### 收工时的已知 TODO / 上线前配置（供后续会话接续）
1. **TTS 恢复**：app.json 已移除 WechatSI 声明（后台未授权会报错）。需在小程序后台「设置→第三方设置→插件管理」添加「微信同声传译」后，恢复 app.json 的 plugins 声明（见 game/audio.js 注释）。
2. **订阅消息推送**：申请模板 ID 替换 utils 调用占位；定时/后端推送未做。
3. **分享奖励**：需自建邀请链路（微信分享无可靠成功回调），当前仅入口引导。
4. **词库例句渲染**：导入已支持 `ex` 字段，题目/答案区展示例句待做。
5. **受限页 URL 直入守卫**：avatar/rank/wrong-book/checkin/achievement 页自身 onLoad 登录校验（当前仅入口拦截）。
6. **深色模式**：仅全局/index 适配，其余页面按需补充。
7. **云托管部署**：环境变量 `WX_APPID`/`WX_SECRET`；小程序后台：同声传译插件、订阅模板、类目（教育/学习）与提审材料。
8. **协议合规**：完整「用户协议/隐私政策」文本页待补（当前为首页 modal 摘要）。

### 工作区状态
- git：`main` 与 `origin/main` 同步，工作区干净。
- 待办细节见 `.codeartsdoer/specs/m5-login-guest/tasks.md`、`m6-polish/tasks.md`（均已完成并勾选，TODO 已在文档内标注）。

---

## 2026-09-08（体验优化批 + 云托管通道切换）

### 部署通道与登录链路（生产问题修复）
- **callContainer 迁移**：前端从 `wx.request + 裸域名` 切到 `wx.cloud.callContainer`（`utils/request.js` + `app.js wx.cloud.init`），根治「request 合法域名」白名单报错；无需配服务器域名。
- **envId 修正**：`CLOUD_CONFIG.envId = prod-d6gnifjoe28cfd96f`（原误填 cloud1-… 致 INVALID_HOST）；serviceName=`express-g0hk`。
- **login 多来源**：`/api/login` 优先取云托管网关注入的 `x-wx-openid`（免 secret/免证书）；其次 `dev_` 测试码；再次 code2session（需 `WX_SECRET`）。日志曾出现 `4011` 与 `DEPTH_ZERO_SELF_SIGNED_CERT`（云托管开放接口服务容器内自签证书）——临时以 env `NODE_TLS_REJECT_UNAUTHORIZED=0` 打通，正规化方向见 TODO。

### 用户体验优化（产品拍板，2026-09-08）
- **① 默认解锁前 3 关**：1~3 关游客同享默认开放；第 4 关起逐关解锁（需上一关 ≥1 星），游客第 4 关起需登录（commit `3a84b19`）。
- **⑤ 声音开关**：`audio.js` 增加总开关（音效+TTS 统一受控），游戏 HUD 🔊/🔇 切换并持久化（`7f87cb5`）。
- **④ 排版可读性**：英文整词展示改「首字母大写」（题面/选项词/词级空槽/回执，判定仍用小写）；关键字号放大（怪兽/词级提示 13→15px、游戏提示 26→30rpx）（`1887951`，同步 question.test 断言）。
- **② 题型分类关卡**：学段下加题型 chips（综合/单词/填空/词语/成语/歇后语），分类独立抽题与存档（`grade@type@level`，综合兼容旧 key）、空分类隐藏、1~9 题提示不可进（`237ef11`）。
- **③ 小程序码（后端）**：`GET /api/wxcode` 生成 getwxacodeunlimit（云调用内网 http 免 token）→ base64 data-url（`1ce83da`）。前端分享卡叠加码待做。

### 交互 Demo（三版 HTML，供挑选交互方向）
- 子代理产出 `study_game/demo/01-duolingo-style.html / 02-boss-rush.html / 03-speed-arena.html`，见该目录；选定方向后再落地小程序。

### 待办/上线前配置（承接上文，新增）
9. **③ 前端**：`pages/share-card` 海报叠加小程序码（drawImage data-url）。
10. **云托管配置**：开放接口服务白名单加 `/wxa/getwxacodeunlimit`；小程序码发布/体验版方可扫；env `NODE_TLS_REJECT_UNAUTHORIZED=0` 为临时项，正规化=关闭开放接口服务或信任其容器 CA。
11. 低优先：关卡卡语义化（第 N 关·分类名）、game/level 深色补全、大字模式。

---

## 2026-09-08（会话收尾 · lazyCodeLoading 与终态）

- **组件按需注入**：`miniprogram/app.json` 加 `"lazyCodeLoading":"requiredComponents"`（消除开发者工具告警、优化冷启动）（commit `de0b631`）。
- 工作区与 `origin/main` 完全同步，无未提交改动；本会话全部功能与文档已归档。
- 已知待办见上文 09-08「待办/上线前配置」与 `.codeartsdoer/specs/*/tasks.md`（接续会话从此处继续）。


---

## 2026-09-08（收尾批：计分调整 · 数据链路修复 · M7 形态/地图）

### 计分与数值
- **每题得分 100→10**：每关 10 题满分 100；前端 `config.SCORE_PER_CORRECT` 与后端 `constants.SCORE_PER_QUESTION` 同步（服务端答对数×10 推导，防伪口径不变），新手引导文案同步（`07ae4f9`）。

### 数据链路修复（实测缺漏）
- **错题本空**：根因=前端从未调用 `/api/wrong/add`。修复：engine 答错触发 `onWrong` → game 注入 → 登录用户上报（`1952341`）；另后端 `wrong list/stats` 待复习口径改为「未掌握（含今日新错，当天可见）」。
- **排行榜无人**：根因=前端从未调用 `/api/rank/sync`。修复：结算通关后（登录）自动同步胜场+1/星累加（`1952341`）。
- **解锁条件提示**：avatar 页显示「累计 N 星 / 达到段位 X（还差…），达标变可解锁」，level 锁定卡显示「登录解锁 / 通关上一关解锁」（`80cd76f`）。

### Demo 打磨
- `demo/01-duolingo-style.html` 去半成品观感：顶栏真实统计（进度/今日通关/总星，跨天重置）、移除占位返回、加进度重置与 Demo2/3 切换（`edfe12c`）。

### M7 玩法形态化 + 关卡地图（spec：`.codeartsdoer/specs/m7-gameplay-modes/`）
- **Phase B 关卡蛇形路径地图**（`d443fd5`）：level 页网格→蛇形路径节点（金✔重玩 / 呼吸"继续" / 灰🔒+条件，连线随通关点亮）；学段/题型分类/游客/默认解锁3+逐关/分类存档/徽标全保留。
- **Phase A 对局三形态·玩家自选**（`aa1437c`）：经典 / Boss 狂潮（10 格血条+受击顿帧+暴怒+击破）/ 极速竞技（每题 8s+惩罚锁）；**判定/计分/星级/上报零改动**（score 恒 答对数×10，表现不进分；超时与答错同走 `_failQuestion`）。

### 接口体检（2026-09-08 线上网关）
- `e2e/smoke-api.js`：12 组路由 **全部 PASS**（authed 走 x-wx-source 通道为 1003 属预期——真实小程序走 Bearer token 不受影响；若需 smoke source 通道通，检查云托管 env `WX_TRUSTED_SOURCES` 未被清空）。
- 真实调用链探测（login 拿 token → Bearer 调 user/me、score、rank/sync、wrong/add·list、checkin/auto、report、ranklist/world、achievement、avatar）：**全部 code=0**。



