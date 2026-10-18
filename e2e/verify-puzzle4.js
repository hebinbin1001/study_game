'use strict';

/**
 * verify-puzzle4.js —— 数字智力「四款新玩法」端到端冒烟（2026-10-18）
 *
 * 为什么有这个文件：
 *   找规律 / 认钟表 / 算术迷宫 / 汉诺塔 四款上线时只有引擎单测 + demo 预览页布局验收，
 *   没进过真实的开发者工具 —— 引擎算得对，不代表页面接得对（?level 不生效、
 *   选项没绑定、点了不翻页、移动判定接反，这些都只有真跑一局才知道）。
 *
 * 覆盖（每款都真点真判，不只"页面能打开"）：
 *   A. 找规律：?level=3 生效 → 首题 1/10、4 个候选 → 点选立即染色反馈 → 自动进第 2 题
 *              → 强制结算 → 写 pattern_N 星级、0 星时标题不能是「全部通关！」
 *   B. 认钟表：1 档画表盘且指针角度合法；24→12 时制那档不画表盘（否则表盘剧透答案）
 *              → 点选后题号推进
 *   C. 算术迷宫：6×6=36 格、英雄所在格存在 → 沿无墙方向走一步（计步或弹出门题）
 *   D. 汉诺塔：3 柱、第 2 关 4 盘（最少 15 步）→ A→B 合法计步 → 大盘压小盘被拒 → 撤销回退
 *
 * 运行：node e2e/verify-puzzle4.js
 *
 * ⚠️ 状态（2026-10-18）：**本用例尚未在真机跑绿**。写它的时候开发者工具自动化刚好挂死，
 *    而工具的 CLI 拉起要调 reg.exe（被安全策略拦），这一轮起不来工具 → 一条断言都没执行过。
 *    首次使用请先单独跑本脚本校准（选择器/数据字段以当时页面为准），
 *    跑绿之后再按 run-all.js 里 puzzleLevel 的写法注册成阶段、并加进 lib/modules.js 的 puzzle 模块。
 */

const H = require('./lib/harness');

/** 从页面数据里找英雄格（maze 的 cells[i].cls 含 'cur'） */
function heroIndex(cells) {
  for (let i = 0; i < cells.length; i++) {
    if (/cur/.test(String(cells[i].cls || ''))) return i;
  }
  return -1;
}

