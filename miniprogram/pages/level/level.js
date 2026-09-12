// 关卡选择页（一期重做：蛇形地图 → 竖排关卡列表）
//
// 职责：
//   1. 渲染 7 学段 tab + 题型分类 chips + 星星进度卡 + 竖排关卡列表
//   2. onShow 读取星级存档更新视图（REQ-GAME-13）
//   3. 点击关卡判断解锁，未锁定直接开局；未解锁抖动提示 / 登录引导（REQ-GAME-14）
//   4. 分类维度独立存档：grade@<type>@level；「综合」沿用旧 grade_level（兼容历史存档）
//   5. 选中关卡携带「学段 + 关卡 + 分类」参数进入游戏页
//
// 一期设计说明：
//   · 原「蛇形路径地图」换成竖排列表 —— 信息密度更高，且不再需要按可用高度估算节点尺寸，
//     天然适配任何机型与任意关卡数（列表滚动即可，不必再维护高度常量）。
//   · 「闯关形态」（经典 / Boss / 极速）已删除：三者判定、计分、节奏骨架完全一致，属换皮。
//
// 关联需求：REQ-DICT-1、REQ-GAME-13、REQ-GAME-14、REQ-GUEST-1

var constants = require('../../utils/constants');
var dict = require('../../utils/dict');
var storage = require('../../utils/storage');
var auth = require('../../utils/auth');
var challenge = require('../../utils/challenge');
var rewards = require('../../utils/challenge-rewards');
var request = require('../../utils/request');

// 关卡规模与默认解锁数：取自 utils/constants.js（与首页「继续挑战」共用同一口径，避免漂移）
var LEVELS_PER_GRADE = constants.LEVELS_PER_GRADE;
var DEFAULT_UNLOCKED = constants.DEFAULT_UNLOCKED_LEVELS;

// 关卡行第二行的说明（题库类统一样式；后续按关卡细分难度时在这里扩展）
var LEVEL_SUB = '10 题 · 一题一次机会';

