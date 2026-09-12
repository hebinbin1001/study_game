/**
 * achievements.test.js —— 成就体系单测（2026-09-12 需求④ 扩充到 30+）
 *
 * 覆盖 server/achievements.js：
 *   1. 规模与结构：≥30 条、id 唯一、分类齐全、字段齐备、图标路径规范；
 *   2. **无死成就**：每条成就的 metric 必须存在于 METRICS，且阈值 > 0；
 *      每个 metric 至少要能给出一个「可达样本」——即存在一组 stats 让它解锁；
 *   3. 阈值单调：同一 metric 的阶梯（100/500/2000 这类）必须严格递增，不能倒挂；
 *   4. statsFrom：把原始 DB 行（snake_case）映射成指标快照，边界要稳（空数据、缺字段）；
 *   5. evaluate：阈值边界（差 1 不解锁、正好解锁）、进度百分比 0~100、封顶 100；
 *   6. listWithProgress：返回**数组**（兼容旧客户端）+ 新增字段（category/progress/unlockedAt），
 *      已解锁时间不会被进度判定覆盖；
 *   7. 段位类成就的阈值必须落在 server/rank-ladder.js 的合法大段位区间内（口径一致）。
 *
 * 运行：node miniprogram/utils/__tests__/achievements.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('成就体系（server/achievements.js）');

const achievements = require('../../../server/achievements');
const ladder = require('../../../server/rank-ladder');

const DEFS = achievements.DEFINITIONS;
const CATEGORY_KEYS = achievements.CATEGORIES.map(function (c) { return c.key; });

/** 造一份「全部指标都能拉满」的样本，用于验证没有死成就 */
function fullStats() {
  // 300 局、每局 10 题全对三星：覆盖 answer_5000 / play / perfectLevels / comboTotal 等最高阈值
  // grade+level 循环出 60 个不同关卡（覆盖「30 个关卡拿到三星」）
  const scores = Array.from({ length: 600 }, function (_, i) {
    return {
      grade: 'g' + (i % 6),
      level: (i % 10) + 1,
      score: 100,
      // 轮换玩法维度：覆盖「各玩法通关次数」类成就（P2 新增的 4 张图）
      game_type: ['word_warrior', 'snake', 'math24', 'sudoku', 'memory'][i % 5],
      correct_count: 10,
      total_q: 10,
      max_combo: 10,
      stars: 3,
    };
  });
  return achievements.statsFrom({
    rankRecord: { wins: 999, stars: 9999, rankId: 8 },
    scores: scores,
    wrongRecords: Array.from({ length: 60 }, function () { return { mastery: 100, reviewCount: 3 }; }),
    checkins: Array.from({ length: 130 }, function (_, i) { return { date: '2026-01-01', streak: i + 1 }; }),
    customLevelCount: 9,
  });
}

// ============ 1. 规模与结构 ============
s.test('规模：成就 ≥30 条', () => {
  s.assert.ok(DEFS.length >= 30, '当前 ' + DEFS.length + ' 条，应不少于 30 条');
});

s.test('结构：id 唯一、字段齐备、分类合法', () => {
  const ids = DEFS.map(function (d) { return d.achievementId; });
  s.assert.allDistinct(ids, '成就 id 不能重复');
  DEFS.forEach(function (d) {
    s.assert.ok(!!d.achievementId && /^[a-z0-9_]+$/.test(d.achievementId), 'id 规范：' + d.achievementId);
    s.assert.ok(!!d.name && d.name.length <= 12, d.achievementId + ' 名称应为短标题');
    s.assert.ok(!!d.description, d.achievementId + ' 应有描述');
    s.assert.ok(CATEGORY_KEYS.indexOf(d.category) !== -1, d.achievementId + ' 分类非法：' + d.category);
    s.assert.ok(typeof d.threshold === 'number' && d.threshold > 0, d.achievementId + ' 阈值应为正数');
  });
});

s.test('分类：7 个分类都有成就（含答题/关卡/玩法/习惯/错题/段位/自定义）', () => {
  s.assert.equal(achievements.CATEGORIES.length, 7);
  CATEGORY_KEYS.forEach(function (key) {
    const n = DEFS.filter(function (d) { return d.category === key; }).length;
    s.assert.ok(n >= 2, '分类 ' + key + ' 至少应有 2 条成就，实际 ' + n);
  });
});

s.test('图标：路径统一为 /assets/achievements/<id>.png', () => {
  DEFS.forEach(function (d) {
    s.assert.equal(achievements.iconOf(d.achievementId),
      '/assets/achievements/' + d.achievementId + '.png');
  });
});

// ============ 2. 无死成就 ============
s.test('无死成就：每条 metric 都存在，且每个 metric 至少被一条成就使用', () => {
  const usedMetrics = {};
  DEFS.forEach(function (d) {
    s.assert.ok(typeof achievements.METRICS[d.metric] === 'function',
      d.achievementId + ' 的 metric「' + d.metric + '」没有实现（永远解不开）');
    usedMetrics[d.metric] = true;
  });
  Object.keys(achievements.METRICS).forEach(function (m) {
    s.assert.ok(usedMetrics[m], '指标 ' + m + ' 没有任何成就使用（写了也没用）');
  });
});

