/**
 * rank-stars.test.js —— 段位星星去重口径（2026-09-13 用户拍板 (C)）
 *
 * 口径：段位星 = 按 (游戏类型, 学段, 题型, 关卡) 取**历史最高星**后求和。
 * 目的：堵住「同一关反复刷反复叠星 → 随便玩玩就满级」。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('段位星星去重口径');

const { dedupeStars } = require('../../server/rank-stars');

s.test('同一关刷多次只算一次最高星', () => {
  const rows = [
    { game_type: 'word_warrior', grade: 'primary34', type_key: '', level: 1, stars: 1 },
    { game_type: 'word_warrior', grade: 'primary34', type_key: '', level: 1, stars: 3 },
    { game_type: 'word_warrior', grade: 'primary34', type_key: '', level: 1, stars: 2 }
  ];
  s.assert.equal(dedupeStars(rows), 3);
});

s.test('不同关卡 / 学段 / 玩法 / 题型分别计入', () => {
  const rows = [
    { game_type: 'word_warrior', grade: 'primary34', type_key: '', level: 1, stars: 3 },
    { game_type: 'word_warrior', grade: 'primary34', type_key: '', level: 2, stars: 2 },
    { game_type: 'word_warrior', grade: 'primary12', type_key: '', level: 1, stars: 3 },
    { game_type: 'link', grade: 'primary34', type_key: '', level: 1, stars: 3 },
    { game_type: 'word_warrior', grade: 'primary34', type_key: 'idiom', level: 1, stars: 1 }
  ];
  s.assert.equal(dedupeStars(rows), 3 + 2 + 3 + 3 + 1);
});

s.test('缺字段 / 脏数据安全，且星数封顶 3', () => {
  s.assert.equal(dedupeStars(null), 0);
  s.assert.equal(dedupeStars([]), 0);
  s.assert.equal(dedupeStars([null, undefined]), 0);
  s.assert.equal(dedupeStars([{ stars: 9 }]), 3, '自报超过 3 星按 3 计');
  s.assert.equal(dedupeStars([{ stars: -5 }]), 0, '负数按 0 计');
  s.assert.equal(dedupeStars([{ level: 0, stars: 2 }]), 2, '关卡 0 也算一条（不吞数据）');
});

s.test('空关卡号不会与「无 level」混淆', () => {
  const rows = [
    { grade: 'primary34', level: '', stars: 3 },
    { grade: 'primary34', level: null, stars: 1 }
  ];
  s.assert.equal(dedupeStars(rows), 3, '同一 key（空 level）应取最高');
});
