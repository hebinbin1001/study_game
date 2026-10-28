# 待修复 Bug 与优化清单（交付修复用）

> 来源：`docs/玩法体系评估-待确认.md` 的实测结论。本文**只列可执行项**，背景与完整评估见那份文档。
> 所有条目均已用脚本实测复现，**不是推测**。每条给出：位置 / 现象 / 根因 / 复现 / 改法 / 验收。
> 生成时间：本轮评估；**本文档不作为「已经修好」的依据**，修完请按 §5 逐条跑验证。

---

## 0. 修复前必读（项目硬约定）

1. **改文件不要用 PowerShell 写**（PS5.1 默认 GBK，会毁掉中文，项目已踩过两次）。
   用编辑器 / `apply_patch` 之类按 UTF-8 写。
2. **控制台里中文显示乱码是 PowerShell 的问题，不代表文件坏了** —— 判断编码要看 `git diff`。
3. 提交前**只跑相关模块**，不要自己跑全量回归（全量须用户明确说「上线」才跑）：
   ```bash
   node e2e/run-all.js --changed          # 按 git 改动自动推导
   node e2e/run-all.js --module=puzzle    # 数字智力模块
   node tests/unit/run-all.js             # 单测
   ```
4. **本清单全部条目不涉及**：数据库 DDL、后端接口、云托管部署、素材与包体。
   都是端上纯逻辑 / 文案 / 测试，**不需要部署，只需在微信开发者工具里预览**。
5. **有一条不可破坏的不变量**：7 条玩法线每一档的 1/2/3 星都必须拿得到
   （护栏 `tests/unit/challenge.test.js`、`tests/unit/stars-reachable.test.js`）。
   本清单里的修复**都不该动到它**，改完必须这两个文件全绿。
6. 本清单的修复**都不影响老存档**：星级按 `学段@线@关卡` 存 0~3，取历史最大；
   题目参数不落库。所以改难度参数不会让老玩家的星变少。

---

## 第一部分：Bug（建议直接修）

### BUG-1 🔴 初一到大学生的「口算冲刺 / 算式天平」难度断崖式回落

**严重度：高**（玩家能明显感知：年级越高题目反而越简单）

**位置**
- `miniprogram/game/math-sprint.js:21-23`
- `miniprogram/game/balance.js:34-36`

```js
function gradeScale(gradeIdx) {
  if (typeof gradeIdx !== 'number' || gradeIdx < 0 || gradeIdx > 6) return 1;
  return [0.6, 0.8, 1, 1.3, 1.6, 2, 2.4][gradeIdx];
}
```

**根因**
这段是「7 档学段」时代写的：数组只有 7 个元素，且 `gradeIdx > 6` 直接回落成 `1`（基准倍率）。
而 `constants.GRADES` 在「学段按年级细分」改造后已经是 **14 档**（`kg, g1…g12, college`），
页面传进来的 `_gi` 是 **0~13**：

- `pages/math-sprint/math-sprint.js:43` → `this._gi = lv - 1`，`:99` 传给 `makeQuestion`
- `pages/math-balance/math-balance.js:49` → `this._gi = lv - 1`，`:79` 传给 `makeQuestion`

所以 **gradeIdx = 7~13（对应关卡 8~14 = 初一 ~ 大学）全部掉进 fallback，倍率变回 1**。

**实测证据**（`elapsed=0`，各采样 300~400 次取最大数字；脚本见 §5 ①）

口算冲刺：

| 关卡 | 学段 | 最大数字 |
| --- | --- | --- |
| 1 | kg 幼儿园 | 12 |
| 2 | g1 一年级 | 16 |
| 3 | g2 二年级 | 20 |
| 4 | g3 三年级 | 26 |
| 5 | g4 四年级 | 32 |
| 6 | g5 五年级 | 40 |
| 7 | g6 六年级 | **48 ← 峰值** |
| 8 | **g7 初一** | **20 ← 断崖** |
| 9~14 | g8 ~ 大学 | **20**（一直平） |

算式天平（取「混合」题档 `idx=9`）：