s.test('无死成就：满级样本下全部成就可解锁（当前 ' + DEFS.length + ' 条）', () => {
  const stats = fullStats();
  const evaluated = achievements.evaluate(stats);
  const locked = evaluated.filter(function (e) { return !e.unlocked; })
    .map(function (e) { return e.achievementId + '(' + e.current + '/' + e.threshold + ')'; });
  s.assert.deepEqual(locked, [], '以下成就在满级样本下仍解不开：' + locked.join(', '));
  s.assert.equal(evaluated.length, DEFS.length);
});

s.test('无死成就：全零样本下一条都不解锁（不能白送）', () => {
  const stats = achievements.statsFrom({});
  const unlocked = achievements.evaluate(stats).filter(function (e) { return e.unlocked; });
  s.assert.deepEqual(unlocked.map(function (e) { return e.achievementId; }), [],
    '空数据不应解锁任何成就');
});

// ============ 3. 阈值单调 ============
s.test('阈值阶梯：同一 metric 的多个成就必须严格递增', () => {
  const byMetric = {};
  DEFS.forEach(function (d) {
    byMetric[d.metric] = byMetric[d.metric] || [];
    byMetric[d.metric].push(d);
  });
  Object.keys(byMetric).forEach(function (m) {
    const list = byMetric[m].slice().sort(function (a, b) { return a.threshold - b.threshold; });
    for (let i = 1; i < list.length; i++) {
      s.assert.ok(list[i].threshold > list[i - 1].threshold,
        '同一指标 ' + m + ' 出现重复/倒挂阈值：'
        + list[i - 1].achievementId + '=' + list[i - 1].threshold
        + ' 与 ' + list[i].achievementId + '=' + list[i].threshold);
    }
  });
});

// ============ 4. statsFrom ============
s.test('statsFrom：空数据安全（不抛错、全 0）', () => {
  const st = achievements.statsFrom(null);
  Object.keys(achievements.METRICS).forEach(function (m) {
    s.assert.equal(st[m], 0, m + ' 在空数据下应为 0');
  });
});

s.test('statsFrom：由原始成绩行算出累计答对 / 最高连击 / 全对 / 三星次数 / 对局数', () => {
  const st = achievements.statsFrom({
    scores: [
      { correct_count: 6, total_q: 10, max_combo: 4, stars: 1 },
      { correct_count: 10, total_q: 10, max_combo: 12, stars: 3 },
      { correct_count: 8, total_q: 10, max_combo: 9, stars: 2 },
    ],
  });
  s.assert.equal(st.totalCorrect, 24);
  s.assert.equal(st.maxCombo, 12);
  s.assert.equal(st.perfectRun, 1, '出现过单局全对');
  s.assert.equal(st.perfectCount, 1);
  s.assert.equal(st.playCount, 3);
});

s.test('statsFrom：连续全对取最长连续段，被答错打断', () => {
  const perfect = function () { return { correct_count: 10, total_q: 10, stars: 3 }; };
  const miss = function () { return { correct_count: 6, total_q: 10, stars: 1 }; };
  const st = achievements.statsFrom({
    scores: [perfect(), perfect(), miss(), perfect(), perfect(), perfect()],
  });
  s.assert.equal(st.perfectStreak, 3, '最长连续段是最后 3 局');
  const none = achievements.statsFrom({ scores: [miss(), miss()] });
  s.assert.equal(none.perfectStreak, 0);
});

s.test('statsFrom：累计连击 = 各局最高连击之和；三星关卡按学段+关卡去重', () => {
  const st = achievements.statsFrom({
    scores: [
      { grade: 'g1', level: 1, max_combo: 6, stars: 3, score: 80, correct_count: 8, total_q: 10 },
      { grade: 'g1', level: 1, max_combo: 4, stars: 3, score: 90, correct_count: 9, total_q: 10 },
      { grade: 'g1', level: 2, max_combo: 3, stars: 2, score: 70, correct_count: 7, total_q: 10 },
    ],
  });
  s.assert.equal(st.comboTotal, 13, '6+4+3');
  s.assert.equal(st.maxCombo, 6);
  s.assert.equal(st.maxScore, 90);
  s.assert.equal(st.perfectLevels, 1, '同一关刷两次三星只算一关');
});

s.test('statsFrom：错题/签到/段位/自定义关卡口径', () => {
  const st = achievements.statsFrom({
    rankRecord: { wins: 7, stars: 88, rankId: 4 },
    wrongRecords: [
      { mastery: 100, reviewCount: 2 },
      { mastery: 99, reviewCount: 1 },
      { mastery: 0, reviewCount: 0 },
    ],
    checkins: [{ date: '2026-09-11', streak: 2 }, { date: '2026-09-12', streak: 3 }],
    customLevelCount: 2,
  });
  s.assert.equal(st.wins, 7);
  s.assert.equal(st.stars, 88);
  s.assert.equal(st.rankId, 4);
  s.assert.equal(st.wrongTotal, 3);
  s.assert.equal(st.wrongMastered, 1, '只有 mastery>=100 算已掌握');
  s.assert.equal(st.reviewedItems, 2, '复习过至少一次才算');
  s.assert.equal(st.streakMax, 3, '取最长连续天数');
  s.assert.equal(st.checkinTotal, 2);
  s.assert.equal(st.customLevels, 2);
});

