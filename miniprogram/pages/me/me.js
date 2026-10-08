// 个人中心页（M6-N）：资料卡 + 功能菜单 + 退出/注销
var storage = require('../../utils/storage');
var request = require('../../utils/request');
var auth = require('../../utils/auth');
var art = require('../../utils/art');
var constants = require('../../utils/constants');
var dict = require('../../utils/dict');

/** 教材版本 key → 展示名 */
function bookNameOf(key) {
  for (var i = 0; i < constants.BOOKS.length; i++) {
    if (constants.BOOKS[i].key === String(key || '')) return constants.BOOKS[i].name;
  }
  return constants.BOOKS[0].name;
}

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
    menu: [
      // 注：原先这里还有一条「昵称与头像」，但它与资料卡上的「编辑」指向同一个页面，
      // 属于重复入口（需求 ③），已移除 —— 改资料统一走资料卡的「编辑」。
      { emoji: '👗', name: '我的形象 · 皮肤', url: '/pages/avatar/avatar' },
      { emoji: '🏆', name: '排行榜', url: '/pages/rank/rank' },
      // 2026-10-08 新增三件套：每日挑战赛 / 赛季 / 好友 PK
      { emoji: '🎯', name: '每日挑战赛', url: '/pages/daily-challenge/daily-challenge' },
      { emoji: '🏅', name: '赛季', url: '/pages/season/season' },
      { emoji: '🤝', name: '好友 PK', url: '/pages/pk/pk' },
      { emoji: '📖', name: '错题本', url: '/pages/wrong-book/wrong-book' },
      // 教材版本（2026-10-08 二期）：只影响英语出题用哪套词表，不上榜、不影响进度
      { emoji: '📚', name: '教材版本', action: 'book' },
      { emoji: '🏅', name: '成就勋章', url: '/pages/achievement/achievement' },
      { emoji: '📄', name: '用户协议与隐私政策', url: '/pages/agreement/agreement' }
    ]
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
    var menu = this.data.menu.map(function (m) {
      if (m.action === 'book') return Object.assign({}, m, { name: '教材版本 · ' + bookLabel });
      return m;
    });
    this.setData({
      loggedIn: loggedIn,
      nickname: nickname || '',
      avatarUrl: avatarUrl || '',
      menu: menu
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
    var url = ds.url;
    if (!url) return;
    wx.navigateTo({ url: url });
  },

  /**
   * 选教材版本（2026-10-08 二期：教材对接）。
   *
   * 只影响「出题用哪套词表」：选了人教版且该年级已有 PEP 词条 → 用 PEP 词条；
   * 该年级 PEP 词条还不够 → 自动回退通用词表，并明确告诉用户，不让界面出现空白。
   */
  pickBook: function () {
    var self = this;
    var books = constants.BOOKS.map(function (b) {
      return { key: b.key, name: b.name };
    });
    wx.showActionSheet({
      itemList: books.map(function (b) { return b.name; }),
      success: function (res) {
        var picked = books[res.tapIndex];
        if (!picked) return;
        storage.setBook(picked.key);
        dict.setBook(picked.key);
        var grade = storage.getLastGrade() || constants.GRADES[0].key;
        var stat = dict.bookStat(grade, picked.key);
        self.refresh();
        var tip = picked.key && stat.usingFallback
          ? '已选 ' + picked.name + '，该年级词表补充中，先用通用词表'
          : '已切换为 ' + picked.name;
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
