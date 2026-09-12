'use strict';

/**
 * e2e/gen-klotski-levels.js —— 生成「华容道」固定关卡库（build 产物，勿手改）
 *
 * 关卡来源：参考实现 `../huarongdao/tools/levels.json`（30 关，作者已用穷举法校验过），
 * 本脚本做的是**用我们自己的引擎重新校验一遍**，再产出端上要用的数据文件：
 *
 *   1. 逐关 parseGrid（棋形/数量严格校验：曹操 1、竖将 4、横将 1、兵 4）；
 *   2. 用我们的引擎 BFS 求最优解，**必须等于关卡标注的 minMoves**（不一致直接报错退出）；
 *   3. 最优解在**独立回放器**里逐步执行，必须每步合法且确实通关（交叉验证，避免"求解器自说自话"）；
 *   4. 关卡去重（局面 key 唯一）、难度单调不减；
 *   5. 输出 `miniprogram/data/klotski-levels.js`：含 30 关的网格、档位、最少步数、最优解路径。
 *
 * 用法：
 *   node e2e/gen-klotski-levels.js                    # 用默认参考路径生成
 *   node e2e/gen-klotski-levels.js --src=<levels.json># 指定其他来源
 */

const fs = require('fs');
const path = require('path');
const K = require('../miniprogram/game/klotski');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SRC = path.resolve(ROOT, '..', 'huarongdao', 'tools', 'levels.json');
const OUT = path.join(ROOT, 'miniprogram', 'data', 'klotski-levels.js');

function argValue(name) {
  const hit = process.argv.slice(2).find((a) => a.indexOf('--' + name + '=') === 0);
  return hit ? hit.slice(name.length + 3) : null;
}

const SRC = argValue('src') || DEFAULT_SRC;

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('找不到关卡来源：' + SRC);
    console.error('（默认取参考实现 ../huarongdao/tools/levels.json，可用 --src=<path> 指定）');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const levels = Array.isArray(raw) ? raw : (raw.levels || []);
  if (!levels.length) {
    console.error('关卡来源里没有关卡数据');
    process.exit(1);
  }

  const problems = [];
  const seenKeys = {};
  const out = [];
  let lastMin = 0;

  levels.forEach((lv, idx) => {
    const no = idx + 1;
    let pieces;
    try {
      pieces = K.parseGrid(lv.grid);
    } catch (e) {
      problems.push('第 ' + no + ' 关（' + lv.name + '）棋形非法：' + e.message);
      return;
    }
    const key = K.keyOf(pieces);
    if (seenKeys[key]) {
      problems.push('第 ' + no + ' 关（' + lv.name + '）与第 ' + seenKeys[key] + ' 关局面重复');
    }
    seenKeys[key] = no;

    const sol = K.solve(pieces, true);
    if (!sol) {
      problems.push('第 ' + no + ' 关（' + lv.name + '）无解');
      return;
    }
    if (sol.len !== lv.minMoves) {
      problems.push('第 ' + no + ' 关（' + lv.name + '）标注 ' + lv.minMoves
        + ' 步，我们的求解器算出 ' + sol.len + ' 步');
    }
    const replayed = K.replay(pieces, sol.moves);
    if (!replayed.ok || !replayed.win) {
      problems.push('第 ' + no + ' 关（' + lv.name + '）最优解回放校验失败（ok=' + replayed.ok + ', win=' + replayed.win + '）');
    }
    if (lv.minMoves < lastMin) {
      problems.push('第 ' + no + ' 关（' + lv.name + '）难度回落：' + lv.minMoves + ' < 上一关 ' + lastMin);
    }
    lastMin = lv.minMoves;

    out.push({
      no: no,
      name: lv.name,
      tier: lv.tier,
      classic: !!lv.classic,
      minMoves: sol.len,
      grid: lv.grid,
      solution: K.packMoves(sol.moves)
    });
  });

  if (problems.length) {
    console.error('关卡校验失败 ' + problems.length + ' 项：');
    problems.forEach((p) => console.error('  ✗ ' + p));
    process.exit(1);
  }

  const tiers = {};
  out.forEach((l) => { tiers[l.tier] = (tiers[l.tier] || 0) + 1; });
  const tierLine = Object.keys(tiers).map((t) => t + ' ' + tiers[t] + ' 关').join(' / ');

  const header = [
    '/**',
    ' * data/klotski-levels.js —— 华容道固定关卡库（' + out.length + ' 关，自动生成，勿手改）',
    ' *',
    ' * 玩法：5×4 棋盘标准 10 子，把「曹操」移到下方 2×2 出口；**一次连续滑动算 1 步**。',
    ' * 生成与重新生成：node e2e/gen-klotski-levels.js',
    ' *   （来源 ../huarongdao/tools/levels.json；生成时用本仓库引擎重算最优解并交叉校验）',
    ' * 关卡库校验：node miniprogram/utils/__tests__/klotski-levels.test.js',
    ' *',
    ' * 难度分档：' + tierLine + '；最少步数 ' + out[0].minMoves + ' → ' + out[out.length - 1].minMoves + ' 步',
    ' * solution：最优解，走法 = [棋子左上角格位, dx, dy, 格数]（一次连续滑动算 1 步）',
    ' */',
    '',
    "'use strict';",
    '',
    'module.exports = {',
    "  label: '华容道',",
    '  total: ' + out.length + ',',
    '  levels: ['
  ].join('\n');

  const body = out.map((l) => {
    return '    { no: ' + l.no + ", name: '" + l.name + "', tier: '" + l.tier + "', classic: " + l.classic
      + ', minMoves: ' + l.minMoves + ', grid: ' + JSON.stringify(l.grid)
      + ', solution: ' + JSON.stringify(l.solution) + ' },';
  }).join('\n');

  fs.writeFileSync(OUT, header + '\n' + body + '\n  ]\n};\n', 'utf8');

  console.log('已生成 ' + path.relative(ROOT, OUT));
  console.log('  关卡 ' + out.length + ' 关（' + tierLine + '）');
  console.log('  最少步数 ' + out[0].minMoves + ' → ' + out[out.length - 1].minMoves
    + '；全部经「重算最优解 + 回放交叉校验」');
}

main();
