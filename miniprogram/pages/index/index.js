// 首页 Tab（B1 UI 对齐 demo 首页；M5 登录态保留）
//
// 结构（自上而下）：
//   Header(词力战士+🔊) / Hero(头像+标题+副题) / 游客引导条 /
//   资产条(⭐累计星 / 🎖段位 / 🔥连续) / 排行榜行(我的名次) /
//   今日目标(报告聚合) / 每日一题·签到(→checkin, B2 改每日一题) /
//   继续挑战大卡(→level) / 推荐玩法 2 卡
// 关联：REQ-GAME-1、M5 REQ-GUEST、B2 每日一题=签到。

var storage = require('../../utils/storage');
var auth = require('../../utils/auth');
var constants = require('../../utils/constants');
var challenge = require('../../utils/challenge');
// 推荐玩法：玩法目录 + 本机计数（玩得最多的两款，2026-09-13）
var gameCatalog = require('../../utils/game-catalog');
var playCounts = require('../../utils/play-counts');
// UI 重做一期（2026-10-17 战士主题版）：首页叙事从「一堆入口」改成「养成你的战士」——
// 视觉中心是当前皮肤立绘，下面是皮肤收集线，再往下是「下一个要打的 Boss」。
// 等级口径（用户拍板）：战力 = 等级 = 段位阶梯的 cell（由星星数推导），不新增数值。
var skins = require('../../utils/skins');
var rankLadder = require('../../utils/rank-ladder');
var bossLadder = require('../../utils/boss-ladder');

