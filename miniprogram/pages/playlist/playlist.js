// 玩法 Tab（B1，UI 对齐 demo/ui-demo.html 玩法页）
// 职责：
//   1. 顶部信息条：玩法数量/已解锁数
//   2. 分类筛选 chips（全部/射击/配对/连线/反应/数学）
//   3. 2 列玩法卡：已解锁可玩 / 未解锁占位（B6 逐款点亮）
// 说明：真实玩法链路 = 字母射击→关卡选择页；其余玩法 B6 实现后接入。

var GAMES = [
  { key: 'shoot', name: '字母射击', icon: '🔫', desc: '挖空补词 · 打跑怪兽', cat: '射击', unlocked: true, url: '/pages/level/level' },
  { key: 'match', name: '词义消消乐', icon: '🃏', desc: '词↔义配对消除', cat: '配对', unlocked: true, url: '/pages/match/match' },
  { key: 'sudoku', name: '数独', icon: '🔢', desc: '数字推理 · 数学闯关', cat: '数学', math: true, unlocked: true, url: '/pages/sudoku/sudoku' },
  { key: 'link', name: '词语连连看', icon: '🔗', desc: '连线配对 · 双词匹配', cat: '连线', unlocked: true, url: '/pages/link/link' },
  { key: 'bounce', name: '单词弹弹球', icon: '🏐', desc: '暂无成熟玩法案例 · 敬请期待', cat: '反应', unlocked: false },
  { key: 'snake', name: '单词贪吃蛇', icon: '🐍', desc: '辨词进食 · 越长越强', cat: '反应', unlocked: true, url: '/pages/snake/snake' },
  { key: 'math24', name: '算 24 点', icon: '🧮', desc: '四数四则 · 脑力挑战', cat: '数学', math: true, unlocked: true, url: '/pages/math24/math24' },
  { key: 'sprint', name: '口算冲刺', icon: '⚡', desc: '60 秒限时 · 连击翻倍', cat: '数学', math: true, unlocked: true, url: '/pages/math-sprint/math-sprint' },
  { key: 'memory', name: '记忆矩阵', icon: '🔲', desc: '记住亮起的格子', cat: '智力', unlocked: true, url: '/pages/memory-grid/memory-grid' },
  { key: 'g2048', name: '2048', icon: '🀄', desc: '数字合成 · 百玩不腻', cat: '数学', math: true, unlocked: true, url: '/pages/g2048/g2048' }
];

var CATS = [
  { key: 'all', label: '全部' },
  { key: '射击', label: '射击' },
  { key: '配对', label: '配对' },
  { key: '连线', label: '连线' },
  { key: '反应', label: '反应' },
  { key: '数学', label: '数学' },
  { key: '智力', label: '智力' }
];

Page({
  data: {
    games: GAMES,
    cats: CATS,
    curCat: 'all',
    unlockedCount: GAMES.filter(function (g) { return g.unlocked; }).length,
    totalCount: GAMES.length
  },

  onShow: function () {
    this._applyCat(this.data.curCat);
  },

  pickCat: function (e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ curCat: key });
    this._applyCat(key);
  },

  _applyCat: function (key) {
    var list = GAMES.filter(function (g) {
      return key === 'all' || g.cat === key;
    });
    this.setData({ games: list, curCat: key });
  },

  // 点玩法卡
  onGameTap: function (e) {
    var key = e.currentTarget.dataset.key;
    var g = GAMES.find(function (x) { return x.key === key; });
    if (!g) return;
    if (!g.unlocked) {
      // B6 前占位（数独/消消乐 demo 已有样例，真实玩法后续批次）
      wx.showToast({ title: g.name + ' · 敬请期待', icon: 'none' });
      return;
    }
    if (g.url) {
      wx.navigateTo({ url: g.url });
    }
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 8 款玩法合集', path: '/pages/playlist/playlist' };
  }
});
