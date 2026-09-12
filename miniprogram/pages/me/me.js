// 个人中心页（M6-N）：资料卡 + 功能菜单 + 退出/注销
var storage = require('../../utils/storage');
var request = require('../../utils/request');
var auth = require('../../utils/auth');

Page({
  data: {
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    rankName: '',     // 段位（/api/rank/info，失败静默占位）
    rankIcon: '',     // 段位徽章图（assets/ranks/*.png，后端按当前小级返回）
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
        rankIcon: d.icon || '',
        wins: d.wins || 0,
        rankStars: d.stars || 0
      });
    }).catch(function () {});
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
  }
});
