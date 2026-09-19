/**
 * 玩法目录（唯一数据源，2026-09-13 抽出）
 *
 * 原来这份清单写死在 pages/playlist/playlist.js 里，首页「推荐玩法」要按本机玩得最多的
 * 玩法来展示时就得再抄一份 —— 抽到这里，两个页面共用一份，避免两处对不上。
 *
 * 字段说明：
 *   key        玩法唯一键（与 utils/challenge.js 的 MODES、play-report 的 gameType 对应关系见下）
 *   lineMode   题库类玩法的「玩法线」key（对应 challenge.LINE_MODES）；数字智力类为空
 *   section    'line' = 闯关线（题库类，有 30 关进度）/ 'casual' = 数字智力（独立关卡）
 *   url        入口地址；题库类统一指向关卡页并带 ?mode=xxx（先选关再进游戏）
 *   cat/math   分类与「数学」标签（页面卡片用）
 *   unlocked   是否已开放（未开放的点卡片给「敬请期待」提示）
 *
 * key ↔ 存档/上报口径对应：
 *   shoot → gameType word_warrior ｜ match → match ｜ link → link
 *   wordbuild → word_build ｜ idiombuild → idiom ｜ snake → snake
 *   数字智力类各自上报（math24 / sudoku / memory_grid 等）
 */
'use strict';

module.exports = [
  { key: 'shoot', name: '字母射击', icon: '🔫', desc: '挖空补词 · 打跑怪兽', cat: '射击', section: 'line', lineMode: 'shoot', unlocked: true, url: '/pages/level/level?mode=shoot' },
  { key: 'match', name: '词义消消乐', icon: '🃏', desc: '词↔义配对消除', cat: '配对', section: 'line', lineMode: 'match', unlocked: true, url: '/pages/level/level?mode=match' },
  { key: 'link', name: '词语连连看', icon: '🔗', desc: '连线配对 · 双词匹配', cat: '连线', section: 'line', lineMode: 'link', unlocked: true, url: '/pages/level/level?mode=link' },
  { key: 'wordbuild', name: '字母拼词工坊', icon: '🔤', desc: '看中文拼出英文单词', cat: '拼写', section: 'line', lineMode: 'wordBuild', unlocked: true, url: '/pages/level/level?mode=wordBuild' },
  { key: 'idiombuild', name: '成语拼字', icon: '🀄️', desc: '看释义拼四字成语', cat: '拼写', section: 'line', lineMode: 'idiom', unlocked: true, url: '/pages/level/level?mode=idiom' },
  { key: 'snake', name: '单词贪吃蛇', icon: '🐍', desc: '辨词进食 · 越长越强', cat: '反应', section: 'line', lineMode: 'snake', unlocked: true, url: '/pages/level/level?mode=snake' },
  { key: 'quiz', name: '限时抢答', icon: '⚡', desc: '倒计时抢词 · 答错扣时间', cat: '反应', section: 'line', lineMode: 'quiz', unlocked: true, url: '/pages/level/level?mode=quiz' },

  // 数字智力类统一「先关卡页、再进游戏」（第三批 · 第 4 条 a，用户 2026-09-13 拍板）
  { key: 'sudoku', name: '数独', icon: '🔢', desc: '数字推理 · 数学闯关', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=sudoku' },
  { key: 'math24', name: '算 24 点', icon: '🧮', desc: '四数四则 · 脑力挑战', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=math24' },
  { key: 'sprint', name: '口算冲刺', icon: '⚡', desc: '60 秒限时 · 连击翻倍', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=sprint' },
  { key: 'balance', name: '算式天平', icon: '⚖️', desc: '挑个数字让天平平衡', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=balance' },
  { key: 'g2048', name: '2048', icon: '🎲', desc: '数字合成 · 每关记最快用时', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=g2048' },
  { key: 'memory', name: '记忆矩阵', icon: '🔲', desc: '记住亮起的格子', cat: '智力', section: 'casual', unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=memory' },
  { key: 'onestroke', name: '一笔画', icon: '✏️', desc: '每条线只走一次', cat: '智力', section: 'casual', unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=onestroke' },
  { key: 'klotski', name: '华容道', icon: '🧩', desc: '滑动突围 · 30 关经典', cat: '智力', section: 'casual', unlocked: true, url: '/pages/puzzle-level/puzzle-level?mode=klotski' },
  { key: 'bounce', name: '单词弹弹球', icon: '🏐', desc: '暂无成熟玩法案例 · 敬请期待', cat: '反应', section: 'casual', unlocked: false }
];
