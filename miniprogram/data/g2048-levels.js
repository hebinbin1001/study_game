/**
 * 2048 关卡表
 *   2026-09-13 扩充：10 → 14 关
 *   2026-10-18 取消步数硬上限（用户：「留着有时候都过不了」）
 *
 * 现在的失败条件只有一条：**棋盘无路可走**。步数不再判负，只用来评星：
 *   · par = 拿满 3★ 的参考步数；≤par → 3★，≤1.5×par → 2★，其余 1★；
 *   · par 必须高于该目标的实战可达性下限（单测 g2048-levels.test.js 校验），
 *     否则会变成「怎么精打细算也拿不到 3★」的假目标。
 *
 * 同一 target 保留两档：
 *   · 入门：par 宽松（3★ 好拿，适合先熟悉棋盘）
 *   · 挑战：par 收紧（3★ 需要真的省步）
 */
'use strict';

module.exports = {
  levels: [
    { no: 1, target: 32, par: 24, tier: '入门' },
    { no: 2, target: 32, par: 16, tier: '挑战' },
    { no: 3, target: 64, par: 48, tier: '入门' },
    { no: 4, target: 64, par: 34, tier: '挑战' },
    { no: 5, target: 128, par: 96, tier: '入门' },
    { no: 6, target: 128, par: 68, tier: '挑战' },
    { no: 7, target: 256, par: 190, tier: '入门' },
    { no: 8, target: 256, par: 136, tier: '挑战' },
    { no: 9, target: 512, par: 380, tier: '入门' },
    { no: 10, target: 512, par: 272, tier: '挑战' },
    { no: 11, target: 1024, par: 900, tier: '入门' },
    { no: 12, target: 1024, par: 700, tier: '挑战' },
    { no: 13, target: 2048, par: 1600, tier: '入门' },
    { no: 14, target: 2048, par: 1200, tier: '挑战' }
  ]
};
