# 公众号排版工具（tools/wechat-mp）

把一篇 Markdown 之外的「结构化配置」直接排进微信公众号草稿箱：
填标题、填作者、粘正文、**按位置插入图片**、设封面、保存草稿。

**它不发表。** 群发不可逆，那一下必须人点 —— 这是工具的硬边界，不是没做完。

---

## 一、一次性准备

Chrome 136 之后禁止在默认账号下开调试端口（防 cookie 被读），所以要用**独立 profile** 启动一个：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\codex-mp-profile" https://mp.weixin.qq.com/
```

弹出的窗口里**扫码登录公众号后台**，然后**保持窗口开着**（脚本要从当前 URL 里取 token）。

> 想确认端口通不通：浏览器里访问 `http://127.0.0.1:9222/json/version` 能看到 JSON 就行。

## 二、跑一遍

```bash
# 先干跑：只校验配置和素材，不碰浏览器
node tools/wechat-mp/publish-draft.js --config=路径/文章.json --dry-run

# 确认无误再真跑
node tools/wechat-mp/publish-draft.js --config=路径/文章.json --port=9222
```

跑完去「内容管理 → 图文消息」看草稿。**每次运行都会新建一篇**，所以调试时记得删掉半成品。

## 三、配置格式

```json
{
  "title":   "标题（≤64 字）",
  "author":  "作者",
  "cover":   "final/01-cover.jpg",
  "summary": "（可空，留空由公众号自动取正文前 120 字）",
  "blocks": [
    { "type": "img", "src": "final/01-cover.jpg" },
    { "type": "p",   "text": "普通段落" },
    { "type": "p",   "text": "加粗段落", "bold": true },
    { "type": "h2",  "text": "一、小节标题" }
  ]
}
```

- **图片路径相对于配置文件所在目录**，`blocks` 里出现几张图就上传几张，顺序即正文顺序。
- `cover` 指向 `blocks` 里已有的图 → 直接选它；不在 `blocks` 里 → 脚本先把它插到正文最前面再选。
- 写错的地方（标题超长、类型拼错、缺字段、图片不存在）会在**动手之前**一次性报全，不会留下半成品草稿。

样例见 `config.example.json`；真实案例（一次完整发布的配置）见项目里的
`assets-src/wechat-article/article.json`（该目录不入库）。

## 四、它是怎么做到的（改代码前必读）

| 环节 | 关键点 |
| --- | --- |
| 连浏览器 | 用 Node 内置 WebSocket 直连 CDP。**不要换成 agent-browser / Playwright** —— Chrome 111+ 会拒绝带 Origin 头的 DevTools 连接，表现是「进程起来了、端口在听、就是连不上」 |
| 填文字 | 编辑器是 ProseMirror：赋值 `innerHTML` 无效，要用 `Input.insertText`（真键盘输入）或派发带 `DataTransfer` 的 `paste` 事件（贴 HTML） |
| 插图 | 图片只能走公众号自己的上传通道：把文件塞进 `input[type=file]`，微信上传完**插到当前光标处** —— 所以必须「先定位光标选标记、再投喂文件」 |
| 图片定位 | 正文里每张图先占一个 `@@IMG:n@@` 文本标记；插图时 `TreeWalker` 找到它、选中它，上传后图片替换标记，位置精确 |
| 弹窗 | 贴长文时公众号会弹「内容结构检测」，必须点掉「继续插入」，否则挡住后面所有点击 |
| 封面 | 必须从正文或图片库里选 → 所以要么本来就在正文，要么先插到最前 |
| 视口 | 固定 1280×720（`setViewport`），封面那几步的坐标常量依赖它，别改 |

## 五、已知限制

- **公众号改版会失效**：所有选择器/坐标都是照着当前版本摸出来的（2026-09-30）。真失效时先看 `lib/editor.js` 里的常量、以及 `clickByText` 的文本匹配。
- **视口必须 1280×720**：改了尺寸封面那几步就会点偏。
- **一次一篇**：不做批量。
- **不碰发表**：只到草稿。

## 六、出问题怎么看

| 现象 | 原因 / 处理 |
| --- | --- |
| `连不上 127.0.0.1:9222` | 浏览器没开，或不是用 `--user-data-dir` 独立 profile 启动的 |
| `当前页面不是公众号后台（URL 里没有 token）` | 那个浏览器窗口没登录，或停在了登录页 |
| `标题没填进去` | 编辑器结构变了（ProseMirror 选择器失效），去 `lib/editor.js` 调 `fillTitle` |
| `标记数对不上` | 正文 HTML 被编辑器清洗过，或配置里图片数与实际不符 |
| 图片插错位置 | 上传得太快，微信还没处理完上一张 → 调大 `uploadImage` 的 `waitMs` |
