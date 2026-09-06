// 形象选择页（avatar）
//
// 职责：
//   1. 展示战士/怪兽形象（皮肤）列表，显示已解锁与使用中状态
//   2. 解锁形象（后端校验星数/段位条件）
//   3. 使用形象：本地立即生效（离线可用）+ 后端同步
//
// 皮肤系统改造说明：
//   - 后端 icon 为 /assets/avatars/*.png（素材暂缺），改用 utils/skins.js 的 emoji 占位；
//   - 后端不可达（离线 / 无 openid）时，用 skins.LOCAL_SKINS 兜底展示（仅 free 解锁）；
//   - 「使用」先写本地存储（ww_warrior_skin / ww_boss_skin），游戏页据此离线渲染皮肤。

var request = require('../../utils/request');
var storage = require('../../utils/storage');
var skins = require('../../utils/skins');

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

  // 给后端返回的形象项附加 emoji 与稀有度中文标签
  _decorate: function (item) {
    return Object.assign({}, item, {
      emoji: skins.getSkinRender(item.avatarId).emoji,
      rarityLabel: skins.getRarity(item.rarity).label
    });
  },

  // 从列表中找 currentUsed 项
  _findCurrent: function (list) {
    var cur = '';
    (list || []).forEach(function (it) {
      if (it.currentUsed) cur = it.avatarId;
    });
    return cur;
  },

  // 加载形象列表
  loadAvatars: function () {
    var self = this;
    self.setData({ loading: true });

    request.get('/api/avatar/list').then(function (data) {
      var warriors = (data.warriors || []).map(function (it) { return self._decorate(it); });
      var monsters = (data.monsters || []).map(function (it) { return self._decorate(it); });

      self.setData({
        warriors: warriors,
        monsters: monsters,
        currentWarrior: self._findCurrent(warriors),
        currentMonster: self._findCurrent(monsters),
        loading: false
      });
    }).catch(function () {
      // 后端不可达（离线/无 openid）：用本地清单兜底，避免皮肤页空白
      self.setData({ loading: false });
      self._loadLocalFallback();
    });
  },

  // 本地兜底：仅 free 解锁；使用中状态取本地存储
  _loadLocalFallback: function () {
    var self = this;
    var localWarrior = storage.getWarriorSkin();
    var localBoss = storage.getBossSkin();
    var warriors = [];
    var monsters = [];

    skins.LOCAL_SKINS.forEach(function (s) {
      var item = {
        avatarId: s.avatarId,
        name: s.name,
        rarity: s.rarity,
        rarityLabel: skins.getRarity(s.rarity).label,
        emoji: s.emoji,
        unlockType: s.unlockType,
        unlockValue: s.unlockValue,
        unlocked: s.unlockType === 'free',
        currentUsed: (s.avatarId === localWarrior) || (s.avatarId === localBoss)
      };
      if (s.type === 'warrior') {
        warriors.push(item);
      } else {
        monsters.push(item);
      }
    });

    self.setData({
      warriors: warriors,
      monsters: monsters,
      currentWarrior: localWarrior,
      currentMonster: localBoss
    });
  },

  // 加载段位信息（/api/rank/info 为段位信息接口，路径正确）
  loadRankInfo: function () {
    var self = this;
    request.get('/api/rank/info').then(function (data) {
      self.setData({ rankInfo: data });
    }).catch(function () {
      // 段位信息获取失败，静默降级
    });
  },

  // 解锁形象（后端校验星数/段位）
  unlockAvatar: function (e) {
    var avatarId = e.currentTarget.dataset.avatarId;
    var self = this;

    wx.showModal({
      title: '解锁形象',
      content: '确定要解锁这个形象吗？',
      success: function (modalRes) {
        if (!modalRes.confirm) return;

        request.post('/api/avatar/unlock', { avatarId: avatarId }).then(function () {
          wx.showToast({ title: '解锁成功', icon: 'success' });
          self.loadAvatars();
        }).catch(function (err) {
          wx.showToast({ title: err.message || '解锁失败', icon: 'none' });
        });
      }
    });
  },

  // 使用形象：本地立即生效（离线可用）+ 后端同步（失败静默降级）
  useAvatar: function (e) {
    var avatarId = e.currentTarget.dataset.avatarId;
    var self = this;

    // 本地立即生效：写本地存储 + 更新使用中标记
    if (avatarId.indexOf('warrior_') === 0) {
      storage.setWarriorSkin(avatarId);
      self.setData({ currentWarrior: avatarId });
      self._markCurrent('warriors', avatarId);
    } else if (avatarId.indexOf('monster_') === 0) {
      storage.setBossSkin(avatarId);
      self.setData({ currentMonster: avatarId });
      self._markCurrent('monsters', avatarId);
    }

    // 后端同步（失败静默：本地已生效，下次联网可重新同步）
    request.post('/api/avatar/use', { avatarId: avatarId }).then(function () {
      wx.showToast({ title: '已使用', icon: 'success' });
    }).catch(function () {
      wx.showToast({ title: '已使用（离线）', icon: 'success' });
    });
  },

  // 更新某列表中 currentUsed 标记（仅保留目标项）
  _markCurrent: function (key, avatarId) {
    var list = this.data[key].map(function (it) {
      return Object.assign({}, it, { currentUsed: it.avatarId === avatarId });
    });
    var patch = {};
    patch[key] = list;
    this.setData(patch);
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});
