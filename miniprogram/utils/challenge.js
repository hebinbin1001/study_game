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
 *   P1：字母射击 / 字母拼词 / 词语连连看三款，各 10 关；
 *   **P2（本文件当前形态）：再接入词义消消乐 / 成语拼字 / 单词贪吃蛇 ——
 *       6 款轮换，每学段 30 关 = 6 款 × 5 关**，且各玩法在挑战模式下会把自己的成绩
 *       上报到 `scores`（game_type = 玩法 key），供「玩法进度榜」与玩法类成就使用。
 *   ⚠️ 未支持参数的玩法**不能**先写进模板，否则该关点了要么随机开局、要么不记星，
 *      玩家会卡在关卡中间（新增玩法时请同步扩 MODES 与模板，并补单测）。
 *
 * ★ 终关 Boss（2026-09-12 用户拍板方案 A）：每学段**第 30 关**固定为「字母射击」Boss 关，
 *   参数 = 题量 ×1.5（10 → 15）、命数同比例放大（5 → 7），**星级阈值不动**。
 *
 *   为什么命数必须跟着放大（当初正是这个原因把 Boss 推迟到 P2 之后做）：
 *   通关要求答对 `总题数 −（命数 − 1）` 题，所以「加题量」会把通关最低正确率顶上去 ——
 *     10 题 5 命 → 最低 60%（恰好压在 1 星线上）
 *     15 题 5 命 → 最低 73% → **1 星档（阈值 60%）数学上不可达**
 *     15 题 7 命 → 最低 60% → 三档重新可达 ✓
 *   单测 `challenge.test.js` 用 starReachability 把这条不变量钉死了（Boss 关也要三档可达）。
 *
 *   为什么不给连连看/消消乐做 Boss：它们棋盘固定 4×4 = 8 对，加不了题量；
 *   而它们按「剩余命 3/2/1」给星，减命会让 3 星档直接消失（详见交接单的方案 B/C）。
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
    gameType: 'word_warrior',        // 成绩表 game_type（小写，服务端正则只收 [a-z0-9_]）
    label: '字母射击',
    emoji: '🎯',
    page: '/pages/game/game',
    starBasis: '正确率 90/70/60（命数见关卡参数：普通关 5 命、Boss 关 7 命）'
  },
  wordBuild: {
    key: 'wordBuild',
    gameType: 'word_build',
    label: '字母拼词',
    emoji: '🔤',
    page: '/pages/word-build/word-build',
    starBasis: '答对率 90/70/60'
  },
  link: {
    key: 'link',
    gameType: 'link',
    label: '词语连连看',
    emoji: '🔗',
    page: '/pages/link/link',
    starBasis: '剩余命 3/2/1'
  },
  match: {
    key: 'match',
    gameType: 'match',
    label: '词义消消乐',
    emoji: '🃏',
    page: '/pages/match/match',
    starBasis: '剩余命 3/2/1'
  },
  idiom: {
    key: 'idiom',
    gameType: 'idiom',
    label: '成语拼字',
    emoji: '🀄',
    page: '/pages/idiom-build/idiom-build',
    starBasis: '答对率 90/70/60（5 命）'
  },
  snake: {
    key: 'snake',
    gameType: 'snake',
    label: '单词贪吃蛇',
    emoji: '🐍',
    page: '/pages/snake/snake',
    starBasis: '剩余命 3/2/1'
  }
};

// 玩法轮换节奏（P2）：6 款顺序轮换，每学段 30 关 → 每款各 5 关
var CYCLE = ['shoot', 'match', 'wordBuild', 'link', 'idiom', 'snake'];

// ============ 终关 Boss（方案 A：题量 ×1.5 + 命数同比例放大） ============
/** Boss 关号：每学段的最后一关 */
var BOSS_LEVEL = 30;
/** Boss 关固定玩法：用最有代表性的主玩法，与第 1 关「新手关」首尾呼应 */
var BOSS_MODE = 'shoot';
/**
 * Boss 参数。数值来源：
 *   totalQ = GAME_CONFIG.totalQ(10) × 1.5 = 15；
 *   lives  按「最低星档仍可达」反推：需要 (t −(l−1))/t ≤ 60%，即 l ≥ 0.4t + 1，
 *          15 题 → l ≥ 7，与「5 × 1.5 = 7.5 向下取整」一致。
 * 两者都不随学段变化（字母射击本来就是全学段同一套参数）。
 */
