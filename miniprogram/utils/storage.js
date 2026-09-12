/**
 * utils/storage.js —— 本地存储封装
 *
 * 职责：封装 wx.getStorageSync / wx.setStorageSync，提供统一 get/set/remove 接口；
 *       在其上构建昵称、头像、星级存档、待上报成绩队列等业务读写方法。
 *
 * 关联需求：
 *   - REQ-NICK-2（昵称读写持久化）
 *   - REQ-GAME-13（星级按「学段+关卡」存储并取历史最大值）
 *   - REQ-GAME-14（关卡解锁推导：第 1 关默认解锁，第 N 关需第 N-1 关 ≥1 星）
 *   - REQ-NFR-2（离线可玩，存档本地化）
 *
 * 存储 key 引用 constants.js 的 STORAGE_KEYS，不重复定义。
 *
 * 星级存储结构（ww_stars）：
 *   { "primary34_1": 2, "primary34_2": 3, "junior_1": 1, "primary34@idiom@1": 2, ... }
 *   key 格式为 "<grade>_<level>"（综合/历史存档）或 "<grade>@<typeKey>@<level>"（题型分类关卡，
 *   2026-09-08 新增；value 为历史最高星级 0~3）。首页累计星星统计遍历全量即包含分类星。
 *
 * 待上报成绩队列（ww_pending_scores）：
 *   [ { grade, level, score, correctCount, totalQ, maxCombo, stars, ts }, ... ]
 *
 * 队列管理（REQ-NFR-2，修复"只增不清"）：
 *   - MAX_PENDING_SCORES = 50：单 key 上限保护，超限丢弃最旧并打 warning；
 *   - flushPendingScores(reportFn)：逐条调用注入的上报函数，成功后移除、
 *     失败保留；自带防并发锁，供 App.onShow 与成绩页上报成功后调用消费。
 *
 * 写入失败信号（修复 set 静默吞错）：
 *   - 底层 set(key, value) 返回 boolean（true 写入成功 / false 写入失败）；
 *   - addPendingScore/clearPendingScores/removePendingScoreAt 均返回 boolean，
 *     使调用方（如 result.js 成绩入队）能区分「入队成功」与「存储失败」。
 */

var constants = require('./constants');

var STORAGE_KEYS = constants.STORAGE_KEYS;

// 待上报成绩队列长度上限（超出丢弃最旧，防单 key 1MB 上限溢出）
var MAX_PENDING_SCORES = 50;

// ============ 一、底层封装 ============

// 非 wx 环境（如 Node 单测）的内存兜底，保证模块可测
var memoryMock = {};
function hasWx() {
  return (typeof wx !== 'undefined') && wx && (typeof wx.getStorageSync === 'function');
}

/**
 * 读取本地存储（统一接口）。
 * @param {string} key 存储 key
 * @returns {*} 存储值，不存在返回空串（与 wx.getStorageSync 行为一致）
 */
function get(key) {
  if (hasWx()) {
    try {
      return wx.getStorageSync(key);
    } catch (e) {
      return '';
    }
  }
  // 内存兜底
  return memoryMock.hasOwnProperty(key) ? memoryMock[key] : '';
}

/**
 * 写入本地存储（统一接口）。
 *
 * 修复：不再静默吞错——返回 boolean，调用方可据此区分写入成功/失败。
 * 对昵称/头像/星级等非关键写入，调用方通常仍忽略返回值（失败不影响游玩）；
 * 对成绩入队等需要感知的写入，调用方应检查返回值决定降级策略。
 * @param {string} key 存储 key
 * @param {*} value 任意可序列化值
 * @returns {boolean} true 写入成功；false 写入失败（容量满/序列化异常等）
 */
function set(key, value) {
  if (hasWx()) {
    try {
      wx.setStorageSync(key, value);
      return true;
    } catch (e) {
      // 写入失败（如超出存储上限）：显式返回 false，由调用方决定降级
      return false;
    }
  }
  // 内存兜底
  memoryMock[key] = value;
  return true;
}

/**
 * 移除本地存储（统一接口）。
 * @param {string} key 存储 key
 */
function remove(key) {
  if (hasWx()) {
    try {
      wx.removeStorageSync(key);
    } catch (e) {
      // 静默忽略
    }
    return;
  }
  delete memoryMock[key];
}

// ============ 二、昵称与头像（REQ-NICK-2） ============

/**
 * 读取本地昵称。
 * @returns {string} 昵称，未设置返回空串
 */
function getNickname() {
  var v = get(STORAGE_KEYS.nickname);
  return v || '';
}

/**
 * 保存昵称到本地。
 * @param {string} nickname 昵称
 */
function setNickname(nickname) {
  set(STORAGE_KEYS.nickname, nickname);
}

/**
 * 读取本地头像地址。
 * @returns {string} 头像 URL，未设置返回空串
 */
