/**
 * game-hud —— 公共对局 HUD 组件（B5 外壳抽取）
 * 用法：
 *   <game-hud lives="{{lives}}" score="{{score}}" scoreText="{{scoreText}}"
 *             extra="{{hudText}}" />
 * 属性说明：
 *   lives   生命数(❤ 计数)
 *   score   分数（主数值，可空）
 *   scoreText 得分标签，如 '分'
 *   extra   右侧附加文案（如关卡/最高分/连击）
 * 事件：可扩展 bindpaused（保留位，页面自行实现暂停逻辑）。
 */
Component({
  properties: {
    lives: { type: Number, value: 3 },
    score: { type: Number, value: 0 },
    scoreText: { type: String, value: '分' },
    extra: { type: String, value: '' }
  },
  data: {},
  methods: {}
});
