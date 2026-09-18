/**
 * utils/bank.js —— 题库覆盖层（用户可编辑词条，2026-09-18）
 *
 * 需求：题库页要能**直观看到各学段有哪些词汇**，并支持**编辑 / 新增 / 删除**，
 * 而且这些题库就是**闯关线的题源**。
 *
 * 做法（关键设计）：不改十几个玩法的取题代码，只在词库层加一层「用户覆盖」——
 *   内置词库（miniprogram/data/*.js，只读）
 *     ⊕ 用户新增（action='create'）
 *     ⊕ 用户修改（action='patch'，按指纹覆盖内置同名条目的字段）
 *     − 用户停用（action='disable'，按指纹把内置条目从题池里拿掉）
 * 合并结果由 utils/dict.js 统一返回，于是**字母射击 / 拼词 / 成语 / 贪吃蛇 / 连连看 /
 * 每日一题 / 关卡页题量统计**全都自动跟着用户题库走。
 *
 * 存储：云端为真源（跨设备不丢），本地缓存一份保证离线也能出题。
 *   本模块只管「规则 + 本地缓存」，网络读写由页面层调 /api/wordbank/*。
 *
 * 为什么内置条目是「停用」而不是物理删除：内置词库以后会升级补词，
 * 硬删会跟升级打架（删了又回来）。停用是可逆的，界面上等同删除。
 */

'use strict';

var storage = require('./storage');

var CACHE_KEY = 'ww_wordbank_overrides';

/** 词条指纹：内置条目靠它定位（学段 + 题型 + 题目），与数组下标无关（内置库升级不会错位） */
function fingerprint(grade, type, q) {
  return String(grade || '') + '|' + String(type || '') + '|' + String(q || '');
}

/** 读本地缓存的覆盖记录（形如 { 'grade|type|q': entry }） */
function readCache() {
  var raw = storage.get(CACHE_KEY);
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }
  return (typeof raw === 'object') ? raw : {};
}

function writeCache(map) {
  storage.set(CACHE_KEY, JSON.stringify(map || {}));
}

/**
 * 覆盖记录列表 → 以指纹为键的字典（同时写本地缓存）。
 * @param {Array<Object>} list 服务端返回的覆盖记录
 * @returns {Object} { 'grade|type|q': entry }
 */
function setOverrides(list) {
  var map = {};
  (list || []).forEach(function (e) {
    if (!e) return;
    var key = e.key || fingerprint(e.grade, e.type, e.q);
    map[key] = {
      key: key,
      action: e.action || 'create',
      grade: e.grade || '',
      type: e.type || '',
      q: e.q || '',
      a: e.a || '',
      hint: e.hint || '',
      ex: e.ex || '',
      d: e.d || ''
    };
  });
  writeCache(map);
  return map;
}

/** 读覆盖记录（优先用内存/本地缓存；页面刷新时内存会重建） */
function getOverrides() {
  return readCache();
}

/**
 * 把覆盖层套到某个学段的内置词条上（纯函数，便于单测）。
 *
 * 规则与顺序：
 *   1. disable → 该条目从结果里剔除；
 *   2. patch   → 用用户的 a/hint/ex/d 覆盖内置同名字段（q 不变，所以指纹仍稳定）；
 *   3. create  → 追加到末尾（同一「题型+题目」重复新增时按最后一条覆盖）。
 *
 * @param {Array<Object>} builtin 内置词条（只读）
 * @param {string} grade 学段 key
 * @param {Object} [map] 覆盖字典；缺省读本地缓存
 * @returns {Array<Object>} 合并后的词条数组（新数组，不修改入参）
 */
function applyOverrides(builtin, grade, map) {
  var ov = map || getOverrides();
  var disabled = {};
  var patches = {};
  var creates = [];

  Object.keys(ov || {}).forEach(function (k) {
    var e = ov[k];
    if (!e || e.grade !== grade) return;
    if (e.action === 'disable') disabled[k] = true;
    else if (e.action === 'patch') patches[k] = e;
    else if (e.action === 'create') creates.push(e);
  });

  var out = [];
  (builtin || []).forEach(function (it) {
    if (!it) return;
    var key = fingerprint(grade, it.type, it.q);
    if (disabled[key]) return;
    var patch = patches[key];
    if (!patch) { out.push(it); return; }
    out.push(mergeItem(it, patch));
  });

  var seen = {};
  out.forEach(function (it) { seen[fingerprint(grade, it.type, it.q)] = true; });
  creates.forEach(function (e) {
    var key = fingerprint(grade, e.type, e.q);
    if (!e.q || !e.a) return;            // 残缺记录忽略（服务端也会校验）
    if (seen[key]) return;               // 内置里已有同名条目：patch 才是正确动作
    seen[key] = true;
    out.push({
      type: e.type,
      q: e.q,
      a: e.a,
      hint: e.hint || '',
      ex: e.ex || '',
      d: e.d ? String(e.d).split(',').filter(Boolean) : undefined,
      _user: true                      // 标记为「我的」词条（题库页展示来源标签）
    });
  });
  return out;
}

/** 用覆盖记录改写内置条目（只覆盖有值的字段，空值不抹掉内置内容） */
function mergeItem(builtin, patch) {
  var out = {};
  Object.keys(builtin).forEach(function (k) { out[k] = builtin[k]; });
  if (patch.a) out.a = patch.a;
  if (patch.hint) out.hint = patch.hint;
  if (patch.ex) out.ex = patch.ex;
  if (patch.d) out.d = String(patch.d).split(',').filter(Boolean);
  out._edited = true;                   // 标记为「已修改」
  return out;
}

/**
 * 构造一条覆盖记录（页面保存时用，与 /api/wordbank/entries 的 body 同形）。
 * @param {string} action 'create' | 'patch' | 'disable'
 */
function makeEntry(action, grade, type, q, fields) {
  var f = fields || {};
  return {
    action: action,
    grade: grade || '',
    type: type || '',
    q: q || '',
    a: f.a || '',
    hint: f.hint || '',
    ex: f.ex || '',
    d: f.d || '',
    key: fingerprint(grade, type, q)
  };
}

/** 本地即时合并一条改动（不等云端回来就先让页面/对局生效） */
function upsertLocal(entry) {
  var map = readCache();
  var key = entry.key || fingerprint(entry.grade, entry.type, entry.q);
  map[key] = Object.assign({}, entry, { key: key });
  writeCache(map);
  return map;
}

/** 本地移除一条改动（恢复内置原样） */
function removeLocal(grade, type, q) {
  var map = readCache();
  delete map[fingerprint(grade, type, q)];
  writeCache(map);
  return map;
}

module.exports = {
  CACHE_KEY: CACHE_KEY,
  fingerprint: fingerprint,
  setOverrides: setOverrides,
  getOverrides: getOverrides,
  applyOverrides: applyOverrides,
  mergeItem: mergeItem,
  makeEntry: makeEntry,
  upsertLocal: upsertLocal,
  removeLocal: removeLocal
};
