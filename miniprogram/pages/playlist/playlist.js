// 玩法 Tab（P3 一期改造：顶部二级分段「闯关线 / 数字智力」）
//
// 为什么分段（用户 2026-09-13 拍板）：
//   题库类玩法（射击/消消乐/拼词/连连看/成语/贪吃蛇）现在各自有一条 30 关闯关线，
//   属于「有进度、按学段生成、写星级」的闯关内容；数字智力类（24点/数独/天平/口算/
//   记忆/一笔画/2048/华容道）是固定关卡的独立小游戏。两类混在一屏里，用户看不出
//   「哪个能闯关、哪个只是小游戏」。
//   做法取舍：先做页内二级分段（零素材成本、随时可升级），等数字智力类内容更厚
//   再考虑提成第 5 个底部 tab（届时只要补两枚 tab 图标）。
//
// 入口约定（重要）：题库类卡片的 url 一律指向关卡页并带上 mode，
//   如 `/pages/level/level?mode=link` → 关卡页预选「词语连连看」这条 30 关线；
//   不再直接进玩法页的自由练，这样每款玩法都有闯关进度（用户原始诉求）。
var storage = require('../../utils/storage');
var constants = require('../../utils/constants');
var challenge = require('../../utils/challenge');

var SECTIONS = [
  { key: 'line', icon: '🎯', label: '闯关线' },
  { key: 'casual', icon: '🧠', label: '数字智力' }
];

// 分类 key 保持历史的「射击/配对/连线/反应/数学/智力/拼写」不变（不动存档与统计口径），
// 只在展示文案前加图标 —— 用户反馈「这几个 tab 只有文字，缺图标」。
var CATS = [
  { key: 'all', label: '🎮 全部' },
  { key: '射击', label: '🔫 射击' },
  { key: '配对', label: '🃏 配对' },
  { key: '连线', label: '🔗 连线' },
  { key: '反应', label: '🐍 反应' },
  { key: '数学', label: '🧮 数学' },
  { key: '智力', label: '🧩 智力' },
  { key: '拼写', label: '🔤 拼写' }
];