var BOSS_PARAMS = { totalQ: 15, lives: 7 };

/**
 * 生成关卡模板（30 关）。
 * @returns {Array<{level:number, mode:string}>}
 */
function buildTemplate() {
  var out = [];
  for (var lv = 1; lv <= LEVELS_PER_GRADE; lv++) {
    // 第 30 关覆盖轮换、固定为 Boss 玩法（其余照常轮换）
    var mode = (lv === BOSS_LEVEL) ? BOSS_MODE : CYCLE[(lv - 1) % CYCLE.length];
    out.push({ level: lv, mode: mode });
  }
  return out;
}

var TEMPLATE = buildTemplate();

/**
 * 是否 Boss 关。
 * @param {number} level 关卡号
 * @returns {boolean}
 */
function isBossLevel(level) {
  return (parseInt(level, 10) || 0) === BOSS_LEVEL;
}

// ============ 二、按学段实例化参数（题量等） ============
// 约束：题量与命数必须让 1/2/3 星三档都可达（单测 challenge.test.js 有护栏）。
//   · 字母射击：10 题 + 5 命 → 通关最低正确率 60%，恰好落在 1 星档
//   · 字母拼词：题量按学段 6~10 + 5 命 → 6 题时最低 67%、10 题时最低 60%，三档都可达
//   · 词语连连看：按剩余命 3/2/1 给星，天然三档可达
var GRADE_PARAMS = {
  kindergarten: { wordBuild: { count: 6 }, idiom: { count: 5 }, match: { pairs: 6 }, snake: { words: 4 } },
  primary12:    { wordBuild: { count: 8 }, idiom: { count: 6 }, match: { pairs: 6 }, snake: { words: 4 } },
  primary34:    { wordBuild: { count: 8 }, idiom: { count: 8 }, match: { pairs: 8 }, snake: { words: 5 } },
  primary56:    { wordBuild: { count: 8 }, idiom: { count: 8 }, match: { pairs: 8 }, snake: { words: 5 } },
  junior:       { wordBuild: { count: 10 }, idiom: { count: 8 }, match: { pairs: 8 }, snake: { words: 5 } },
  senior:       { wordBuild: { count: 10 }, idiom: { count: 8 }, match: { pairs: 8 }, snake: { words: 5 } },
  college:      { wordBuild: { count: 10 }, idiom: { count: 8 }, match: { pairs: 8 }, snake: { words: 5 } }
};