| 关卡 | 学段 | 最大数字 |
| --- | --- | --- |
| 7 | g6 六年级 | 22 |
| 8 | **g7 初一** | **9** |
| 9~14 | g8 ~ 大学 | **9** |

→ **初一到大学生的题目数字范围，比小学四/五/六年级还小，落回二年级水平。**

**改法**（两处同样改）
1. 把数组扩成 **14 个元素、保持单调递增**，建议保留原两端锚点（幼儿园 `0.6`、大学 `2.4`）：
   ```js
   var SCALE = [0.6, 0.7, 0.8, 0.9, 1.0, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9, 2.05, 2.2, 2.4];
   function gradeScale(gradeIdx) {
     if (typeof gradeIdx !== 'number' || gradeIdx < 0 || gradeIdx >= SCALE.length) return 1;
     return SCALE[gradeIdx];
   }
   ```
   > 上面这组数值只是**起点**，允许调整；**约束是**：① 14 个元素；② 严格单调不减；
   > ③ 两端保持 0.6 / 2.4；④ 判断上界改用 `SCALE.length`，**不要再写死数字**（这次的根因就是写死）。
2. 用 `SCALE.length` 而不是 `GRADES.length` 做上界，这样以后学段再变，倍率表自己会报错而不是静默回落。

**验收**
- 关卡 8~14 的最大数字 **≥ 关卡 7**，且 1~14 关单调不减（补成单测，见 BUG-4）。
- `node tests/unit/math-sprint.test.js`、`node tests/unit/balance.test.js` 全绿。

**回归风险**：低。纯出题参数，不落库；只影响 g7~college 的题目数字范围（正是要修的方向）。

---

### BUG-2 🟠 关卡页难度分母写死 `/7`（用户可见）

**严重度：中**（显示错误，玩家会疑惑「14/7 是什么」）

**位置**：`miniprogram/utils/puzzle-levels.js:79` 与 `:82`

```js
// :79 口算冲刺
return gradeLevels(function (g, i) { return '60 秒 · 连击翻倍 · 难度 ' + (i + 1) + '/7'; });
// :82 算式天平
return gradeLevels(function (g, i) { return '加减 → 乘 → 混合 · 难度 ' + (i + 1) + '/7'; });
```

**根因**：同一个「7 档 → 14 档」改造的残留。`gradeLevels` 按 `constants.GRADES`（14 档）生成 14 关，
但文案里的分母写死 7。

**现象**：`pages/puzzle-level/puzzle-level.wxml:24` 直接渲染 `{{item.sub}}`，所以关卡列表会显示
`难度 1/7 … 难度 7/7`（正常）然后 `难度 8/7 … 难度 14/7`（错误）。

**改法**：分母取常量，别写死：
```js
return gradeLevels(function (g, i) {
  return '60 秒 · 连击翻倍 · 难度 ' + (i + 1) + '/' + constants.GRADES.length;
});
```
（该文件第 14 行已经 `require('./constants')`，直接用。）

**验收**：口算冲刺 / 算式天平的 14 关副标题为「难度 1/14」…「难度 14/14」；补断言（见 BUG-4）。

**回归风险**：无。纯文案，不改参数。

---

### BUG-3 🟠 记忆矩阵关卡页的描述与实际玩法完全不符

**严重度：中**（玩家照描述选关，进去发现不是那回事）

**位置**
- 关卡表：`miniprogram/utils/puzzle-levels.js:84-86`
  ```js
  if (k === 'memory') {
    return gridLevels(3, 5, [1, 2], 'memory');   // 生成 "2×2 格 · 单个数字" … "6×4 格 · 2 位数字"
  }
  ```
  `gridLevels` 产出的 `sub` 形如 `'2×2 格 · 单个数字'`、`params` 是 `{rows, cols, digits}`。
- 引擎实际：`miniprogram/game/memory-grid.js:10` `GRID = 25`（**固定 5×5**），
  难度来自 `targetCount(level)`（亮格数 3→8 封顶，`:18`）与 `showMs(level)`（展示时长 1500→650ms，`:27`）。
