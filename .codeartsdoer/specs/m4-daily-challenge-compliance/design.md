# 词力战士 M4 阶段设计文档

> 文档状态：M4 设计（v1.0）
> 关联 spec：`spec.md`
> 说明：本文档如实反映 **M4 已落地代码** 的现状——「签到打卡」「成就勋章」两大模块已实现并接入前端；「每日挑战」「音效/BGM」「学习报告」「合规」在 spec 中规划、代码尚未落地（详见第七节实现状态对照）。

---

## 一、架构设计

### 1.1 前端新增模块（已实现）

```
miniprogram/
├── pages/
│   ├── checkin/              # 签到页
│   │   ├── checkin.js        # 签到逻辑（加载/签到）
│   │   ├── checkin.wxml      # 签到卡片 + 奖励说明
│   │   └── checkin.wxss
│   └── achievement/          # 成就列表页
│       ├── achievement.js    # 成就加载 + 检查解锁
│       ├── achievement.wxml  # 成就列表 + 解锁状态
│       └── achievement.wxss
└── game/
    └── audio.js              # 音效/发音统一接口（M1 占位空实现，M4 未补实现）
```

### 1.2 后端新增模块（已实现）

```
server/
├── routes/
│   ├── checkin.js            # 签到路由（POST 签到 / GET 查询）
│   └── achievement.js        # 成就路由（GET 列表 / POST 检查解锁）
└── models/
    ├── checkin-record.js     # 签到记录模型（checkin_records 表）
    ├── achievement.js        # 成就定义模型（achievements 表）
    └── user-achievement.js   # 用户成就关联模型（user_achievements 表）
```

### 1.3 集成改动（已实现）

- `server/db.js`：注册 `CheckinRecord`、`Achievement`、`UserAchievement` 三个模型，并建立 `User.hasMany(CheckinRecord)`、`User.hasMany(UserAchievement)` 关联（均以 `openid` 关联）。
- `server/index.js`：挂载 `/api/checkin`、`/api/achievement` 两条路由（均经 `openid` 中间件）。
- `miniprogram/app.json`：注册 `pages/checkin/checkin`、`pages/achievement/achievement` 两个页面。
- `miniprogram/pages/index/index.js`：新增 `goCheckin`、`goAchievement` 两个首页入口。

### 1.4 规划未落地模块

以下模块在 `spec.md` 中有需求定义，但当前代码库中**无对应实现**：

| 模块 | spec 章节 | 现状 |
|------|-----------|------|
| 每日挑战（DailyChallenge） | 二 | 无模型/路由/页面 |
| 音效/BGM | 五 | `game/audio.js` 仍为 M1 空占位（静默降级） |
| 学习报告 | 六 | 无路由/页面 |
| 合规（青少年模式/隐私协议/防沉迷） | 七 | 无实现 |

---

## 二、数据模型设计

### 2.1 CheckinRecord（签到记录，已实现）

对应 `server/models/checkin-record.js`，表名 `checkin_records`。

```javascript
const CheckinRecord = sequelize.define("CheckinRecord", {
  recordId: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,   // 记录 ID
  },
  openid: {
    type: DataTypes.STRING(64),
    allowNull: false,                 // 用户标识
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,                 // 签到日期
  },
  streak: {
    type: DataTypes.INTEGER,
    defaultValue: 1,                  // 连续签到天数
  },
}, {
  tableName: "checkin_records",
  timestamps: true,
  updatedAt: false,                   // 仅保留 createdAt，无 updatedAt
});
```

> 说明：spec 2.1 中 `date` 类型标注为 `date`，实现采用 `DATEONLY`，路由层以 `YYYY-MM-DD` 字符串写入。

### 2.2 Achievement（成就定义，已实现）

对应 `server/models/achievement.js`，表名 `achievements`。

