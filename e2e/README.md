# 端到端验证与全流程编排（e2e/）

把「写代码 → 跑测试 → 提交」固化成一条命令，避免每次靠人肉记忆决定跑哪些检查。

---

## 一、一条命令跑完全部

```bash
cd study_game
npm run verify          # 全量：静态 → 单元 → 端到端
npm run verify:fast     # 只跑静态 + 单元（秒级，不需要开发者工具）
npm run e2e             # 只跑端到端（需要开发者工具）
npm test                # 只跑单元测试

node e2e/run-all.js --only=game    # 只跑某一段，便于单点排障
node e2e/run-all.js --only=link
```

任一层失败则整体以非 0 退出，可直接当作提交门禁。

---

## 二、分层与顺序

编排器按「先便宜后昂贵」固定顺序执行，失败能立刻看出是哪一层的问题：

| 层 | 阶段 id | 内容 | 需要开发者工具 |
|---|---|---|---|
| 静态 | `syntax` | 全量 JS 语法检查 | 否 |
| 静态 | `structure` | app.json / 组件 / tabBar / 玩法一致性 | 否 |
| 静态 | `wxss` | WXSS 检查 | 否 |
| 单元 | `unit` | `miniprogram/utils/__tests__/` 全套 | 否 |
| 端到端 | `game` | 单词闯关（字母射击打怪） | 是 |
| 端到端 | `math24` | 算 24 点 | 是 |
| 端到端 | `link` | 词语连连看 | 是 |
| 端到端 | `snake` | 单词贪吃蛇 | 是 |
| 端到端 | `pages` | 全页面渲染回归（18 页） | 是 |
| 端到端 | `m2m4` | M2~M4 页面回归（8 页） | 是 |

**强制串行**：所有 E2E 共用微信开发者工具的同一个自动化端口（3799），并发会互相抢占项目实例，产生假失败。

---

## 三、前置条件

1. 微信开发者工具已安装并**已登录**；
2. 工具安装目录与 `e2e/lib/harness.js` 顶部的 `DEVTOOLS_DIR` 一致
   （当前为 `D:\Program Files (x86)\Tencent\微信web开发者工具`）；
3. 端口 3799 未被占用。

不需要手动打开开发者工具：harness 检测到端口未就绪时会自动执行 `cli auto` 拉起。

---

## 四、目录职责

| 文件 | 职责 |
|---|---|
| `run-all.js` | 全流程编排器（分层、串行、汇总、写报告） |
| `lib/harness.js` | E2E 公共底座：连接、超时保护、进关前置、状态等待、断言汇总 |
| `verify-game.js` | 单词闯关玩法逻辑 |
| `verify-math24.js` | 算 24 点玩法逻辑 |
| `verify-link.js` | 词语连连看玩法逻辑 |
| `verify-snake.js` | 单词贪吃蛇玩法逻辑 |
| `verify-all-pages.js` / `verify-m2m4.js` | 页面渲染回归 |
| `syntax-check-all.js` / `structure-check.js` / `check-wxss.js` | 静态检查 |
| `smoke-api.js` / `probe-callcontainer.js` | 后端接口冒烟（需网络） |
| `reports/` | 运行产物（已 gitignore，每次运行覆盖） |

---

## 五、写新用例的约定（重要）

### 1. 用 harness，不要各写一份样板

```js
const H = require('./lib/harness');

H.runSuite('verify-xxx（玩法名）', async function (miniProgram, ck) {
  const page = await H.goto(miniProgram, '/pages/xxx/xxx', 1500);
  ck.check('页面已渲染', !!(await H.waitForSelector(page, '.page-xxx', 8000)));
});
```

`runSuite` 负责连接、异常兜底、汇总与退出码；`ck.check(label, ok, detail)` 收集断言且**不中断**执行，最后统一列出失败项。

### 2. 等状态，不要等时间（最关键的一条）

引擎主循环把 `dt` 钳制在 **0.05s/帧**（REQ-NFR-1 保帧率），所以当模拟器帧率低于 20fps 时，
游戏内的「游戏时间」推进速度会**慢于墙上时间** —— 0.7 秒的死亡动画在开发者工具里可能耗时 2 秒以上。

因此：

```js
// ✗ 反例：固定等待 + 立刻断言，随机器负载偶发假失败
await option.tap();
await page.waitFor(2200);
ck.check('题号已推进', (await page.data()).qIndex === 2);

// ✓ 正例：等状态信号
await option.tap();
const d = await H.waitForData(page, function (x) { return (x.qIndex || 0) > 1; },
  20000, '题号推进');
ck.check('题号已推进', !!d);
```

**为什么「题号推进」能当作「可以继续作答」的信号**：引擎 `_newQuestion()` 里先执行
`G.state = IDLE`，之后才 `_emitOptions()/_emitHud()`；所以观察到题号变化时，引擎必然已回到可作答态。
若不等这个信号就点下一题，`engine.fire()` 会因 `state !== 'idle'` 直接 return，得分/连击/浮层断言会连片失败。

### 3. 进关前必须先过两道遮罩

游戏页有 M7 形态选择层与 M6-L 新手引导两道前置，不过这两层引擎不会启动、`.option` 恒为 0：

```js
const page = await H.goto(miniProgram, '/pages/game/game?grade=kindergarten&level=1', 2000);
await H.clearGameGates(page);          // 形态选择层 + 新手引导 ×3
await H.waitForCount(page, '.option', 4, 20000);
```

### 4. 涉及定时器/主循环的玩法，先冻结再手动步进

贪吃蛇这类「定时器驱动 + 有竞态」的玩法，用例应冻结主循环、手动步进到确定态再断言
（见 `verify-snake.js`），把随机竞态变成确定性状态机。

### 5. 判定连通性/可解性时，复用产品自身规则

连连看这类玩法不要用测试自己的一套「能不能连」规则去判定，
否则会写出「假绿灯」—— 测试通过了，产品规则却是错的。应调用产品自身的判定函数（见 `verify-link.js`）。

---

## 六、失败处理与迭代循环

```
改代码 → npm run verify
   ├─ 全绿 → 提交
   └─ 有失败 → 读报错定位 → 修 → 再跑全套
                 └─ 连续 3 轮仍失败 → 暂停，输出问题摘要，等人工确认
```

每次修改代码后必须重跑**全套**（而不是只跑失败的那一层），因为改动可能影响其他阶段的前提。

### 排查顺序

1. 看汇总表定位失败层；
2. 单点复现：`node e2e/run-all.js --only=<阶段id>`；
3. 区分「产品缺陷」与「用例假设错误」：
   - 产品缺陷 → 改产品代码，并补一条能覆盖该缺陷的回归断言；
   - 用例假设错误（如上面第五节第 2 条） → 把正确的等待/驱动方式下沉到 `harness.js`，避免下次再踩；
4. 修完重跑全套。

---

## 七、产物

每次运行都会覆盖写入：

- `e2e/reports/latest.json` —— 结构化摘要（各阶段 ok/status/耗时、总 verdict）
- `e2e/reports/last-run.txt` —— 一行一阶段的紧凑结果

两个文件均已 gitignore，属于生成物。
