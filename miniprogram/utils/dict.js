/**
 * utils/dict.js —— 词库装载与抽题
 *
 * 职责：按学段装载内置 JSON 词库，提供随机抽题能力。
 *       内置 JSON 与 parser/validator 产出的词条共用统一 WordItem 结构。
 *
 * 关联需求：REQ-DICT-3（统一结构）、REQ-DICT-4（本地装载）、REQ-DICT-5（可扩展）
 *
 * 统一 WordItem 结构：{ type, q, a, hint, d? }
 *   - type: 类型码（w1/w2/c1/c2/xhy/zc/fill/trans）
 *   - q:    题目（挖空位置用 * 标记）
 *   - a:    答案
 *   - hint: 提示/释义
 *   - d:    干扰项数组（可选，缺省由出题层补齐）
 *
 * 内置 JSON 文件结构（data/<grade>.json）：
 *   {
 *     "grade": "kg",
 *     "label": "幼儿园",
 *     "items": [ { type, q, a, hint, d? }, ... ]
 *   }
 *
 * 扩展约定（REQ-DICT-5）：新增学段/题型仅改 data/ JSON 与 constants.js 枚举，
 *   不改本文件与出题逻辑。
 */

var constants = require('./constants');
var bank = require('./bank');

var GRADES = constants.GRADES;

// ============ 一、词库装载与缓存 ============

// 学段 → items 数组的内存缓存（避免重复 require/解析）
var gradeCache = {};
// 学段 → 纯内置 items 缓存（不含用户覆盖层；loadBuiltin 用）
var builtinCache = {};

// 用户题库覆盖层（2026-09-18）：由页面/启动时 setOverrides() 注入；
// 为空时 loadByGrade 等价于纯内置词库（测试与离线场景零影响）。
var overrideMap = null;
// 自建题库（挂在学段下作为附加题源）；同样由 setBanks() 注入
var bankMap = null;

// 当前教材版本（2026-10-08 二期：教材对接）。'' = 通用词表。
// 由 app.js 启动时 setBook(storage.getBook()) 注入；影响 loadByGrade 的过滤结果。
var currentBook = '';
// 「该版本词条至少要有这么多条才敢用它出题」——太少会让同一批词反复出现，
// 不足时自动回退到该学段的通用词表（规划文档 5.3：不能让用户看到空白）。
var MIN_BOOK_ITEMS = 20;

// 学段 key → 静态 require 的 JS 词库模块。
// 重要：微信小程序不支持 require .json 文件（会把路径解析成 .json.js 而失败），
// 动态拼接路径也无法被打包分析。故词库以 data/*.js 模块形式（module.exports = {...}）
// 静态引用，key 与 GRADES.key 一一对应。
var GRADE_DATA = {
  // 2026-10-08：学段按年级细分，从 7 档扩到 14 档。
  // ⚠️ 必须逐个静态 require（小程序不支持动态拼接路径，那样打不进包）。
  kg: require('../data/kg.js'),
  g1: require('../data/g1.js'),
  g2: require('../data/g2.js'),
  g3: require('../data/g3.js'),
  g4: require('../data/g4.js'),
  g5: require('../data/g5.js'),
  g6: require('../data/g6.js'),
  g7: require('../data/g7.js'),
  g8: require('../data/g8.js'),
  g9: require('../data/g9.js'),
  g10: require('../data/g10.js'),
  g11: require('../data/g11.js'),
  g12: require('../data/g12.js'),
  college: require('../data/college.js')
};

/**
 * 根据学段 key 查找 GRADES 中的配置项。
 * @param {string} grade 学段 key，如 'g3'
 * @returns {Object|null} GRADES 中的配置项，未找到返回 null
 */
function findGradeConfig(grade) {
  for (var i = 0; i < GRADES.length; i++) {
    if (GRADES[i].key === grade) {
      return GRADES[i];
    }
  }
  return null;
}

/**
 * 按学段装载对应内置 JSON 词库。
 *
 * 关联需求：REQ-DICT-4（本地装载，断网可加载）
 * @param {string} grade 学段 key，如 'kg'、'g3'
 * @returns {Array<Object>} 该学段的 WordItem 数组；学段不存在或文件缺失返回 []
 */
function loadByGrade(grade) {
  var key = cacheKeyOf(grade);
  // 命中缓存直接返回
  if (gradeCache.hasOwnProperty(key)) {
    return gradeCache[key];
  }

  var builtinItems = rawByGrade(grade);
  // 套上「用户题库覆盖层」（2026-09-18）：内置 ⊕ 新增 ⊕ 修改 − 停用。
  // 合并放在 dict 出口，凡是走 dict 取题的地方（字母射击 / 拼词 / 成语 / 贪吃蛇 /
  // 连连看 / 每日一题 / 关卡页题量统计）都自动跟着用户题库走，无需各自改代码。
  var merged = bank.applyOverrides(builtinItems, grade, overrideMap, bankMap);
  // 教材版本过滤：选了版本且该学段有足够该版本词条 → 只用该版本；否则回退通用。
  var finalItems = filterByBook(merged, currentBook);

  // 缓存（覆盖层变化时由 setOverrides/refreshOverrides 统一清缓存）
  gradeCache[key] = finalItems;
  return finalItems;
}

