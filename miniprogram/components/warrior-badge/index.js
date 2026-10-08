/**
 * 战士徽章（2026-10-08）—— 玩法页顶部常驻的「我的战士」小立绘
 *
 * 为什么做这个（用户反馈）：「很多皮肤感觉只有在字母射击才能用，其他游戏都用不上」。
 * 根因不是皮肤没接，而是**其他玩法界面里压根没有角色的位置**（连连看、24 点里谁站哪？）。
 * 这个徽章就是给所有玩法一个统一的落点：
 *   · 抬眼就能看到自己的战士 —— 皮肤才有「这是我的」的归属感；
 *   · 点一下直接去换皮肤 —— 「想换」的念头随时能落地。
 *
 * 为什么做成组件而不是把 wxml 复制十几份：以后调样式只改这一处。
 */
'use strict';

var storage = require('../../utils/storage');
var skins = require('../../utils/skins');

Component({
  properties: {
    /** 尺寸档位：sm（HUD 旁，默认）/ md（结算页这类更大的位置） */
    size: { type: String, value: 'sm' },
    /**
     * 是否固定在页面右上角。
     * 玩法页用它一行接入（不用各页自己写定位样式）；结算页这类要参与布局的地方传 false。
     */
    fixed: { type: Boolean, value: false }
  },

  data: {
    image: '',          // 立绘 URL（CDN 或包内兜底两张之一）
    emoji: '⚔️',        // 图挂了 / 没选皮肤时的兜底
    color: ''
  },

  attached: function () {
    this.refresh();
  },

  // 从皮肤页返回时要跟着变 —— 不然换完皮肤发现徽章还是旧的，很出戏
  pageLifetimes: {
    show: function () {
      this.refresh();
    }
  },

  methods: {
    refresh: function () {
      var id = storage.getWarriorSkin();
      var w = skins.getWarriorSkin(id);
      this.setData({
        image: (w && w.image) || '',
        emoji: (w && w.emoji) || '⚔️',
        color: (w && w.color) || ''
      });
    },

    onTap: function () {
      wx.navigateTo({ url: '/pages/avatar/avatar' });
    },

    /** 立绘加载失败（离线 / CDN 抖动）→ 退回 emoji，不留白块 */
    onImgError: function () {
      this.setData({ image: '' });
    }
  }
});