- 页面实际：`miniprogram/pages/memory-grid/memory-grid.js:59,66` 只用 `lib.GRID` /
  `lib.targetCount` / `lib.showMs`，**从来不读 `rows/cols/digits`**。

**结论**：关卡页对记忆矩阵的描述是错的 —— 点进去是「5×5 记住亮了几格」，和「2×2 格 · 单个数字」毫无关系。

**改法（推荐：改文案，不动引擎）**
引擎的「亮格数 + 展示时长」双轴递减是**能用的真难度**，比「格子×位数」更贴合已实现的玩法。
所以让 `sub` 与引擎同源（**从引擎取，不要抄一份常量**）：

```js
if (k === 'memory') {
  var mg = require('../game/memory-grid');
  var out = [];
  var total = COUNTS.memory;                 // 30
  for (var i = 1; i <= total; i++) {
    out.push({
      no: i,
      label: '第 ' + i + ' 关',
      sub: '亮 ' + mg.targetCount(i) + ' 格 · ' + (mg.showMs(i) / 1000).toFixed(1) + ' 秒',
      params: {}
    });
  }
  return out;
}
```
> 注意：这里出现了一个「utils 反向 require game」的依赖方向，项目里已有同类先例
> （`puzzle-levels.js:69` 就 `require('../data/g2048-levels')`），可以接受；
> 若修复方觉得不妥，替代方案是**把口径文案写在引擎里导出一个 `describeLevel(i)`**，页面只渲染。
> **`params` 若下游无人使用，可直接置空**（已确认页面不读）。

**验收**：关卡页每关描述与进入后实际界面上的「记住 N 个亮格 / 约 X 秒后消失」一致（同源即一致）。

**回归风险**：低。只改关卡表文案；`tests/unit/puzzle-levels.test.js` 有一条
`assert.contains(list[0].sub, '格')` —— 改后仍含「格」字，**不会红**（但该断言本身很弱，见 BUG-4）。

---

## 第二部分：测试护栏缺失（不补会再犯）

### BUG-4 🔴 两处「假绿灯 / 未覆盖」测试 —— 这是 BUG-1~3 能长期存活的原因

#### 4a. `tests/unit/puzzle-levels.test.js` 的断言自己等于自己

**位置**：`tests/unit/puzzle-levels.test.js:18-29`

```js
const list = lv.levelsOf(k);
s.assert.equal(list.length, constants.GRADES.length, k + ' 应有 7 档');   // ← 消息仍写「7 档」
s.assert.equal(list[0].params.grade, constants.GRADES[0].key);
s.assert.equal(list[6].params.grade, constants.GRADES[6].key);            // ← 写死第 7 档
```

**问题**
1. 断言是 `list.length === constants.GRADES.length`，**两边同源 → 永远成立**，
   学段从 7 档改 14 档它也不会红；
2. 人类可读的消息还写着「应有 **7** 档」，`list[6]` 也是 7 档时代的残留；
3. **全文件没有任何一条断言检查 `sub` 的内容** → 所以 BUG-2（`/7`）和 BUG-3（错误描述）都漏过去了。

**改法**
```js
s.assert.equal(list.length, 14, k + ' 应有 14 档（学段按年级细分后）');
// 覆盖首/中/尾三档，而不是只测第 7 档
[0, 6, 13].forEach(function (i) {
  s.assert.equal(list[i].params.grade, constants.GRADES[i].key);
});
list.forEach(function (it) {
  s.assert.ok(!!it.sub, k + ' 第 ' + it.no + ' 关要有难度说明');
  // 分母必须等于真实档数，不许写死
  if (it.sub.indexOf('难度') >= 0) {
    s.assert.contains(it.sub, '/' + constants.GRADES.length, '第 ' + it.no + ' 关分母写死了');
  }
});
```
补一条记忆矩阵的断言（与引擎同源）：
```js
s.test('记忆矩阵：描述与引擎口径一致', () => {
  const mg = require('../../miniprogram/game/memory-grid');
  const list = lv.levelsOf('memory');
  s.assert.equal(list.length, 30);
  s.assert.contains(list[0].sub, String(mg.targetCount(1)));   // 描述里的亮格数 = 引擎的
  s.assert.contains(list[29].sub, String(mg.targetCount(30)));
});
```