s.test('statsFrom：按 game_type 统计各玩法通关次数（P2 玩法类成就的口径）', () => {
  const st = achievements.statsFrom({
    scores: [
      { game_type: 'snake', stars: 2 },
      { game_type: 'snake', stars: 3 },
      { game_type: 'snake', stars: 0 },   // 没通关（0 星）不算
      { game_type: 'sudoku', stars: 1 },
      { game_type: 'math24', stars: 3 },
      { game_type: 'memory', stars: 1 },
      { game_type: 'word_warrior', stars: 3 },
    ],
  });
  s.assert.equal(st.snakeClears, 2, '贪吃蛇通关 2 次（0 星那局不算）');
  s.assert.equal(st.sudokuClears, 1);
  s.assert.equal(st.math24Clears, 1);
  s.assert.equal(st.memoryClears, 1);
});

// ============ 5. evaluate ============
s.test('evaluate：阈值边界（差 1 不解锁、正好解锁）', () => {
  const just = achievements.evaluate(achievements.statsFrom({ rankRecord: { wins: 9 } }));
  s.assert.equal(just.find(function (e) { return e.achievementId === 'level_clear_10'; }).unlocked, false);
  const exact = achievements.evaluate(achievements.statsFrom({ rankRecord: { wins: 10 } }));
  s.assert.equal(exact.find(function (e) { return e.achievementId === 'level_clear_10'; }).unlocked, true);
  // 阶梯：10 关解锁时 30/100 关仍未解锁
  s.assert.equal(exact.find(function (e) { return e.achievementId === 'level_clear_30'; }).unlocked, false);
});

s.test('evaluate：进度百分比 0~100 且封顶', () => {
  const st = achievements.statsFrom({ rankRecord: { wins: 5 } });
  const ev = achievements.evaluate(st);
  const win10 = ev.find(function (e) { return e.achievementId === 'level_clear_10'; });
  s.assert.equal(win10.progress, 50, '5/10 = 50%');
  const over = achievements.evaluate(achievements.statsFrom({ rankRecord: { wins: 999 } }))
    .find(function (e) { return e.achievementId === 'level_clear_10'; });
  s.assert.equal(over.progress, 100, '超出阈值时封顶 100%');
  ev.forEach(function (e) {
    s.assert.ok(e.progress >= 0 && e.progress <= 100, e.achievementId + ' 进度越界：' + e.progress);
  });
});

// ============ 6. listWithProgress ============
s.test('列表：返回数组（兼容旧客户端）且带新字段', () => {
  const list = achievements.listWithProgress(achievements.statsFrom({}), {});
  s.assert.ok(Array.isArray(list), '必须是数组（老客户端按数组渲染）');
  s.assert.equal(list.length, DEFS.length);
  const item = list[0];
  s.assert.ok(!!item.achievementId && !!item.name && !!item.description && !!item.icon);
  s.assert.ok(!!item.category && typeof item.progress === 'number' && typeof item.current === 'number');
  s.assert.equal(item.unlocked, false);
  s.assert.equal(item.unlockedAt, null);
  s.assert.equal(item.conditionValue, item.threshold, '兼容字段 conditionValue = threshold');
});

s.test('列表：已解锁时间来自落库记录，不因进度判定被清空', () => {
  const when = new Date('2026-09-12T10:00:00Z');
  const list = achievements.listWithProgress(achievements.statsFrom({ rankRecord: { wins: 50 } }), {
    level_clear_10: when,
  });
  const got = list.find(function (it) { return it.achievementId === 'level_clear_10'; });
  s.assert.equal(got.unlocked, true);
  s.assert.equal(got.unlockedAt, when);
  s.assert.equal(got.progress, 100);
});

// ============ 7. 与段位口径一致 ============
s.test('段位类成就：阈值落在合法大段位区间（1~8）', () => {
  const maxCell = ladder.LADDER ? ladder.LADDER.length : 8;
  const rankDefs = DEFS.filter(function (d) { return d.category === 'rank'; });
  s.assert.ok(rankDefs.length >= 4, '段位类至少 4 条');
  rankDefs.forEach(function (d) {
    s.assert.equal(d.metric, 'rankId');
    s.assert.ok(d.threshold >= 1 && d.threshold <= maxCell,
      d.achievementId + ' 阈值 ' + d.threshold + ' 超出段位区间 1~' + maxCell);
  });
  // 阈值从低到高应覆盖「早期 / 中期 / 高阶」
  const ths = rankDefs.map(function (d) { return d.threshold; }).sort(function (a, b) { return a - b; });
  s.assert.equal(ths[0], 1, '应有一条「刚有段位」的入门成就');
  s.assert.ok(ths[ths.length - 1] >= 7, '应有高阶段位成就');
});

s.done();
