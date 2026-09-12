/**
 * utils/challenge.js —— 挑战主线关卡表（2026-09-12 拍板落地）
 *
 * 设计（用户拍板：和题库相关的玩法都纳入挑战关卡，按年级生成不同关卡）：
 *   · 一关 = 一种玩法 + 本学段题库 + 该关参数；
 *   · 每学段 30 关，玩法按固定节奏轮换，第 1 关固定「字母射击」当新手关；
 *   · 同一关用固定种子（grade+level）派生出题随机源 → 每次进同一关题目一致，
 *     重玩刷星公平、也能分享给好友打同一套题；
 *   · 星级沿用 storage 的 <grade>@challenge@<level> 命名空间，
 *     解锁规则与关卡页一致（前 3 关默认解锁，之后上一关 ≥1 星，游客第 4 关起需登录）。
 *
 * 分期（见 docs/挑战关卡规划-待确认.md）：
 *   P1（本文件当前形态）：只编排**已支持按关卡参数开局**的 3 款玩法 ——
 *       字母射击 / 字母拼词 / 词语连连看，各 10 关；
 *   P2：把消消乐 / 成语拼字 / 单词贪吃蛇接进来（那 3 款还需先支持参数与固定种子）。
 *   ⚠️ 未支持参数的玩法**不能**先写进模板，否则该关点了要么随机开局、要么不记星，
 *      玩家会卡在关卡中间（新增玩法时请同步扩 MODES 与模板，并补单测）。
 *
 * ⚠️ 关于「终关 Boss 难度」：靠“加题量/减命数”做难度会破坏星级可达性
 *   （例：字母射击 15 题 5 命 → 通关最低正确率 73%，1 星档（<70%）数学上不可达，
 *   与 R1 修掉的老缺陷同类）。所以要加 Boss 参数，必须同时重算该玩法的星级阈值，
 *   留到 P2 与「统一星级折算表」一起做。当前 30 关只区分玩法与题库，不改题量/命数。
 */

'use strict';

var constants = require('./constants');
var dict = require('./dict');
var rng = require('./rng');

var LEVELS_PER_GRADE = constants.CHALLENGE_LEVELS_PER_GRADE; // 30
var STAR_KEY = constants.CHALLENGE_STAR_KEY;                 // 'challenge'

// ============ 一、玩法元数据（新增玩法只在这里加一行 + 模板引用） ============
var MODES = {
  shoot: {
    key: 'shoot',
    label: '字母射击',
    emoji: '🎯',
    page: '/pages/game/game',
    starBasis: '正确率 90/70/60（5 命）'
  },
  wordBuild: {
    key: 'wordBuild',
    label: '字母拼词',
    emoji: '🔤',
    page: '/pages/word-build/word-build',
    starBasis: '答对率 90/70/60（5 命）'
  },
  link: {
    key: 'link',
    label: '词语连连看',
    emoji: '🔗',
    page: '/pages/link/link',
    starBasis: '剩余命 3/2/1'
  }
};

// 玩法轮换节奏：字母射击 → 字母拼词 → 词语连连看（各 10 关，共 30 关）
var CYCLE = ['shoot', 'wordBuild', 'link'];

/**
 * 生成关卡模板（30 关）。
 * @returns {Array<{level:number, mode:string}>}
 */
function buildTemplate() {
  var out = [];
  for (var lv = 1; lv <= LEVELS_PER_GRADE; lv++) {
    out.push({ level: lv, mode: CYCLE[(lv - 1) % CYCLE.length] });
  }
  return out;
}

var TEMPLATE = buildTemplate();

// ============ 二、按学段实例化参数（题量等） ============
// 约束：题量与命数必须让 1/2/3 星三档都可达（单测 challenge.test.js 有护栏）。
//   · 字母射击：10 题 + 5 命 → 通关最低正确率 60%，恰好落在 1 星档
//   · 字母拼词：题量按学段 6~10 + 5 命 → 6 题时最低 67%、10 题时最低 60%，三档都可达
//   · 词语连连看：按剩余命 3/2/1 给星，天然三档可达
var GRADE_PARAMS = {
  kindergarten: { wordBuild: { count: 6 } },
  primary12:    { wordBuild: { count: 8 } },
  primary34:    { wordBuild: { count: 8 } },
  primary56:    { wordBuild: { count: 8 } },
  junior:       { wordBuild: { count: 10 } },
  senior:       { wordBuild: { count: 10 } },
  college:      { wordBuild: { count: 10 } }
};

var DEFAULT_PARAMS = {
  shoot: { totalQ: constants.GAME_CONFIG.totalQ, lives: constants.GAME_CONFIG.initLives },
  wordBuild: { count: 8 },
  link: { pairs: 8 }
};