#### 4b. `math-sprint` / `balance` 的单测从未传入 `gradeIdx`

**位置**：`tests/unit/math-sprint.test.js:23,29,34,42` 与 `tests/unit/balance.test.js:32,38,62,72`

```js
const a = m.makeQuestion(0);              // 只传 elapsedMs，gradeIdx 是 undefined
const b = m.makeQuestion(25000);
const q = g.makeQuestion(i % g.ROUND_Q, seededRandom(i + 1));   // 只传 idx 和 random
```

**问题**：`gradeIdx` 永远是 `undefined` → `gradeScale(undefined)` → 走 fallback `return 1`。
**「按年级分档」这个功能从头到尾一次都没被测过**，所以 BUG-1 一路活到今天。

**改法**：加一条单调性用例（这条比逐个断言具体数值更耐用，以后调倍率不会假红）：
```js
s.test('年级倍率：0~13 档单调不减，且高年级不低于低年级', () => {
  const c = require('../../miniprogram/utils/constants');
  const maxOf = (gi) => {
    let mx = 0;
    for (let i = 0; i < 300; i++) {
      const m = (m.makeQuestion(0, gi).expr.match(/\d+/g) || []).map(Number);
      mx = Math.max(mx, ...m);
    }
    return mx;
  };
  let prev = 0;
  for (let gi = 0; gi < c.GRADES.length; gi++) {
    const cur = maxOf(gi);
    s.assert.ok(cur >= prev, '第 ' + (gi + 1) + ' 档(' + c.GRADES[gi].key + ')最大数字 ' + cur + ' 低于上一档 ' + prev);
    prev = cur;
  }
});
```
> 随机采样会让这条用例有极小概率抖动，建议**要么断言 `gradeScale` 的返回值序列**（把它 export 出来），
> **要么把采样次数拉高**。更稳的做法是把 `gradeScale` 加进 `module.exports` 直接断言倍率数组单调 —— 推荐这个。

---

## 第三部分：优化（含需拍板项）

> 这些不是 bug，是体验/内容问题。**「需拍板」的不要自行开工**，等用户确认。

### OPT-1 🟡 限时抢答第 21~30 关难度完全相同（可直接做）

**位置**：`miniprogram/utils/challenge.js:594`

```js
out.seconds = Math.max(30, 60 - tier * 8);   // 60 → 52 → 44 → 36 → 28→封顶30 → 20→封顶30
```

**现象**：tier 4 与 tier 5 都被封顶到 30 秒，所以 `10 题 · 30 秒` 覆盖了**第 21~30 关共 10 关**，
30 关里最后 1/3 没有任何难度变化。

**改法（任选）**
- 把地板从 30 秒降到 26 秒：`Math.max(26, 60 - tier * 7)` → `60/53/46/39/32/26`（6 档全不同）；
- 或直接改成查表：`[60, 52, 44, 37, 31, 26][tier]`。

**验收**：`challenge.lineLevelAt()` 打印出的 30 关参数里，`seconds` 有 **6 个不同值**（现在只有 5 个）。
**必须同时确认**：`node tests/unit/challenge.test.js` 与 `stars-reachable.test.js` 仍全绿
（限时抢答不扣命，三档星级天然可达，理论上不受影响 —— 但要跑过才算数）。

### OPT-2 🔴 词义消消乐 / 词语连连看：两条线 30 关零递增，且机制互相重复（**需拍板**）

**证据**
- 两条线的 30 关参数**只有 1 个档位**（`match` 29/29 关与上一关完全相同，`link` 同样）；
- 两者都是「4×4 附近网格的词↔义配对 + 剩余命 3/2/1 折星」；
- 项目自己的方案文档 `docs/关卡与玩法重构方案-待确认.md` 已标注「**二者重复，保留一种**」，
  但提交 `699dabf` 的结论是「维持现状（按拍板）」，两条都上线了；
