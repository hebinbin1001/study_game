/**
 * casual-play-report.test.js —— 「休闲玩法只给星、不写题量」的两端契约
 *
 * 背景（2026-10-28 用户拍板 A）：
 *   数独/华容道/2048 这类玩法没有逐题正确率，原来靠 utils/play-report.js 的
 *   bandForStars() 把「3 星」反推成「答对 10/10」再上报 —— 服务端算出的星级是对的，
 *   但学习报告里凭空多出 10 道题，正确率、答题数、全对成就全被污染。
 *
 * 这里钉死四件事：
 *   ① 休闲玩法上报时题量必须是 0（星级照给）；
 *   ② 字词玩法必须带真实 correct/total，别被顺手改成 0；
 *   ③ 服务端接受 total_q=0 的「非答题记录」，但星级只认 0~3；
 *   ④ 不许再把「星级反推正确率」这套逻辑加回来（源码级防回退）。
 *
 * 2026-11-06（D12）补一条例外：**连连看（link）** 虽然是字词玩法，但它是「全部配对成功
 * 才过关」型 —— 被扣命的是错配、不是答错某道题。原代码传 `this.pairsUsed`（该字段从未赋值，
 * 实际一直是 0/0），但字段名像「已配对数」，补上赋值就会变成恒定 100% 正确率。
 * 用户拍板改为显式 totalQ=0 只报星级；它**不进** CASUAL_GAME_TYPES（分类不变，
 * 变的是调用点口径，见最后一条用例）。
 *
 * 运行：node tests/unit/casual-play-report.test.js
 */

'use strict';

const { suite } = require('./_runner');
const fs = require('fs');
const path = require('path');

const s = suite('休闲玩法上报口径（星星照给 · 题量不写）');
const ROOT = path.join(__dirname, '../..');
const U = path.join(ROOT, 'miniprogram/utils');
const GAMES_DIR = path.join(ROOT, 'miniprogram/pkg-games');

// ============ 加载 play-report（request / auth / play-counts 全部打桩） ============

const posted = [];
let loggedIn = true;

function stubUtil(name, exportsObj) {
  const abs = require.resolve(path.join(U, name));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsObj };
}

stubUtil('request', {
  post: function (url, body) {
    posted.push({ url: url, body: body });
    return Promise.resolve({ code: 0 });
  }
});
stubUtil('auth', { isLoggedIn: function () { return loggedIn; } });
stubUtil('play-counts', { bump: function () {} });

const playReport = require(path.join(U, 'play-report'));
const CASUAL = playReport.CASUAL_GAME_TYPES;

// ============ ① 分类表自检 ============

s.test('休闲玩法分类：覆盖 12 款、无重复、不含字词玩法', () => {
  s.assert.equal(CASUAL.length, 12, '休闲玩法应有 12 款（少一款就会把假题量写回学习报告）');
  s.assert.equal(new Set(CASUAL).size, CASUAL.length, 'CASUAL_GAME_TYPES 有重复项');
  ['sudoku', 'klotski', 'g2048', 'hanoi', 'onestroke', 'memory',
    'math24', 'sprint', 'balance', 'pattern', 'clock', 'bounce'].forEach((g) => {
    s.assert.ok(playReport.isCasualGame(g), g + ' 应归为休闲玩法');
  });
  // 字词玩法一个都不能混进来：它们有真实正确率，混进来等于把学习数据丢掉
  ['word_warrior', 'match', 'link', 'word_build', 'idiom', 'snake', 'quiz', 'maze'].forEach((g) => {
    s.assert.ok(!playReport.isCasualGame(g), g + ' 是字词玩法，不能归为休闲（会丢学习数据）');
  });
});

// ============ ② 上报载荷 ============

s.test('休闲玩法：题量写 0、星级原样带上、段位照常同步', () => {
  posted.length = 0;
  const ok = playReport.reportPlay({
    gameType: 'sudoku', grade: 'all', level: 7, stars: 3
  });
  s.assert.true(ok, '登录态应发起上报');
  s.assert.equal(posted.length, 2, '应上报成绩 + 同步段位各一次');
  s.assert.equal(posted[0].url, '/api/score');
  s.assert.equal(posted[0].body.totalQ, 0, '休闲玩法不得上报题量（否则污染正确率）');
  s.assert.equal(posted[0].body.correctCount, 0, '休闲玩法不得上报答对数');
  s.assert.equal(posted[0].body.stars, 3, '星级必须原样带上（这是它唯一的成绩）');
  s.assert.equal(posted[0].body.game_type, 'sudoku');
  s.assert.equal(posted[1].url, '/api/rank/sync');
  s.assert.equal(posted[1].body.stars, 3);
});

s.test('字词玩法：真实 correct/total 原样上报，不做任何替换', () => {
  posted.length = 0;
  playReport.reportPlay({
    gameType: 'word_build', grade: 'g1', level: 3,
    correct: 7, total: 10, stars: 2, maxCombo: 4, typeKey: 'shoot'
  });
  s.assert.equal(posted[0].body.totalQ, 10);
  s.assert.equal(posted[0].body.correctCount, 7);
  s.assert.equal(posted[0].body.maxCombo, 4);
  s.assert.equal(posted[0].body.type, 'shoot');
});

