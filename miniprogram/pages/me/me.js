// 个人中心页（M6-N）：资料卡 + 功能菜单 + 退出/注销
var storage = require('../../utils/storage');
var request = require('../../utils/request');
var auth = require('../../utils/auth');
var art = require('../../utils/art');

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
      { emoji: '📖', name: '错题本', url: '/pages/wrong-book/wrong-book' },
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
    this.setData({
      loggedIn: loggedIn,
      nickname: nickname || '',
      avatarUrl: avatarUrl || ''
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
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url: url });
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