/** 缓存 key：学段 + 教材版本（换版本要重新过滤，不能共用一份缓存） */
function cacheKeyOf(grade) {
  return String(grade || '') + '|' + currentBook;
}

/**
 * 按教材版本过滤词条。
 *
 * 口径（2026-10-08 二期）：
 *   · 没有教材标签的词条 = **通用词条**，任何版本都能用（原有题库、自建词条都属于这一类）；
 *   · 选了版本后，用「通用词条 + 该版本词条」（教材词只是补充，不会把原有内容挤掉）；
 *   · 该版本词条还不够 MIN_BOOK_ITEMS 条 → 整个题库照旧返回（版本词表还在补充中，
 *     界面上会提示「先用通用词表」，不让用户看到空题）。
 *
 * @param {Array<Object>} items 已套过用户覆盖层的词条
 * @param {string} book 教材版本 key（空 = 不过滤）
 * @returns {Array<Object>}
 */
function filterByBook(items, book) {
  if (!book || !items || !items.length) return items;
  var matched = [];
  var generic = [];
  for (var i = 0; i < items.length; i++) {
    var b = String(items[i].book || '');
    if (b === book) matched.push(items[i]);
    else if (!b) generic.push(items[i]);
  }
  if (matched.length >= MIN_BOOK_ITEMS) return generic.concat(matched);
  return items;
}

/**
 * 设置当前教材版本（''=通用 / pep / wys / bjb）。
 * 会清空出题缓存，下一次取题立即生效。
 * @param {string} book
 * @returns {string} 生效后的版本 key
 */
function setBook(book) {
  var k = String(book || '');
  if (k === currentBook) return currentBook;
  currentBook = k;
  clearCache();
  return currentBook;
}

/** 读当前教材版本 */
function getBook() {
  return currentBook;
}

/**
 * 某学段某教材版本的词条覆盖情况（端上提示「该版本词表正在补充」用）。
 * @param {string} grade
 * @param {string} [book] 省略则用当前版本
 * @returns {{total:number, matched:number, usingFallback:boolean}}
 */
function bookStat(grade, book) {
  var b = book === undefined || book === null ? currentBook : String(book || '');
  var items = rawByGrade(grade);
  var matched = 0;
  for (var i = 0; i < items.length; i++) {
    if (String(items[i].book || '') === b) matched++;
  }
  return {
    total: items.length,
    matched: matched,
    usingFallback: !!b && matched < MIN_BOOK_ITEMS
  };
}

/**
 * 取「纯内置」词条（不套用户覆盖层）。
 *
 * 题库页需要它来展示「被停用的内置条目」（合并结果里这些已经不在），
 * 以及判断某条到底是不是内置的。
 * @param {string} grade 学段 key
 * @returns {Array<Object>}
 */
function loadBuiltin(grade) {
  return rawByGrade(grade);
}

/** 内部：读 data/*.js 里的原始内置词条（带缓存） */
function rawByGrade(grade) {
  if (builtinCache.hasOwnProperty(grade)) return builtinCache[grade];

  var config = findGradeConfig(grade);
  if (!config) {
    builtinCache[grade] = [];
    return [];
  }

  // 从静态映射取内置 JS 词库模块（见 GRADE_DATA 说明）。
  var dict = GRADE_DATA[grade];
  var items = [];
  // 兼容两种 JSON 结构：{ items: [] } 或直接为数组
  if (Array.isArray(dict)) {
    items = dict;
  } else if (dict && Array.isArray(dict.items)) {
    items = dict.items;
  } else {
    items = [];
  }

  builtinCache[grade] = items;
  return items;
}

/**
 * 预装载全部学段词库到缓存（应用启动时可选调用，加速首次出题）。
 * @returns {Object} 各学段 items 数量统计，如 { kg: 100, g1: 75, ... }
 */
function preloadAll() {
  var stats = {};
  for (var i = 0; i < GRADES.length; i++) {
    var items = loadByGrade(GRADES[i].key);
    stats[GRADES[i].key] = items.length;
  }
  return stats;
}

/**
 * 清除指定学段缓存（词库热更新/导入后调用）。
 * @param {string} grade 学段 key，省略则清空全部缓存
 */
function clearCache(grade) {
  if (grade) {
    // 学段可能有多份缓存（每个教材版本一份）→ 按前缀清
    var prefix = String(grade) + '|';
    Object.keys(gradeCache).forEach(function (k) {
      if (k.indexOf(prefix) === 0) delete gradeCache[k];
    });
  } else {
    gradeCache = {};
  }
}

/**
 * 注入/更新「用户题库覆盖层」（2026-09-18）。
 *
 * 题库页拉完云端覆盖记录后调它，随后所有取题自动走合并后的题库；
 * 传空数组 = 恢复纯内置词库。内部会清掉学段缓存，保证立即生效。
 *
 * @param {Array<Object>} list 覆盖记录列表（见 utils/bank.js）
 */
