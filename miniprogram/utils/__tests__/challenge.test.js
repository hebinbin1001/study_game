/**
 * challenge.test.js —— 挑战主线关卡表单测
 *
 * 覆盖（对应 docs/挑战关卡规划-待确认.md 的落地约束）：
 *   1. 关卡规模与编排：每学段 30 关、三款玩法各 10 关、第 1 关固定字母射击；
 *   2. 未支持参数的玩法不得进模板（防止玩家点进某一关却随机开局 / 不记星而卡关）；
 *   3. 按学段生成不同关卡：副标题/参数随学段变化；
 *   4. 固定题面：同一关两次取题完全一致，不同关/不同学段不一致；
 *   5. 星级可达性：每款玩法在其「题量 + 命数」下，1/2/3 星三档都拿得到（R1 同类护栏）；
 *   6. 老存档迁移：旧的字母射击 10 关星级搬到主线的对应字母射击关，且幂等；
 *   7. 随机器：同种子可复现、不同种子不同、pickN 不重复不越界。
 *
 * 运行：node miniprogram/utils/__tests__/challenge.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('挑战主线关卡表');

const challenge = require('../challenge');
const constants = require('../constants');
const dict = require('../dict');
const rng = require('../rng');

const GRADES = constants.GRADES.map(function (g) { return g.key; });

// ============ 1. 编排 ============
s.test('关卡规模：每学段 30 关', () => {
  s.assert.equal(challenge.LEVELS_PER_GRADE, 30);
  GRADES.forEach(function (g) {
    s.assert.equal(challenge.levelsOf(g).length, 30, g + ' 应有 30 关');
  });
});

s.test('编排：6 款玩法轮换 + 终关 Boss，第 1 关固定字母射击', () => {
  GRADES.forEach(function (g) {
    const rows = challenge.levelsOf(g);
    const count = {};
    rows.forEach(function (r) { count[r.mode] = (count[r.mode] || 0) + 1; });
    // P2：6 款玩法轮换，30 关 → 每款各 5 关；
    // 终关 Boss（第 30 关）固定字母射击 → shoot 6 关、snake 4 关，其余仍是各 5 关
    s.assert.equal(count.shoot, 6, g + ' 字母射击应 6 关（第 1 关新手关 + 第 30 关 Boss 关）');
    ['match', 'wordBuild', 'link', 'idiom'].forEach(function (m) {
      s.assert.equal(count[m], 5, g + ' 玩法「' + m + '」应 5 关');
    });
    s.assert.equal(count.snake, 4, g + ' 贪吃蛇应 4 关（第 30 关被 Boss 关占用）');
    s.assert.equal(Object.keys(count).length, 6, g + ' 主线应恰好 6 款玩法');
    s.assert.equal(rows[0].mode, 'shoot', g + ' 第 1 关应为字母射击（新手关）');
    s.assert.equal(rows[challenge.BOSS_LEVEL - 1].mode, 'shoot',
      g + ' 第 ' + challenge.BOSS_LEVEL + ' 关应为字母射击（Boss 关）');
  });
});

s.test('编排：相邻两关不重复同一玩法（节奏轮换）', () => {
  const rows = challenge.levelsOf('primary34');
  for (let i = 1; i < rows.length; i++) {
    s.assert.notEqual(rows[i].mode, rows[i - 1].mode, '第 ' + (i + 1) + ' 关与上一关玩法重复');
  }
});

s.test('模板只使用已支持挑战参数的玩法（防止半成品玩法进主线卡关）', () => {
  // P2 已接入 6 款：字母射击 / 消消乐 / 字母拼词 / 连连看 / 成语拼字 / 贪吃蛇
  const supported = ['shoot', 'match', 'wordBuild', 'link', 'idiom', 'snake'];
  challenge.TEMPLATE.forEach(function (row) {
    s.assert.ok(supported.indexOf(row.mode) !== -1,
      '第 ' + row.level + ' 关的玩法「' + row.mode + '」还没支持按关卡参数开局，不能进主线');
    s.assert.ok(!!challenge.MODES[row.mode], row.mode + ' 必须在 MODES 里登记');
    s.assert.ok(!!challenge.MODES[row.mode].page, row.mode + ' 必须登记跳转页');
  });
});

// ============ 2. 按年级生成不同关卡 ============
s.test('按学段实例化：玩法相同、题量随学段变化', () => {
  const k = challenge.levelAt('kindergarten', 3);   // 第 3 关 = 字母拼词
  const j = challenge.levelAt('junior', 3);
  s.assert.equal(k.mode, j.mode, '同一关卡号玩法应一致');
  s.assert.equal(k.mode, 'wordBuild');
  s.assert.equal(challenge.paramsOf('kindergarten', 'wordBuild').count, 6);
  s.assert.equal(challenge.paramsOf('junior', 'wordBuild').count, 10);
  s.assert.notEqual(k.sub, j.sub, '副标题应体现学段差异');
  s.assert.contains(k.sub, '6 题');
});

s.test('关卡描述字段齐备且越界返回 null', () => {
  const lv = challenge.levelAt('primary34', 4);
  s.assert.equal(lv.level, 4);
  s.assert.ok(!!lv.modeLabel && !!lv.modeEmoji && !!lv.page && !!lv.sub);
  s.assert.equal(lv.seed, challenge.seedOf('primary34', 4));
  s.assert.equal(challenge.levelAt('primary34', 0), null);
  s.assert.equal(challenge.levelAt('primary34', 31), null);
});

s.test('跳转 URL 带齐 challenge/grade/level/seed', () => {
  const lv = challenge.levelAt('primary12', 4);      // 第 4 关 = 词语连连看
  const url = challenge.pageUrl(lv, 'primary12');
  s.assert.contains(url, '/pages/link/link?');
  s.assert.contains(url, 'challenge=1');
  s.assert.contains(url, 'grade=primary12');
  s.assert.contains(url, 'level=4');
  s.assert.contains(url, 'seed=' + lv.seed);
});

// ============ 3. 固定题面（种子） ============
s.test('种子：同关恒定、不同关/不同学段不同', () => {
  s.assert.equal(challenge.seedOf('primary34', 7), challenge.seedOf('primary34', 7));
  s.assert.notEqual(challenge.seedOf('primary34', 7), challenge.seedOf('primary34', 8));
  s.assert.notEqual(challenge.seedOf('primary34', 7), challenge.seedOf('junior', 7));
  s.assert.ok(challenge.seedOf('primary34', 7) > 0, '种子应为正整数');
});

s.test('取题：同一关两次完全一致（重玩刷星公平）', () => {
  GRADES.forEach(function (g) {
    for (let lv = 1; lv <= 30; lv += 3) {
      const a = challenge.pickItems(g, lv, 10).map(function (i) { return i.q + '|' + i.a; });
      const b = challenge.pickItems(g, lv, 10).map(function (i) { return i.q + '|' + i.a; });
      s.assert.deepEqual(b, a, g + ' 第 ' + lv + ' 关两次取题应一致');
      s.assert.allDistinct(a, g + ' 第 ' + lv + ' 关不应出重复题');
    }
  });
});

s.test('取题：不同关的题目组合不同', () => {
  const a = challenge.pickItems('primary34', 1, 10).map(function (i) { return i.q; }).join(',');
  const b = challenge.pickItems('primary34', 4, 10).map(function (i) { return i.q; }).join(',');
  s.assert.notEqual(a, b, '同一学段不同关不应出同一套题');
});

s.test('取题：题量按需、超出题库时返回实际数量', () => {
  const items = challenge.pickItems('kindergarten', 1, 100);
  const pool = dict.loadByGrade('kindergarten');
  s.assert.equal(items.length, Math.min(100, pool.length));
  s.assert.ok(items.length >= 1, '至少要能取到题');
});

s.test('取题：分类限定只出该类题', () => {
  const items = challenge.pickItems('primary34', 5, 8, 'idiom');
  s.assert.ok(items.length > 0, '该学段应有成语题');
  items.forEach(function (it) {
    s.assert.ok(constants.isItemInGroup(it, 'idiom'), '应只出成语：' + it.q);
  });
});

// ============ 4. 星级可达性护栏 ============
s.test('星级可达性：字母射击（10 题 5 命）三档都拿得到', () => {
  const p = challenge.paramsOf('primary34', 'shoot');
  const r = challenge.starReachability(p.totalQ, p.lives);
  s.assert.deepEqual(r.reachable, [1, 2, 3], '1/2/3 星都应可达（旧缺陷回归点）');
  s.assert.equal(Math.round(r.minRate), 60, '通关最低正确率 60% 恰好落在 1 星档');
});

s.test('星级可达性：每个学段的字母拼词题量都让三档可达', () => {
  GRADES.forEach(function (g) {
    const p = challenge.paramsOf(g, 'wordBuild');
    // 字母拼词 5 命（与字母射击统一口径），答错扣命，命耗尽判负不发星
    const r = challenge.starReachability(p.count, 5);
    s.assert.deepEqual(r.reachable, [1, 2, 3],
      g + ' 字母拼词 ' + p.count + ' 题 5 命时应 1/2/3 星都可达');
  });
});

s.test('星级折算：答对率 90/70/60 与剩余命 3/2/1', () => {
  // 这个用例的标题里两套口径都要成立，Boss 相关的护栏在下方单独成组
  s.assert.equal(challenge.starsByRightRate(10, 10), 3);
  s.assert.equal(challenge.starsByRightRate(7, 10), 2);
  s.assert.equal(challenge.starsByRightRate(6, 10), 1);
  s.assert.equal(challenge.starsByRightRate(5, 10), 0);
  s.assert.equal(challenge.starsByRightRate(0, 0), 0, '总题数 0 返回 0，不抛错');
  s.assert.equal(challenge.starsByLives(3), 3);
  s.assert.equal(challenge.starsByLives(2), 2);
  s.assert.equal(challenge.starsByLives(1), 1);
  s.assert.equal(challenge.starsByLives(0), 0);
});

// ============ 4.5 终关 Boss（方案 A：题量 ×1.5 + 命数同比例放大） ============
s.test('Boss 关：第 30 关标记 + 参数为 15 题 7 命', () => {
  GRADES.forEach(function (g) {
    const lv = challenge.levelAt(g, challenge.BOSS_LEVEL);
    s.assert.ok(lv && lv.isBoss, g + ' 第 ' + challenge.BOSS_LEVEL + ' 关应标记 isBoss');
    s.assert.equal(lv.mode, 'shoot', g + ' Boss 关应为字母射击');
    const p = challenge.paramsOf(g, 'shoot', challenge.BOSS_LEVEL);
    s.assert.equal(p.totalQ, 15, g + ' Boss 题量应为 15（10 ×1.5）');
    s.assert.equal(p.lives, 7, g + ' Boss 命数应为 7（否则 1 星档不可达）');
    s.assert.ok(lv.sub.indexOf('BOSS') === 0, 'Boss 关副标题应以 BOSS 开头，实际 = ' + lv.sub);
  });
  // 普通关不受影响
  const normal = challenge.paramsOf('primary34', 'shoot', 25);
  s.assert.equal(normal.totalQ, 10, '普通字母射击关仍是 10 题');
  s.assert.equal(normal.lives, 5, '普通关仍是 5 命');
  // 不传 level 时保持旧行为（老调用方向后兼容）
  s.assert.equal(challenge.paramsOf('primary34', 'shoot').totalQ, 10, '不传 level 应按普通关参数');
});

s.test('Boss 关星级可达性：三档都拿得到（方案 A 的核心不变量）', () => {
  const r = challenge.starReachability(challenge.BOSS_PARAMS.totalQ, challenge.BOSS_PARAMS.lives);
  s.assert.deepEqual(r.reachable, [1, 2, 3], 'Boss 关 1/2/3 星都应可达');
  s.assert.equal(Math.round(r.minRate), 60, 'Boss 通关最低正确率应与普通关一致（60%）');

  // 回归护栏：把「不可行的老方案」钉在这里 —— 一旦有人改回只加题量/只减命数就会红
  const onlyMoreQ = challenge.starReachability(15, 5);
  s.assert.deepEqual(onlyMoreQ.reachable, [2, 3], '15 题 5 命只有 2/3 星可达（说明护栏确实有效）');
  s.assert.equal(Math.round(onlyMoreQ.minRate), 73, '15 题 5 命的通关最低正确率是 73%');
  const fewerLives = challenge.starReachability(10, 4);
  s.assert.deepEqual(fewerLives.reachable, [2, 3], '10 题 4 命同样会丢 1 星（减命也不可行）');
});

s.test('Boss 关：题量真的从题库里取到 15 题，且同关可复现', () => {
  GRADES.forEach(function (g) {
    const items = challenge.pickItems(g, challenge.BOSS_LEVEL, challenge.BOSS_PARAMS.totalQ);
    s.assert.equal(items.length, challenge.BOSS_PARAMS.totalQ,
      g + ' Boss 关应能取到 ' + challenge.BOSS_PARAMS.totalQ + ' 题，实际 ' + items.length);
    const again = challenge.pickItems(g, challenge.BOSS_LEVEL, challenge.BOSS_PARAMS.totalQ);
    s.assert.equal(again.map(function (x) { return x.q; }).join('|'),
      items.map(function (x) { return x.q; }).join('|'), g + ' Boss 关题目应可复现（重玩刷星公平）');
  });
});

// ============ 5. 老存档迁移 ============
s.test('迁移：旧字母射击星级搬到主线对应关，且幂等', () => {
  const mem = {};
  const fake = {
    get: function (k) { return mem[k]; },
    set: function (k, v) { mem[k] = v; },
    getAllStars: function () { return mem.__stars || {}; },
    saveStars: function (grade, level, stars, typeKey) {
      mem.__stars = mem.__stars || {};
      const key = typeKey ? grade + '@' + typeKey + '@' + level : grade + '_' + level;
      mem.__stars[key] = Math.max(mem.__stars[key] || 0, stars);
    }
  };
  mem.__stars = { 'kindergarten_1': 3, 'kindergarten_2': 2, 'junior_10': 1 };

  s.assert.equal(challenge.migrateStars(fake), true, '首次应执行迁移');
  // 旧 10 关按序号平移到主线第 1~10 关（P2 后每款玩法只有 5 关，按玩法槽位映射会丢 6~10 关）
  s.assert.equal(mem.__stars['kindergarten@challenge@1'], 3, '旧第 1 关 → 主线第 1 关');
  s.assert.equal(mem.__stars['kindergarten@challenge@2'], 2, '旧第 2 关 → 主线第 2 关');
  s.assert.equal(mem.__stars['junior@challenge@10'], 1, '旧第 10 关 → 主线第 10 关');
  s.assert.equal(challenge.migrateStars(fake), false, '第二次调用应跳过（幂等）');
});

s.test('迁移：不覆盖已有主线星级（取历史最大值）', () => {
  const mem = { 'primary34@challenge@1': 3, 'primary34_1': 1 };
  const fake = {
    get: function (k) { return mem[k]; },
    set: function (k, v) { mem[k] = v; },
    getAllStars: function () { return mem; },
    saveStars: function (grade, level, stars, typeKey) {
      const key = typeKey ? grade + '@' + typeKey + '@' + level : grade + '_' + level;
      mem[key] = Math.max(mem[key] || 0, stars);
    }
  };
  challenge.migrateStars(fake);
  s.assert.equal(mem['primary34@challenge@1'], 3, '已有 3 星不应被旧的 1 星降级');
});

// ============ 6. 随机源 ============
s.test('随机源：同种子可复现、不同种子不同', () => {
  const a = Array.from({ length: 5 }, rng.makeRng('same'));
  const b = Array.from({ length: 5 }, rng.makeRng('same'));
  const c = Array.from({ length: 5 }, rng.makeRng('other'));
  s.assert.deepEqual(a, b, '同种子应产出同一串');
  s.assert.notDeepEqual(a, c, '不同种子应产出不同串');
  a.forEach(function (v) {
    s.assert.ok(v >= 0 && v < 1, '随机数应落在 [0,1)：' + v);
  });
  s.assert.equal(typeof rng.hashSeed(''), 'number');
  s.assert.notEqual(rng.hashSeed('a'), rng.hashSeed('b'));
});

s.test('随机源：pickN 取数不重复、不越界、不改入参', () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  const picked = rng.pickN(list, 3, rng.makeRng(7));
  s.assert.equal(picked.length, 3);
  s.assert.allDistinct(picked);
  picked.forEach(function (v) { s.assert.ok(list.indexOf(v) !== -1, '取到的元素应来自原列表'); });
  s.assert.deepEqual(list, [1, 2, 3, 4, 5, 6, 7, 8], '不应修改入参数组');
  s.assert.equal(rng.pickN(list, 99).length, 8, 'n 超长时返回整个列表');
  s.assert.equal(rng.pickN(list, 0).length, 0);
  s.assert.equal(rng.pickN(null, 3).length, 0, '空列表安全返回');
});

s.done();
