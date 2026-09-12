/**
 * utils/constants.js —— 词力战士全局常量定义
 *
 * 职责：集中定义学段枚举、8 类型码枚举、星级阈值、本地存储 key、
 *       游戏配置默认值，供出题/装载/存储/渲染等模块统一引用。
 *
 * 关联需求：
 *   - 学段枚举（REQ-DICT-1）
 *   - 8 类型码枚举（REQ-DICT-2）
 *   - 星级阈值 90/70/40（REQ-GAME-12）
 *   - 存储 key（REQ-NICK-2、REQ-GAME-13、REQ-NFR-2）
 *   - 游戏配置默认值（REQ-NFR-5、REQ-GAME-3）
 */

// ============ 一、学段枚举（7 个学段，REQ-DICT-1） ============
// key 对应 data/ 下的内置词库 JS 模块文件名，label 为界面展示中文名
const GRADES = [
  { key: 'kindergarten', label: '幼儿园',  file: 'kindergarten.js' },
  { key: 'primary12',    label: '小学1-2', file: 'primary12.js' },
  { key: 'primary34',    label: '小学3-4', file: 'primary34.js' },
  { key: 'primary56',    label: '小学5-6', file: 'primary56.js' },
  { key: 'junior',       label: '初中',    file: 'junior.js' },
  { key: 'senior',       label: '高中',    file: 'senior.js' },
  { key: 'college',      label: '大学',    file: 'college.js' }
];

// ============ 二、8 类型码枚举（REQ-DICT-2） ============
// 参照 docs/词库格式规范.md 的「类型码一览」
const TYPES = {
  w1:    { code: 'w1',    name: '单词挖1格',   desc: '挖 1 个字母（默认挖元音）' },
  w2:    { code: 'w2',    name: '单词挖多格',   desc: '* 标记每个挖空字母' },
  c1:    { code: 'c1',    name: '汉字/成语挖1字', desc: '挖 1 个汉字' },
  c2:    { code: 'c2',    name: '词语/成语挖多字', desc: '挖多个汉字' },
  xhy:   { code: 'xhy',   name: '歇后语',      desc: '前半句 → 后半句填空' },
  zc:    { code: 'zc',    name: '组词',        desc: '给字选可组词的字' },
  fill:  { code: 'fill',  name: '英语句子填空',   desc: '句子挖空' },
  trans: { code: 'trans', name: '中英互译',     desc: '看中文选英文' }
};

// 8 种合法类型码列表（供导入校验遍历使用，REQ-IMP-2）
const TYPE_CODES = Object.keys(TYPES);

// ============ 三、星级阈值（正确率 → 星数，REQ-GAME-12） ============
// 正确率 >= 90% 得 3 星，>= 70% 得 2 星，>= 60% 得 1 星，< 60% 得 0 星
//
// ⚠️ 阈值必须落在「通关可达的正确率区间」内，否则会出现永远拿不到的星级档：
//   · 通关条件是答满 totalQ 题；命数为 initLives，扣到 0 立即判负且不写星级档；
//   · 因此通关最多只能错 (initLives - 1) 题，最低正确率 = (totalQ - (initLives-1)) / totalQ；
//   · 当前 totalQ=10、initLives=5 → 最低 60%，恰好落在 1 星档（60%），三档全部可达。
//
// 历史缺陷（R1）：旧值 initLives=3 + 阈值 90/70/40 时，通关最多错 2 题 →
//   正确率恒 ≥ 80% → 结算只可能是 3 星或 2 星，**1 星档（40%~69%）在数学上不可达**，
//   关卡解锁条件「上一关 ≥1 星」也因此等价于「通关过」，形同虚设。
//   回归护栏见 utils/__tests__/stars-reachable.test.js。
const STAR_THRESHOLDS = [
  { minRate: 90, stars: 3 },
  { minRate: 70, stars: 2 },
  { minRate: 60, stars: 1 }
];

// 由正确率计算星级（正确率百分比数值，如 85 表示 85%）
function starsByRate(rate) {
  for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
    if (rate >= STAR_THRESHOLDS[i].minRate) {
      return STAR_THRESHOLDS[i].stars;
    }
  }
  return 0;
}

// ============ 四、本地存储 key（REQ-NICK-2、REQ-GAME-13、REQ-NFR-2） ============
const STORAGE_KEYS = {
  nickname: 'ww_nickname',        // 昵称（本地镜像，云端为准）
  avatar: 'ww_avatar',            // 头像地址（本地镜像）
  token: 'ww_token',              // 登录态令牌（M5）
  user: 'ww_user',                // 用户资料缓存（M5：nickname/avatarUrl/needProfile）
  stars: 'ww_stars',              // 星级存档（按「学段+关卡」维度）
  pendingScores: 'ww_pending_scores', // 待上报成绩队列（离线暂存）
  warriorSkin: 'ww_warrior_skin', // 当前使用的战士皮肤 avatarId
  bossSkin: 'ww_boss_skin',        // 当前使用的怪兽皮肤 avatarId
  sound: 'ww_sound_on',            // 声音开关（'1'开/'0'关，默认开）
  lastGrade: 'ww_last_grade',      // 最近一次进入的学段（首页「继续挑战」定位用）
  lastType: 'ww_last_type',        // 最近一次进入的题型分类（空 = 综合）
  challengeMigrated: 'ww_challenge_migrated' // 挑战主线存档迁移标记（一次性，见 utils/challenge.js）
};

