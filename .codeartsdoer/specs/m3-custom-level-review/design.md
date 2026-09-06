# 词力战士 M3 阶段设计文档

> 文档状态：M3 设计（v1.0）
> 关联 spec：`spec.md`

---

## 一、架构设计

### 1.1 新增模块

```
miniprogram/
├── pages/
│   ├── level-editor/        # 关卡编辑器页
│   │   ├── level-editor.js
│   │   ├── level-editor.wxml
│   │   └── level-editor.wxss
│   ├── level-share/         # 分享导入页
│   │   ├── level-share.js
│   │   ├── level-share.wxml
│   │   └── level-share.wxss
│   ├── wrong-book/          # 错题本列表页
│   │   ├── wrong-book.js
│   │   ├── wrong-book.wxml
│   │   └── wrong-book.wxss
│   └── wrong-review/        # 复习页
│       ├── wrong-review.js
│       ├── wrong-review.wxml
│       └── wrong-review.wxss
├── components/
│   ├── question-item/       # 题目列表项组件
│   │   ├── question-item.js
│   │   ├── question-item.wxml
│   │   └── question-item.wxss
│   └── review-card/         # 复习卡片组件
│       ├── review-card.js
│       ├── review-card.wxml
│       └── review-card.wxss
└── utils/
    └── ebbinghaus.js        # 艾宾浩斯复习算法
```

### 1.2 后端扩展

```
server/
├── routes/
│   ├── level.js             # 关卡路由
│   ├── level-review.js      # 审核路由
│   └── wrong.js             # 错题本路由
├── models/
│   ├── custom-level.js      # 自定义关卡模型
│   ├── level-review.js      # 审核记录模型
│   └── wrong-record.js      # 错题记录模型
└── middlewares/
    └── review-auth.js       # 审核权限中间件
```

---

## 二、数据模型设计

### 2.1 后端模型

#### CustomLevel（自定义关卡）

```javascript
const CustomLevel = sequelize.define('custom_level', {
  levelId: { type: DataTypes.STRING(32), primaryKey: true },
  title: { type: DataTypes.STRING(64), allowNull: false },
  description: { type: DataTypes.STRING(256) },
  authorOpenid: { type: DataTypes.STRING(64), allowNull: false },
  grade: { type: DataTypes.STRING(16), allowNull: false },
  items: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  totalQ: { type: DataTypes.INTEGER, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM('draft', 'pending', 'approved', 'rejected'),
    defaultValue: 'draft'
  },
  shareCode: { type: DataTypes.STRING(6), unique: true },
});
```

#### LevelReview（审核记录）

```javascript
const LevelReview = sequelize.define('level_review', {
  reviewId: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  levelId: { type: DataTypes.STRING(32), allowNull: false },
  reviewerOpenid: { type: DataTypes.STRING(64) },
  status: {
    type: DataTypes.ENUM('approved', 'rejected'),
    allowNull: false
  },
  comment: { type: DataTypes.STRING(256) },
});
```

#### WrongRecord（错题记录）

```javascript
const WrongRecord = sequelize.define('wrong_record', {
  recordId: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  openid: { type: DataTypes.STRING(64), allowNull: false },
  questionId: { type: DataTypes.STRING(128), allowNull: false },
  question: { type: DataTypes.JSON, allowNull: false },
  wrongCount: { type: DataTypes.INTEGER, defaultValue: 1 },
  nextReviewAt: { type: DataTypes.DATE },
  reviewCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  mastery: { type: DataTypes.INTEGER, defaultValue: 0 },
});
```

### 2.2 本地存储扩展

```javascript
// storage.js 新增字段
{
  customLevels: [],  // 本地缓存的自定义关卡
  wrongStats: { total: 0, pending: 0, mastered: 0 }
}
```

---

## 三、接口设计

### 3.1 关卡接口

#### POST /api/level

创建/更新关卡

**Request:**
```json
{
  "levelId": "optional",
  "title": "我的关卡",
  "description": "描述",
  "grade": "primary12",
  "items": [{"type": "w1", "q": "c*t", "a": "a", "hint": "猫"}]
}
```

**Response:**
```json
{
  "code": 0,
  "data": { "levelId": "xxx", "status": "draft" }
}
```

#### POST /api/level/submit

提交审核

**Request:**
```json
{ "levelId": "xxx" }
```

#### POST /api/level/share

生成分享码

**Response:**
```json
{ "code": 0, "data": { "shareCode": "ABC123" } }
```

#### GET /api/level/import?code=ABC123

导入关卡

### 3.2 审核接口

#### GET /api/level/reviews?status=pending

待审核列表（管理端）

#### POST /api/level/review

审核操作

**Request:**
```json
{
  "levelId": "xxx",
  "status": "approved",
  "comment": "通过"
}
```

### 3.3 错题本接口

#### GET /api/wrong/list

获取错题列表

**Response:**
```json
{
  "code": 0,
  "data": {
    "pending": [...],
    "mastered": [...]
  }
}
```

#### POST /api/wrong/add

添加错题记录

**Request:**
```json
{
  "questionId": "w1|c*t|a",
  "question": { "type": "w1", "q": "c*t", "a": "a", "hint": "猫" }
}
```

#### POST /api/wrong/review

复习作答

**Request:**
```json
{
  "recordId": "xxx",
  "correct": true
}
```

---

## 四、艾宾浩斯算法设计

### 4.1 复习间隔配置

```javascript
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];
```

### 4.2 核心算法

```javascript
function calculateNextReview(reviewCount, mastery, isCorrect) {
  if (!isCorrect) {
    // 答错：重置复习次数，降低熟练度
    return {
      mastery: Math.max(0, mastery - 10),
      reviewCount: 0,
      nextReviewAt: addDays(new Date(), 1)
    };
  }
  
  // 答对：增加熟练度，按间隔计算下次复习时间
  const newMastery = Math.min(100, mastery + 20);
  const intervalIdx = Math.min(reviewCount, EBBINGHAUS_INTERVALS.length - 1);
  const intervalDays = EBBINGHAUS_INTERVALS[intervalIdx];
  
  return {
    mastery: newMastery,
    reviewCount: reviewCount + 1,
    nextReviewAt: addDays(new Date(), intervalDays)
  };
}
```

### 4.3 本地工具函数

```javascript
// ebbinghaus.js
module.exports = {
  calculateNextReview,      // 计算下次复习时间
  isDueForReview,           // 判断是否需要复习
  getNextReviewText,        // 获取复习时间文案（如"明天"、"2天后"）
  getReviewProgress         // 获取复习进度（0~5）
};
```

---

## 五、测试策略

### 5.1 单元测试

- 艾宾浩斯算法：间隔计算、熟练度增减
- 分享码生成：6 位唯一码
- 关卡状态流转：draft → pending → approved

### 5.2 集成测试

- 关卡创建 → 提交审核 → 审核通过 → 可玩
- 错题记录 → 复习 → 间隔递增

### 5.3 幂等性测试

- 重复提交审核不重复插入
- 重复复习不重复记录

---

## 六、部署检查清单

- [ ] 后端模型迁移：custom_levels、level_reviews、wrong_records
- [ ] 审核权限配置：审核员 openid 白名单
- [ ] 分享码索引：shareCode 唯一索引
- [ ] 错题索引：openid + nextReviewAt