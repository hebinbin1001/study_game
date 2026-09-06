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
 *     "grade": "kindergarten",
 *     "label": "幼儿园",
 *     "items": [ { type, q, a, hint, d? }, ... ]
 *   }
 *
 * 扩展约定（REQ-DICT-5）：新增学段/题型仅改 data/ JSON 与 constants.js 枚举，
 *   不改本文件与出题逻辑。
 */

var constants = require('./constants');

var GRADES = constants.GRADES;

// ============ 一、词库装载与缓存 ============

// 学段 → items 数组的内存缓存（避免重复 require/解析）
var gradeCache = {};

// 学段 key → 静态 require 的 JS 词库模块。
// 重要：微信小程序不支持 require .json 文件（会把路径解析成 .json.js 而失败），
// 动态拼接路径也无法被打包分析。故词库以 data/*.js 模块形式（module.exports = {...}）
// 静态引用，key 与 GRADES.key 一一对应。
var GRADE_DATA = {
  kindergarten: require('../data/kindergarten.js'),
  primary12: require('../data/primary12.js'),
  primary34: require('../data/primary34.js'),
  primary56: require('../data/primary56.js'),
  junior: require('../data/junior.js'),
  senior: require('../data/senior.js'),
  college: require('../data/college.js')
};

/**
 * 根据学段 key 查找 GRADES 中的配置项。
 * @param {string} grade 学段 key，如 'primary34'
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
 * @param {string} grade 学段 key，如 'kindergarten'、'primary34'
 * @returns {Array<Object>} 该学段的 WordItem 数组；学段不存在或文件缺失返回 []
 */
function loadByGrade(grade) {
  // 命中缓存直接返回
  if (gradeCache.hasOwnProperty(grade)) {
    return gradeCache[grade];
  }

  var config = findGradeConfig(grade);
  if (!config) {
    // 未知学段，缓存空数组避免重复查找
    gradeCache[grade] = [];
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

  // 缓存
  gradeCache[grade] = items;
  return items;
}

/**
 * 预装载全部学段词库到缓存（应用启动时可选调用，加速首次出题）。
 * @returns {Object} 各学段 items 数量统计，如 { kindergarten: 100, ... }
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
    delete gradeCache[grade];
  } else {
    gradeCache = {};
  }
}

// ============ 二、随机抽题 ============

/**
 * 从指定学段随机抽取一条题目，可选排除已出题目。
 *
 * 关联需求：REQ-DICT-3（统一结构）
 * @param {string} grade 学段 key
 * @param {Array<string|Object>} [exclude] 已出题目，元素为题目文本(q)或 item 对象；匹配 q 字段去重
 * @returns {Object|null} WordItem，无可用题目返回 null
 */
function randomItem(grade, exclude) {
  var items = loadByGrade(grade);
  if (items.length === 0) {
    return null;
  }

  // 构建已出题目 q 集合
  var excludeSet = {};
  if (exclude && exclude.length > 0) {
    for (var i = 0; i < exclude.length; i++) {
      var ex = exclude[i];
      var q = (typeof ex === 'string') ? ex : (ex && ex.q);
      if (q) {
        excludeSet[q] = true;
      }
    }
  }

  // 筛选可用题目
  var available = [];
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var key = it && it.q;
    if (!excludeSet[key]) {
      available.push(it);
    }
  }

  if (available.length === 0) {
    return null; // 全部已出，由调用方决定是否重置
  }

  // 随机选一条
  var idx = Math.floor(Math.random() * available.length);
  return available[idx];
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
  randomItem: randomItem,
  randomItems: randomItems,
  preloadAll: preloadAll,
  clearCache: clearCache,
  findGradeConfig: findGradeConfig
};