- 代价：玩法线 7 条里占 2 条 = **840 个关卡节点**（30 × 2 × 14 学段）。

**候选方案（等用户选）**

| 方案 | 做法 | 成本 | 代价 |
| --- | --- | --- | --- |
| A 只删一条 | 保留 `link`（已实现 + 有 E2E 覆盖），`match` 下线为占位 | 低（约半天） | 要处理已有进度入口；少 30 关 |
| B 做出真差异 | `link` 保留「路径连接」；`match` 改成**多轮 / 限时** | 中（2~3 天） | 要改引擎 + 页面 + 单测 + E2E |
| C 维持现状 | 不动 | 0 | 840 个节点继续同质 |

> 评估文档的建议是 **B**：`link` 的路径判定（`game/link.js:16 canConnect`）是真实差异，
> 而 `quiz` 已经验证过「**用时间做难度**不受题量天花板约束」（`challenge.js:590-594` 注释明确写了）。

### OPT-3 🔴 字母拼词 / 成语拼字：题量递增被数学锁死，高学段后 25 关无变化（**需拍板**）

**证据**：在「5 命 + 90/70/60」口径下，能让 1/2/3 星都拿到的题量**只有 6, 8, 9, 10, 11, 12, 13**；
第 14 题起最低可达正确率是 71.4%，**1 星档（60~70%）数学上取不到**。
所以 `challenge.js:516 lineSafeCount()` 找不到 13 以上的合法题量时会兜底回到 13。

实测结果：

| 学段 | 拼词线 30 关的真实题量 | 档位数 |
| --- | --- | --- |
| kg ~ g5 | 6/8题×5 → 9 → 10 → 11 → 12 → 13（各 ×5） | 5~6 |
| g6 ~ g9 | 10题×5 → 11 → 12 → **13题×15** | 4 |
| **g10 ~ 大学** | 12题×5 → **13题×25** | **2** |

→ 高一到大学这 4 个学段，**后 25 关（83%）难度零变化**。

**天花板由命数决定**（实测）：3 命→6 题 / 4 命→9 题 / **5 命→13 题** / 6 命→16 题 / 7 命→19 题。

**候选方案（等用户选）**

| 方案 | 做法 | 效果 | 代价 |
| --- | --- | --- | --- |
| A 抬命数 | 这两条线改 6 命 → 天花板 16 题 | 最直接 | 加完还会撞（16 题）；新老口径不一致 |
| B 加难度轴 | 保留 5 命，改加「每题限时」或「干扰项 +1」 | 不受天花板约束，教学上更真 | 改引擎 + 页面，2~3 天 |
| C 顺内容难度 | 逐关取更长 / 更生僻的词（按词长、词频出题） | 难度来自内容本身，最自然 | 需要给词库加难度字段或构建期排序 |

> 评估文档建议 **B + C**（A 只是把天花板抬高，换一条轴才不封顶）。
> **不论选哪个，都必须保住「三档星级可达」这条不变量**（`challenge.test.js` 护栏）。

### OPT-4 🟡 成就只覆盖 3 / 15 款玩法（可直接做，性价比最高）

**位置**：`server/achievements.js:119-121` 只有 `snake_master` / `math24_master` / `sudoku_master`
三个玩法专属成就；配套指标只有 `snakeClears` / `math24Clears` / `sudokuClears`（`:52-54`、`:207-209`）。

**缺口**：其余 12 款（含 7 条玩法线里的 `word_warrior` / `word_build` / `idiom` / `match` /
`link` / `quiz`）**没有任何专属成就**，玩家在其中拿不到可炫耀目标。

**改法**：机制**全现成** —— `achievements.js:182-184` 已有 `clearsOf(game_type)` 通用函数，
只需加数据（各加 1 条「通关 N 次」）+ 在 `statsFrom` 里挂上对应指标。
**建议至少补齐 7 条玩法线**，其余数字智力按需。

**注意**：成就定义改动涉及 `server/`，**需要云托管部署**才生效（本清单其他条目不需要）。