// ============ 五、游戏配置默认值（REQ-NFR-5、REQ-GAME-3） ============
// 与 HTML 原型 CONFIG（prototype/index.html）保持一致
const GAME_CONFIG = {
  totalQ: 10,          // 每关题数
  initLives: 5,        // 初始生命值（与阈值联动：通关最低正确率 = (10-(5-1))/10 = 60%）
  sinkSpeed: 13,       // 怪兽自然下沉速度（像素/秒）
  approach: 58,        // 答错时怪兽逼近距离
  // R3：答错反馈窗口 0.6s → 1.2s。0.6s 对低龄玩家是一闪而过（画布上的正确答案还没看清
  // 就切到下一题了），延长后配合选项高亮（正确项标绿、误选项标红）才真正起到纠错作用。
  approachTime: 1.2,   // 答错逼近/抖动/红闪时长（秒），同时决定答错到下一题的间隔
  canvasW: 390,        // 游戏画布逻辑宽度（px）
  canvasH: 500         // 游戏画布逻辑高度（px）
};

// ============ 六、题型分类（关卡页按分类选择，2026-09-08 拍板） ============
// 关卡规模（关卡页与首页「继续挑战」共用，避免两处漂移）
const LEVELS_PER_GRADE = 10;        // 每学段关卡数
const DEFAULT_UNLOCKED_LEVELS = 3;  // 默认解锁前 3 关（含游客）；第 4 关起需登录且逐关解锁

// 挑战主线（2026-09-12 拍板）：一关 = 一种玩法 + 本学段题库 + 该关参数。
// 与上面的「题型分类自由练」并存：自由练仍是每学段每分类 10 关。
const CHALLENGE_LEVELS_PER_GRADE = 30;  // 挑战主线每学段关数
const CHALLENGE_STAR_KEY = 'challenge'; // 挑战星级的存档命名空间（storage 里存成 <grade>@challenge@<level>）

// 词条 type → 用户分类。c1/c2 按「完整词长」区分词语/成语（与出题 typeKind 口径一致：
// 题面原文长度 >= 4 视为成语，如 守*待兔 长度为 5 → 成语）。
function wordLenOf(item) {
  if (!item) return 0;
  return String(item.q || item.w || '').length;
}
function isIdiomLen(item) {
  return wordLenOf(item) >= 4;
}

// match(t, item)：t 为词条 type；item 供 c1/c2 判成语等需长度的情形。
// 兼容原型老类型码：en→单词、cn→词语、idiom→成语。
const TYPE_GROUPS = [
  { key: 'all',     label: '综合',   match: function () { return true; } },
  { key: 'word',    label: '单词',   match: function (t) { return t === 'w1' || t === 'w2' || t === 'trans' || t === 'en'; } },
  { key: 'fill',    label: '填空',   match: function (t) { return t === 'fill'; } },
  { key: 'wordCn',  label: '词语',   match: function (t, it) { return t === 'zc' || t === 'cn' || ((t === 'c1' || t === 'c2') && !isIdiomLen(it)); } },
  { key: 'idiom',   label: '成语',   match: function (t, it) { return t === 'idiom' || ((t === 'c1' || t === 'c2') && isIdiomLen(it)); } },
  { key: 'xhy',     label: '歇后语', match: function (t) { return t === 'xhy'; } }
];

/**
 * 判断词条是否属于某分类（groupKey='all' 恒真）。
 * @param {Object} item 词条
 * @param {string} groupKey 分类 key（TYPE_GROUPS[].key）
 * @returns {boolean}
 */
function isItemInGroup(item, groupKey) {
  if (!item) return false;
  let grp = null;
  for (let i = 0; i < TYPE_GROUPS.length; i++) {
    if (TYPE_GROUPS[i].key === groupKey) { grp = TYPE_GROUPS[i]; break; }
  }
  if (!grp || grp.key === 'all') return true;
  return !!grp.match(item.type, item);
}

module.exports = {
  GRADES,
  TYPES,
  TYPE_CODES,
  STAR_THRESHOLDS,
  starsByRate,
  STORAGE_KEYS,
  GAME_CONFIG,
  LEVELS_PER_GRADE,
  DEFAULT_UNLOCKED_LEVELS,
  CHALLENGE_LEVELS_PER_GRADE,
  CHALLENGE_STAR_KEY,
  TYPE_GROUPS,
  isItemInGroup
};
