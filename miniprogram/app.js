// app.js —— 词力战士（Word Warrior）小程序入口
//
// 职责：
//   1. 初始化全局数据 globalData（用户 openid、昵称、头像、词库缓存）
//   2. onLaunch 中做基础库版本（SDKVersion）兼容检测（REQ-NFR-3）
//   3. 接线后端地址（REQ-API-5）：setBaseUrl 注入云托管域名
//   4. openid 获取占位（M1 降级：未取得时请求不携带并打 warning，不阻塞主流程）
//   5. onShow 回到前台时 flush 离线滞留成绩队列（REQ-NFR-2）

// 目标最低基础库版本（Canvas 2D 新接口要求，REQ-NFR-3）
const MIN_SDK_VERSION = '2.9.0';

// 云托管后端基础地址（REQ-API-5）。
// TODO(替换)：在「微信云托管控制台」为当前环境开通后，将默认域名填到此处，
//   例如 const API_BASE_URL = 'https://your-env-id-xxxx.ap-shanghai.app.tcloudbase.com';
// 留空时回退 utils/request.js 内 detectEnvVersion() 推断的占位；develop 环境默认
// 不发外网请求、由调用方本地入队降级，保证离线可玩不报错。
const API_BASE_URL = '';

var request = require('./utils/request');
var storage = require('./utils/storage');

App({
  // 全局共享数据
  globalData: {
    openid: '',        // 用户微信 openid（登录态获取后填充）
    nickname: '',      // 用户昵称（来自本地存储 ww_nickname）
    avatarUrl: '',     // 用户头像地址（来自本地存储 ww_avatar）
    wordCache: null    // 词库缓存（后续按学段装载后填充，避免重复加载）
  },

  // wx.cloud.init 已执行标记（幂等，防止重复 init）
  _cloudInited: false,

  onLaunch() {
    // 1. 接线后端地址（REQ-API-5，见文件头 TODO 替换真实域名）
    request.setBaseUrl(API_BASE_URL);

    // 2. openid 获取占位（M1 降级实现，见 initOpenid）
    this.initOpenid();

    // 3. 基础库版本兼容检测（低于 2.9.0 提示升级，REQ-NFR-3）
    this.checkSDKVersion();
  },

  onShow() {
    // 回到前台：补发离线滞留成绩队列（REQ-NFR-2）。
    // 单条上报成功即从队列移除；失败保留等待下次（onShow/成绩页成功后）重试。
    // flush 内部自带防并发锁，此处无需额外节流；catch 兜底确保不抛错。
    storage.flushPendingScores(function (score) {
      return request.post('/api/score', score);
    }).catch(function () {
      // 补发失败（网络未恢复等）：静默，下次 onShow 再试
    });
  },

  // 检查基础库版本，低于阈值时提示用户升级微信
  checkSDKVersion() {
    let sdkVersion = '';
    try {
      const info = wx.getSystemInfoSync();
      sdkVersion = info.SDKVersion || '';
    } catch (e) {
      // 获取失败时不做阻断，静默跳过
      return;
    }

    if (sdkVersion && this.compareVersion(sdkVersion, MIN_SDK_VERSION) < 0) {
      wx.showModal({
        title: '版本过低',
        content: '当前微信版本过低，可能无法正常游玩，请升级微信后再试。',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  // 版本号比较：v1 > v2 返回 1，v1 == v2 返回 0，v1 < v2 返回 -1
  compareVersion(v1, v2) {
    const a = String(v1).split('.');
    const b = String(v2).split('.');
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const x = parseInt(a[i] || '0', 10);
      const y = parseInt(b[i] || '0', 10);
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  },

  // openid 获取（M1 占位稳健实现，REQ-API-5）。
  // 说明：
  //   1. 微信云托管真实部署时，网关在转发请求时自动注入 x-wx-openid 头，
  //      前端通常无需自行换取 openid（utils/request.js 仅在已取得时附带）。
  //   2. 若工程接入微信云开发（wx.cloud），可在此走云函数换取 openid 写入
  //      globalData.openid；云函数未部署 / wx.cloud 未配置时保持幂等降级。
  initOpenid() {
    try {
      if (this._cloudInited) return;
      if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.init !== 'function') {
        // 工程未配置 wx.cloud（当前为云托管方案）：静默降级，不报错。
        return;
      }
      // 已配置 wx.cloud：init 一次（幂等，多次 init 会告警）
      wx.cloud.init({ traceUser: true });
      this._cloudInited = true;
      // TODO(M2)：接入云函数换取 openid：
      //   const { result } = await wx.cloud.callFunction({ name: 'login' });
      //   this.globalData.openid = (result && result.openid) || '';
    } catch (e) {
      // 云开发不可用：幂等空实现，保证离线可玩不报错
    }
  }
});