Page({
  data: {
    grades: [],             // 学段列表（来自 GRADES，REQ-DICT-1）
    currentGradeIndex: 0,   // 当前选中的学段下标
    typeGroups: [],         // 题型分类 chips（{ key,label,count }，仅含可用分类，综合恒在）
    currentType: 'all',     // 当前题型分类 key（'all' = 综合）
    currentTypeLabel: '',   // 当前分类 label（关卡行标签用）
    levels: [],             // 关卡行数据（含 state/星级/解锁提示）
    loggedIn: false,        // 登录态（未登录可玩前 3 关）
    gradeEarnedStars: 0,    // 进度卡：当前分类已得星星数
    gradeTotalStars: 30,    // 进度卡：星星总数（10 关 × 3 星）
    gradeStarPercent: 0,    // 进度卡：星星进度百分比 0~100
    isChallengeView: true,  // 当前是否「挑战主线」视图（综合 = 主线，具体分类 = 自由练）
    chests: []              // 挑战主线里程碑宝箱（P3）
  },

  onLoad: function () {
    // 初始化学段列表（7 个学段，REQ-DICT-1）
    this.setData({ grades: constants.GRADES });
    this.refreshLevels();
  },

  onShow: function () {
    // 从游戏页 / 登录返回后刷新星级与登录态（REQ-GAME-13、M5）
    this.refreshLevels();
  },

  // 切换学段 tab（REQ-DICT-1）
  pickGrade: function (e) {
    var index = e.currentTarget.dataset.index;
    if (index === this.data.currentGradeIndex) return;
    this.setData({ currentGradeIndex: index });
    this.refreshLevels();
  },

  // 切换题型分类 chip
  pickType: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.currentType) return;
    var groups = this.data.typeGroups || [];
    var label = '';
    var count = 0;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].key === key) { label = groups[i].label; count = groups[i].count; break; }
    }
    // 可用但不足一关（1..9 题）：提示且不切换
    if (key !== 'all' && count > 0 && count < 10) {
      wx.showToast({ title: '该学段「' + (label || key) + '」仅 ' + count + ' 题，暂不满一关', icon: 'none', duration: 1500 });
      return;
    }
    this.setData({ currentType: key });
    this.refreshLevels();
  },

  // 刷新当前学段 + 分类的关卡列表（REQ-GAME-13/14、游客限制、分类维度）
  refreshLevels: function () {
    var grade = this.data.grades[this.data.currentGradeIndex];
    if (!grade) return;
    var key = grade.key;
    var loggedIn = auth.isLoggedIn();
    // 挑战主线：老存档（字母射击 10 关星级）一次性迁移到主线对应关，幂等
    challenge.migrateStars(storage);

    // ① 分类可用性：题量 > 0 才展示（综合恒展示）
    var counts = {};
    var typeGroups = [];
    for (var g = 0; g < constants.TYPE_GROUPS.length; g++) {
      var grp = constants.TYPE_GROUPS[g];
      var n = dict.filterByGroup(key, grp.key).length;
      counts[grp.key] = n;
      if (grp.key === 'all' || n > 0) {
        // 「综合」= 挑战主线（一关一种玩法），其余分类 = 该题型的自由练
        typeGroups.push({
          key: grp.key,
          label: (grp.key === 'all') ? '挑战主线' : grp.label,
          count: n
        });
      }
    }
    // ② 当前分类在切换学段后不可用 → 回退综合
    var typeKey = this.data.currentType;
    if (typeKey !== 'all' && !counts[typeKey]) typeKey = 'all';
    var typeLabel = '';
    for (var t = 0; t < constants.TYPE_GROUPS.length; t++) {
      if (constants.TYPE_GROUPS[t].key === typeKey) { typeLabel = constants.TYPE_GROUPS[t].label; break; }
    }
    // 综合不传 typeKey → storage 沿用旧 key（兼容历史存档）
    var typeArg = (typeKey === 'all') ? undefined : typeKey;

    // ③ 关卡行数据
    //   · 综合（all）= 挑战主线：30 关，一关一种玩法（2026-09-12 拍板）
    //   · 具体分类   = 自由练：沿用原有 10 关 × 该分类题库
    var built = (typeKey === 'all')
      ? this._buildChallengeRows(key, loggedIn)
      : this._buildPracticeRows(key, typeArg, loggedIn, typeLabel);
    // 里程碑宝箱只在「挑战主线」视图展示（自由练没有主线进度）
    var chests = (typeKey === 'all') ? rewards.chestState(key) : [];
    var levels = built.levels;
    var gradeEarnedStars = built.earnedStars;
    var gradeTotalStars = built.totalStars;
    var gradeStarPercent = gradeTotalStars > 0
      ? Math.round(gradeEarnedStars / gradeTotalStars * 100)
      : 0;

    this.setData({
      typeGroups: typeGroups,
      currentType: typeKey,
      currentTypeLabel: typeLabel,
      levels: levels,
      loggedIn: loggedIn,
      gradeEarnedStars: gradeEarnedStars,
      gradeTotalStars: gradeTotalStars,
      gradeStarPercent: gradeStarPercent,
      isChallengeView: typeKey === 'all',
      chests: chests
    });
  },

  /**
   * 挑战主线行数据（每学段 30 关，一关一种玩法）。
   * 星级存 `grade@challenge@level`，解锁规则与自由练一致：
   *   前 DEFAULT_UNLOCKED 关默认解锁（游客同享）；之后登录用户过一关解锁一关。
   * @param {string} key 学段 key
   * @param {boolean} loggedIn 是否已登录（游客第 4 关起需登录）
   * @returns {{levels:Array, earnedStars:number, totalStars:number}}
   */
  _buildChallengeRows: function (key, loggedIn) {
    var rows = challenge.levelsOf(key);
    var levels = [];
    var earnedStars = 0;
    var curIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var n = row.level;
      var stars = storage.getStars(key, n, challenge.STAR_KEY);
      earnedStars += stars;
      var needLogin = !loggedIn && n > DEFAULT_UNLOCKED;
      var unlocked = (n <= DEFAULT_UNLOCKED) ||
        (loggedIn && storage.isLevelUnlocked(key, n, challenge.STAR_KEY));
      levels.push({
        level: n,
        mode: row.mode,
        page: row.page,
        seed: row.seed,
        stars: stars,
        starArr: [stars >= 1, stars >= 2, stars >= 3],
        unlocked: unlocked,
        needLogin: needLogin,
        shaking: false,
        kindLabel: row.modeEmoji + ' ' + row.modeLabel,
        sub: row.sub,
        // 终关 Boss（第 30 关）：行上加徽标、整行换成金色描边（见 level.wxss 的 .lvrow.boss）
        isBoss: !!row.isBoss
      });
    }
    // 两遍定 state：先知道「首个已解锁但没满星」的位置，才能标出「继续挑战」
    var curIdx = this._firstOpenIndex(levels);
    for (var j = 0; j < levels.length; j++) {
      levels[j].state = this._stateOf(levels[j], j === curIdx);
      levels[j].lockTip = this._lockTipOf(levels[j]);
    }
    return { levels: levels, earnedStars: earnedStars, totalStars: rows.length * 3 };
  },

  /**
   * 自由练行数据（某学段某分类的 10 关，题库=该分类）。
   * 与改造前完全一致，保证已有存档与分类练习不受影响。
   */
  _buildPracticeRows: function (key, typeArg, loggedIn, typeLabel) {
    var levels = [];
    var earnedStars = 0;
    var curIdx = -1;
    for (var i = 1; i <= LEVELS_PER_GRADE; i++) {
      var stars = storage.getStars(key, i, typeArg);
      earnedStars += stars;
      var needLogin = !loggedIn && i > DEFAULT_UNLOCKED;
      var unlocked = (i <= DEFAULT_UNLOCKED) ||
        (loggedIn && storage.isLevelUnlocked(key, i, typeArg));
      if (unlocked && stars === 0 && curIdx === -1) curIdx = levels.length;
      levels.push({
        level: i,
        stars: stars,
        starArr: [stars >= 1, stars >= 2, stars >= 3],
        unlocked: unlocked,
        needLogin: needLogin,
        shaking: false
      });
    }
    for (var j = 0; j < levels.length; j++) {
      var it = levels[j];
      it.state = this._stateOf(it, j === curIdx);
      it.kindLabel = typeLabel;   // 关卡标签：当前题型分类
      it.sub = LEVEL_SUB;
      it.lockTip = this._lockTipOf(it);
    }
    return { levels: levels, earnedStars: earnedStars, totalStars: LEVELS_PER_GRADE * 3 };
  },

  /** 首个「已解锁但 0 星」的行下标（没有则 -1）= 继续挑战目标 */
  _firstOpenIndex: function (levels) {
    var lastUnlocked = -1;
    for (var i = 0; i < levels.length; i++) {
      if (!levels[i].unlocked) break;
      lastUnlocked = i;
      if (levels[i].stars === 0) return i;
    }
    return lastUnlocked;   // 已解锁的都通关了 → 最后一关可刷星
  },

  /**
   * 四种状态：done(已通关) / cur(首个待挑战) / open(已解锁但还没轮到，可直接开打) / lock(未解锁)。
   * 注意 open 必须与 lock 区分：前 DEFAULT_UNLOCKED 关默认解锁，若只通了第 1 关，
   * 第 3 关同样是「能玩但还没轮到」——旧版把它渲染成锁定，是显示缺陷。
   */
  _stateOf: function (row, isCurrent) {
    if (row.stars > 0) return 'done';
    if (!row.unlocked) return 'lock';
    return isCurrent ? 'cur' : 'open';
  },

  _lockTipOf: function (row) {
    if (row.state !== 'lock') return '';
    return row.needLogin ? '登录后解锁' : '通关第 ' + (row.level - 1) + ' 关后解锁';
  },

  // 点击关卡行
  /**
   * 领取挑战主线里程碑宝箱（每通 10 关一个，奖励星星）。
   * 奖励去向：本地记录（幂等）+ 登录玩家同步段位（星星是段位货币）。
   */
  claimChest: function (e) {
    var at = parseInt(e.currentTarget.dataset.at, 10);
    var grade = this.data.grades[this.data.currentGradeIndex];
    if (!grade) return;
    var r = rewards.claim(grade.key, at);
    if (!r.ok) {
      wx.showToast({ title: r.reason || '还不能领取', icon: 'none' });
      return;
    }
    if (r.already) {
      wx.showToast({ title: '这个宝箱已经领过啦', icon: 'none' });
      return;
    }
    if (auth.isLoggedIn()) {
      // 计入段位（累计星）；失败静默，下次领取/通关会再同步
      request.post('/api/rank/sync', { stars: r.stars }).catch(function () {});
    }
    wx.showModal({
      title: '🎁 宝箱已开',
      content: '+' + r.stars + ' 星' + (auth.isLoggedIn() ? '（已计入段位）' : '（登录后计入段位）'),
      showCancel: false,
      confirmText: '太好了'
    });
    this.refreshLevels();
  },

  onLevelTap: function (e) {
    var index = e.currentTarget.dataset.index;
    var card = this.data.levels[index];
    if (!card) return;

    // 未解锁：区分「游客需登录」与「前关未通」（REQ-GAME-14 / M5 REQ-GUEST-1）
    if (!card.unlocked) {
      this.shakeCard(index);
      if (card.needLogin) {
        var self = this;
        auth.promptLogin('登录后可继续解锁更多关卡').then(function (user) {
          if (user) self.refreshLevels();
        });
      } else {
        wx.showToast({ title: '通关上一关即可解锁本关', icon: 'none', duration: 1200 });
      }
      return;
    }

    // 已解锁：携带学段 + 关卡（+ 分类）参数进入游戏页
    var grade = this.data.grades[this.data.currentGradeIndex];
    // 记下本次选择，供首页「继续挑战」定位到真正要继续的关卡
    storage.set(constants.STORAGE_KEYS.lastGrade, grade.key);
    storage.set(constants.STORAGE_KEYS.lastType, this.data.currentType || '');
    var url = '';
    if (this.data.isChallengeView) {
      // 挑战主线：按该关的玩法跳对应玩法页（带 challenge=1 与关卡种子）
      url = challenge.pageUrl(challenge.levelAt(grade.key, card.level), grade.key);
      if (!url) return;
    } else {
      url = '/pages/game/game?grade=' + grade.key + '&level=' + card.level;
      if (this.data.currentType && this.data.currentType !== 'all') {
        url += '&type=' + this.data.currentType;
      }
    }
    wx.navigateTo({ url: url });
  },

  // 触发锁定行抖动动画（REQ-GAME-14；锁定/登录引导时点击）
  shakeCard: function (index) {
    var key = 'levels[' + index + '].shaking';
    var on = {};
    on[key] = true;
    this.setData(on);
    var self = this;
    setTimeout(function () {
      var off = {};
      off[key] = false;
      self.setData(off);
    }, 400);
  },

  // 游客横幅点击：登录解锁第 4 关及以后
  guestLogin: function () {
    var self = this;
    auth.promptLogin('登录后可继续解锁第 4 关及以后关卡').then(function (user) {
      if (user) self.refreshLevels();
    });
  },

  // 进入自定义关卡编辑器（M3）
  goCustomLevel: function () {
    wx.navigateTo({ url: '/pages/level-editor/level-editor' });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  },

  // 页面分享（M5 P4）
  onShareAppMessage: function () {
    return {
      title: '词力战士 - 来挑战我的关卡吧',
      path: '/pages/index/index'
    };
  }
});
