/**
 * 2048 关卡表（2026-09-13 扩充：10 → 14 关）
 *
 * 用户拍板：不追 30 关，按可达性扩；每关记录并显示**最短用时**。
 * 参数规则（单测 g2048-levels.test.js 会校验）：
 *   · target 不降级；同一 target 有「入门（步数宽松）+ 挑战（步数紧）」两档
 *   · steps 必须高于该目标的实战可达性下限与理论硬下限，否则关卡不可能通过
 */
'use strict';

module.exports = {
  levels: [
    { no: 1, target: 32, steps: 24, tier: '入门' },
    { no: 2, target: 32, steps: 16, tier: '挑战' },
    { no: 3, target: 64, steps: 48, tier: '入门' },
    { no: 4, target: 64, steps: 34, tier: '挑战' },
    { no: 5, target: 128, steps: 96, tier: '入门' },
    { no: 6, target: 128, steps: 68, tier: '挑战' },
    { no: 7, target: 256, steps: 190, tier: '入门' },
    { no: 8, target: 256, steps: 136, tier: '挑战' },
    { no: 9, target: 512, steps: 380, tier: '入门' },
    { no: 10, target: 512, steps: 272, tier: '挑战' },
    { no: 11, target: 1024, steps: 900, tier: '入门' },
    { no: 12, target: 1024, steps: 700, tier: '挑战' },
    { no: 13, target: 2048, steps: 1600, tier: '入门' },
    { no: 14, target: 2048, steps: 1200, tier: '挑战' }
  ]
};
