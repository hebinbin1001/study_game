// 成就列表页（achievement）
//
// 职责：
//   1. 展示成就列表 + 解锁状态
//   2. 检查并解锁新成就

var request = require('../../utils/request');
var auth = require('../../utils/auth');

// 成就勋章 emoji 映射（服务端 icon 为占位路径，本地用 emoji 呈现勋章视觉；
// 未匹配 id 时回退默认奖牌）
var ACHIEVEMENT_EMOJI = {
  first_blood: '🥇',
  combo_master: '🔥',
  star_collector: '⭐',
  rank_bronze: '🛡️',
  rank_king: '👑',
  perfect_clear: '💯'
};
var DEFAULT_EMOJI = '🏅';

Page({
  data: {
    achievements: [],
    loading: false,
    unlockedCount: 0,      // 已解锁数量（页头总进度卡）
    totalCount: 0,         // 成就总数
    progressPercent: 0     // 收集进度百分比（0-100，模板预处理字段）
  },

  onShow: function () {
    this.loadAchievements();
  },

  // 加载成就列表
  loadAchievements: function () {
    var self = this;
    self.setData({ loading: true });

    request.get('/api/achievement/list').then(function (data) {
      var list = data || [];
      var viewList = [];
      var unlockedCount = 0;

      // 模板预处理：补充 emoji 勋章字段，统计解锁数（供总进度条展示）
      for (var i = 0; i < list.length; i++) {
        var ach = list[i];
        if (ach.unlocked) {
          unlockedCount++;
        }
        viewList.push({
          achievementId: ach.achievementId,
          name: ach.name,
          description: ach.description,
          icon: ach.icon,
          conditionType: ach.conditionType,
          conditionValue: ach.conditionValue,
          unlocked: ach.unlocked,
          emoji: ACHIEVEMENT_EMOJI[ach.achievementId] || DEFAULT_EMOJI
        });
      }

      var totalCount = list.length;
      var percent = totalCount > 0
        ? Math.round((unlockedCount / totalCount) * 100)
        : 0;

      self.setData({
        achievements: viewList,
        unlockedCount: unlockedCount,
        totalCount: totalCount,
        progressPercent: percent,
        loading: false
      });
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  // 检查解锁
  checkUnlock: function () {
    var self = this;
    request.post('/api/achievement/check', {}).then(function (data) {
      if (data.newlyUnlocked && data.newlyUnlocked.length > 0) {
        var names = data.newlyUnlocked.map(function (a) { return a.name; }).join('、');
        wx.showToast({ title: '解锁成就：' + names, icon: 'success' });
      }
      self.loadAchievements();
    }).catch(function () {
      // 检查解锁失败，静默忽略
    });
  },

  // 生成战绩分享卡（M6-K）：带昵称 + 段位 + 累计星 进入分享卡页
  goShareCard: function () {
    var self = this;
    var u = auth.getUser();
    var nickname = (u && u.nickname) || '';
    request.get('/api/rank/info').then(function (d) {
      self._openShareCard(nickname, (d && d.rankName) || '', (d && d.stars) || 0);
    }).catch(function () {
      self._openShareCard(nickname, '', 0);
    });
  },

  _openShareCard: function (nickname, rankName, stars) {
    var q =
      'nickname=' + encodeURIComponent(nickname || '') +
      '&rankName=' + encodeURIComponent(rankName || '') +
      '&stars=' + (parseInt(stars, 10) || 0);
    wx.navigateTo({ url: '/pages/share-card/share-card?' + q });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});