function gradeKeyOf(gradeKey) {
  var key = gradeKey;
  if (!key) key = constants.GRADES[0].key;
  for (var i = 0; i < constants.GRADES.length; i++) {
    if (constants.GRADES[i].key === key) return key;
  }
  return key; // 未知学段也放行（模板是通用的，题库为空时页面会优雅降级）
}

function labelOf(gradeKey) {
  for (var i = 0; i < constants.GRADES.length; i++) {
    if (constants.GRADES[i].key === gradeKey) return constants.GRADES[i].label;
  }
  return gradeKey;
}

/**
 * 取某学段某关的玩法参数（已与默认值合并）。
 * @param {string} gradeKey 学段 key
 * @param {string} mode 玩法 key（MODES 的 key）
 * @returns {Object} 合并后的参数
 */
function paramsOf(gradeKey, mode) {
  var base = DEFAULT_PARAMS[mode] || {};
  var over = (GRADE_PARAMS[gradeKeyOf(gradeKey)] || {})[mode] || {};
  var out = {};
  for (var k in base) { if (base.hasOwnProperty(k)) out[k] = base[k]; }
  for (var j in over) { if (over.hasOwnProperty(j)) out[j] = over[j]; }
  return out;
}

/** 关卡副标题（关卡页/首页卡片展示用，说明这一关是什么玩法、多少题） */
function subOf(gradeKey, mode) {
  var p = paramsOf(gradeKey, mode);
  if (mode === 'shoot') return p.totalQ + ' 题 · ' + p.lives + ' 命';
  if (mode === 'wordBuild') return p.count + ' 题 · 拼字母';
  if (mode === 'link') return p.pairs + ' 对 · ' + p.pairs * 2 + ' 张牌';
  return '';
}

// ============ 三、种子与随机源 ============
/**
 * 关卡种子：同一学段同一关恒定。
 * @param {string} gradeKey
 * @param {number} level
 * @returns {number} 32 位整数
 */
function seedOf(gradeKey, level) {
  return rng.hashSeed('challenge:' + gradeKeyOf(gradeKey) + ':' + (parseInt(level, 10) || 1));
}

/**
 * 关卡随机源（同一关每次进入得到同一串随机数）。
 * @param {string} gradeKey
 * @param {number} level
 * @returns {function(): number}
 */
function rngFor(gradeKey, level) {
  return rng.makeRng(seedOf(gradeKey, level));
}

// ============ 四、关卡查询 ============
/**
 * 取某学段某一关的完整描述。
 * @param {string} gradeKey
 * @param {number} level 1 ~ LEVELS_PER_GRADE
 * @returns {Object|null} { level, mode, modeLabel, modeEmoji, page, sub, seed }
 */
function levelAt(gradeKey, level) {
  var n = parseInt(level, 10);
  if (!(n >= 1 && n <= LEVELS_PER_GRADE)) return null;
  var row = TEMPLATE[n - 1];
  var meta = MODES[row.mode];
  return {
    level: n,
    mode: row.mode,
    modeLabel: meta.label,
    modeEmoji: meta.emoji,
    page: meta.page,
    starBasis: meta.starBasis,
    sub: subOf(gradeKey, row.mode),
    seed: seedOf(gradeKey, n)
  };
}

/**
 * 取某学段全部 30 关（关卡页「综合」视图与首页推导共用）。
 * @param {string} gradeKey
 * @returns {Array<Object>}
 */
function levelsOf(gradeKey) {
  var out = [];
  for (var lv = 1; lv <= LEVELS_PER_GRADE; lv++) out.push(levelAt(gradeKey, lv));
  return out;
}

/**
 * 某学段里「指定玩法」的关卡号列表（存档迁移用：旧字母射击第 k 关 → 主线第 k 个字母射击关）。
 * @param {string} gradeKey
 * @param {string} mode
 * @returns {number[]}
 */
function levelsOfMode(gradeKey, mode) {
  var out = [];
  for (var lv = 1; lv <= LEVELS_PER_GRADE; lv++) {
    if (TEMPLATE[lv - 1].mode === mode) out.push(lv);
  }
  return out;
}

/**
 * 组装玩法页跳转 URL（挑战模式）。
 * @param {Object} lv levelAt() 的结果
 * @param {string} gradeKey
 * @returns {string} 如 /pages/word-build/word-build?challenge=1&grade=primary34&level=2&seed=123
 */
function pageUrl(lv, gradeKey) {
  if (!lv) return '';
  return lv.page + '?challenge=1&grade=' + gradeKeyOf(gradeKey)
    + '&level=' + lv.level + '&seed=' + lv.seed;
}

// ============ 五、按种子从题库取题 ============
/**
 * 按关卡种子从本学段题库取固定题目（字母射击等「逐题作答」类玩法用）。
 * @param {string} gradeKey 学段 key
 * @param {number} level 关卡号
 * @param {number} count 需要几题
 * @param {string} [typeKey] 题型分类（可选，'all'/空 = 不限）
 * @returns {Array} 词条数组（题量不足时返回实际数量）
 */