```javascript
const Achievement = sequelize.define("Achievement", {
  achievementId: {
    type: DataTypes.STRING(32),
    primaryKey: true,                 // 成就标识
  },
  name: {
    type: DataTypes.STRING(32),
    allowNull: false,                 // 成就名称
  },
  description: {
    type: DataTypes.STRING(128),
    allowNull: false,                 // 描述
  },
  icon: {
    type: DataTypes.STRING(256),
    allowNull: false,                 // 图标路径
  },
  conditionType: {
    type: DataTypes.ENUM("total_wins", "total_stars", "max_combo", "rank", "perfect_clear"),
    allowNull: false,                 // 条件类型
  },
  conditionValue: {
    type: DataTypes.INTEGER,
    defaultValue: 0,                  // 条件阈值
  },
}, {
  tableName: "achievements",
  timestamps: false,                  // 静态定义，无时间戳
});
```

> 说明：spec 4.1 中 `condition` 为 `object` 字段，实现改为 `conditionType`（枚举）+ `conditionValue`（阈值）两个字段，语义等价但更利于按类型分支判断。

### 2.3 UserAchievement（用户成就关联，已实现）

对应 `server/models/user-achievement.js`，表名 `user_achievements`。

```javascript
const UserAchievement = sequelize.define("UserAchievement", {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,   // 主键
  },
  openid: {
    type: DataTypes.STRING(64),
    allowNull: false,                 // 用户标识
  },
  achievementId: {
    type: DataTypes.STRING(32),
    allowNull: false,                 // 成就标识
  },
}, {
  tableName: "user_achievements",
  timestamps: true,
  updatedAt: false,                   // 仅保留 createdAt（解锁时间），无 updatedAt
});
```

### 2.4 DailyChallenge（每日挑战，规划未实现）

spec 2.1 规划字段：`challengeId / date / grade / items / completed`。当前代码库无对应模型/表，待后续实现。

---

## 三、接口设计

> 所有接口统一返回 `{ code, data, message }` 结构（`code=0` 成功，`code=1001` 未识别用户，`code=5000` 服务内部错误），经 `openid` 中间件注入 `req.openid`。

### 3.1 签到接口（已实现，`server/routes/checkin.js`）

#### POST /api/checkin —— 签到

- 幂等：同一天重复签到返回 `code=4000`（「今日已签到」），不重复插入。
- 连续天数计算：昨日有记录则 `streak = 昨日 streak + 1`，否则 `streak = 1`。
- 签到奖励星数并回写 `RankRecord.stars`（若存在）。

**Response（成功）:**
```json
{
  "code": 0,
  "data": {
    "recordId": "uuid",
    "date": "2026-09-06",
    "streak": 3,
    "rewardStars": 30
  }
}
```

#### GET /api/checkin?month=YYYY-MM —— 获取签到记录

- `month` 可选，指定月份过滤（`[month-01, 下一月-01)` 区间）。
- 返回 `currentStreak`（今日未签时回退看昨日）、`totalCheckins`（本查询范围记录数）。

**Response:**
```json
{
  "code": 0,
  "data": {
    "records": [ { "recordId": "...", "date": "2026-09-06", "streak": 3 } ],
    "currentStreak": 3,
    "totalCheckins": 12
  }
}
```

### 3.2 成就接口（已实现，`server/routes/achievement.js`）

#### GET /api/achievement/list —— 成就列表 + 解锁状态

- 先 `initAchievements()` 懒初始化内置成就（`findOrCreate`，非 seeder）。
- 组装返回：`achievementId / name / description / icon / conditionType / conditionValue / unlocked`。

**Response:**
```json
{
  "code": 0,
  "data": [
    { "achievementId": "first_blood", "name": "首胜", "description": "首次通关",
      "icon": "/assets/achievements/first_blood.png",
      "conditionType": "total_wins", "conditionValue": 1, "unlocked": true }
  ]
}
```

#### POST /api/achievement/check —— 检查并解锁成就