async function main() {
  const ck = H.createChecker();
  let mp = null;
  try {
    mp = await H.ensureAutomation({ quiet: false });

    // ============ A. 找规律 ============
    console.log('[1/4] 找规律：?level=3 生效 / 点击反馈 / 自动翻页 / 结算写星');
    const p = await H.goto(mp, '/pages/pattern/pattern?level=3', 2200);
    let d = await p.data();
    ck.check('找规律：落地页正确', (await mp.currentPage()).path === 'pages/pattern/pattern');
    ck.check('找规律：?level=3 生效', d.levelText === '3/30', '实际 = ' + d.levelText);
    ck.check('找规律：首题 1/10', d.qText === '1/10', '实际 = ' + d.qText);
    ck.check('找规律：题面至少 5 格（含问号格）', (d.cells || []).length >= 5,
      '实际 = ' + (d.cells || []).length);
    const patOpts = await H.withTimeout(p.$$('.opts .opt'), 8000, 'pattern .opt');
    ck.check('找规律：渲染 4 个候选', (patOpts || []).length === 4,
      '实际 = ' + (patOpts || []).length);

    await H.withTimeout(patOpts[0].tap(), 10000, 'pattern tap opt 0');
    await p.waitFor(220);
    d = await p.data();
    ck.check('找规律：点选后立即反馈（染色 + 文案）',
      (d.fb === 'good' || d.fb === 'bad') && /答对|差一点/.test(d.bannerMain || ''),
      'fb = ' + d.fb + ', banner = ' + d.bannerMain);
    await p.waitFor(1300);
    d = await p.data();
    ck.check('找规律：自动进入第 2 题', d.qText === '2/10', '实际 = ' + d.qText);

    await p.callMethod('_finish');
    await p.waitFor(500);
    d = await p.data();
    ck.check('找规律：弹出结算', d.settle === true, 'settle = ' + d.settle);
    ck.check('找规律：结算星级 0~3', typeof d.starsText === 'string' && d.starsText.length <= 3,
      'starsText = ' + d.starsText);
    ck.check('找规律：未过关时标题必须为空（否则 settle-pop 会显示「全部通关！」）',
      d.win === true || d.overTitle === '',
      'win = ' + d.win + ', overTitle = ' + d.overTitle);
    const st = await mp.callWxMethod('getStorageSync', 'ww_stars');
    ck.check('找规律：写入 pattern_3 星级', !!(st && st.pattern_3 !== undefined && st.pattern_3 !== null),
      'ww_stars.pattern_3 = ' + JSON.stringify(st && st.pattern_3));

    // ============ B. 认钟表 ============
    console.log('[2/4] 认钟表：表盘 / 指针角度 / 24→12 时制不画表盘 / 翻页');
    const c = await H.goto(mp, '/pages/clock/clock?level=1', 2200);
    d = await c.data();
    ck.check('认钟表：?level=1 生效', d.levelText === '1/30', '实际 = ' + d.levelText);
    ck.check('认钟表：1~6 关画表盘', d.faceShow === true, 'faceShow = ' + d.faceShow);
    ck.check('认钟表：时针角度在 0~360',
      d.hourDeg >= 0 && d.hourDeg < 360, 'hourDeg = ' + d.hourDeg);
    ck.check('认钟表：分针角度在 0~360',
      d.minDeg >= 0 && d.minDeg < 360, 'minDeg = ' + d.minDeg);
    ck.check('认钟表：表盘刻度 60 个', (d.ticks || []).length === 60,
      '实际 = ' + (d.ticks || []).length);
    const clockOpts = await H.withTimeout(c.$$('.opts .opt'), 8000, 'clock .opt');
    ck.check('认钟表：渲染 4 个候选', (clockOpts || []).length === 4,
      '实际 = ' + (clockOpts || []).length);
    await H.withTimeout(clockOpts[0].tap(), 10000, 'clock tap opt 0');
    await c.waitFor(1500);
    d = await c.data();
    ck.check('认钟表：答完自动翻到第 2 题', d.qText === '2/10', '实际 = ' + d.qText);

    const c24 = await H.goto(mp, '/pages/clock/clock?level=25', 2200);
    d = await c24.data();
    ck.check('认钟表：24→12 时制档不画表盘（否则剧透答案）',
      d.faceShow === false && !!d.faceText,
      'faceShow = ' + d.faceShow + ', faceText = ' + d.faceText);

    // ============ C. 算术迷宫 ============
    console.log('[3/4] 算术迷宫：36 格 / 英雄格 / 走一步');
    const m = await H.goto(mp, '/pages/maze/maze?level=1', 2400);
    d = await m.data();
    ck.check('迷宫：?level=1 生效', d.levelText === '1/30', '实际 = ' + d.levelText);
    ck.check('迷宫：6×6=36 格', (d.cells || []).length === 36,
      '实际 = ' + (d.cells || []).length);
    ck.check('迷宫：开局 0 步', String(d.stepText) === '0', '实际 = ' + d.stepText);
    const mazeCells = await H.withTimeout(m.$$('.board .cell'), 8000, 'maze .cell');
    ck.check('迷宫：格子都渲染出来了', (mazeCells || []).length === 36,
      '实际 = ' + (mazeCells || []).length);

    const hero = heroIndex(d.cells || []);
    ck.check('迷宫：能找到英雄所在格（cls 含 cur）', hero >= 0, 'hero 下标 = ' + hero);
    const size = d.size || 6;
    const self = (d.cells || [])[hero] || {};
    const cands = [];
    if (!self.kn && hero - size >= 0) cands.push(hero - size);
    if (!self.ke && hero % size < size - 1) cands.push(hero + 1);
    if (!self.ks && hero + size < size * size) cands.push(hero + size);
    if (!self.kw && hero % size > 0) cands.push(hero - 1);
    ck.check('迷宫：英雄格至少有一个无墙方向', cands.length > 0, '候选 = ' + cands.join(','));

    if (cands.length) {
      await H.withTimeout(mazeCells[cands[0]].tap(), 10000, 'maze tap neighbour');
      await m.waitFor(700);
      d = await m.data();
      ck.check('迷宫：走一步后计步或弹出门题',
        Number(d.stepText) > 0 || d.ask === true,
        'stepText = ' + d.stepText + ', ask = ' + d.ask);
      if (d.ask) {
        ck.check('迷宫：门题有算式与 4 个选项',
          !!d.askText && (d.askOptions || []).length === 4,
          'askText = ' + d.askText + ', opts = ' + (d.askOptions || []).length);
      }
    }

    // ============ D. 汉诺塔 ============
    console.log('[4/4] 汉诺塔：3 柱 / 第 2 关 4 盘 / 合法与非法移动 / 撤销');
    const h = await H.goto(mp, '/pages/hanoi/hanoi?level=2', 2000);
    d = await h.data();
    ck.check('汉诺塔：?level=2 生效', d.levelText === '2/6', '实际 = ' + d.levelText);
    ck.check('汉诺塔：第 2 关 4 盘 → 最少 15 步', d.minText === '15', '实际 = ' + d.minText);
    const pegs = await H.withTimeout(h.$$('.peg'), 8000, 'hanoi .peg');
    ck.check('汉诺塔：3 根柱子', (pegs || []).length === 3, '实际 = ' + (pegs || []).length);

    await pegs[0].tap();
    await h.waitFor(280);
    await pegs[2].tap();
    await h.waitFor(500);
    d = await h.data();
    ck.check('汉诺塔：A→C 走一步（计步 = 1）', d.stepText === '1', '实际 = ' + d.stepText);

    await h.callMethod('onUndo');
    await h.waitFor(450);
    d = await h.data();
    ck.check('汉诺塔：撤销回退步数', d.stepText === '0', '实际 = ' + d.stepText);

    // 非法移动：A 顶盘（最小）先搬到 B，再把 A 的次大盘压到 B 的小盘上 → 必须被拒
    await h.callMethod('onReset');
    await h.waitFor(450);
    await pegs[0].tap();
    await h.waitFor(280);
    await pegs[1].tap();
    await h.waitFor(480);
    d = await h.data();
    ck.check('汉诺塔：A→B 合法（计步 = 1）', d.stepText === '1', '实际 = ' + d.stepText);
    await pegs[0].tap();
    await h.waitFor(280);
    await pegs[1].tap();
    await h.waitFor(480);
    d = await h.data();
    ck.check('汉诺塔：大盘压小盘被拒（步数不变）', d.stepText === '1', '实际 = ' + d.stepText);

    ck.check('全程未崩溃（仍在汉诺塔页）',
      (await mp.currentPage()).path === 'pages/hanoi/hanoi');
  } catch (e) {
    ck.check('脚本执行无异常', false, (e && e.message) || String(e));
  } finally {
    if (mp) { try { await mp.close(); } catch (e) { /* 关闭异常忽略 */ } }
  }
  process.exitCode = H.summarize('verify-puzzle4（四款数字智力冒烟）', ck);
}

main();
