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
// 正确率 >= 90% 得 3 星，>= 70% 得 2 星，>= 40% 得 1 星，< 40% 得 0 星
const STAR_THRESHOLDS = [
  { minRate: 90, stars: 3 },
  { minRate: 70, stars: 2 },
  { minRate: 40, stars: 1 }
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
  sound: 'ww_sound_on'            // 声音开关（'1'开/'0'关，默认开）
};

// ============ 五、游戏配置默认值（REQ-NFR-5、REQ-GAME-3） ============
// 与 HTML 原型 CONFIG（prototype/index.html）保持一致
const GAME_CONFIG = {
  totalQ: 10,          // 每关题数
  initLives: 3,        // 初始生命值
  sinkSpeed: 13,       // 怪兽自然下沉速度（像素/秒）
  approach: 58,        // 答错时怪兽逼近距离
  approachTime: 0.6,   // 答错逼近/抖动/红闪动画时长（秒）
  canvasW: 390,        // 游戏画布逻辑宽度（px）
  canvasH: 500         // 游戏画布逻辑高度（px）
};

// ============ 六、题型分类（关卡页按分类选择，2026-09-08 拍板） ============
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
  TYPE_GROUPS,
  isItemInGroup
};