- 读取 `RankRecord`（wins/stars/rankId）、`Score`（max_combo、stars）与已解锁集合，逐条判断并 `UserAchievement.create` 写入新解锁项。

**Response:**
```json
{
  "code": 0,
  "data": {
    "newlyUnlocked": [ { "achievementId": "...", "name": "..." } ],
    "totalUnlocked": 3
  }
}
```

### 3.3 规划接口（未实现）

- 每日挑战（spec 2.3 排行榜等）：无接口落地。
- 学习报告（spec 六）：无接口落地。

---

## 四、业务规则

### 4.1 签到与连续奖励

奖励分档（`checkin.js` 硬编码）：

| 连续天数 | 奖励星数 |
|----------|----------|
| 1（基础） | +10 |
| 3 | +30 |
| 7 | +100 |
| 14 | +200 |
| 30 | +500 |

- 签到仅记「连续」天数；断签（昨日无记录）则 `streak` 重置为 1。
- 奖励星数累加到 `RankRecord.stars`（影响段位/星级成就）。

### 4.2 成就解锁规则

6 个内置成就（`DEFAULT_ACHIEVEMENTS` 静态定义）：

| achievementId | name | conditionType | conditionValue |
|---------------|------|---------------|----------------|
| first_blood | 首胜 | total_wins | 1 |
| combo_master | 连击大师 | max_combo | 10 |
| star_collector | 星数收集 | total_stars | 50 |
| rank_bronze | 青铜段位 | rank | 1 |
| rank_king | 王者段位 | rank | 7 |
| perfect_clear | 完美通关 | perfect_clear | 1 |

判断逻辑（`achievement.js` 的 switch）：
- `total_wins`：`rankRecord.wins >= conditionValue`
- `total_stars`：`rankRecord.stars >= conditionValue`
- `rank`：`rankRecord.rankId >= conditionValue`
- `max_combo`：历史 `Score` 中 `max_combo` 最大值 ≥ 阈值
- `perfect_clear`：历史 `Score` 中 `stars === 3` 的次数 ≥ 阈值

---

## 五、测试策略

### 5.1 单元测试

- 签到连续天数计算（昨日有/无记录 → streak 递加/重置）
- 签到奖励分档映射（1/3/7/14/30 天 → 10/30/100/200/500）
- 成就条件判断（各 conditionType 分支）

### 5.2 集成测试

- 签到：POST 签到 → GET 查询 → 幂等（重复签到返回 4000）
- 成就：GET 列表（初始化内置成就）→ POST check → 新解锁项落库

### 5.3 幂等性测试

- 同日重复签到不重复插入、不重复加星
- 重复 check 成就已解锁项不重复插入

---

## 六、部署检查清单

- [x] 后端模型注册：`checkin_records`、`achievements`、`user_achievements`（`db.js`）
- [x] 路由挂载：`/api/checkin`、`/api/achievement`（`index.js`）
- [x] 前端页面注册：`pages/checkin/checkin`、`pages/achievement/achievement`（`app.json`）
- [ ] 内置成就图标资源：`/assets/achievements/*.png`（icon 字段引用，资源待补）
- [ ] 每日挑战 / 学习报告 / 合规模块（未实现，见第七节）

---

## 七、实现状态对照

| spec 功能 | spec 章节 | 代码实现 | 状态 |
|-----------|-----------|----------|------|
| 每日挑战 | 二 | 无 | ❌ 未实现 |
| 签到打卡 | 三 | `checkin-record.js` + `routes/checkin.js` + `pages/checkin/` | ✅ 已实现 |
| 成就勋章 | 四 | `achievement.js` + `user-achievement.js` + `routes/achievement.js` + `pages/achievement/` | ✅ 已实现 |
| 音效/BGM | 五 | `game/audio.js`（M1 空占位） | ⚠️ 仅占位 |
| 学习报告 | 六 | 无 | ❌ 未实现 |
| 合规 | 七 | 无 | ❌ 未实现 |