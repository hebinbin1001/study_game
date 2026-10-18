// 个人中心页（M6-N）：资料卡 + 功能菜单 + 退出/注销
var storage = require('../../utils/storage');
var request = require('../../utils/request');
var auth = require('../../utils/auth');
var art = require('../../utils/art');
var constants = require('../../utils/constants');
var dict = require('../../utils/dict');

/** 年级 key → 展示名（全局年级设置用，2026-10-18） */
function gradeNameOf(key) {
  for (var i = 0; i < constants.GRADES.length; i++) {
    if (constants.GRADES[i].key === String(key || '')) return constants.GRADES[i].label;
  }
  return constants.GRADES[0].label;
}

/** 教材版本 key → 展示名 */
function bookNameOf(key) {
  for (var i = 0; i < constants.BOOKS.length; i++) {
    if (constants.BOOKS[i].key === String(key || '')) return constants.BOOKS[i].name;
  }
  return constants.BOOKS[0].name;
}

/**
 * 功能菜单（2026-10-17 分组）
 *
 * 为什么分组：原来 9 条菜单平铺，成长/对战/学习混在一起；其中排行榜、每日挑战、
 * 赛季、好友 PK、错题本 在首页/学习页也有入口 —— 这些重复入口**保留不删**
 * （不同场景下都能到），但按用途归位，找东西不用扫整屏。
 *
 * group 取值：成长 / 对战 / 学习（协议单独放版本行，不再占一整行 108rpx）。
 */
var MENU = [
  { emoji: '👗', name: '我的形象 · 皮肤', url: '/pages/avatar/avatar', group: '成长' },
  { emoji: '🏅', name: '成就勋章', url: '/pages/achievement/achievement', group: '成长' },
  { emoji: '🏆', name: '排行榜', url: '/pages/rank/rank', group: '成长' },
  { emoji: '🎯', name: '每日挑战赛', url: '/pages/daily-challenge/daily-challenge', group: '对战' },
  { emoji: '🏅', name: '赛季', url: '/pages/season/season', group: '对战' },
  { emoji: '🤝', name: '好友 PK', url: '/pages/pk/pk', group: '对战' },
  { emoji: '📖', name: '错题本', url: '/pages/wrong-book/wrong-book', group: '学习' },
  // 全局年级（2026-10-18）：决定主线 30 关 / 玩法线 / 词库 / 每日挑战用哪套题；切换不丢已有进度
  { emoji: '🏫', name: '当前年级', action: 'grade', group: '学习' },
  // 教材版本（2026-10-08 二期）：只影响英语出题用哪套词表，不上榜、不影响进度
  { emoji: '📚', name: '教材版本', action: 'book', group: '学习' }
];

var GROUP_ORDER = ['成长', '对战', '学习'];

