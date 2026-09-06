# 词力战士 M2 阶段设计文档

> 文档状态：M2 设计（v1.0）
> 关联 spec：`spec.md`

---

## 一、架构设计

### 1.1 新增模块

```
miniprogram/
├── pages/
│   ├── avatar/              # 形象选择页
│   │   ├── avatar.js
│   │   ├── avatar.wxml
│   │   └── avatar.wxss
│   ├── rank/                # 排行榜页
│   │   ├── rank.js
│   │   ├── rank.wxml
│   │   └── rank.wxss
│   └── rank-friends/        # 好友排行榜页
│       ├── rank-friends.js
│       ├── rank-friends.wxml
│       └── rank-friends.wxss
├── components/
│   ├── avatar-item/         # 形象列表项组件
│   │   ├── avatar-item.js
│   │   ├── avatar-item.wxml
│   │   └── avatar-item.wxss
│   ├── rank-item/           # 排行榜列表项组件
│   │   ├── rank-item.js
│   │   ├── rank-item.wxml
│   │   └── rank-item.wxss
│   └── rank-badge/          # 段位徽章组件
│       ├── rank-badge.js
│       ├── rank-badge.wxml
│       └── rank-badge.wxss
└── utils/
    └── rank.js              # 排行榜计算工具
```

### 1.2 后端扩展

```
server/
├── routes/
│   ├── avatar.js            # 形象路由
│   └── rank.js              # 排行榜路由
├── models/
│   ├── avatar.js            # 形象模型
│   ├── user-avatar.js       # 用户形象关联模型
│   └── rank.js              # 排行榜模型
└── middlewares/
    └── rank.js              # 排行榜计算中间件
```

---

## 二、数据模型设计

### 2.1 后端模型

#### Avatar（形象）

```javascript
const Avatar = sequelize.define('avatar', {
  avatarId: { type: DataTypes.STRING(32), primaryKey: true },
  name: { type: DataTypes.STRING(32), allowNull: false },
  type: { type: DataTypes.ENUM('warrior', 'monster'), allowNull: false },
  rarity: { type: DataTypes.ENUM('common', 'rare', 'epic', 'legend'), allowNull: false },
  icon: { type: DataTypes.STRING(256), allowNull: false },
  unlockType: { type: DataTypes.ENUM('stars', 'rank', 'level', 'free'), allowNull: false },
  unlockValue: { type: DataTypes.INTEGER, defaultValue: 0 }
});
```

#### UserAvatar（用户形象关联）

```javascript
const UserAvatar = sequelize.define('user_avatar', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  openid: { type: DataTypes.STRING(64), allowNull: false },
  avatarId: { type: DataTypes.STRING(32), allowNull: false },
  unlockedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  currentUsed: { type: DataTypes.BOOLEAN, defaultValue: false }
});
```

#### Rank（段位）

```javascript
const Rank = sequelize.define('rank', {
  rankId: { type: DataTypes.INTEGER, primaryKey: true },
  rankName: { type: DataTypes.STRING(16), allowNull: false },
  icon: { type: DataTypes.STRING(256), allowNull: false },
  minWins: { type: DataTypes.INTEGER, defaultValue: 0 }
});
```

#### RankRecord（段位记录）

```javascript
const RankRecord = sequelize.define('rank_record', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  openid: { type: DataTypes.STRING(64), allowNull: false },
  rankId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  wins: { type: DataTypes.INTEGER, defaultValue: 0 },
  stars: { type: DataTypes.INTEGER, defaultValue: 0 }
});
```

### 2.2 本地存储扩展

```javascript
// storage.js 新增字段
{
  avatar: { currentWarrior: 'warrior_01', currentMonster: 'monster_01' },
  rank: { rankId: 1, wins: 0, stars: 0 },
  unlockedAvatars: ['warrior_01', 'monster_01']
}
```

---

## 三、接口设计

### 3.1 形象接口

#### GET /api/avatar/list

获取可用形象列表 + 已解锁状态

**Request:**
```
Headers: x-wx-openid: <openid>
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "warriors": [
      {
        "avatarId": "warrior_01",
        "name": "初学者战士",
        "rarity": "common",
        "icon": "/assets/avatars/warrior_01.png",
        "unlocked": true,
        "currentUsed": true
      }
    ],
    "monsters": [...]
  }
}
```

#### POST /api/avatar/unlock

解锁形象

**Request:**
```json
{
  "avatarId": "warrior_02"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { "unlocked": true }
}
```

### 3.2 段位接口

#### GET /api/rank/info

获取段位信息

**Response:**
```json
{
  "code": 0,
  "data": {
    "rankId": 1,
    "rankName": "青铜",
    "icon": "/assets/ranks/bronze.png",
    "wins": 0,
    "stars": 0
  }
}
```

#### GET /api/rank/progress

获取晋升进度

**Response:**
```json
{
  "code": 0,
  "data": {
    "currentRank": { "rankId": 1, "rankName": "青铜" },
    "nextRank": { "rankId": 2, "rankName": "白银" },
    "currentWins": 5,
    "winsNeeded": 10,
    "progressPercent": 50
  }
}
```

### 3.3 排行榜接口

#### GET /api/rank/world?page=1&pageSize=20

世界排行榜

**Response:**
```json
{
  "code": 0,
  "data": {
    "page": 1,
    "pageSize": 20,
    "total": 156,
    "list": [
      {
        "rank": 1,
        "openid": "xxx",
        "nickname": "玩家A",
        "avatarUrl": "...",
        "rankId": 7,
        "rankName": "王者",
        "score": 15000,
        "stars": 120
      }
    ]
  }
}
```

#### GET /api/rank/me

我的排名

**Response:**
```json
{
  "code": 0,
  "data": {
    "rank": 45,
    "nickname": "我的昵称",
    "avatarUrl": "...",
    "rankId": 3,
    "rankName": "黄金",
    "score": 5000,
    "stars": 40
  }
}
```

---

## 四、业务规则

### 4.1 段位晋升规则

- 累计胜场 = 累计通关次数（答完 10 题且得分 > 0）
- 达到段位阈值后立即晋升
- 段位只升不降（无降级机制）

### 4.2 形象解锁规则

- 默认解锁：`warrior_01`、`monster_01`
- 星数解锁：总星数达到阈值
- 段位解锁：段位达到阈值
- 解锁后持久化到数据库

### 4.3 排行榜更新规则

- 每次通关后上报成绩（幂等 upsert）
- 排行榜按 score 降序排列
- 同分按 stars 降序
- 同分同星按 updatedAt 升序

---

## 五、测试策略

### 5.1 单元测试

- 段位晋升计算逻辑
- 形象解锁条件判断
- 排行榜分页查询

### 5.2 集成测试

- 形象接口：列表 + 解锁 + 使用
- 段位接口：信息 + 进度
- 排行榜接口：世界 + 我的排名

### 5.3 幂等性测试

- 重复上报成绩不重复计分
- 重复解锁形象不重复插入

---

## 六、部署检查清单

- [ ] 后端模型迁移：avatar、user_avatar、rank、rank_record
- [ ] 内置形象数据初始化
- [ ] 内置段位数据初始化
- [ ] 排行榜索引：openid + score