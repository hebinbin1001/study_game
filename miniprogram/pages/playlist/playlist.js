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
var request = require('../../utils/request');

// 2026-10-18：分类/分段图标改为 PNG（豆包出图），走云托管静态资源。
// 原因：原来用 emoji 当图标，部分安卓机没有对应彩色 emoji 字体 → 只看得到文字，
// 用户反馈「几个 tab 的图标都没有」；PNG 在所有机型一致，也不占代码包 200KB 图片额度。
var art = require('../../utils/art');
function tabIcon(name) { return art.artUrl('/assets/ui-icons/tabs/' + name + '.png'); }

var SECTIONS = [
  { key: 'line', iconSrc: tabIcon('sec_line'), label: '自由玩' },
  { key: 'casual', iconSrc: tabIcon('sec_casual'), label: '数字智力' }
];

// 分类 key 保持历史的「射击/配对/连线/反应/数学/智力/拼写」不变（不动存档与统计口径），
// 只在展示文案前加图标 —— 用户反馈「这几个 tab 只有文字，缺图标」。
var CATS = [
  { key: 'all', label: '全部', iconSrc: tabIcon('cat_all') },
  { key: '射击', label: '射击', iconSrc: tabIcon('cat_shoot') },
  { key: '配对', label: '配对', iconSrc: tabIcon('cat_match') },
  { key: '连线', label: '连线', iconSrc: tabIcon('cat_link') },
  { key: '反应', label: '反应', iconSrc: tabIcon('cat_reaction') },
  { key: '数学', label: '数学', iconSrc: tabIcon('cat_math') },
  { key: '智力', label: '智力', iconSrc: tabIcon('cat_puzzle') },
  { key: '拼写', label: '拼写', iconSrc: tabIcon('cat_spelling') }
];

// 玩法目录抽到 utils/game-catalog.js（首页「推荐玩法」也用它，避免两处对不上）
var GAMES = require('../../utils/game-catalog');

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
    // 年级切换（2026-10-09 用户拍板「弱化年级入口」）：
    // 原来只有首页那条「先选一下你的年级」强引导，用户觉得打扰且"选了没用"；
    // 现在改成在这儿随手可切 —— 年级本来就是"当前视图"，不该锁死在账号上。
    grades: constants.GRADES,
    gradeIndex: 0,
    gradeLabel: '',
    gradeKey: '',
    gradePickerVisible: false,
    unlockedCount: 0,
    totalCount: 0,
    sectionDesc: '',
    // 未上线的玩法（2026-10-17）：以前它们占着网格位，把内容多推了一行；
    // 现在移出网格，在页脚用一行「制作中」交代，玩家不会以为点不动是 bug。
    soonText: ''
    ,
    pausedGames: []      // 管理端暂停的玩法 key
  },

  onLoad: function (options) {
    var opt = options || {};
    var section = (opt.section === 'casual') ? 'casual' : 'line';
    this.setData({ curSection: section, curCat: 'all' });
    this._applyCat('all');
    // 没设置过年级：先弹一次选择（与关卡页同一套逻辑），避免默认落到幼儿园
    if (!storage.getLastGrade()) this.setData({ gradePickerVisible: true });
  },

  onShow: function () {
    // 从玩法线打完回来要刷新「已通关 x/30」进度；同时拉管理端暂停状态
    this._loadGameStatus();
  },

  /** 管理端可以暂停某个玩法入口；失败时按「全部开放」降级 */
  _loadGameStatus: function () {
    var self = this;
    request.get('/api/game-status').then(function (d) {
      self.setData({ pausedGames: (d && d.paused) || [] });
      self._applyCat(self.data.curCat);
    }).catch(function () {
      self.setData({ pausedGames: [] });
      self._applyCat(self.data.curCat);
    });
  },

  // 切换二级分段：闯关线 / 数字智力
  pickSection: function (e) {
    this._pickSection(e);
  },

  _pickSection: function (e) {
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

  /** 年级是全局设置（2026-10-18）：本页只读展示，点开选择器切换 */
  openGradePicker: function () {
    this.setData({ gradePickerVisible: true });
  },
  onGradeClose: function () {
    this.setData({ gradePickerVisible: false });
  },
  onGradePick: function (e) {
    var key = (e && e.detail && e.detail.key) || '';
    if (!key) return;
    storage.setLastGrade(key);
    this.setData({ gradePickerVisible: false, gradeKey: key });
    this._applyCat(this.data.curCat);
    var label = this.data.gradeLabel || '';
    wx.showToast({ title: '已切换到' + label, icon: 'none' });
  },

  /**
   * 按「分段 + 分类」过滤玩法卡，并给玩法线卡片补上进度文案。
   * 进度口径：该玩法线在当前学段的已通关关数（星级存档 <学段>@mode_<玩法>@<关卡>）。
   */
  _applyCat: function (key) {
    var section = this.data.curSection;
    var inSection = gamesOfSection(section);
    var paused = this.data.pausedGames || [];
    var available = inSection.filter(function (g) { return paused.indexOf(g.key) < 0; });
    var cats = CATS.filter(function (c) {
      if (c.key === 'all') return true;
      return available.some(function (g) { return g.cat === c.key; });
    });
    var grade = storage.getLastGrade() || constants.GRADES[0].key;
    // 同步年级 chip 的选中态（从首页/关卡页改过年级后回到这一页要跟上）
    var gIdx = 0;
    for (var gi = 0; gi < constants.GRADES.length; gi++) {
      if (constants.GRADES[gi].key === grade) { gIdx = gi; break; }
    }
    var allStars = storage.getAllStars();
    var all = available.filter(function (g) {
      return key === 'all' || g.cat === key;
    }).map(function (g) {
      var out = {};
      for (var k in g) {
        if (g.hasOwnProperty(k)) out[k] = g[k];
      }
      if (g.lineMode) {
        var prog = challenge.lineProgress(allStars, grade, g.lineMode);
        out.progressText = '已过 ' + prog.cleared + '/' + challenge.LEVELS_PER_GRADE;
        // 绿框只代表「这条线已经全通」（2026-10-17 修）：
        // 原来 wxml 用 unlocked 套 .done，结果 14 张已解锁卡全挂绿框，绿色失去含义。
        out.full = prog.cleared >= challenge.LEVELS_PER_GRADE;
        // 进度与 CTA 合成一枚胶囊，卡片底部不再堆两个标签
        out.ctaText = '自由玩 · ' + out.progressText;
      } else {
        out.full = false;
        out.ctaText = '开始';
      }
      return out;
    });
    // 未上线的玩法不占网格位，统一交给页脚说明
    var soon = all.filter(function (g) { return !g.unlocked; });
    var list = all.filter(function (g) { return g.unlocked; });
    this.setData({
      games: list,
      cats: cats,
      curCat: key,
      gradeIndex: gIdx,
      gradeKey: constants.GRADES[gIdx].key,
      gradeLabel: constants.GRADES[gIdx].label,
      totalCount: available.length,
      unlockedCount: available.filter(function (g) { return g.unlocked; }).length,
      soonText: soon.map(function (g) { return g.icon + ' ' + g.name; }).join(' · '),
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

  onGameIconError: function (e) {
    var key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key;
    if (!key) return;
    var games = this.data.games || [];
    for (var i = 0; i < games.length; i++) {
      if (games[i].key === key) {
        this.setData({ ['games[' + i + '].iconSrc']: '' });
        break;
      }
    }
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 15 款玩法合集', path: '/pages/playlist/playlist' };
  }
});