Page({
  data: {
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    rankName: '',     // 段位（/api/rank/info，失败静默占位）
    rankIcon: '',     // 段位徽章图 URL（后端返回 /assets/ranks/...，这里转成云托管地址加载）
    rankIconBig: '',  // 大段位图兜底（小级图缺失时 onerror 切到这张）
    wins: 0,
    rankStars: 0,
    menu: MENU,
    menuGroups: [],   // [{ title, items }]，由 refresh 按 group 聚合
    gradeKey: '',     // 当前年级（全局设置）
    gradeLabel: '',   // 当前年级名（资料卡 meta-chip 展示）
    gradePickerVisible: false
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var loggedIn = auth.isLoggedIn();
    var u = auth.getUser();
    var nickname = (loggedIn && u && u.nickname) ? u.nickname : storage.getNickname();
    var avatarUrl = (loggedIn && u && u.avatarUrl) ? u.avatarUrl : storage.getAvatar();
    // 菜单里的「教材版本」带上当前选择，省得用户点进去才知道选的是哪个
    var bookLabel = bookNameOf(storage.getBook());
    // 全局年级：没有设置过就按第一个学段兜底（首次进关卡页时会强制选一次）
    var gradeKey = storage.getLastGrade() || constants.GRADES[0].key;
    var gradeLabel = gradeNameOf(gradeKey);
    var menu = MENU.map(function (m) {
      if (m.action === 'book') {
        // 初高中不细分版本（2026-10-18 拍板）：菜单直接写口径，别写成「通用词表」
        // 让人误以为「这里本来能选、只是我没选」。
        if (!constants.isBookSelectable(gradeKey)) {
          return Object.assign({}, m, { name: '教材版本 · 初高中统一（不区分）' });
        }
        // 2026-10-18：本年级没有该版本词条时直接在菜单里写出来，
        // 否则家长会以为"选了人教版就同步了"，实际还在用通用词表。
        var stat = dict.bookStat(gradeKey, storage.getBook());
        var suffix = stat.usingFallback ? '（本年级暂无）' : '';
        return Object.assign({}, m, { name: '教材版本 · ' + bookLabel + suffix });
      }
      if (m.action === 'grade') return Object.assign({}, m, { name: '当前年级 · ' + gradeLabel });
      return m;
    });
    // 按 group 聚合（顺序固定：成长 → 对战 → 学习）
    var groups = [];
    GROUP_ORDER.forEach(function (title) {
      var items = menu.filter(function (m) { return m.group === title; });
      if (items.length) groups.push({ title: title, items: items });
    });
    this.setData({
      loggedIn: loggedIn,
      nickname: nickname || '',
      avatarUrl: avatarUrl || '',
      menu: menu,
      gradeKey: gradeKey,
      gradeLabel: gradeLabel,
      menuGroups: groups
    });

    if (!loggedIn) return;

    // 段位/星数（失败静默，仅占位展示）
    var self = this;
    request.get('/api/rank/info').then(function (d) {
      if (!d) return;
      self.setData({
        rankName: d.rankName || '',
        // 段位徽章不再打进代码包（微信按「包内图片总量」判定），改走云托管 URL
        rankIcon: art.artUrl(d.icon),
        rankIconBig: art.artUrl(d.iconBig),
        wins: d.wins || 0,
        rankStars: d.stars || 0
      });
    }).catch(function () {});

  },

  /**
   * 版本号连点 5 次进管理后台（2026-09-13）：隐藏入口，普通用户不会误入；
   * 进去后还要输管理口令，服务端再校验一次（ADMIN_OPENIDS / ADMIN_PASSCODE）。
   */
  onVersionTap: function () {
    this._verTaps = (this._verTaps || 0) + 1;
    if (this._verTaps >= 5) {
      this._verTaps = 0;
      wx.navigateTo({ url: '/pages/admin/admin' });
      return;
    }
    if (this._verTaps >= 3) {
      wx.showToast({ title: '再点 ' + (5 - this._verTaps) + ' 次进入管理后台', icon: 'none', duration: 800 });
    }
  },

  /** 点段位 → 段位详情页（各段位门槛 + 距下一段还差多少星，第三批 · 第 8 条） */
  goRankInfo: function () {
    // rankStars = /api/rank/info 返回的云端口径累计星（与「我的」页展示同源）
    wx.navigateTo({ url: '/pages/rank-info/rank-info?stars=' + (this.data.rankStars || 0) });
  },

  // 段位小级徽章加载失败 → 回退到大段位图（72 张里缺某张时不出现裂图）
  onRankIconError: function () {
    if (this.data.rankIconBig && this.data.rankIcon !== this.data.rankIconBig) {
      this.setData({ rankIcon: this.data.rankIconBig });
    }
  },

  // 菜单点击
  onMenuTap: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (ds.action === 'book') {
      this.pickBook();
      return;
    }
    if (ds.action === 'grade') {
      this.setData({ gradePickerVisible: true });
      return;
    }
    var url = ds.url;
    if (!url) return;
    wx.navigateTo({ url: url });
  },

  /** 年级选择器：选中 → 写全局设置（storage: ww_last_grade）→ 刷新菜单文案 */
  onGradePick: function (e) {
    var key = (e && e.detail && e.detail.key) || '';
    if (!key) return;
    storage.setLastGrade(key);
    this.setData({ gradePickerVisible: false, gradeKey: key });
    this.refresh();
    wx.showToast({ title: '已切换到' + gradeNameOf(key), icon: 'none' });
  },
  openGradePicker: function () {
    this.setData({ gradePickerVisible: true });
  },
  onGradeClose: function () {
    this.setData({ gradePickerVisible: false });
  },

  /** 用户协议（2026-10-17 从菜单里移出，改成版本行旁的小字链接 —— 低频入口不该占 108rpx） */
  goAgreement: function () {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  /**
   * 选教材版本（2026-10-08 二期：教材对接）。
   *
   * 只影响「出题用哪套词表」：选了人教版且该年级已有 PEP 词条 → 用 PEP 词条；
   * 该年级 PEP 词条还不够 → 自动回退通用词表，并明确告诉用户，不让界面出现空白。
   *
   * 2026-10-18 全量审计后改：**按当前年级标出每个版本到底有多少词**。
   * 原来只列版本书名，家长无法判断"我家孩子这个年级到底同步没同步"：
   *   · 人教版 PEP 三年级起点 → 一、二年级本来就没有词条；
   *   · 外研版目前只有小学 1~6 年级词表；
   *   · 初高中暂无分版本词表（高考词汇统一，不做版本切分）。
   * 现在选项直接写「本年级 119 词 / 本年级暂无」，选到暂无的会说明回退原因。
   *
   * 2026-10-18 第二版（用户拍板）：初高中**不细分版本**，不给切换入口，
   * 只弹一段口径说明 —— 给一个「选了也不生效」的选项比不给更糟。
   */
  pickBook: function () {
    var self = this;
    var grade = storage.getLastGrade() || constants.GRADES[0].key;
    if (!constants.isBookSelectable(grade)) {
      wx.showModal({
        title: '教材版本',
        content: '初中、高中英语按中考 / 高考词汇统一出题，不区分教材版本，所以「'
          + gradeNameOf(grade) + '」没有版本可切。\n\n要把初高中拆到人教版 / 外研版，'
          + '需要先补齐这两个版本的初高中词表，词表到位后再放开。\n\n小学阶段（含学前）仍可切换人教版 PEP / 外研版。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    var books = constants.BOOKS.map(function (b) {
      var stat = dict.bookStat(grade, b.key);
      return { key: b.key, name: b.name, matched: stat.matched };
    });
    var itemList = books.map(function (b) {
      if (!b.key) return b.name;
      return b.name + (b.matched > 0 ? ' · 本年级 ' + b.matched + ' 词' : ' · 本年级暂无');
    });
    wx.showActionSheet({
      itemList: itemList,
      success: function (res) {
        var picked = books[res.tapIndex];
        if (!picked) return;
        storage.setBook(picked.key);
        dict.setBook(picked.key);
        var stat = dict.bookStat(grade, picked.key);
        self.refresh();
        var tip = !picked.key
          ? '已切换为通用词表'
          : (stat.usingFallback
            ? picked.name + ' 本年级词表尚未补齐，先用通用词表出题'
            : '已切换为 ' + picked.name + '（本年级 ' + stat.matched + ' 词）');
        wx.showToast({ title: tip, icon: 'none', duration: 2200 });
        // 云端同步（失败静默：本地已生效，换设备时再同步）
        if (auth.isLoggedIn()) {
          request.post('/api/user/book', { book: picked.key }).catch(function () {});
        }
      },
      fail: function () {}
    });
  },

  // 资料卡点击：游客 → 登录；已登录 → 编辑资料（昵称头像页）
  onProfileTap: function () {
    if (auth.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/nickname/nickname' });
      return;
    }
    this.goLogin();
  },

  // 资料卡「编辑」→ 昵称与头像页
  goNickname: function () {
    wx.navigateTo({ url: '/pages/nickname/nickname' });
  },

  // 未登录：资料卡登录按钮
  goLogin: function () {
    var self = this;
    auth.promptLogin('登录后可同步资料与进度').then(function (user) {
      if (user) self.refresh();
    });
  },

  // 退出登录（逻辑参照 pages/nickname/nickname.js goLogout）
  goLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新登录才能解锁全部关卡',
      confirmText: '退出',
      success: function (r) {
        if (!r.confirm) return;
        auth.logout();
        storage.setNickname('');
        storage.setAvatar('');
        wx.showToast({ title: '已退出', icon: 'none' });
        setTimeout(function () {
          wx.switchTab({ url: '/pages/index/index' });
        }, 700);
      }
    });
  },

  // 注销账号（双重确认 → 后端删全量数据 → 清本地态回首页）
  goDeleteAccount: function () {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    var self = this;
    wx.showModal({
      title: '注销账号',
      content: '注销将删除该账号的全部成绩、星级、错题、皮肤与成就数据，且不可恢复。确定注销吗？',
      confirmText: '注销',
      confirmColor: '#ff5a5a',
      success: function (r) {
        if (!r.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '删除后无法找回，是否继续？',
          confirmText: '确认注销',
          confirmColor: '#ff5a5a',
          success: function (r2) {
            if (r2.confirm) self._doDeleteAccount();
          }
        });
      }
    });
  },

  _doDeleteAccount: function () {
    wx.showLoading({ title: '注销中...' });
    request.post('/api/user/delete').then(function () {
      wx.hideLoading();
      auth.logout();
      storage.setNickname('');
      storage.setAvatar('');
      try { wx.clearStorageSync(); } catch (e) { /* 忽略 */ }
      wx.showToast({ title: '账号已注销', icon: 'none' });
      setTimeout(function () {
        wx.switchTab({ url: '/pages/index/index' });
      }, 900);
    }).catch(function (err) {
      wx.hideLoading();
      wx.showModal({
        title: '注销失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      });
    });
  },

  // M5 T4.1：我的页分享
  onShareAppMessage: function () {
    return {
      title: '词力战士 - 一边打怪兽一边记字词，学生党解压神器',
      path: '/pages/index/index'
    };
  }
});