function getAvatar() {
  var v = get(STORAGE_KEYS.avatar);
  return v || '';
}

/**
 * 保存头像地址到本地。
 * @param {string} url 头像 URL
 */
function setAvatar(url) {
  set(STORAGE_KEYS.avatar, url);
}

// ============ 二点二、登录态缓存（M5） ============
// token 与 user 由 utils/auth.js 读写；此处仅做存储封装。

/**
 * 读取登录态令牌。
 * @returns {string} token，未登录返回空串
 */
function getToken() {
  var v = get(STORAGE_KEYS.token);
  return v || '';
}

/**
 * 保存登录态令牌。
 * @param {string} token
 * @returns {boolean} true 写入成功
 */
function setToken(token) {
  return set(STORAGE_KEYS.token, token);
}

/** 清除登录态令牌。 */
function clearToken() {
  remove(STORAGE_KEYS.token);
}

/**
 * 读取用户资料缓存。
 * @returns {Object|null} { nickname, avatarUrl, needProfile, openid } 或 null
 */
function getUser() {
  var v = get(STORAGE_KEYS.user);
  return (v && typeof v === 'object') ? v : null;
}

/**
 * 保存用户资料缓存。
 * @param {Object} user
 * @returns {boolean} true 写入成功
 */
function setUser(user) {
  return set(STORAGE_KEYS.user, user);
}

/** 清除用户资料缓存。 */
function clearUser() {
  remove(STORAGE_KEYS.user);
}

// 说明：原「对局形态记忆（ww_mode）」已随三种形态一并删除（一期）。
// ============ 二点五、皮肤选择（战士/boss 皮肤） ============
// 说明：皮肤列表与解锁状态由后端 /api/avatar/* 管理；此处仅缓存
//   「当前使用」的皮肤 avatarId，供游戏页离线渲染（离线时回退默认皮肤）。
//   形象页「使用」成功后将 avatarId 写入，游戏页渲染前读取。

/**
 * 读取当前战士皮肤 avatarId。
 * @returns {string} avatarId，未设置返回空串（渲染层回退默认皮肤）
 */
function getWarriorSkin() {
  var v = get(STORAGE_KEYS.warriorSkin);
  return v || '';
}

/**
 * 保存当前战士皮肤 avatarId。
 * @param {string} avatarId 如 'warrior_02'
 * @returns {boolean} true 写入成功
 */
function setWarriorSkin(avatarId) {
  return set(STORAGE_KEYS.warriorSkin, avatarId);
}

/**
 * 读取当前怪兽皮肤 avatarId。
 * @returns {string} avatarId，未设置返回空串（渲染层回退默认皮肤）
 */
function getBossSkin() {
  var v = get(STORAGE_KEYS.bossSkin);
  return v || '';
}

/**
 * 保存当前怪兽皮肤 avatarId。
 * @param {string} avatarId 如 'monster_03'
 * @returns {boolean} true 写入成功
 */
function setBossSkin(avatarId) {
  return set(STORAGE_KEYS.bossSkin, avatarId);
}

// ============ 三、星级存档（REQ-GAME-13） ============

/**
 * 读取全部星级存档对象。
 * @returns {Object} { "<grade>_<level>": stars, ... }
 */
function getAllStars() {
  var v = get(STORAGE_KEYS.stars);
  if (!v || typeof v !== 'object') {
    return {};
  }
  return v;
}

/**
 * 构造星级存储 key。
 * @param {string} grade 学段 key
 * @param {number} level 关卡序号
 * @returns {string} "<grade>_<level>"
 */
function starKey(grade, level, typeKey) {
  // 分类关卡独立存档：grade@<type>@level（如 kindergarten@idiom@1）；
  // 综合/旧调用沿用 grade_level（兼容历史存档）。
  if (typeKey && typeKey !== 'all') {
    return grade + '@' + typeKey + '@' + level;
  }
  return grade + '_' + level;
}

/**
 * 读取指定学段+关卡的星级。
 *
 * 关联需求：REQ-GAME-13
 * @param {string} grade 学段 key
 * @param {number} level 关卡序号（1 起）
 * @returns {number} 星级 0~3，未记录返回 0
 */
function getStars(grade, level, typeKey) {
  var all = getAllStars();
  var k = starKey(grade, level, typeKey);
  var s = all[k];
  return (typeof s === 'number' && s >= 0) ? s : 0;
}

/**
 * 保存指定学段+关卡的星级，取历史最大值（不会降级）。
 *
 * 关联需求：REQ-GAME-13（取历史最大值）
 * @param {string} grade 学段 key
 * @param {number} level 关卡序号
 * @param {number} stars 本局星级 0~3
 * @returns {number} 写入后的实际星级（即历史最大值）
 */