### OPT-5 🟢 「听」维度为零覆盖（**需拍板**）

**证据**
- 16 款玩法全部是「看字」，没有一款用耳朵；
- `game/audio.js:53-79` 的 TTS（`speak` / `speakByItem`）**已实现**，但 `app.json` **没有 `plugins` 声明**
  → `requirePlugin('WechatSI')` 返回 null → 发音**静默降级、实际是关的**（`audio.js:6-7` 注释说明
  当初因「编译报插件未授权」才关掉）；
- **有一条零插件依赖的路**（实测覆盖率）：

| 数据 | 数量 | 带注音 | 覆盖率 | 现状用途 |
| --- | --- | --- | --- | --- |
| 英语类词条 | 1877 | 1864 带 `ipa` | **99.3%** | **只在两处展示**：`pages/game/game.wxml:41`、`pages/bank/bank.wxml:163`；**没有任何玩法用它出题** |
| 汉字类词条 | 559 | 559 带 `py` | 100% | **只作排序键**（`utils/bank.js:52-55, 333-345`），且**不带声调**（`草`→`cao`）→ **不能直接当注音用** |

**建议**：先做**零插件的音标玩法**（如「看音标选词 / 音标拼词」），99.3% 覆盖、纯离线、包体零增长。
若要真发音则需恢复 TTS 插件，**但要先解决插件授权**这一关，属独立风险项。
**若要做「拼音选字」**，得先用构建期工具重新生成**带声调**的拼音（现有 `py` 是无声调排序键）。

### OPT-6 🟢 `bounce`（单词弹弹球）灰卡（可直接做）

**位置**：`miniprogram/utils/game-catalog.js:40` —— `unlocked: false`、desc「暂无成熟玩法案例 · 敬请期待」、
**没有 url**。

**性质**：它是**已拍板删除**的残留，不是待开发：
- 提交 `699dabf` 原文：「弹弹球无成熟案例, 玩法页下线为占位」；
- `docs/关卡与玩法重构方案-待确认.md` 的玩法矩阵：「单词弹弹球 ｜ 现有占位（未实现）｜ **删除**」；
- 但 `pages/bounce/` 四件套代码还在（`bounce.js` 173 行）。

**改法**：从 `game-catalog.js` 删掉该条；同步清理 `pages/bounce/` 与 `app.json` 里的注册。
**注意**：删掉页面后要跑 `node e2e/check-assets.js` —— 它会提示「没有任何代码引用的 JS」，
确认没有死代码残留（`app.json` 的 `pages` 数组也要一起删，否则结构校验会红）。

### OPT-7 🟢 玩法缺「预期时长」标注（可直接做，约半天）

**问题**：`math24` 无时限、`klotski` 后段最少 100 步，单关可能十几分钟；
而小程序是碎片场景，玩家点进玩法前无法判断要不要坐下来玩。

**改法**：`utils/game-catalog.js` 每款加 `minutes: '约 1 分钟' / '3~5 分钟'`，玩法卡与关卡页展示。
纯静态数据 + 一个展示位。

---

## 4. 优先级建议

| 顺序 | 条目 | 理由 | 预估 |
| --- | --- | --- | --- |
| 1 | **BUG-1** | 唯一的功能性 bug，高学段玩家体验直接受损 | 1~2 小时 |
| 2 | **BUG-4** | 两道 bug 的共同根因，不补会再犯 | 1 小时 |
| 3 | **BUG-2** | 一行文案，用户可见 | 10 分钟 |
| 4 | **BUG-3** | 描述与玩法不符，用户可见 | 30 分钟 |
| 5 | **OPT-4** | 机制现成、只加数据、性价比最高（**需部署**） | 约 1 天 |
| 6 | **OPT-1** | 30 关里最后 10 关无难度变化 | 1 小时 |
| 7 | **OPT-6** | 清掉虚假承诺的灰卡 | 10 分钟 |
| 8 | **OPT-7** | 体验打磨 | 半天 |
| — | **OPT-2 / OPT-3 / OPT-5** | **等用户拍板，不要自行开工** | — |

