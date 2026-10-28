/**
 * how-to-play —— 玩法操作引导（2026-10-28）
 *
 * 解决什么：字母射击有 3 步教程（game.js 的 TUTORIAL_STEPS），其余 20 款玩法
 * 新用户点进去只能靠猜。碎片场景里「猜规则」的成本极高——猜错一次就退出了。
 *
 * 用法：在玩法页 wxml 末尾加一行，json 里注册组件即可，页面 js 不用改：
 *   <how-to-play game="klotski" />
 *
 * 展示策略：
 *   · 每款玩法只弹一次（storage 里 ww_howto_<key>），标记在**展示时**就写，
 *     而不是关闭时——用户看到卡片直接杀进程，下次也不该再来一遍；
 *   · 延迟 400ms 再弹：等页面首帧画完，否则遮罩会先盖在空白上；
 *   · 没有登记文案的玩法直接不弹（宁可不提示，也不弹一张空卡）。
 *
 * 文案在 utils/game-howto.js（数据与展示分离，改文案不用碰 21 个页面）。
 */
var storage = require('../../utils/storage');
var howto = require('../../utils/game-howto');

Component({
  properties: {
    /** 玩法 key，同 utils/game-catalog.js */
    game: { type: String, value: '' },
    /** 延迟毫秒（默认 400ms） */
    delay: { type: Number, value: 400 }
  },

  data: {
    show: false,
    ic: '',
    t: '',
    tips: []
  },

  lifetimes: {
    attached: function () {
      this._prepare();
    },
    detached: function () {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    }
  },

  methods: {
    _prepare: function () {
      var key = String(this.data.game || '');
      if (!key) return;
      var h = howto.get(key);
      if (!h) return;

      var doneKey = 'ww_howto_' + key;
      try {
        if (storage.get(doneKey)) return;
      } catch (e) { /* 读不到就当没看过，弹一次也无害 */ }

      var self = this;
      var wait = Math.max(0, parseInt(this.data.delay, 10) || 0);
      this._timer = setTimeout(function () {
        self._timer = null;
        self.setData({ show: true, ic: h.ic, t: h.t, tips: h.tips });
        try { storage.set(doneKey, '1'); } catch (e) {}
      }, wait);
    },

    close: function () {
      this.setData({ show: false });
    },

    /** catchtouchmove 需要一个真实方法，空绑会在 taps 检查里报错 */
    noop: function () {}
  }
});