function saveStars(grade, level, stars, typeKey) {
  var all = getAllStars();
  var k = starKey(grade, level, typeKey);
  var prev = (typeof all[k] === 'number') ? all[k] : 0;
  var next = Math.max(prev, stars);
  all[k] = next;
  set(STORAGE_KEYS.stars, all);
  return next;
}

// ============ 四、关卡解锁推导（REQ-GAME-14） ============

/**
 * 判断指定关卡是否解锁。
 *
 * 规则：第 1 关默认解锁；第 N 关（N>1）需第 N-1 关 ≥1 星。
 *
 * 关联需求：REQ-GAME-14
 * @param {string} grade 学段 key
 * @param {number} level 关卡序号（1 起）
 * @returns {boolean} true 表示已解锁
 */
function isLevelUnlocked(grade, level, typeKey) {
  if (level <= 1) {
    return true; // 第 1 关默认解锁
  }
  // 第 N 关需第 N-1 关 ≥1 星
  var prevStars = getStars(grade, level - 1, typeKey);
  return prevStars >= 1;
}

/**
 * 计算「继续挑战」的目标关卡（首页卡片与关卡页的"继续"节点共用同一口径）。
 *
 * 规则（与关卡页 refreshLevels 保持一致）：
 *   1. 前 DEFAULT_UNLOCKED_LEVELS 关默认解锁（游客同享）；
 *   2. 第 N 关需第 N-1 关 ≥1 星；
 *   3. 取第一个「已解锁但还没拿到星」的关卡作为继续目标；
 *   4. 已解锁的关卡都通关了，就取最后一个已解锁关卡（可重玩刷星）。
 *
 * 注意：本函数只依据本地存档推导，**不含登录门槛**（第 4 关起需登录）。
 * 调用方需自行判断游客是否该被引导去登录页。
 *
 * @param {string} grade 学段 key
 * @param {string} [typeKey] 题型分类 key
 * @param {number} [levelCount] 该存档维度的关卡总数（默认每学段 10 关；
 *        挑战主线传 constants.CHALLENGE_LEVELS_PER_GRADE = 30）
 * @returns {{level:number, stars:number, allPassed:boolean}}
 */
function findContinueLevel(grade, typeKey, levelCount) {
  var asked = parseInt(levelCount, 10);
  var total = (asked > 0) ? asked : constants.LEVELS_PER_GRADE;
  var defaultUnlocked = constants.DEFAULT_UNLOCKED_LEVELS;
  var lastUnlocked = 1;

  for (var i = 1; i <= total; i++) {
    var unlocked = (i <= defaultUnlocked) || (getStars(grade, i - 1, typeKey) >= 1);
    if (!unlocked) break;
    lastUnlocked = i;
    if (getStars(grade, i, typeKey) === 0) {
      return { level: i, stars: 0, allPassed: false };
    }
  }

  return {
    level: lastUnlocked,
    stars: getStars(grade, lastUnlocked, typeKey),
    allPassed: true
  };
}

// ============ 五、待上报成绩队列（REQ-NFR-2） ============

/**
 * 写回队列（统一落盘入口）。
 * @param {Array} queue 成绩数组
 * @returns {boolean} 是否写入成功
 */
function writeQueue(queue) {
  return set(STORAGE_KEYS.pendingScores, queue);
}

/**
 * 读取待上报成绩队列。
 * @returns {Array<Object>} 成绩数组，无则空数组
 */
function getPendingScores() {
  var v = get(STORAGE_KEYS.pendingScores);
  if (!Array.isArray(v)) {
    return [];
  }
  return v;
}

/**
 * 追加一条待上报成绩到队列尾部。
 *
 * 修复：返回 boolean 替代旧的"队列长度"，使调用方能区分
 *   「入队成功」与「存储失败」；并施加 MAX_PENDING_SCORES 上限，
 *   超限丢弃最旧一条并打 warning，防止队列只增导致单 key 超 1MB。
 *
 * 关联需求：REQ-NFR-2（离线暂存，联网后补报）
 * @param {Object} score 成绩对象 { grade, level, score, correctCount, totalQ, maxCombo, stars }
 * @returns {boolean} true 入队成功；false 写入失败（本地存储不可用/超限）
 */
function addPendingScore(score) {
  var queue = getPendingScores();
  // 附带时间戳，便于上报时排序
  var item = Object.assign({}, score, { ts: Date.now() });
  queue.push(item);

  // 上限保护：丢弃最旧并打 warning
  if (queue.length > MAX_PENDING_SCORES) {
    var dropped = queue.shift();
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[utils/storage] 待上报成绩队列超上限(' + MAX_PENDING_SCORES + ')，丢弃最旧一条（ts=' + (dropped && dropped.ts) + '）。');
    }
  }

  return writeQueue(queue);
}

/**
 * 清空待上报成绩队列（全部上报成功后调用）。
 * @returns {boolean} true 清空成功；false 写入失败
 */
