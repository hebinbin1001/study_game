/**
 * 通用战斗反馈层：冲刺、斩击、Boss 反击、终结技。
 * 只负责短动画，不参与玩法判定；页面通过递增 trigger 重播。
 */
'use strict';

var skins = require('../../utils/skins');
var storage = require('../../utils/storage');
var art = require('../../utils/art');

Component({
  properties: {
    trigger: { type: Number, value: 0 },
    mode: { type: String, value: 'attack' },
    text: { type: String, value: '' },
    // Boss 在屏幕中的实际中心坐标（px）。页面每次出招时传入，实现真正冲锋到目标。
    targetX: { type: Number, value: 0 },
    targetY: { type: Number, value: 0 },
    // 玩家起始位置；Boss 反击时会从 target 冲刺到这里。
    playerX: { type: Number, value: 0 },
    playerY: { type: Number, value: 0 },
    bossImg: { type: String, value: '' },
    bossEmoji: { type: String, value: '👾' },
    // 有真实战斗角色的页面直接移动页面节点，组件只保留刀光/冲击，避免出现虚影。
    useOwnHero: { type: Boolean, value: false },
    useOwnBoss: { type: Boolean, value: false }
  },

  data: {
    show: false,
    modeClass: 'attack',
    warriorImg: '',
    warriorEmoji: '🛡',
    bossImgOk: true,
    textSafe: '',
    skinFx: 'steel',
    targetStyle: ''
  },

  observers: {
    targetX: function () { this._syncTarget(); },
    targetY: function () { this._syncTarget(); },
    playerX: function () { this._syncTarget(); },
    playerY: function () { this._syncTarget(); },
    trigger: function (value) {
      if (!value) return;
      this._play();
    }
  },

  lifetimes: {
    attached: function () {
      var skin = skins.getWarriorSkin(storage.getWarriorSkin());
      var id = String((skin && skin.id) || 'warrior_01');
      var fx = 'steel';
      if (/lion|bear|king/.test(id)) fx = 'beast';
      else if (/fox|eagle|wolf|gale|ninja/.test(id)) fx = 'wind';
      else if (/thunder|storm/.test(id)) fx = 'thunder';
      else if (/flame|phoenix|glory|magma/.test(id)) fx = 'flame';
      else if (/dino|sprout|ocean|tide|druid/.test(id)) fx = 'nature';
      else if (/owl|scholar|page/.test(id)) fx = 'arcane';
      else if (/radiant|gold|paladin|silver/.test(id)) fx = 'shine';
      this.setData({
        warriorImg: art.artUrl(skin.image || ''),
        warriorEmoji: skin.emoji || '🛡',
        skinFx: fx,
        skinColor: (skin && skin.color) || '#8bdfff'
      });
      this._syncTarget();
    },

    detached: function () {
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  },

  methods: {
    _syncTarget: function () {
      var info = {};
      try {
        info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
      } catch (e) {
        info = {};
      }
      var vw = Number(info.windowWidth) || 375;
      var vh = Number(info.windowHeight) || 812;
      var x = Number(this.data.targetX) || vw * .5;
      var y = Number(this.data.targetY) || vh * .42;
      var px = Number(this.data.playerX) || vw * .5;
      var py = Number(this.data.playerY) || vh * .82;
      this.setData({
        targetStyle: '--target-x:' + Math.round(x) + 'px;'
          + '--target-y:' + Math.round(y) + 'px;'
          + '--player-x:' + Math.round(px) + 'px;'
          + '--player-y:' + Math.round(py) + 'px;'
          + '--hero-start-x:' + Math.round(px - x) + 'px;'
          + '--hero-start-y:' + Math.round(py - y) + 'px;'
          + '--boss-dx:' + Math.round((px - x) * .78) + 'px;'
          + '--boss-dy:' + Math.round((py - y) * .78) + 'px;'
          + '--skin-color:' + (this.data.skinColor || '#f4df78') + ';'
      });
    },

    _play: function () {
      if (this._hideTimer) clearTimeout(this._hideTimer);
      var mode = this.data.mode;
      var safeMode = ['attack', 'counter', 'finish'].indexOf(mode) >= 0 ? mode : 'attack';
      var duration = safeMode === 'finish' ? 860 : (safeMode === 'counter' ? 480 : 620);
      var self = this;
      this._syncTarget();
      this.setData({
        show: false,
        modeClass: safeMode,
        textSafe: this.data.text || '',
        targetStyle: this.data.targetStyle
      }, function () {
        self.setData({ show: true });
      });
      this._hideTimer = setTimeout(function () {
        self.setData({ show: false });
        self._hideTimer = null;
      }, duration);
    },

    onWarriorImgError: function () {
      this.setData({ warriorImg: '' });
    },

    onBossImgError: function () {
      this.setData({ bossImgOk: false });
    }
  }
});
