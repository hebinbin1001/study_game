/**
 * grade-picker —— 全局年级选择器（2026-10-18）
 *
 * 背景：年级原来是「关卡页 14 个 tab / 玩法页 chips / 词库页 tab」各选一次，
 * 三处状态还会不一致。现在年级收敛成一个全局学习设置（storage: ww_last_grade），
 * 这个组件就是唯一的选择界面，由「我的 → 当前年级」和页面里的年级文字共同调用。
 *
 * 用法：
 *   <grade-picker visible="{{gradePickerVisible}}" value="{{gradeKey}}"
 *                 bind:pick="onGradePick" bind:close="onGradeClose" />
 * 事件：
 *   pick  detail = { key }  —— 选中某个年级（组件自己不写 storage，由页面统一处理）
 *   close —— 取消/点遮罩
 */
var constants = require('../../utils/constants');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    value: { type: String, value: '' }
  },
  data: {
    grades: []
  },
  lifetimes: {
    attached: function () {
      this.setData({
        grades: (constants.GRADES || []).map(function (g) {
          return { key: g.key, label: g.label };
        })
      });
    }
  },
  methods: {
    onPick: function (e) {
      var key = e.currentTarget.dataset.key;
      if (!key) return;
      this.triggerEvent('pick', { key: key });
    },
    onClose: function () {
      this.triggerEvent('close');
    },
    // 阻止点内容区时冒泡到遮罩
    noop: function () {}
  }
});