// lineMode = 对应的玩法线 key（与 utils/challenge.js 的 LINE_MODES 对齐）
var GAMES = [
  { key: 'shoot', name: '字母射击', icon: '🔫', desc: '挖空补词 · 打跑怪兽', cat: '射击', section: 'line', lineMode: 'shoot', unlocked: true, url: '/pages/level/level?mode=shoot' },
  { key: 'match', name: '词义消消乐', icon: '🃏', desc: '词↔义配对消除', cat: '配对', section: 'line', lineMode: 'match', unlocked: true, url: '/pages/level/level?mode=match' },
  { key: 'link', name: '词语连连看', icon: '🔗', desc: '连线配对 · 双词匹配', cat: '连线', section: 'line', lineMode: 'link', unlocked: true, url: '/pages/level/level?mode=link' },
  { key: 'wordbuild', name: '字母拼词工坊', icon: '🔤', desc: '看中文拼出英文单词', cat: '拼写', section: 'line', lineMode: 'wordBuild', unlocked: true, url: '/pages/level/level?mode=wordBuild' },
  { key: 'idiombuild', name: '成语拼字', icon: '🀄️', desc: '看释义拼四字成语', cat: '拼写', section: 'line', lineMode: 'idiom', unlocked: true, url: '/pages/level/level?mode=idiom' },
  { key: 'snake', name: '单词贪吃蛇', icon: '🐍', desc: '辨词进食 · 越长越强', cat: '反应', section: 'line', lineMode: 'snake', unlocked: true, url: '/pages/level/level?mode=snake' },

  { key: 'sudoku', name: '数独', icon: '🔢', desc: '数字推理 · 数学闯关', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/sudoku/sudoku' },
  { key: 'math24', name: '算 24 点', icon: '🧮', desc: '四数四则 · 脑力挑战', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/math24/math24' },
  { key: 'sprint', name: '口算冲刺', icon: '⚡', desc: '60 秒限时 · 连击翻倍', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/math-sprint/math-sprint' },
  { key: 'balance', name: '算式天平', icon: '⚖️', desc: '挑个数字让天平平衡', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/math-balance/math-balance' },
  { key: 'g2048', name: '2048', icon: '🎲', desc: '数字合成 · 百玩不腻', cat: '数学', section: 'casual', math: true, unlocked: true, url: '/pages/g2048/g2048' },
  { key: 'memory', name: '记忆矩阵', icon: '🔲', desc: '记住亮起的格子', cat: '智力', section: 'casual', unlocked: true, url: '/pages/memory-grid/memory-grid' },
  { key: 'onestroke', name: '一笔画', icon: '✏️', desc: '每条线只走一次', cat: '智力', section: 'casual', unlocked: true, url: '/pages/one-stroke/one-stroke' },
  { key: 'klotski', name: '华容道', icon: '🧩', desc: '滑动突围 · 30 关经典', cat: '智力', section: 'casual', unlocked: true, url: '/pages/klotski/klotski' },
  { key: 'bounce', name: '单词弹弹球', icon: '🏐', desc: '暂无成熟玩法案例 · 敬请期待', cat: '反应', section: 'casual', unlocked: false }
];

function gamesOfSection(section) {
  return GAMES.filter(function (g) { return g.section === section; });
}

Page({
  data: {
    games: [],
    cats: CATS,
    sections: SECTIONS,
    curSection: 'line',
    curCat: 'all',
    unlockedCount: 0,
    totalCount: 0,
    sectionDesc: ''
  },

  onLoad: function (options) {
    var opt = options || {};
    var section = (opt.section === 'casual') ? 'casual' : 'line';
    this.setData({ curSection: section, curCat: 'all' });
    this._applyCat('all');
  },

  onShow: function () {
    // 从玩法线打完回来要刷新「已通关 x/30」进度
    this._applyCat(this.data.curCat);
  },

  // 切换二级分段：闯关线 / 数字智力
  pickSection: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.curSection) return;
    this.setData({ curSection: key, curCat: 'all' });
    this._applyCat('all');
  },

  pickCat: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.curCat) return;
    this.setData({ curCat: key });
    this._applyCat(key);
  },

  /**
   * 按「分段 + 分类」过滤玩法卡，并给玩法线卡片补上进度文案。
   * 进度口径：该玩法线在当前学段的已通关关数（星级存档 <学段>@mode_<玩法>@<关卡>）。
   */
  _applyCat: function (key) {
    var section = this.data.curSection;
    var inSection = gamesOfSection(section);
    var cats = CATS.filter(function (c) {
      if (c.key === 'all') return true;
      return inSection.some(function (g) { return g.cat === c.key; });
    });
    var grade = storage.get(constants.STORAGE_KEYS.lastGrade) || constants.GRADES[0].key;
    var allStars = storage.getAllStars();
    var list = inSection.filter(function (g) {
      return key === 'all' || g.cat === key;
    }).map(function (g) {
      var out = {};
      for (var k in g) {
        if (g.hasOwnProperty(k)) out[k] = g[k];
      }
      if (g.lineMode) {
        var prog = challenge.lineProgress(allStars, grade, g.lineMode);
        out.progressText = '已通关 ' + prog.cleared + '/' + challenge.LEVELS_PER_GRADE;
      }
      return out;
    });
    this.setData({
      games: list,
      cats: cats,
      curCat: key,
      totalCount: inSection.length,
      unlockedCount: inSection.filter(function (g) { return g.unlocked; }).length,
      sectionDesc: (section === 'line')
        ? '每条线 30 关 · 按学段生成'
        : '独立关卡 · 随时开玩'
    });
  },

  // 点玩法卡
  onGameTap: function (e) {
    var key = e.currentTarget.dataset.key;
    var g = GAMES.find(function (x) { return x.key === key; });
    if (!g) return;
    if (!g.unlocked) {
      wx.showToast({ title: g.name + ' · 敬请期待', icon: 'none' });
      return;
    }
    if (g.url) {
      wx.navigateTo({ url: g.url });
    }
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 15 款玩法合集', path: '/pages/playlist/playlist' };
  }
});
