/**
 * settle-pop —— 公共结算弹层（B5 外壳抽取）
 * 用法：
 *   <settle-pop visible="{{settle}}" win="{{win}}" starsText="{{starsText}}"
 *               title="{{titleText}}" msg="{{msgText}}">
 *     <!-- 可选：自定义操作按钮区（默认给「再来一次」） -->
 *   </settle-pop>
 * 属性：
 *   visible / win / starsText(如 ⭐⭐⭐，失败传空) / title / msg
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
    showRetry: { type: Boolean, value: true }
  },
  data: {},
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },
    onTapBubble() {
      // 阻止冒泡
    }
  }
});