function setOverrides(list) {
  overrideMap = bank.setOverrides(list);
  clearCache();
  return overrideMap;
}

/** 读当前覆盖层（页面渲染来源标签用） */
function getOverrides() {
  return overrideMap || bank.getOverrides();
}

/**
 * 注入/更新「自建题库列表」（2026-09-18）。
 * 自建库挂在某个学段下作为该学段的附加题源；enabled=false 的库不参与出题。
 * @param {Array<Object>} list [{bankId,name,grade,enabled}]
 */
function setBanks(list) {
  bankMap = bank.setBanks(list);
  clearCache();
  return bankMap;
}

/** 读当前自建库列表（题库页渲染用） */
function getBanks() {
  return bankMap || bank.getBanks();
}

/**
 * 本地改完覆盖层后重新读一遍（题库页保存/删除后调）。
 * 与 setOverrides 的差别：数据源是本地缓存而不是服务端返回值，
 * 用于「先本地生效、再异步推云端」的路径。
 */
function refreshOverrides() {
  overrideMap = bank.getOverrides();
  bankMap = bank.getBanks();
  clearCache();
  return overrideMap;
}

// ============ 二、随机抽题 ============

/**
 * 内部：从候选池中按排除集随机取 1 条（元素 q 字段去重）。
 * @param {Array<Object>} items 候选词条
 * @param {Array<string|Object>} [exclude] 已出题目
 * @returns {Object|null}
 */
function pickRandom(items, exclude) {
  if (!items || items.length === 0) return null;
  var excludeSet = {};
  if (exclude && exclude.length > 0) {
    for (var i = 0; i < exclude.length; i++) {
      var ex = exclude[i];
      var q = (typeof ex === 'string') ? ex : (ex && ex.q);
      if (q) excludeSet[q] = true;
    }
  }
  var available = [];
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var key = it && it.q;
    if (!excludeSet[key]) available.push(it);
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * 从指定学段按题型分类过滤词条（分类定义见 constants.TYPE_GROUPS）。
 * @param {string} grade 学段 key
 * @param {string} groupKey 分类 key；'all'/空 = 返回全量词条
 * @returns {Array<Object>} 过滤后词条（无则空数组）
 */
function filterByGroup(grade, groupKey) {
  var items = loadByGrade(grade);
  if (!groupKey || groupKey === 'all') return items;
  var out = [];
  for (var i = 0; i < items.length; i++) {
    if (constants.isItemInGroup(items[i], groupKey)) out.push(items[i]);
  }
  return out;
}

/**
 * 从指定学段 + 题型分类随机抽取一条（带已出排重，签名对齐 randomItem）。
 * @param {string} grade 学段 key
 * @param {string} groupKey 分类 key（'all' 等价综合）
 * @param {Array<string|Object>} [exclude] 已出题目
 * @returns {Object|null}
 */
function randomItemByGroup(grade, groupKey, exclude) {
  return pickRandom(filterByGroup(grade, groupKey), exclude);
}

/**
 * 从指定学段随机抽取一条题目，可选排除已出题目。
 *
 * 关联需求：REQ-DICT-3（统一结构）
 * @param {string} grade 学段 key
 * @param {Array<string|Object>} [exclude] 已出题目，元素为题目文本(q)或 item 对象；匹配 q 字段去重
 * @returns {Object|null} WordItem，无可用题目返回 null
 */
function randomItem(grade, exclude) {
  return pickRandom(loadByGrade(grade), exclude);
}

/**
 * 从指定学段批量抽取不重复题目。
 * @param {string} grade 学段 key
 * @param {number} count 需要抽取的题数
 * @returns {Array<Object>} WordItem 数组，不足时返回实际能抽到的数量
 */
function randomItems(grade, count) {
  var items = loadByGrade(grade);
  if (items.length === 0 || count <= 0) {
    return [];
  }

  // 复制后 Fisher-Yates 洗牌取前 count 条
  var pool = items.slice();
  var n = pool.length;
  var max = Math.min(count, n);
  for (var i = 0; i < max; i++) {
    var j = i + Math.floor(Math.random() * (n - i));
    var tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, max);
}

// ============ 三、对外接口 ============

module.exports = {
  loadByGrade: loadByGrade,
  loadBuiltin: loadBuiltin,
  randomItem: randomItem,
  randomItems: randomItems,
  filterByGroup: filterByGroup,
  randomItemByGroup: randomItemByGroup,
  preloadAll: preloadAll,
  clearCache: clearCache,
  // 用户题库覆盖层（2026-09-18）
  setOverrides: setOverrides,
  getOverrides: getOverrides,
  setBanks: setBanks,
  getBanks: getBanks,
  refreshOverrides: refreshOverrides,
  findGradeConfig: findGradeConfig,
  // 教材版本（2026-10-08 二期）
  setBook: setBook,
  getBook: getBook,
  bookStat: bookStat,
  MIN_BOOK_ITEMS: MIN_BOOK_ITEMS
};
