var audio = require('../../game/audio');
var uiIcons = require('../../utils/ui-icons');

/**
 * settle-pop —— 公共结算弹层（B5 外壳抽取）
 * 用法：
 *   <settle-pop visible="{{settle}}" win="{{win}}" starsText="{{starsText}}"
 *               title="{{titleText}}" msg="{{msgText}}">
 *     <!-- 可选：自定义操作按钮区（默认给「再来一次」） -->
 *   </settle-pop>
 * 属性：
 *   visible / win / starsText(如 ⭐⭐⭐，失败传空) / title / msg
 *   showNext / nextText —— 通关且还有下一关时显示「下一关 ▶」，点击触发事件 next
 * 默认按钮：visible && !win 时显示「再来一次」触发事件 retry；
 * 自定义操作由页面放内容在插槽里，或监听 bind:retry。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    win: { type: Boolean, value: false },
    starsText: { type: String, value: '' },
    title: { type: String, value: '' },
    msg: { type: String, value: '' },
    // 2026-10-17：「差一点」提示（如「再答对 1 题就是 3 星」），由页面用 utils/challenge.starHint 算好传入
    hint: { type: String, value: '' },
    showRetry: { type: Boolean, value: true },
    // 2026-09-18：通关后提示「下一关」——由页面传入是否还有下一关
    showNext: { type: Boolean, value: false },
    // 2026-10-18：页面在插槽里自己给全套按钮时置 true —— 组件不再追加「再玩一次」，
    // 否则会出现「再玩一次 + 重玩本关」两个同义按钮（华容道通关后就是这样）
    customOps: { type: Boolean, value: false },
    nextText: { type: String, value: '' }
  },
  data: {
    icons: {}
  },
  lifetimes: {
    attached: function () {
      this.setData({ icons: uiIcons.urls() });
    }
  },
  methods: {
    onRetry() {
      audio.playUiNext();
      this.triggerEvent('retry');
    },
    onNext() {
      audio.playUiNext();
      this.triggerEvent('next');
    },
    onTapBubble() {
      // 阻止冒泡
    }
  }
});