Page({
  // 实例级标志（不在 data，避免渲染）；登录/协议进行中置 true，防 nudge 弹窗互顶
  _loginBusy: false,
  _nudgeTimer: null,
  // 加载失败过的立绘 URL（2026-10-19）：按 URL 记而不是只记一个布尔量，
  // 否则第一张图挂了之后，换成别的皮肤也永远显示 emoji（换皮肤看起来「没生效」）。
  _imgErr: {},

  data: {
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    // 资产条
    totalStars: 0,
    localStars: 0,     // 本机存档星数合计（游客展示用，也用于"登录同步"提醒）
    starsLabel: '累计星星',  // 登录=累计星星（云端口径）；游客=本机星星
    rankName: '',      // 段位名（登录后云端）
    streakDays: 0,     // 连续天数（checkin）
    // 排行榜行
    myRank: 0,         // 我的总榜名次（0=未上榜/游客）
    // 继续挑战（一期：显示真实进度并直达对局）
    continueGrade: 'kg',             // 目标学段 key（2026-10-08 起按年级细分）
    needGrade: false,                // 从没主动选过年级 → 首页给引导（见 onShow）
    // 全局年级（2026-10-18）：HUD 最左那枚胶囊，点开 = 同一个 grade-picker
    gradeKey: '',                    // 当前年级 key（写进 grade-picker 的 value）
    gradeLabel: '',                  // 当前年级名（胶囊文字）
    gradeChosen: false,              // 是否主动选过（没选过 → 胶囊高亮成「选年级」）
    gradePickerVisible: false,       // 选择器开合
    continueLevel: 1,               // 目标关卡
    continueStars: 0,               // 该关历史最佳星级
    continueHint: '',               // 副标题：玩法 · 学段 · 第 N 关
    continuePlayable: false,        // 是否可直接开打（游客第 4 关起走关卡页登录）
    // 今日目标
    todayQ: 0,
    todayRate: 0,      // 百分比
    dailyDone: false,  // 每日一题/签到今日完成
    soundOn: true,     // 声音开关（HUD 喇叭）

    // —— 战士舞台（首页视觉中心）——
    warriorName: '我的战士',   // 当前装备皮肤的中文名
    warriorImg: '',           // 立绘 URL（CDN；空则回退 emoji）
    warriorEmoji: '⚔️',
    warriorImgErr: false,     // 立绘加载失败 → 回退 emoji，避免裂图
    lvCell: 1,                // 等级 = 段位阶梯 cell（星星推导）
    lvPercent: 0,             // 本級进度（0~100）
    lvNeed: 0,                // 距下一级还差多少星
    lvNext: '',               // 下一级名称
    rankShort: '青铜',        // 大段名（顶部胶囊用，避免长段位名撑破）
    // —— 皮肤收集条 ——
    skinCells: [],            // 5 格：当前皮肤 + 已拥有 + 下一个待解锁（next 金框）
    skinOwned: 0,
    skinTotal: 0,
    nextSkinName: '',         // 下一个能解锁的皮肤名
    nextSkinReq: '',          // 解锁条件文案（段位 / 星星 / 签到）
    // —— Boss 预告 ——
    bossName: '',
    bossEmoji: '👹',
    bossImg: '',
    bossImgErr: false,
    bossHint: '',
    // 底部「热门玩法」：先用本机常玩兜底，随后用服务端玩法热度覆盖（见 _loadHotGames）
    hotGames: []
  },

  onShow: function () {
    var soundOn = storage.get(constants.STORAGE_KEYS.sound) !== '0';
    this.setData({ soundOn: soundOn });
    // 游客首屏不再自动弹协议；协议在用户点「登录/注册」后展示（O2）
    this.refresh();
    // 玩法热度（6 小时缓存）；失败/游客都退回本机常玩，不影响首屏
    this._loadHotGames();
    // 温和登录提醒延后触发（避开用户主动登录的弹窗时序，防 modal 互顶）
    var self = this;
    if (this._nudgeTimer) clearTimeout(this._nudgeTimer);
    this._nudgeTimer = setTimeout(function () { self._maybeNudgeLogin(); }, 900);
  },

  onHide: function () {
    // 离开首页时取消挂起的 nudge 定时器，避免在其他页面意外弹窗
    if (this._nudgeTimer) { clearTimeout(this._nudgeTimer); this._nudgeTimer = null; }
  },

  // —— 数据刷新 ——
  refresh: function () {
    var self = this;
    // 挑战主线：老存档（字母射击 10 关）一次性迁移到主线的对应关卡，幂等
    challenge.migrateStars(storage);
    var loggedIn = auth.isLoggedIn();
    var u = auth.getUser();
    var nickname = (loggedIn && u && u.nickname) ? u.nickname : '';
    var avatarUrl = (loggedIn && u && u.avatarUrl) ? u.avatarUrl : '';
    if (!nickname) nickname = storage.getNickname();
    if (!avatarUrl) avatarUrl = storage.getAvatar();

    // 本地星级汇总（资产条主值）
    var totalStars = 0;
    var allStars = storage.getAllStars();
    for (var k in allStars) {
      if (allStars.hasOwnProperty(k) && typeof allStars[k] === 'number') totalStars += allStars[k];
    }
    var rankName = storage.get('ww_rank_name') || '';
    var streakDays = storage.get('ww_streak') || 0;

    // 继续挑战：按「最近一次进入的学段/题型」推导下一关（与关卡页同一口径）
    // 2026-10-08：用 getLastGrade()（内部会把旧学段 key 归一化成新 key），
    // 否则老用户升级后首页「继续挑战」会指向一个已经不存在的档位。
    // 2026-10-08：用户从没主动选过年级时（getLastGrade 为空），首页要引导去选 ——
    // 否则新用户会默默落在「幼儿园」，看到一堆对不上自己年级的题还以为产品不行。
    var chosenGrade = storage.getLastGrade();
    var lastGrade = chosenGrade || constants.GRADES[0].key;
    var lastType = storage.get(constants.STORAGE_KEYS.lastType) || '';
    var gradeLabel = lastGrade;
    for (var gi = 0; gi < constants.GRADES.length; gi++) {
      if (constants.GRADES[gi].key === lastGrade) { gradeLabel = constants.GRADES[gi].label; break; }
    }
    // 继续挑战 = 挑战主线（2026-09-12 拍板）：
    // 一关 = 一种玩法 + 本学段题库，取该学段第一个未满星的主线关卡，
    // 卡片直接显示「玩法 · 学段 · 第 N/30 关」，点击进入该玩法页（带关卡种子）。
    var cont = storage.findContinueLevel(lastGrade, challenge.STAR_KEY, challenge.LEVELS_PER_GRADE);
    var contLv = challenge.levelAt(lastGrade, cont.level) || challenge.levelAt(lastGrade, 1);
    var contMode = contLv ? contLv.mode : 'shoot';
    // 游客第 4 关起需登录：卡片改为引导去关卡页（那里会弹登录引导）
    var continuePlayable = loggedIn || cont.level <= constants.DEFAULT_UNLOCKED_LEVELS;
    // 终关 Boss：卡片前缀加标记，玩家一眼看出「接下来是打 Boss」。
    //
    // 2026-09-29 缩短（截图审查发现）：原文案是
    //   「👑 BOSS · 字母射击 · 幼儿园 · 第 30/30 关」+「（已通关，可刷星）」
    // 卡片里右侧还有「换关卡」按钮，文字被挤到只剩「第 30...」——
    // 关键信息（第几关）反而看不清。现在去掉「/30」（总关数在关卡页更清楚）,
    // 通关提示也压短，留出余量。总关数信息在关卡页/进度条里仍然完整。
    // 2026-10-08 再次收紧：加上「👑 BOSS」前缀后，卡片右侧还有「换关卡」按钮，
    // 「玩法 · 学段 · 第 N 关」整串会顶到按钮底下。学段信息在关卡页/首页顶部都有，
    // 这里优先保住「玩什么 + 第几关」。
    var continueHint = (contLv && contLv.isBoss ? '👑 BOSS · ' : '')
      + (contLv ? contLv.modeLabel : '字母射击')
      + ' · 第 ' + cont.level + ' 关'
      + (cont.allPassed ? '（可刷星）' : '');

    var dailyDone = false;
    var todayKey = this._todayKey();
    var records = storage.get('ww_checkin_cache') || [];
    records.forEach(function (r) { if (r.date === todayKey) dailyDone = true; });

    // 战士舞台 / 皮肤收集条（星星与连续天数同时决定解锁，故两者都传）
    var hero = this._heroData(totalStars, streakDays);
    // Boss 预告：取当前学段第 30 关的镇守 Boss（映射见 utils/boss-ladder.js）
    var boss = bossLadder.bossOf(lastGrade);

    this.setData(Object.assign({
      loggedIn: loggedIn,
      nickname: nickname,
      avatarUrl: avatarUrl,
      // 已登录但没设昵称 = 未完成注册（不上排行榜）→ 首页显示「完善昵称」引导条
      needProfile: !!(loggedIn && u && u.needProfile),
      // 没选过年级 → 首页显示「选择你的年级」引导条（点了去关卡页选）
      needGrade: !chosenGrade,
      // 年级胶囊（HUD 最左）：没选过时显示「选年级」并橙色高亮
      gradeKey: lastGrade,
      gradeLabel: gradeLabel,
      gradeChosen: !!chosenGrade,
      totalStars: totalStars,
      localStars: totalStars,
      // 口径统一（用户拍板）：首页与我的页都展示同一个数 ——
      // 登录后取云端累计星（与「我的」页的 /api/rank/info 同源，两页不再打架）；
      // 游客没有云端数据，退回本机存档星并明确标注，避免被误当成全服资产。
      starsLabel: loggedIn ? '累计星星' : '本机星星',
      rankName: rankName,
      streakDays: streakDays,
      continueGrade: lastGrade,
      continueLevel: cont.level,
      continueStars: cont.stars,
      continueHint: continueHint,
      continuePlayable: continuePlayable,
      continueMode: contMode,
      continueModeLabel: contLv ? contLv.modeLabel : '',
      dailyDone: dailyDone,
      recos: this._buildRecos(),
      // 先用本机常玩兜底，_loadHotGames 拿到服务端热度后会覆盖（网络慢也不会空一块）
      hotGames: this._buildRecos(),
      bossName: boss.name,
      bossEmoji: boss.emoji,
      bossImg: boss.image,
      bossImgErr: !!(boss.image && this._imgErr && this._imgErr[boss.image]),
      // 学段名这里不再重复（2026-10-18）：HUD 最左已经有年级胶囊，
      // 卡片里再写一遍「幼儿园 · …」就是同一信息讲两次（二期已经因同类问题返工过）。
      bossHint: '第 30 关镇守 · 字母射击 BOSS 关'
    }, hero));

    if (loggedIn) this._fetchCloud();
  },

  /**
   * 由星星数推导「等级 / 段位 / 皮肤收集条」。
   *
   * 为什么单独抽出来：星星有两个来源 —— 本机存档（游客）与云端累计星（登录后
   * 由 _fetchCloud 回填）。两处都要按同一口径重算等级，否则登录用户会看到
   * 等级和星星对不上（历史坑：资产条数字会变、等级不变）。
   *
   * @param {number} stars 累计星星
   * @param {number} streak 连续签到天数（里程碑皮肤解锁依据）
   * @returns {object} 可直接 setData 的部分 data
   */
  _heroData: function (stars, streak) {
    var s = Math.max(0, parseInt(stars, 10) || 0);
    var st = Math.max(0, parseInt(streak, 10) || 0);
    var prog = rankLadder.progressOf(s);
    var cell = prog.current.cell;

    // 当前皮肤：读本机装备的 avatarId，取不到就回退默认战士（不会空白）
    var equipped = storage.getWarriorSkin() || '';
    var wSkin = skins.getWarriorSkin(equipped);

    var warriors = [];
    for (var i = 0; i < skins.LOCAL_SKINS.length; i++) {
      if (skins.LOCAL_SKINS[i].type === 'warrior') warriors.push(skins.LOCAL_SKINS[i]);
    }

    var warriorName = '我的战士';
    for (var j = 0; j < warriors.length; j++) {
      if (warriors[j].avatarId === wSkin.id) { warriorName = warriors[j].name; break; }
    }

    // 分「已拥有 / 未解锁」——口径与 skins.LOCAL_SKINS 的 unlockType 一致
    var self = this;
    var owned = [];
    var locked = [];
    warriors.forEach(function (w) {
      if (self._skinUnlocked(w, s, cell, st)) owned.push(w); else locked.push(w);
    });

    // 收集条 5 格：当前皮肤打头（保证玩家一眼看到「这就是我」），
    // 再补已拥有（最多 3 格），剩余用未解锁填（第一只标金框 = 下一目标）。
    var cells = [];
    var used = {};
    var cur = null;
    // 已装备的皮肤优先（2026-10-19）：云端解锁的皮肤可能不在本地「已拥有」里
    // （本地按星星/段位估算，云端可能有额外发放），但它既然正穿在身上，
    // 收集条第一格就必须是它，否则会出现「立绘是狐狸、第一格却是布衣学徒」。
    for (var k = 0; k < warriors.length; k++) {
      if (warriors[k].avatarId === wSkin.id) { cur = warriors[k]; break; }
    }
    if (!cur) {
      // 装备的皮肤不在本地清单里（更老/未知 id）→ 用默认战士当第一格
      for (var m = 0; m < warriors.length; m++) {
        if (warriors[m].avatarId === 'warrior_01') { cur = warriors[m]; break; }
      }
    }
    if (cur) {
      cells.push({ id: cur.avatarId, name: cur.name, img: cur.image, emoji: cur.emoji, locked: false, next: false });
      used[cur.avatarId] = true;
    }
    for (var n = 0; n < owned.length && cells.length < 3; n++) {
      if (used[owned[n].avatarId]) continue;
      cells.push({ id: owned[n].avatarId, name: owned[n].name, img: owned[n].image, emoji: owned[n].emoji, locked: false, next: false });
      used[owned[n].avatarId] = true;
    }
    // 未解锁：按清单顺序取前几只（清单本身按解锁难度从低到高排列）
    var firstLocked = null;
    for (var p = 0; p < locked.length && cells.length < 5; p++) {
      var lk = locked[p];
      cells.push({
        id: lk.avatarId,
        name: lk.name,
        img: lk.image,
        emoji: lk.emoji,
        locked: true,
        next: !firstLocked,
        req: this._skinReqText(lk)
      });
      if (!firstLocked) firstLocked = lk;
    }

    return {
      lvCell: cell,
      lvPercent: prog.isMaxRank ? 100 : prog.progressPercent,
      lvNeed: prog.starsNeeded,
      lvNext: prog.nextName,
      rankShort: prog.current.bigRank.name,
      warriorName: warriorName,
      warriorImg: wSkin.image || '',
      // 立绘失败标记跟着 URL 走：换了皮肤就该重新试新图，
      // 不能因为「上一张加载失败过」把之后所有皮肤都锁在 emoji 上。
      warriorImgErr: !!(wSkin.image && this._imgErr && this._imgErr[wSkin.image]),
      warriorEmoji: wSkin.emoji || '⚔️',
      skinCells: cells,
      skinOwned: owned.length,
      skinTotal: warriors.length,
      nextSkinName: firstLocked ? firstLocked.name : '',
      nextSkinReq: firstLocked ? this._skinReqText(firstLocked) : ''
    };
  },

  /**
   * 皮肤是否已解锁（本地判定，与服务端 avatar-seed 的 unlockType 同义）。
   * 说明：服务端是权威，但首页不改数据、只做展示，本地判定足够，
   * 且离线/未登录时也能出正确的收集线。
   */
  _skinUnlocked: function (s, stars, cell, streak) {
    var t = s.unlockType || 'free';
    if (t === 'free') return true;
    if (t === 'stars') return stars >= (s.unlockValue || 0);
    if (t === 'rank') return cell >= (s.unlockValue || 1);
    if (t === 'milestone') return streak >= (s.unlockValue || 0);
    // 'level' = 学段全三星这类复合条件（本地无汇总数据）→ 首页按未解锁展示
    return false;
  },

  /** 皮肤的解锁条件文案（首页收集条 / 下一目标提示用） */
  _skinReqText: function (s) {
    var t = s.unlockType || 'free';
    if (t === 'free') return '免费获得';
    if (t === 'stars') return s.unlockValue + '⭐ 解锁';
    if (t === 'rank') {
      var b = rankLadder.BIG_RANKS[(s.unlockValue || 1) - 1];
      return (b ? b.name : '青铜') + ' 段位解锁';
    }
    if (t === 'milestone') return '连续签到 ' + s.unlockValue + ' 天';
    if (t === 'level') return '学段全三星解锁';
    return '达成条件解锁';
  },

  _fetchCloud: function () {
    var self = this;
    var request = require('../../utils/request');
    // 段位信息
    request.get('/api/rank/info').then(function (d) {
      if (!d) return;
      // 星星口径与「我的」页同源：都用云端累计星（登录态下两页数字必须一致）
      self.setData({ rankName: d.rankName || '' });
      if (typeof d.stars === 'number') {
        // 星星变了 → 等级、进度条、皮肤收集条都要跟着重算（否则等级与星星打架）
        self.setData(self._heroData(d.stars, self.data.streakDays));
        self.setData({ totalStars: d.stars });
      }
      try { storage.set('ww_rank_name', d.rankName || ''); } catch (e) {}
    }).catch(function () {});
    // 我的排名（总榜）
    request.get('/api/rank/me').then(function (d) {
      if (!d) return;
      self.setData({ myRank: d.rank || 0 });
    }).catch(function () {});
    // 连续签到
    request.get('/api/checkin').then(function (d) {
      if (!d) return;
      var streak = d.currentStreak || 0;
      self.setData({ streakDays: streak });
      // 连续天数影响里程碑皮肤（连续 30/60/100… 天）→ 收集条同步重算
      self.setData(self._heroData(self.data.totalStars, streak));
      try { storage.set('ww_streak', streak); } catch (e) {}
      var records = d.records || [];
      try { storage.set('ww_checkin_cache', records); } catch (e) {}
      var dailyDone = false;
      var todayKey = self._todayKey();
      records.forEach(function (r) { if (r.date === todayKey) dailyDone = true; });
      self.setData({ dailyDone: dailyDone });
    }).catch(function () {});
    // 今日目标：report days=1
    request.get('/api/report/range?days=1').then(function (d) {
      if (!d || !d.trend || !d.trend.length) return;
      var t = d.trend[0];
      self.setData({ todayQ: t.questions || 0, todayRate: t.rate || 0 });
    }).catch(function () {});
  },

  _todayKey: function () {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  },

  // —— 声音开关（与 game HUD 同一存储键 + audio 模块同步）——
  toggleSound: function () {
    var audio = require('../../game/audio');
    var next = storage.get(constants.STORAGE_KEYS.sound) === '0';
    storage.set(constants.STORAGE_KEYS.sound, next ? '1' : '0');
    audio.setSoundEnabled(next);
    this.setData({ soundOn: next });
    wx.showToast({ title: next ? '🔊 声音已开启' : '🔇 声音已关闭', icon: 'none' });
  },

  // —— 入口 ——
  // 统一登录：游客点「登录/注册」→ 先弹《用户协议与隐私政策》，同意后才显示“登录中”
  // 并发被 loginSilently 的 _loggingIn 兜底；失败弹窗给具体错误，避免“点了没反应”。
  _doLogin: function () {
    var self = this;
    var step = function (s) {
      try { if (typeof console !== 'undefined') console.log('[login-step]', s); } catch (e) {}
    };
    // 1) 协议确认（未同意过才弹；已同意直接通过）
    step('1-ensureAgreement 开始');
    auth.ensureAgreement().then(function (agreed) {
      step('2-ensureAgreement 返回 agreed=' + agreed);
      if (!agreed) {
        step('2b-用户拒绝协议，保持游客');
        self._loginBusy = false;
        wx.showToast({ title: '已保持游客模式 · 需要时再登录', icon: 'none', duration: 1800 });
        return;
      }
      // 2) 显示 loading 并真正调微信登录
      wx.showLoading({ title: '登录中...', mask: false });
      step('3-调用 wx.login/loginSilently');
      return auth.loginSilently({ skipAgreement: true }).then(function (user) {
        wx.hideLoading();
        self._loginBusy = false;
        step('4-登录返回 user=' + !!(user));
        if (!user) return;
        try {
          step('4a-登录后 isLoggedIn=' + auth.isLoggedIn() + ' needProfile=' + (user && user.needProfile) +
            ' token=' + (storage.getToken ? (storage.getToken() ? '有' : '空') : '?'));
        } catch (e) { step('4a-诊断异常 ' + e); }
        self.refresh();
        try {
          step('4b-refresh后 data.loggedIn=' + self.data.loggedIn);
        } catch (e) {}
        if (user.needProfile) {
          wx.showToast({ title: '登录成功 · 完善昵称后参与排行', icon: 'none', duration: 1500 });
          setTimeout(function () {
            wx.navigateTo({ url: '/pages/nickname/nickname' });
          }, 900);
        } else {
          wx.showToast({ title: '✅ 登录成功', icon: 'none' });
        }
      }).catch(function (err) {
        wx.hideLoading();
        self._loginBusy = false;
        step('5-登录失败 err=' + (err && (err.message || err.errMsg || JSON.stringify(err))));
        var msg = (err && (err.message || err.errMsg)) || '登录失败';
        var code = err && err.code;
        var detail = msg;
        try {
          var cloudOk = !!(wx.cloud && typeof wx.cloud.callContainer === 'function');
          detail = msg + '\n\n[诊断] 云能力:' + (cloudOk ? '可用' : '不可用') +
            (code !== undefined ? '; code=' + code : '') +
            '\n环境提示：开发者工具请绑定云托管服务并登录；也可用「真机预览」测试（openid 由网关注入）。';
        } catch (e) { /* 忽略 */ }
        wx.showModal({
          title: '登录失败',
          content: detail,
          showCancel: false,
          confirmText: '知道了'
        });
      });
    }).catch(function (e) {
      self._loginBusy = false;
      step('ensureAgreement 异常 ' + e);
    });
  },

  // 登录条/资料入口：游客→登录(协议前置)；已登录→我的(tab)
  onProfileTap: function () {
    // 登录流程进行中 → 取消可能撞窗的 nudge 弹窗，并置忙标志
    if (this._nudgeTimer) { clearTimeout(this._nudgeTimer); this._nudgeTimer = null; }
    this._loginBusy = true;
    // 注意：此处禁止在 showModal 前 wx.showToast —— toast 与 modal 共用原生弹窗层，
    // 真机上会导致协议弹窗直接 fail，即「首次进入点击登录没反应」的根因
    try {
      if (typeof console !== 'undefined') console.log('[login] onProfileTap 触发, loggedIn=' + auth.isLoggedIn());
    } catch (e) {}
    if (auth.isLoggedIn()) { wx.switchTab({ url: '/pages/me/me' }); return; }
    this._doLogin();
  },

  goRank: function () {
    var self = this;
    if (auth.isLoggedIn()) { wx.navigateTo({ url: '/pages/rank/rank' }); return; }
    auth.promptLogin('查看排行榜需登录').then(function (user) {
      self.refresh();
      if (user && !user.needProfile) wx.navigateTo({ url: '/pages/rank/rank' });
    });
  },

  // 每日一题·签到（答对即今日签到；里程碑皮肤在 daily-question 页展示）
  goDaily: function () {
    var self = this;
    if (auth.isLoggedIn()) { wx.navigateTo({ url: '/pages/daily-question/daily-question' }); return; }
    auth.promptLogin('每日一题签到需登录').then(function (user) {
      self.refresh();
      if (user && !user.needProfile) wx.navigateTo({ url: '/pages/daily-question/daily-question' });
    });
  },

  // 每日挑战赛：当天同学段同一套题，当天出榜（游客也能玩，登录才上榜）
  goDailyChallenge: function () {
    wx.navigateTo({ url: '/pages/daily-challenge/daily-challenge' });
  },

  // 赛季：自然双月一季，赛季榜 + 上赛季奖励
  goSeason: function () {
    wx.navigateTo({ url: '/pages/season/season' });
  },

  // 好友 PK：异步战帖（发起 → 分享 → 好友应战同一套题）
  goPk: function () {
    wx.navigateTo({ url: '/pages/pk/pk' });
  },

  // 协议全文页
  goAgreement: function () {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  /** 完善资料引导条：已登录但没设昵称（未完成注册，不上排行榜） */
  goProfileSetup: function () {
    wx.navigateTo({ url: '/pages/nickname/nickname' });
  },

  // 游客温和登录提醒：已有本地进度（得过星）且未提示过 → 提醒一次「登录同步」
  _maybeNudgeLogin: function () {
    // 登录/协议流程进行中 → 本次不弹（也不标记，留待下次 onShow），避免 modal 互顶
    if (this._loginBusy) return;
    if (auth.isLoggedIn()) return;
    if (storage.get('ww_login_nudge')) return;
    var totalStars = this.data.totalStars || 0;
    if (totalStars <= 0) return; // 尚无本地成绩，不打扰
    storage.set('ww_login_nudge', '1');
    var self = this;
    wx.showModal({
      title: '登录同步进度',
      content: '你已有 ' + totalStars + ' ⭐ 本地进度。登录后可同步到云端、参与排行榜，且进度不怕换设备/清缓存。',
      confirmText: '去登录',
      cancelText: '暂不',
      success: function (r) {
        if (r.confirm) {
          self._loginBusy = true;
          if (self._nudgeTimer) { clearTimeout(self._nudgeTimer); self._nudgeTimer = null; }
          self._doLogin();
        }
      }
    });
  },

  // 继续挑战：可直接开打则直达对局（一期改造），否则去关卡页
  // （游客第 4 关起需登录，关卡页会弹登录引导；已通关则回到最后一关刷星）
  // 2026-09-12：升级为「挑战主线」—— 按该关的玩法跳对应玩法页（字母射击/字母拼词/词语连连看），
  // 并带上 challenge=1 与关卡种子，玩法页据此固定题面、结算写挑战星级。
  goContinue: function () {
    if (!this.data.continuePlayable) {
      wx.navigateTo({ url: '/pages/level/level' });
      return;
    }
    var lv = challenge.levelAt(this.data.continueGrade, this.data.continueLevel);
    var url = challenge.pageUrl(lv, this.data.continueGrade);
    if (!url) {
      url = '/pages/game/game?challenge=1&grade=' + this.data.continueGrade
        + '&level=' + this.data.continueLevel;
    }
    wx.navigateTo({ url: url });
  },

  // 换关卡 → 关卡选择页
  goLevel: function () {
    wx.navigateTo({ url: '/pages/level/level' });
  },

  /**
   * 首页「推荐玩法」：展示**本机玩得最多**的两款（用户 2026-09-13 反馈：原来是写死的两张卡）。
   *
   * 数据来源 utils/play-counts（一局打完才计数，游客也记）；
   * 玩过不足两款时用默认推荐补齐（字母射击 / 词义消消乐），保证首页永远有两张卡。
   */
  _buildRecos: function () {
    var byKey = {};
    gameCatalog.forEach(function (g) { byKey[g.key] = g; });
    var DEFAULT_KEYS = ['shoot', 'match'];
    var keys = playCounts.topKeys(2);
    DEFAULT_KEYS.forEach(function (k) {
      if (keys.length < 2 && keys.indexOf(k) < 0) keys.push(k);
    });
    return keys.slice(0, 2).map(function (k) { return byKey[k]; })
      .filter(function (g) { return !!g; });
  },

  /**
   * 首页「热门玩法」：服务端玩法总览里的 players（玩家人数）降序取前 2。
   *
   * 为什么不用本机常玩：用户 2026-10-18 要求「展示最近比较火的玩法」，
   * 本机计数只能说明「你自己常玩」，说明不了热度。
   * · 6 小时缓存（ww_hot_games），避免每次进首页都打一次聚合查询；
   * · 请求失败 / 离线 / 游客 → 保留 _buildRecos 的本机兜底，不把区块变空。
   */
  _loadHotGames: function () {
    var self = this;
    var CACHE_KEY = 'ww_hot_games';
    var TTL = 6 * 60 * 60 * 1000;
    var cached = storage.get(CACHE_KEY);
    if (cached && cached.at && cached.list && cached.list.length
      && (Date.now() - cached.at) < TTL) {
      self.setData({ hotGames: cached.list });
      return;
    }
    var request = require('../../utils/request');
    request.get('/api/ranklist/progress-summary').then(function (d) {
      var rows = (d && d.list) || [];
      if (!rows.length) return;
      // game_type → 目录项：用 challenge.gameTypeOf 反查，避免再手写一套映射
      var byType = {};
      gameCatalog.forEach(function (g) {
        if (g.lineMode) byType[challenge.gameTypeOf(g.lineMode)] = g;
      });
      var list = rows.slice()
        .sort(function (a, b) { return (b.players || 0) - (a.players || 0); })
        .map(function (it) { return byType[it.game]; })
        .filter(function (g) { return !!g; })
        .slice(0, 2)
        .map(function (g) {
          return { key: g.key, name: g.name, icon: g.icon, desc: g.desc, url: g.url };
        });
      if (!list.length) return;
      self.setData({ hotGames: list });
      storage.set(CACHE_KEY, { at: Date.now(), list: list });
    }).catch(function () { /* 保留本机兜底 */ });
  },

  /** 点推荐玩法卡片：按目录里的 url 跳转 */
  goReco: function (e) {    var url = (e && e.currentTarget && e.currentTarget.dataset)
      ? e.currentTarget.dataset.url : '';
    if (url) wx.navigateTo({ url: url });
  },

  /** 点「全部玩法」→ 玩法 tab（2026-10-18：四宫格第四格，替代原「推荐玩法」区） */
  goPlaylist: function () {
    wx.switchTab({ url: '/pages/playlist/playlist' });
  },

  /** 点「段位」→ 段位详情（各段位门槛 / 距下一段还差多少星，第三批 · 第 8 条） */
  goRankInfo: function () {
    wx.navigateTo({ url: '/pages/rank-info/rank-info?stars=' + (this.data.totalStars || 0) });
  },

  // —— 全局年级（2026-10-18）：HUD 胶囊 + grade-picker ——
  /** 打开年级选择器（与「我的 → 当前年级」同一个组件） */
  openGradePicker: function () {
    this.setData({ gradePickerVisible: true });
  },

  onGradeClose: function () {
    this.setData({ gradePickerVisible: false });
  },

  /**
   * 选中年级：写全局设置后立刻 refresh()。
   * 首页有一半内容依赖年级（Boss 卡、出战/继续关卡、皮肤可解锁项），
   * 只改 data.gradeLabel 不重算会出现「年级变了但还指着旧年级的 Boss」。
   */
  onGradePick: function (e) {
    var key = (e && e.detail && e.detail.key) || '';
    if (!key) return;
    storage.setLastGrade(key);
    this.setData({ gradePickerVisible: false });
    this.refresh();
    wx.showToast({ title: '已切换到' + (this.data.gradeLabel || '新年级'), icon: 'none' });
  },

  /** 点战士立绘 / 收集条 → 换皮肤（皮肤页就是「战士图鉴」，主题驱动的核心入口） */
  goAvatarSkin: function () {
    wx.navigateTo({ url: '/pages/avatar/avatar' });
  },

  /** 战士立绘加载失败（CDN 不可达 / 离线）→ 回退 emoji，不留裂图 */
  onWarriorImgError: function () {
    // 按 URL 记失败，而不是只置一个 true：
    // 换皮肤后 refresh() 会用新 URL 重算 warriorImgErr，新图能正常尝试。
    var img = this.data.warriorImg;
    if (!this._imgErr) this._imgErr = {};
    if (img) this._imgErr[img] = true;
    this.setData({ warriorImgErr: true });
  },

  /** Boss 立绘加载失败 → 回退 emoji */
  onBossImgError: function () {
    var img = this.data.bossImg;
    if (!this._imgErr) this._imgErr = {};
    if (img) this._imgErr[img] = true;
    this.setData({ bossImgErr: true });
  },

  // 推荐玩法：字母射击→关卡选择
  goShoot: function () {
    wx.navigateTo({ url: '/pages/level/level' });
  },

  // 推荐玩法：数独（B6 已实现）
  goSudoku: function () {
    wx.navigateTo({ url: '/pages/sudoku/sudoku' });
  },

  // 推荐玩法：词义消消乐（B6 已实现）
  goMatch: function () {
    wx.navigateTo({ url: '/pages/match/match' });
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 打怪学字词，闯关赢星星', path: '/pages/index/index' };
  }
});