function pickItems(gradeKey, level, count, typeKey) {
  var key = gradeKeyOf(gradeKey);
  var pool = (typeKey && typeKey !== 'all')
    ? dict.filterByGroup(key, typeKey)
    : dict.loadByGrade(key);
  if (!pool || !pool.length) {
    // 兜底：本学段没题（或分类题量为 0）时并入其他学段，保证关卡可玩
    var fallback = [];
    for (var i = 0; i < constants.GRADES.length; i++) {
      if (constants.GRADES[i].key === key) continue;
      fallback = fallback.concat(dict.loadByGrade(constants.GRADES[i].key));
      if (fallback.length >= count) break;
    }
    pool = fallback;
  }
  return rng.pickN(pool || [], count, rngFor(key, level));
}

// ============ 六、星级折算（统一口径，各玩法共用一个真源） ============
/**
 * 按「答对比例」折算星级 —— 与字母射击同口径（constants.STAR_THRESHOLDS：90/70/60）。
 * @param {number} right 答对题数
 * @param {number} total 总题数
 * @returns {number} 0~3
 */
function starsByRightRate(right, total) {
  var t = parseInt(total, 10) || 0;
  if (!t) return 0;
  return constants.starsByRate((parseInt(right, 10) || 0) / t * 100);
}

/**
 * 按「剩余命数」折算星级（连连看这类以犯错次数定档的玩法）。
 * @param {number} lives
 * @returns {number} 0~3
 */
function starsByLives(lives) {
  var n = parseInt(lives, 10) || 0;
  if (n >= 3) return 3;
  if (n === 2) return 2;
  if (n === 1) return 1;
  return 0;
}

/**
 * 星级可达性自检：给定「题量 + 命数」，通关时可能的正确率是否覆盖 1/2/3 星三档。
 * 用于单测护栏，防止再出现「某档星永远拿不到」的老缺陷（R1 同类）。
 * @param {number} total 题量
 * @param {number} lives 命数（答错扣命，扣到 0 判负）
 * @returns {{reachable:number[], minRate:number}} 可达星档与通关最低正确率
 */
function starReachability(total, lives) {
  var t = parseInt(total, 10) || 0;
  var l = parseInt(lives, 10) || 0;
  if (!t || !l) return { reachable: [], minRate: 0 };
  var minRight = Math.max(0, t - (l - 1));
  var minRate = minRight / t * 100;
  var touched = {};
  for (var right = minRight; right <= t; right++) {
    touched[starsByRightRate(right, t)] = 1;
  }
  return { reachable: [1, 2, 3].filter(function (s) { return touched[s]; }), minRate: minRate };
}

// ============ 七、老存档迁移 ============
/**
 * 把旧的「字母射击 10 关」星级迁移到挑战主线的对应字母射击关。
 *
 * 迁移规则：旧 key `<grade>_<k>`（综合自由练第 k 关）→ 主线第 k 个字母射击关。
 * 幂等：迁移一次后写标记位，之后调用直接返回 false。
 *
 * @param {Object} storage utils/storage 模块（注入以便单测）
 * @returns {boolean} 本次是否执行了迁移
 */
function migrateStars(storage) {
  if (!storage || typeof storage.get !== 'function') return false;
  if (storage.get(constants.STORAGE_KEYS.challengeMigrated)) return false;
  var all = (typeof storage.getAllStars === 'function' ? storage.getAllStars() : {}) || {};
  for (var g = 0; g < constants.GRADES.length; g++) {
    var grade = constants.GRADES[g].key;
    var slots = levelsOfMode(grade, 'shoot');
    for (var k = 1; k <= slots.length; k++) {
      var oldStars = all[grade + '_' + k];
      if (typeof oldStars === 'number' && oldStars > 0) {
        storage.saveStars(grade, slots[k - 1], oldStars, STAR_KEY);
      }
    }
  }
  storage.set(constants.STORAGE_KEYS.challengeMigrated, 1);
  return true;
}

module.exports = {
  LEVELS_PER_GRADE: LEVELS_PER_GRADE,
  STAR_KEY: STAR_KEY,
  MODES: MODES,
  TEMPLATE: TEMPLATE,
  GRADE_PARAMS: GRADE_PARAMS,
  levelAt: levelAt,
  levelsOf: levelsOf,
  levelsOfMode: levelsOfMode,
  paramsOf: paramsOf,
  subOf: subOf,
  seedOf: seedOf,
  rngFor: rngFor,
  pageUrl: pageUrl,
  pickItems: pickItems,
  labelOf: labelOf,
  starsByRightRate: starsByRightRate,
  starsByLives: starsByLives,
  starReachability: starReachability,
  migrateStars: migrateStars
};
