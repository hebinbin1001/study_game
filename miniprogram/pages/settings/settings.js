// 设置页（2026-10-28，2026-10-28 补字号）
//
// 只做**能立刻生效、且不会丢数据**的四件事：
//   1. 声音开关 —— 与首页 HUD 喇叭共用 STORAGE_KEYS.sound，改一处两处都变；
//   2. 字号三档 —— 只改 --fs-scale 倍数，见 utils/font-scale.js；
//   3. 清理临时缓存 —— 只清「上局错题」「玩法计数」这类可重建的本地缓存，
//      **不动**登录态、星星存档、皮肤；清了这些用户会以为「进度没了」；
//   4. 关于（版本 / 协议入口）。
//
// 字号这一项是等「令牌收口」做完才加的：先把全站 794 处写死字号的 font-size
// 换成 var(--fs-*)，否则开关只会让一半文字变大，变成半成品。

var storage = require('../../utils/storage');
var constants = require('../../utils/constants');
var audio = require('../../game/audio');
var fontScale = require('../../utils/font-scale');

// 可安全清理的临时缓存：都能从服务端或下一次操作重新生成
var TEMP_KEYS = [
  'ww_last_wrong',   // 上一局的错题回顾（结算页读完就该消失的中间态）
  'ww_play_counts'   // 玩法次数（首页「推荐玩法」排序用，清了下局重新累计）
];

Page({
  data: {
    soundOn: true,
    version: '开发版',
    fontKey: 'm',
    fontLevels: fontScale.LEVELS
  },

  onShow: function () {
    this.setData({
      // 与其他页面同一口径：只有明确写 '0' 才算关闭，缺失按默认开
      soundOn: storage.get(constants.STORAGE_KEYS.sound) !== '0',
      fontKey: fontScale.current()
    });
    this._readVersion();
  },

  /** 线上版取微信给的版本号；开发版/体验版这里是空串 */
  _readVersion: function () {
    var v = '';
    try {
      var info = wx.getAccountInfoSync();
      v = (info && info.miniProgram && info.miniProgram.version) || '';
    } catch (e) {
      v = '';
    }
    this.setData({ version: v || '开发版' });
  },

  goBack: function () {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/me/me' });
      }
    });
  },

  toggleSound: function (e) {
    var on = !!(e.detail && e.detail.value);
    storage.set(constants.STORAGE_KEYS.sound, on ? '1' : '0');
    // 同步运行时状态：game/audio 的开关是内存变量，只落盘不改内存要等下次启动才生效
    audio.setSoundEnabled(on);
    this.setData({ soundOn: on });
  },

  /**
   * 切换字号档位。
   * 除了落盘，还要当场把本页的 fsStyle 改掉 —— 全局那层只在 onShow 时重算，
   * 而「在设置页改字号」不会触发自己的 onShow，不手动 setData 就会出现
   * 「别的页面变了、当前这页没变」，用户会以为没生效。
   */
  pickFont: function (e) {
    var key = String((e.currentTarget.dataset || {}).key || '');
    if (!fontScale.set(key)) return;
    this.setData({ fontKey: key, fsStyle: fontScale.styleOf(key) });
  },

  clearCache: function () {
    wx.showModal({
      title: '清理临时缓存',
      content: '只清理「上局错题」「玩法次数」这类临时数据，不会影响你的星星、段位、皮肤和登录状态。',
      confirmText: '清理',
      success: function (r) {
        if (!r.confirm) return;
        TEMP_KEYS.forEach(function (k) {
          storage.remove(k);
        });
        wx.showToast({ title: '已清理', icon: 'none' });
      }
    });
  },

  openAgreement: function () {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  }
});