function clearPendingScores() {
  return writeQueue([]);
}

/**
 * 移除队列中指定下标的成绩（单条上报成功后调用）。
 * @param {number} index 待移除项下标
 * @returns {boolean} true 移除成功；false 下标非法或写入失败
 */
function removePendingScoreAt(index) {
  var queue = getPendingScores();
  if (index < 0 || index >= queue.length) {
    return false;
  }
  queue.splice(index, 1);
  return writeQueue(queue);
}

// 防并发锁：进行中的 flush Promise（App.onShow 与成绩页可能同时触发）
var _flushingPromise = null;

/**
 * 消费待上报成绩队列（flush）。
 *
 * 语义：按序（FIFO）调用 reportFn(score) 逐条上报，
 *   - 上报成功（Promise resolve）：从队列移除并写回，继续下一条；
 *   - 上报失败（Promise reject）：保留该项与后续项，中断本轮，
 *     等待下次触发（App.onShow / 成绩页上报成功后）重试。
 *
 * 实现说明：
 *   - reportFn 由调用方注入（避免 storage 反向依赖 request，便于单测），
 *     典型实现为 score => request.post('/api/score', score)；
 *   - 自带防并发：同一时刻仅一轮 flush，重复调用复用进行中的 Promise。
 *
 * 关联需求：REQ-NFR-2（离线成绩联网后按序补报，失败不丢单）
 * @param {Function} reportFn 单条上报函数：score => Promise<data>
 * @returns {Promise<{flushed:number, kept:number}>} 本轮成功条数与保留条数
 */
function flushPendingScores(reportFn) {
  if (_flushingPromise) {
    return _flushingPromise; // 防并发：复用进行中的 flush
  }
  _flushingPromise = doFlushPendingScores(reportFn).then(function (stats) {
    _flushingPromise = null; // 结束置空，允许下一轮
    return stats;
  }, function (err) {
    _flushingPromise = null;
    throw err;
  });
  return _flushingPromise;
}

/**
 * flush 的实际执行体（不含并发锁）。
 * @param {Function} reportFn
 * @returns {Promise<{flushed:number, kept:number}>}
 */
function doFlushPendingScores(reportFn) {
  return new Promise(function (resolve) {
    var queue = getPendingScores().slice(); // 工作副本
    if (queue.length === 0) {
      resolve({ flushed: 0, kept: 0 });
      return;
    }
    if (typeof reportFn !== 'function') {
      resolve({ flushed: 0, kept: queue.length });
      return;
    }

    var flushed = 0;
    function attempt() {
      if (queue.length === 0) {
        resolve({ flushed: flushed, kept: 0 });
        return;
      }
      var item = queue[0];
      // 归一化：同步抛错 / 返回非 Promise 均收敛为 Promise
      var p;
      try {
        p = reportFn(item);
      } catch (e) {
        p = Promise.reject(e);
      }
      Promise.resolve(p).then(function () {
        // 上报成功：从队列移除并写回（写回失败不阻塞内存推进，尽力而为）
        queue.shift();
        writeQueue(queue);
        flushed++;
        attempt();
      }, function () {
        // 上报失败：保留该项与后续项，中断本轮，等待下次触发
        resolve({ flushed: flushed, kept: queue.length });
      });
    }
    // 防御：flush 永不 reject（仅 resolve 统计），避免调用方 catch 将成功项误判为失败重复入队
    try {
      attempt();
    } catch (e) {
      resolve({ flushed: 0, kept: getPendingScores().length });
    }
  });
}

// ============ 六、对外接口 ============

module.exports = {
  // 底层统一接口
  get: get,
  set: set,
  remove: remove,
  // 昵称与头像
  getNickname: getNickname,
  setNickname: setNickname,
  getAvatar: getAvatar,
  setAvatar: setAvatar,
  // 登录态缓存（M5）
  getToken: getToken,
  setToken: setToken,
  clearToken: clearToken,
  getUser: getUser,
  setUser: setUser,
  clearUser: clearUser,
  // 皮肤选择
  getWarriorSkin: getWarriorSkin,
  setWarriorSkin: setWarriorSkin,
  getBossSkin: getBossSkin,
  setBossSkin: setBossSkin,
  // 星级存档
  getAllStars: getAllStars,
  getStars: getStars,
  saveStars: saveStars,
  // 关卡解锁
  isLevelUnlocked: isLevelUnlocked,
  findContinueLevel: findContinueLevel,
  // 待上报成绩队列
  MAX_PENDING_SCORES: MAX_PENDING_SCORES,
  getPendingScores: getPendingScores,
  addPendingScore: addPendingScore,
  clearPendingScores: clearPendingScores,
  removePendingScoreAt: removePendingScoreAt,
  flushPendingScores: flushPendingScores
};