// 2026-11-06（D12）：连连看是「全部配对成功才过关」型玩法，被扣命的是**错配**
// 而不是答错某道题，没有「每题对错」口径。原代码传 this.pairsUsed，但该字段从未赋值
// （全仓仅引用处、无赋值）—— 实际一直上报 0/0，并不是真的在报 100% 正确率；
// 但字段名像「已配对数」，补上赋值就会变成恒定 100%，所以现在显式写 0 并钉死。
// 注意它**不在** CASUAL_GAME_TYPES 里（那是给没有题目的数字智力用的），这里是调用点的口径。
s.test('连连看：按非答题记录上报（只报星级），不再依赖未赋值的 pairsUsed', () => {
  const src = fs.readFileSync(path.join(GAMES_DIR, 'link', 'link.js'), 'utf8');
  const block = (src.match(/reportPlay\(\{[\s\S]*?\}\)/) || [''])[0];
  s.assert.ok(block, 'link 应有 reportPlay 上报块');
  // 只查代码，不查注释 —— 解释「为什么不能传 pairsUsed」的注释里会提到它
  const code = block.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  s.assert.ok(/correct:\s*0/.test(code) && /total:\s*0/.test(code),
    'link 必须按 totalQ=0 上报（正确率概念不成立，写真实值会污染学习报告）');
  s.assert.ok(code.indexOf('pairsUsed') < 0,
    '不要再用 pairsUsed 当正确数/题量（它等于「完成的配对数」，恒等于总数）');
  s.assert.ok(/stars:\s*stars/.test(code), '星级必须照常上报（这是连连看唯一的成绩）');
});

s.test('游客不上报（与结算页一致）', () => {
  posted.length = 0;
  loggedIn = false;
  const ok = playReport.reportPlay({ gameType: 'sudoku', grade: 'all', level: 1, stars: 3 });
  loggedIn = true;
  s.assert.false(ok, '游客应直接返回 false');
  s.assert.equal(posted.length, 0, '游客不应发出任何请求');
});

// ============ ③ 服务端：非答题记录 ============

const { normalizeScoreBody } = require(path.join(ROOT, 'server/routes/score'));

s.test('服务端接受 total_q=0 的非答题记录：星级自报 0~3、得分与题量落 0', () => {
  const r = normalizeScoreBody({
    grade: 'all', level: 7, correctCount: 0, totalQ: 0, stars: 3, game_type: 'sudoku'
  });
  s.assert.ok(r, 'total_q=0 应被接受（休闲玩法的唯一形态）');
  s.assert.equal(r.total_q, 0);
  s.assert.equal(r.correct_count, 0);
  s.assert.equal(r.score, 0, '没有答题就不该有得分');
  s.assert.equal(r.stars, 3);
  s.assert.equal(r.game_type, 'sudoku');
});

s.test('服务端拒绝越界星级与非答题记录里的「答对数」', () => {
  const base = { grade: 'all', level: 1, correctCount: 0, totalQ: 0, game_type: 'sudoku' };
  s.assert.equal(normalizeScoreBody(Object.assign({}, base, { stars: 4 })), null, '4 星不存在');
  s.assert.equal(normalizeScoreBody(Object.assign({}, base, { stars: -1 })), null, '负数星级非法');
  s.assert.equal(normalizeScoreBody(Object.assign({}, base, { stars: 1.5 })), null, '星级必须是整数');
  s.assert.equal(
    normalizeScoreBody(Object.assign({}, base, { correctCount: 3, stars: 3 })), null,
    'total_q=0 却说答对 3 题，属于自相矛盾，应拒绝'
  );
});

s.test('服务端答题口径没被改动：8/10 → 2 星、score 80', () => {
  const r = normalizeScoreBody({ grade: 'g1', level: 1, correctCount: 8, totalQ: 10 });
  s.assert.equal(r.stars, 2);
  s.assert.equal(r.score, 80);
  s.assert.equal(r.total_q, 10);
});

// ============ ④ 源码级防回退 + 全量覆盖 ============

s.test('play-report 里不得再出现「按星级反推正确率」的伪造逻辑', () => {
  const src = fs.readFileSync(path.join(U, 'play-report.js'), 'utf8');
  s.assert.ok(src.indexOf('bandForStars') === -1, 'bandForStars 已被删除，不要再加回来（它会把假题量写进学习报告）');
  s.assert.ok(!/correct:\s*10\s*,\s*total:\s*10/.test(src), '源码里不应再有 10/10 的伪造样本');
});

s.test('每个字词玩法的上报块都带真实 correct/total（新增玩法漏传会在这里红）', () => {
  const dirs = fs.readdirSync(GAMES_DIR).filter((d) => {
    return fs.statSync(path.join(GAMES_DIR, d)).isDirectory();
  });
  const checked = [];
  dirs.forEach((d) => {
    const file = path.join(GAMES_DIR, d, d + '.js');
    if (!fs.existsSync(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    const blocks = src.match(/reportPlay\(\{[\s\S]*?\}\);/g) || [];
    blocks.forEach((block) => {
      const m = block.match(/gameType:\s*(?:challenge\.gameTypeOf\('([^']+)'\)|'([^']+)')/);
      // letter-bubble / quiz 传的是常量（GAME_KEY / MODE），静态解析不出来 ——
      // 这两个都是字词玩法，按字词口径要求（保守），漏传 correct/total 同样红。
      const gt = m ? (m[1] || m[2]) : '';
      checked.push(gt || (d + ':var'));
      if (gt && playReport.isCasualGame(gt)) return;
      s.assert.ok(/correct:/.test(block), d + ' 是字词玩法，上报块必须带 correct');
      s.assert.ok(/total:/.test(block), d + ' 是字词玩法，上报块必须带 total');
    });
  });
  s.assert.ok(checked.length >= 20, '只扫到 ' + checked.length + ' 个上报块，正则可能失效了');
});

s.done();