var DEFAULT_PARAMS = {
  shoot: { totalQ: constants.GAME_CONFIG.totalQ, lives: constants.GAME_CONFIG.initLives },
  wordBuild: { count: 8 },
  link: { pairs: 8 },
  match: { pairs: 8 },
  idiom: { count: 8 },
  snake: { words: 5 }
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
 * 取某玩法的「成绩表 game_type」（小写 snake_case；服务端只接受 [a-z0-9_]）。
 * 玩法进度榜（/api/ranklist/progress）与玩法类成就都按这个字段聚合。
 */
function gameTypeOf(mode) {
  const m = MODES[mode];
  return (m && m.gameType) || 'word_warrior';
}

/**
 * 取某学段某关的玩法参数（已与默认值合并）。
 *
 * 注意：**Boss 关的参数必须传 level 才会生效**（Boss 关题量/命数与普通关不同）。
 * 玩法页调这个函数时要把当前关卡号一起传进来，否则 Boss 关会按普通关参数开局。
 *
 * @param {string} gradeKey 学段 key
 * @param {string} mode 玩法 key（MODES 的 key）
 * @param {number} [level] 关卡号（挑战主线用；不传 = 普通关参数）
 * @returns {Object} 合并后的参数
 */
function paramsOf(gradeKey, mode, level) {
  var base = DEFAULT_PARAMS[mode] || {};
  var over = (GRADE_PARAMS[gradeKeyOf(gradeKey)] || {})[mode] || {};
  var out = {};
  for (var k in base) { if (base.hasOwnProperty(k)) out[k] = base[k]; }
  for (var j in over) { if (over.hasOwnProperty(j)) out[j] = over[j]; }
  // Boss 关：覆盖成 Boss 参数（题量 ×1.5 + 命数同比例放大）
  if (mode === BOSS_MODE && isBossLevel(level)) {
    for (var b in BOSS_PARAMS) { if (BOSS_PARAMS.hasOwnProperty(b)) out[b] = BOSS_PARAMS[b]; }
  }
  return out;
}

/** 关卡副标题（关卡页/首页卡片展示用，说明这一关是什么玩法、多少题） */
function subOf(gradeKey, mode, level) {
  var p = paramsOf(gradeKey, mode, level);
  if (isBossLevel(level)) {
    return 'BOSS · ' + p.totalQ + ' 题 · ' + p.lives + ' 命';
  }
  if (mode === 'shoot') return p.totalQ + ' 题 · ' + p.lives + ' 命';
  if (mode === 'wordBuild') return p.count + ' 题 · 拼字母';
  if (mode === 'link') return p.pairs + ' 对 · ' + p.pairs * 2 + ' 张牌';
  if (mode === 'match') return p.pairs + ' 对 · ' + p.pairs * 2 + ' 张牌';
  if (mode === 'idiom') return p.count + ' 题 · 拼成语';
  if (mode === 'snake') return p.words + ' 词 · 吃字母';
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
 * @returns {Object|null} { level, mode, modeLabel, modeEmoji, page, sub, seed, isBoss }
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
    sub: subOf(gradeKey, row.mode, n),
    isBoss: n === BOSS_LEVEL,
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
function pickItems(gradeKey, level, count, typeKey, seed) {
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
  // 第 5 个参数 seed 可选：玩法线传 lineSeedOf()，主线不传（沿用关卡种子，行为不变）
  return rng.pickN(pool || [], count, rng.makeRng(seed || seedOf(key, level)));
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
 * 迁移规则：旧 key `<grade>_<k>`（综合自由练第 k 关，k=1..10）→ **主线第 k 关**。
 *
 * 为什么按「第 k 关」而不是「第 k 个字母射击关」：旧体系的 10 关就是该学段的整条进度线，
 * 玩家记的是「我打到第 8 关」；而 P2 之后主线每款玩法只有 5 关，字母射击关分散在 1/7/13/19/25，
 * 按玩法槽位映射会让旧第 6~10 关无处安放（早期版本确实这么写过，单测当场抓到）。
 * 因此按序号平移，玩家的推进位置与解锁进度都不变（其中几关是别的玩法，属于一次性小礼包）。
 *
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
    // 旧体系固定 10 关；`LEVELS_PER_GRADE` 保留这一口径（不要用新的 30 关）
    for (var k = 1; k <= constants.LEVELS_PER_GRADE; k++) {
      var oldStars = all[grade + '_' + k];
      if (typeof oldStars === 'number' && oldStars > 0) {
        storage.saveStars(grade, k, oldStars, STAR_KEY);
      }
    }
  }
  storage.set(constants.STORAGE_KEYS.challengeMigrated, 1);
  return true;
}

// ============ 八、玩法线（P3 一期，2026-09-13）============
//
// 为什么有这一节（用户 2026-09-13 反馈）：
//   「闯关学习只有从字母射击才可以进去，其他题库的玩法都是单独的，不太合理」。
//   改造前只有一条 30 关主线（6 款玩法按节奏轮换），想玩连连看得先按顺序打过去；
//   而玩法 tab 里那 6 款题库玩法点进去全是自由练，既没有关卡也不写任何进度。
//
// 现在：6 款题库玩法**各有一条独立 30 关玩法线**，按学段生成、按关卡递增难度、
// 星级存 `<学段>@mode_<玩法>@<关卡>`；主线仍是 `@challenge@`，两套并存互不覆盖。
//   · 命名空间统一加 `mode_` 前缀：玩法 key 里的 `idiom`（成语拼字）与「按题型练」的
//     题型分组 key `idiom` 同名，不加前缀会互相覆盖存档（这是本轮排查出的真坑）。
//   · 种子 = hash(line:学段:玩法:关卡) → 同一关每次进同一套题，可重玩刷星、可分享复盘。
var LINE_PREFIX = 'mode_';
/** 有独立关卡线的玩法（顺序 = 关卡页 chips 顺序） */
var LINE_MODES = ['shoot', 'match', 'wordBuild', 'link', 'idiom', 'snake'];
/** 每 5 关一个难度档：30 关 = 6 档（0~5） */
var LINE_TIER_SIZE = 5;

/**
 * 字母射击玩法线的「题量 + 命数」难度表。
 *
 * 为什么命数要跟着题量一起涨（踩过的坑，别改）：
 *   通关要求答对 `题量 - (命数-1)` 题，而星级阈值是正确率 90/70/60 三档。
 *   只加题量不加命数会把「最低通关正确率」顶到 70% 以上 —— 1 星档（≥60%）再也拿不到
 *   （Boss 关当初就是因为这个把 15 题配了 7 命）。下表每档都满足
 *   60% ≤ 最低通关正确率 ≤ 70%，三档都拿得到，单测 `challenge.test.js` 钉住这条不变量。
 */
var LINE_SHOOT_RAMP = [
  { totalQ: 10, lives: 5 },
  { totalQ: 11, lives: 5 },
  { totalQ: 12, lives: 5 },
  { totalQ: 13, lives: 5 },
  { totalQ: 14, lives: 6 },
  { totalQ: 15, lives: 6 }
];

/** 关卡号 → 难度档（0~5） */
function lineTier(level) {
  var n = parseInt(level, 10) || 1;
  var t = Math.floor((n - 1) / LINE_TIER_SIZE);
  if (t < 0) return 0;
  return t > LINE_SHOOT_RAMP.length - 1 ? LINE_SHOOT_RAMP.length - 1 : t;
}

/**
 * 「按正确率折星」类玩法（拼词 / 成语）的题量：每档 +1，但**跳过会造出 1 星死区的题量**。
 *
 * 为什么不能直接 +1（R1 同类坑，真实算过一次）：
 *   这类玩法 5 条命，通关要求答对 `题量 - 4` 题，可达正确率只能取 (t-4)/t … 1。
 *   题量 = 7 时可达正确率是 42.9 / 57.1 / 71.4 / 85.7 / 100%，60~70% 这一段**取不到**，
 *   而 1 星阈值正好是 60% → 这一档玩家永远拿不到 1 星。
 *   所以这里从目标题量起向上找第一个「1/2/3 星都可达」的题量（最多找 4 个，兜底返回目标值）。
 *
 * @param {number} base 学段基准题量
 * @param {number} tier 难度档
 * @param {number} lives 命数（拼词/成语固定 5）
 */
function lineSafeCount(base, tier, lives) {
  var want = (parseInt(base, 10) || 8) + (parseInt(tier, 10) || 0);
  for (var c = want; c <= want + 4; c++) {
    if (starReachability(c, lives).reachable.length === 3) return c;
  }
  // 到不了三档可达 → 退回「本题量档位里最后一个仍可达的题量」，避免造出 1 星死区
  for (var back = want - 1; back > 4; back--) {
    if (starReachability(back, lives).reachable.length === 3) return back;
  }
  return want;
}

/** 玩法 key → 存档/URL 用的线 key（如 link → mode_link） */
function lineKeyOf(mode) {
  return LINE_PREFIX + mode;
}

/** 线 key 是否合法玩法线 */
function isLineKey(key) {
  var s = String(key || '');
  if (s.indexOf(LINE_PREFIX) !== 0) return false;
  return LINE_MODES.indexOf(s.slice(LINE_PREFIX.length)) >= 0;
}

/** 线 key → 玩法 key（非玩法线返回空串） */
function lineMode(key) {
  return isLineKey(key) ? String(key).slice(LINE_PREFIX.length) : '';
}

/** 玩法线关卡种子（同一关每次一致） */
function lineSeedOf(gradeKey, mode, level) {
  return rng.hashSeed('line:' + gradeKeyOf(gradeKey) + ':' + mode + ':' + (parseInt(level, 10) || 1));
}

/** 参数摘要文案（玩法线的关卡行副标题） */
function subOfParams(mode, p) {
  if (!p) return '';
  if (mode === 'shoot') return p.totalQ + ' 题 · ' + p.lives + ' 命';
  if (mode === 'wordBuild') return p.count + ' 题 · 拼字母';
  if (mode === 'link') return p.pairs + ' 对 · ' + p.pairs * 2 + ' 张牌';
  if (mode === 'match') return p.pairs + ' 对 · ' + p.pairs * 2 + ' 张牌';
  if (mode === 'idiom') return p.count + ' 题 · 拼成语';
  if (mode === 'snake') return p.words + ' 词 · 吃字母';
  return '';
}

/**
 * 玩法线某关的参数（学段基准 + 按难度档递增）。
 *
 * 递增口径（一期）：
 *   · 字母射击：题量 10→15、命数 5→6（见 LINE_SHOOT_RAMP）
 *   · 字母拼词 / 成语拼字：题量每档 +1（如 8→13）
 *   · 单词贪吃蛇：目标词每档 +1（如 5→10）；星级按剩余命折算，不受影响
 *   · 词义消消乐 / 词语连连看：**一期不递增** —— 牌面 4×4（8 对）在手机上已定型，
 *     加牌会破版式；星级又是按「剩余命 3/2/1」折算，减命会让 3 星直接消失。
 *     这两款留给二期用「多轮 / 限时」做难度，不在本期内塞假难度。
 */
function lineParams(gradeKey, mode, level) {
  var base = paramsOf(gradeKey, mode);   // 玩法线没有 Boss 关，不传 level
  var out = {};
  for (var k in base) {
    if (base.hasOwnProperty(k)) out[k] = base[k];
  }
  var tier = lineTier(level);
  if (mode === 'shoot') {
    var ramp = LINE_SHOOT_RAMP[tier];
    out.totalQ = ramp.totalQ;
    out.lives = ramp.lives;
  } else if (mode === 'snake') {
    out.words = (out.words || 5) + tier;
  } else if (mode === 'wordBuild' || mode === 'idiom') {
    // 5 命 + 正确率折星：题量要跳过「1 星死区」（见 lineSafeCount 的推导）
    out.count = lineSafeCount(out.count || 8, tier, 5);
  }
  return out;
}

/**
 * 取玩法线某一关的完整描述（与 levelAt 同形状，便于页面/关卡页复用同一套渲染）。
 * @param {string} gradeKey 学段
 * @param {string} mode 玩法 key
 * @param {number} level 1 ~ 30
 * @returns {Object|null}
 */
function lineLevelAt(gradeKey, mode, level) {
  var n = parseInt(level, 10);
  if (!(n >= 1 && n <= LEVELS_PER_GRADE)) return null;
  if (LINE_MODES.indexOf(mode) < 0) return null;
  var meta = MODES[mode];
  var params = lineParams(gradeKey, mode, n);
  return {
    level: n,
    mode: mode,
    line: lineKeyOf(mode),
    modeLabel: meta.label,
    modeEmoji: meta.emoji,
    page: meta.page,
    starBasis: meta.starBasis,
    sub: subOfParams(mode, params),
    isBoss: false,
    seed: lineSeedOf(gradeKey, mode, n),
    params: params
  };
}

/** 玩法线某学段的全部关卡（关卡页渲染用） */
function lineLevelsOf(gradeKey, mode) {
  var out = [];
  for (var lv = 1; lv <= LEVELS_PER_GRADE; lv++) out.push(lineLevelAt(gradeKey, mode, lv));
  return out;
}

/**
 * 玩法线跳转 URL。
 * @returns {string} 如 /pages/link/link?challenge=1&line=mode_link&grade=primary34&level=7&seed=123
 */
function lineUrl(gradeKey, mode, level) {
  var lv = lineLevelAt(gradeKey, mode, level);
  if (!lv) return '';
  return lv.page + '?challenge=1&line=' + lv.line + '&grade=' + gradeKeyOf(gradeKey)
    + '&level=' + lv.level + '&seed=' + lv.seed;
}

/**
 * 玩法页通用：把页面 URL 参数解析成「一局对局的上下文」。
 *
 * 两条线共用同一套玩法页，只有命名空间/种子/参数来源不同：
 *   · 主线：   ?challenge=1&grade=&level=&seed=          → line = 'challenge'
 *   · 玩法线： ?challenge=1&line=mode_link&grade=&level=&seed=
 *
 * 页面侧只需要：`var ctx = challenge.contextOf(options)`，别再自己拼 key —— 之前 6 个页面
 * 各自拼 `<grade>@challenge@<level>`，新增线时最容易漏改其中一处（漏了就会写错存档）。
 *
 * @param {Object} opt 页面 onLoad 的 options
 * @returns {{isChallenge:boolean, line:string, mode:string, grade:string, level:number,
 *            seed:number, params:Object|null, key:string, label:string, isBoss:boolean}}
 */
/**
 * 「下一关」跳转 URL（2026-09-18 用户要求：过关后要提示下一关）。
 *
 * 同一上下文内推进：主线 → 下一关；玩法线 → 同一条线的下一关。
 * 自由玩（非挑战局）没有关卡概念、最后一关也没有下一关 → 返回 ''，页面据此不显示按钮。
 *
 * @param {Object} opt 当前页面 onLoad 的 options（含 challenge/line/grade/level）
 * @returns {string} 可用的页面 URL；无下一关返回 ''
 */
function nextLevelUrl(opt) {
  var ctx = contextOf(opt);
  if (!ctx.isChallenge) return '';
  var next = ctx.level + 1;
  if (!(next >= 1 && next <= LEVELS_PER_GRADE)) return '';
  if (ctx.line === STAR_KEY) {
    var lv = levelAt(ctx.grade, next);
    return lv ? pageUrl(lv, ctx.grade) : '';
  }
  return lineUrl(ctx.grade, ctx.mode, next);
}

function contextOf(opt) {
  var o = opt || {};
  var isChallenge = String(o.challenge) === '1';
  var grade = String(o.grade || '');
  var level = parseInt(o.level, 10) || 0;
  var line = isLineKey(o.line) ? String(o.line) : STAR_KEY;
  var ctx = {
    isChallenge: false, line: line, mode: '', grade: grade, level: level,
    seed: 0, params: null, key: '', label: '', isBoss: false
  };
  if (!isChallenge || !grade || !level) return ctx;

  if (line === STAR_KEY) {
    var lv = levelAt(grade, level);
    if (!lv) return ctx;
    ctx.mode = lv.mode;
    ctx.params = paramsOf(grade, lv.mode, level);
    ctx.isBoss = !!lv.isBoss;
    ctx.label = labelOf(grade) + ' · 挑战第 ' + level + '/' + LEVELS_PER_GRADE + ' 关';
  } else {
    var mode = lineMode(line);
    var lineLv = lineLevelAt(grade, mode, level);
    if (!lineLv) return ctx;
    ctx.mode = mode;
    ctx.params = lineLv.params;
    ctx.label = labelOf(grade) + ' · ' + lineLv.modeLabel + '第 ' + level + '/' + LEVELS_PER_GRADE + ' 关';
  }
  ctx.seed = parseInt(o.seed, 10) || (line === STAR_KEY
    ? seedOf(grade, level)
    : lineSeedOf(grade, ctx.mode, level));
  ctx.key = grade + '@' + line + '@' + level;
  ctx.isChallenge = true;
  return ctx;
}

/**
 * 玩法线进度（关卡页卡片/进度条用）。
 * @param {Object} starsMap storage.getAllStars() 的结果
 * @param {string} gradeKey 学段
 * @param {string} mode 玩法 key
 * @returns {{cleared:number, earned:number, total:number, next:number}}
 */
function lineProgress(starsMap, gradeKey, mode) {
  var all = starsMap || {};
  var g = gradeKeyOf(gradeKey);
  var line = lineKeyOf(mode);
  var cleared = 0;
  var earned = 0;
  var next = 0;
  for (var n = 1; n <= LEVELS_PER_GRADE; n++) {
    var s = all[g + '@' + line + '@' + n];
    var v = (typeof s === 'number' && s > 0) ? s : 0;
    if (v > 0) cleared++;
    earned += v;
    if (!next && v === 0) next = n;
  }
  if (!next) next = LEVELS_PER_GRADE;
  return { cleared: cleared, earned: earned, total: LEVELS_PER_GRADE * 3, next: next };
}

module.exports = {
  LEVELS_PER_GRADE: LEVELS_PER_GRADE,
  STAR_KEY: STAR_KEY,
  MODES: MODES,
  TEMPLATE: TEMPLATE,
  GRADE_PARAMS: GRADE_PARAMS,
  BOSS_LEVEL: BOSS_LEVEL,
  BOSS_MODE: BOSS_MODE,
  BOSS_PARAMS: BOSS_PARAMS,
  isBossLevel: isBossLevel,
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
  gameTypeOf: gameTypeOf,
  starsByRightRate: starsByRightRate,
  starsByLives: starsByLives,
  starReachability: starReachability,
  // 玩法线（P3 一期）：每款题库玩法一条独立 30 关关卡线
  LINE_MODES: LINE_MODES,
  LINE_PREFIX: LINE_PREFIX,
  lineKeyOf: lineKeyOf,
  isLineKey: isLineKey,
  lineMode: lineMode,
  lineTier: lineTier,
  lineSeedOf: lineSeedOf,
  lineParams: lineParams,
  lineLevelAt: lineLevelAt,
  lineLevelsOf: lineLevelsOf,
  lineUrl: lineUrl,
  lineProgress: lineProgress,
  contextOf: contextOf,
  nextLevelUrl: nextLevelUrl,
  migrateStars: migrateStars
};
