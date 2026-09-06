// 形象选择页（avatar）
//
// 职责：
//   1. 展示战士/怪兽形象列表，显示已解锁状态
//   2. 解锁形象（检查段位/星数条件）
//   3. 使用当前形象

var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    warriors: [],
    monsters: [],
    currentWarrior: '',
    currentMonster: '',
    rankInfo: null,
    loading: false
  },

  onShow: function () {
    this.loadAvatars();
    this.loadRankInfo();
  },

  // 加载形象列表
  loadAvatars: function () {
    var self = this;
    self.setData({ loading: true });

    request.get('/api/avatar/list').then(function (res) {
      if (res.code === 0 && res.data) {
        var warriors = res.data.warriors || [];
        var monsters = res.data.monsters || [];

        // 获取当前使用的形象
        var currentWarrior = warriors.find(function (w) { return w.currentUsed; });
        var currentMonster = monsters.find(function (m) { return m.currentUsed; });

        self.setData({
          warriors: warriors,
          monsters: monsters,
          currentWarrior: currentWarrior ? currentWarrior.avatarId : '',
          currentMonster: currentMonster ? currentMonster.avatarId : '',
          loading: false
        });
      } else {
        self.setData({ loading: false });
      }
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  // 加载段位信息
  loadRankInfo: function () {
    var self = this;
    request.get('/api/rank/info').then(function (res) {
      if (res.code === 0 && res.data) {
        self.setData({ rankInfo: res.data });
      }
    });
  },

  // 解锁形象
  unlockAvatar: function (e) {
    var avatarId = e.currentTarget.dataset.avatarId;
    var self = this;

    wx.showModal({
      title: '解锁形象',
      content: '确定要解锁这个形象吗？',
      success: function (modalRes) {
        if (!modalRes.confirm) return;

        request.post('/api/avatar/unlock', { avatarId: avatarId }).then(function (res) {
          if (res.code === 0) {
            wx.showToast({ title: '解锁成功', icon: 'success' });
            self.loadAvatars();
          } else {
            wx.showToast({ title: res.message || '解锁失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 使用形象
  useAvatar: function (e) {
    var avatarId = e.currentTarget.dataset.avatarId;
    var self = this;

    request.post('/api/avatar/use', { avatarId: avatarId }).then(function (res) {
      if (res.code === 0) {
        wx.showToast({ title: '已使用', icon: 'success' });
        self.loadAvatars();
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});