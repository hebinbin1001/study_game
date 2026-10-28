/**
 * 从云端成绩恢复被系统清理的本地星级存档。
 *
 * 服务端 scores 保留每次成绩；本模块按玩法/学段/题型/关卡取历史最高星，
 * 合并进 ww_stars。只增不减，不会覆盖本地更高成绩。
 */
'use strict';

var request = require('./request');
var auth = require('./auth');
var storage = require('./storage');
var constants = require('./constants');
var challenge = require('./challenge');

var RECOVERY_META_KEY = 'ww_stars_restore_meta';
var BACKUP_KEY = 'ww_stars_before_cloud_restore';
var E2E_FLAG_KEY = 'ww_e2e_mode_until';
var PUZZLE_GAMES = {
  math24: 1,
  sudoku: 1,
  sprint: 1,
  balance: 1,
  g2048: 1,
  memory: 1,
  onestroke: 1,
  klotski: 1,
  pattern: 1,
  clock: 1,
  maze: 1,
  hanoi: 1
};
var WORD_MODE = {
  word_warrior: 'shoot',
  word_build: 'wordBuild',
  link: 'link',
  match: 'match',
  idiom: 'idiom',
  snake: 'snake',
  quiz: 'quiz',
  letter_bubble: 'letterBubble'
};

function restoreKeyOf(row) {
  var item = row || {};
  var gameType = String(item.gameType || item.game_type || '');
  var grade = String(item.grade || '');
  var typeKey = String(item.typeKey || item.type_key || '');
  var level = parseInt(item.level, 10) || 0;
  if (!gameType || level < 1) return '';

  if (PUZZLE_GAMES[gameType]) return gameType + '_' + level;
  if (!grade) return '';
  if (typeKey) return grade + '@' + typeKey + '@' + level;

  var mode = WORD_MODE[gameType];
  if (!mode) return grade + '_' + level;
  var main = challenge.levelAt(grade, level);
  if (main && main.mode === mode) return grade + '@' + challenge.STAR_KEY + '@' + level;
  return grade + '@' + challenge.lineKeyOf(mode) + '@' + level;
}

function mergeHistory(existing, history) {
  var merged = {};
  var current = existing || {};
  Object.keys(current).forEach(function (key) {
    var stars = Number(current[key]);
    if (isFinite(stars) && stars > 0) merged[key] = Math.min(3, stars);
  });
  var restored = 0;
  var scanned = 0;
  (history || []).forEach(function (row) {
    var key = restoreKeyOf(row);
    var stars = Math.max(0, Math.min(3, parseInt(row && row.stars, 10) || 0));
    if (!key || stars <= 0) return;
    scanned++;
    var prev = Number(merged[key]) || 0;
    if (stars > prev) {
      merged[key] = stars;
      restored++;
    }
  });
  return { stars: merged, restored: restored, scanned: scanned };
}

var _pending = null;

function restoreFromCloud() {
  if (_pending) return _pending;
  if (Number(storage.get(E2E_FLAG_KEY)) > Date.now()) {
    return Promise.resolve({ skipped: true, restored: 0, scanned: 0, e2e: true });
  }
  if (!auth.isLoggedIn()) {
    return Promise.resolve({ skipped: true, restored: 0, scanned: 0 });
  }
  _pending = request.get('/api/score/history').then(function (data) {
    if (Number(storage.get(E2E_FLAG_KEY)) > Date.now()) {
      return { skipped: true, restored: 0, scanned: 0, e2e: true };
    }
    var history = (data && data.history) || [];
    var existing = storage.getAllStars();
    var result = mergeHistory(existing, history);
    if (result.restored > 0) {
      if (!storage.get(BACKUP_KEY)) storage.set(BACKUP_KEY, existing);
      storage.set(constants.STORAGE_KEYS.stars, result.stars);
    }
    storage.set(RECOVERY_META_KEY, {
      lastAt: Date.now(),
      sourceRows: Number(data && data.totalRows) || history.length,
      scanned: result.scanned,
      restored: result.restored
    });
    return {
      skipped: false,
      restored: result.restored,
      scanned: result.scanned,
      totalRows: Number(data && data.totalRows) || history.length
    };
  }).catch(function (err) {
    _pending = null;
    throw err;
  }).then(function (result) {
    _pending = null;
    return result;
  });
  return _pending;
}

module.exports = {
  RECOVERY_META_KEY: RECOVERY_META_KEY,
  BACKUP_KEY: BACKUP_KEY,
  E2E_FLAG_KEY: E2E_FLAG_KEY,
  restoreKeyOf: restoreKeyOf,
  mergeHistory: mergeHistory,
  restoreFromCloud: restoreFromCloud
};
