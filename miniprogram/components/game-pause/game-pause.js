/**
 * game-pause —— 统一「暂停 / 音效」组件（2026-10-18，UI 优化清单 ②）
 *
 * 为什么抽组件：16 个玩法页原来只有字母射击能暂停，其余页面切后台计时还在跑、
 * 想歇一下只能退出（退出就丢进度）。逐页复制一套暂停逻辑既容易写歪，音效开关也会
 * 各存各的。这里把「按钮 + 遮罩 + 音效开关」收成一份。
 *
 * 用法（页面里放在对局分支内，只有对局时才出现）：
 *   <game-pause open="{{paused}}" sub="{{levelName}}"
 *     bind:pause="onGamePause" bind:resume="onGameResume"
 *     bind:restart="onGameRestart" bind:quit="onGameQuit" />
 *
 * 事件：
 *   pause    —— 点了暂停（页面在这里停计时器）
 *   resume   —— 点「继续游戏」
 *   restart  —— 点「重新开始」（页面自己重开本关）
 *   quit     —— 点「退出本关」（页面自己 navigateBack）
 *   soundchange { on } —— 音效开关变化（页面一般不用管，组件已写 storage + audio）
 *
 * 音效开关由组件自己落盘（constants.STORAGE_KEYS.sound），并与 game/audio 的
 * setSoundEnabled 同步 —— 全 App 只有这一个口径。
 *
 * 样式：按钮固定在**右上角**（原生导航栏下方），64rpx，半透明白底 + 投影。
 * 页面若在这个位置有 HUD，给 HUD 加 padding-right: 84rpx 让开（见各页 wxss 注释）。
 */
var storage = require('../../utils/storage');
var constants = require('../../utils/constants');
var audio = require('../../game/audio');

Component({
  properties: {
    // 页面控制的打开状态（切后台自动暂停时，页面把它置 true）
    open: { type: Boolean, value: false },
    // 弹层副标题，如「第 3 关 · 27 步」
    sub: { type: String, value: '' },
    // 是否显示按钮（对局中才显示）
    showFab: { type: Boolean, value: true }
  },

  data: {
    show: false,
    sound: true
  },

  observers: {
    open: function (v) {
      if (v) this.setData({ show: true });
    }
  },

  lifetimes: {
    attached: function () {
      var on = storage.get(constants.STORAGE_KEYS.sound) !== '0';
      this.setData({ sound: on });
      audio.setSoundEnabled(on);
    }
  },

  methods: {
    /** 点右上角 ⏸ */
    onOpen: function () {
      this.setData({ show: true });
      this.triggerEvent('pause');
    },

    onResume: function () {
      this.setData({ show: false });
      this.triggerEvent('resume');
    },

    onRestart: function () {
      this.setData({ show: false });
      this.triggerEvent('restart');
    },

    onQuit: function () {
      this.setData({ show: false });
      this.triggerEvent('quit');
    },

    /** 音效开关：落盘 + 同步 audio 模块（全 App 同一口径） */
    onToggleSound: function () {
      var next = !this.data.sound;
      storage.set(constants.STORAGE_KEYS.sound, next ? '1' : '0');
      audio.setSoundEnabled(next);
      this.setData({ sound: next });
      if (next) audio.playCorrect();     // 开的时候响一声，让用户确认生效
      this.triggerEvent('soundchange', { on: next });
    },

    /** 弹层内的空点击不冒泡到页面 */
    noop: function () {}
  }
});
