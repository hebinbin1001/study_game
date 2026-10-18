/**
 * utils/puzzle-resume.js —— 闯关中途断点存档（续玩）
 *
 * 为什么需要：
 *   数字智力类玩法（华容道 / 数独 / 2048 / 一笔画 / 迷宫 / 汉诺塔 / 24 点）一局可能
 *   要几分钟到十几分钟。原来这些页面只在「通关」时写星级，中途退出（切后台被回收、
 *   误触返回、来电话）后重新进入只能从第 1 步重来 —— 用户反馈「尤其是华容道」。
 *
 * 设计口径：
 *   1. **每个玩法一个槽位**（`ww_resume_<game>`）：只保留「最近一局未完成的」，不堆历史；
 *   2. 快照结构统一 `{ v, game, level, ts, state }`：
 *        · v      —— 结构版本号，页面数据结构变了就 +1，旧快照自动作废（不会读出脏局面）；
 *        · level  —— 关卡号，进入页面时用于判断「这份存档是不是这一关的」；
 *        · state  —— 各玩法自己的最小可恢复状态（由页面定义，模块不解释）；
 *   3. **过期与限长**：超过 MAX_AGE_MS（7 天）自动作废；序列化后超过 MAX_BYTES（64KB）
 *      直接不写（避免把 1MB 的单 key 配额吃掉，导致星级等关键存档写不进去）；
 *   4. 通关 / 重新开始 / 判负时由页面调用 clear()，不留「已完成的残局」。
 *
 * 为什么不做成「通用序列化框架」：各玩法的状态结构差异很大（华容道是棋子坐标，
 * 迷宫是 seed + 门状态），强行抽象只会让页面多写一层映射。这里只统一「存取与清理」
 * 的规则，状态本身由页面自己给，出错面最小。
 *
 * 关联：pages/klotski、sudoku、g2048、math24、one-stroke、maze、hanoi
 */

'use strict';

var storage = require('./storage');

/** 存储前缀（单槽：每个玩法只留最近一局） */
var PREFIX = 'ww_resume_';
/** 结构版本：任何玩法的 state 结构发生不兼容变更时 +1 */
var VERSION = 1;
/** 存档有效期：7 天没再碰这一局就当过期，避免读到「上周的残局」 */
var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 单条快照上限：64KB（超了宁可不存，也不能挤爆本地存储配额） */
var MAX_BYTES = 64 * 1024;

/** 玩法 key → 存储 key */
function keyOf(game) {
  return PREFIX + String(game || '');
}

/**
 * 写一份断点快照（覆盖同玩法的旧快照）。
 * @param {string} game 玩法 key（与星级存档一致，如 'klotski'）
 * @param {number} level 关卡号（1 起）
 * @param {*} state 玩法自己的最小恢复状态（必须可 JSON 序列化）
 * @returns {boolean} 是否写入成功（超限 / 序列化失败 / 存储失败都返回 false）
 */
function save(game, level, state) {
  var g = String(game || '');
  var n = parseInt(level, 10);
  if (!g || !(n >= 1) || state === undefined || state === null) return false;
  var payload = { v: VERSION, game: g, level: n, ts: Date.now(), state: state };
  var json;
  try {
    json = JSON.stringify(payload);
  } catch (e) {
    return false;                       // 循环引用 / 含函数：不写，也不能把页面带崩
  }
  // 长度按 UTF-16 码元估算，中文会偏保守 —— 保守是安全的
  if (!json || json.length > MAX_BYTES) {
    clear(g);
    return false;
  }
  return storage.set(keyOf(g), payload);
}

/**
 * 读断点快照（含版本 / 过期校验）；读不到返回 null。
 * @param {string} game 玩法 key
 * @returns {?{v:number,game:string,level:number,ts:number,state:*}}
 */
function load(game) {
  var g = String(game || '');
  if (!g) return null;
  var v = storage.get(keyOf(g));
  if (!v || typeof v !== 'object') return null;
  if (v.v !== VERSION) { clear(g); return null; }          // 旧结构：直接作废
  if (!v.ts || (Date.now() - v.ts) > MAX_AGE_MS) { clear(g); return null; } // 过期
  if (!v.state) { clear(g); return null; }
  return v;
}

/**
 * 读「指定关卡」的断点快照：level 不匹配时返回 null（但**不清除**，
 * 因为用户可能只是点进了别的关卡，原来那局的存档还该留着）。
 * @param {string} game
 * @param {number} level
 * @returns {?Object}
 */
function loadFor(game, level) {
  var snap = load(game);
  if (!snap) return null;
  if (parseInt(level, 10) !== snap.level) return null;
  return snap;
}

/** 清掉某玩法的断点存档（通关 / 重开 / 判负时调） */
function clear(game) {
  var g = String(game || '');
  if (!g) return;
  storage.remove(keyOf(g));
}

/** 是否存在有效断点（只判断，不读内容给页面） */
function has(game) {
  return !!load(game);
}

/** 断点对应的关卡号（没有则 0），用于「继续上次」跳关 */
function levelOf(game) {
  var snap = load(game);
  return snap ? snap.level : 0;
}

module.exports = {
  PREFIX: PREFIX,
  VERSION: VERSION,
  MAX_AGE_MS: MAX_AGE_MS,
  MAX_BYTES: MAX_BYTES,
  keyOf: keyOf,
  save: save,
  load: load,
  loadFor: loadFor,
  clear: clear,
  has: has,
  levelOf: levelOf
};