**BUG-1~4 属「明显 bug 不用等确认」的例外，可直接修**；
OPT-1 / OPT-4 / OPT-6 / OPT-7 是低风险改进，建议一并做；
OPT-2 / OPT-3 / OPT-5 涉及玩法规则与奖励体系，**必须先拍板**。

---

## 5. 复现与验证命令

> 全部是只读 `node -e`，在 `study_game/` 目录下跑。

**① 复现 BUG-1（口算冲刺各档数字范围）**

```bash
node -e "
const ms=require('./miniprogram/game/math-sprint.js');
const c=require('./miniprogram/utils/constants.js');
for(let gi=0; gi<c.GRADES.length; gi++){
  const seen=[]; for(let i=0;i<400;i++) seen.push(ms.makeQuestion(0, gi).expr);
  const nums=seen.join(' ').match(/\d+/g).map(Number);
  console.log('关卡'+(gi+1), c.GRADES[gi].key, '最大数字='+Math.max(...nums)); }"
```
**修好后的期望**：`最大数字` 一列 **单调不减**（现在是 12/16/20/26/32/40/48 之后掉回 20 并一直平）。

算式天平同理，把 `ms.makeQuestion(0, gi)` 换成 `bal.makeQuestion(9, Math.random, gi)`，
`require('./miniprogram/game/balance.js')`。

**② 复现 BUG-2（关卡页文案）**

```bash
node -e "
const lv=require('./miniprogram/utils/puzzle-levels.js');
for(const k of ['sprint','balance']) console.log(k, lv.levelsOf(k).map(x=>x.sub).join(' | '));"
```
**修好后的期望**：分母为 **14**，不出现 `8/7` 之类。

**③ 复现 BUG-3（记忆矩阵描述）**

```bash
node -e "
const lv=require('./miniprogram/utils/puzzle-levels.js');
console.log(lv.levelsOf('memory').slice(0,3).map(x=>x.sub));
console.log(lv.levelsOf('memory').slice(-2).map(x=>x.sub));"
```
**修好后的期望**：描述里的亮格数/秒数与 `game/memory-grid.js` 的
`targetCount(i)` / `showMs(i)` 一致（现在显示的是「2×2 格 · 单个数字」，共 30 关）。

**④ 复现 OPT-1（限时抢答后 10 关同参）**

```bash
node -e "
const ch=require('./miniprogram/utils/challenge.js');
for(let lv=1;lv<=30;lv+=5) console.log('L'+lv, ch.lineLevelAt('g4','quiz',lv).sub);"
```
**修好后的期望**：6 档的秒数各不相同（现在是 `60/52/44/36/30/30`）。

**⑤ 确认没破坏星级可达性（每次改难度参数都要跑）**

```bash
node tests/unit/challenge.test.js
node tests/unit/stars-reachable.test.js
node e2e/run-all.js --module=puzzle
node e2e/run-all.js --changed
```

---

## 6. 一句话交接摘要

**要修 3 个 bug + 补 2 处测试护栏**：
① `math-sprint.js` / `balance.js` 的年级倍率表还是 7 档写的，导致**初一~大学难度回落**（功能性，最要紧）；
② `puzzle-levels.js` 两处难度分母写死 `/7`（现在是 14 档）；
③ `puzzle-levels.js` 的记忆矩阵描述（「2×2 格 · 单个数字」）与引擎实际玩法（固定 5×5、亮格数 3→8）不符；
④⑤ `puzzle-levels.test.js` 的断言自己等于自己（永远绿）、`math-sprint`/`balance` 单测从未传 `gradeIdx`
—— 这正是 ①②③ 能活到今天的**共同根因**，必须一起补。

**7 个优化项里，3 个（OPT-2 消消乐/连连看重复、OPT-3 拼词成语 13 题天花板、OPT-5 听力维度）
需要产品拍板后才能开工**，其余可直接做。**全部条目都不涉及数据库与云托管**（唯一例外是 OPT-4 成就定义在 `server/`，需部署）。
