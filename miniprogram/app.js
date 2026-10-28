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

var request = require('./utils/request');
var storage = require('./utils/storage');
var auth = require('./utils/auth');
var dict = require('./utils/dict');

// 云托管连接方案（2026-09-08 迁移）：
//   前端通过 wx.cloud.init + wx.cloud.callContainer 调用后端（envId/serviceName
//   定义于 utils/request.js 的 CLOUD_CONFIG，唯一来源）。相比旧方案 wx.request +
//   裸域名，callContainer 无需在公众平台配置「服务器域名」（根治 fail url not
//   in domain list），且网关自动注入用户 openid，后端 /api/login 来源①直接可用。

// ---- 三档字号的全局注入（2026-10-28）----
// 字号倍率只有落在 page 根节点上才会被 page{} 里的 --fs-* 继承到，而 page 根节点
// 只能通过 page-meta 的 page-style 打进去；page-meta 又必须写在每个页面 wxml 首行，
// 且 `page-style="{{fsStyle}}"` 需要 page data 才能绑定 —— 52 个页面各加一个 data
// 字段既啰嗦又容易漏（漏了就是「这个页面字号不动」，很难查）。
// 所以这里把全局 Page 构造器包一层：统一往每个页面的 data 塞 fsStyle，并在 onShow
// 时按存储重算一次（用户在设置页改完，回到任意页面立即是新值）。
//
// 失败必须「静默降级」而不是「半死」：整段包在 try 里，取不到全局 Page（严格模式、
// 以后基础库换了注入方式）就什么都不做 —— 结果是字号开关不生效，但页面照常渲染。
// 这条比功能本身重要：不能让一个可访问性开关有能力白屏整个小程序。
function installFontScale() {
  var fontScale = require('./utils/font-scale');
  try {
    if (typeof Page !== 'function') return;
    var basePage = Page;
    Page = function (opts) {
      opts = opts || {};
      var data = opts.data || (opts.data = {});
      if (!('fsStyle' in data)) data.fsStyle = fontScale.styleOf(fontScale.current());

      var userOnShow = opts.onShow;
      opts.onShow = function () {
        var want = fontScale.styleOf(fontScale.current());
        if (want !== this.data.fsStyle) this.setData({ fsStyle: want });
        if (typeof userOnShow === 'function') return userOnShow.apply(this, arguments);
      };
      return basePage(opts);
    };
  } catch (e) {
    // 静默降级：这里每个页面都会走到，打日志只会刷屏
  }
}
installFontScale();

App({
  // 全局共享数据
  globalData: {
    openid: '',        // 用户微信 openid（登录后填充）
    token: '',         // 登录态令牌（M5，由 utils/auth 维护）
    user: null,        // 用户资料 { nickname, avatarUrl, needProfile }（M5）
    nickname: '',      // 用户昵称（来自本地存储 ww_nickname）
    avatarUrl: '',     // 用户头像地址（来自本地存储 ww_avatar）
    wordCache: null    // 词库缓存（后续按学段装载后填充，避免重复加载）
  },

  // wx.cloud.init 已执行标记（幂等，防止重复 init）
  _cloudInited: false,

  onLaunch() {
    // 1. 初始化云开发（callContainer 前置；env 必须为本小程序已关联的环境 ID）
    this.initCloud();

    // 2. 恢复本地登录态（同步，立即生效，不发请求）
    //    —— O2：首次进入默认「游客模式」，不做自动登录建档；
    //       只有用户点「登录/注册」并经《用户协议与隐私政策》同意后才调微信登录。
    auth.restore();
    try {
      require('./utils/star-recovery').restoreFromCloud().catch(function () {});
    } catch (e) {
      // 恢复失败不阻塞启动，之后进入首页/关卡页还会重试
    }

    // 3. openid 获取占位（M1 降级实现，见 initOpenid；登录后由网关注入）
    this.initOpenid();

    // 4. 基础库版本兼容检测（低于 2.9.0 提示升级，REQ-NFR-3）
    this.checkSDKVersion();

    // 5. 题库覆盖层预热（2026-09-18）：先用本地缓存让「用户编辑过的词条」
    //    立刻参与出题（离线也有），登录后再静默拉云端覆盖记录。
    this.syncWordBank();

    // 6. 教材版本（2026-10-08 二期：教材对接）：按用户上次选的版本出题。
    //    放在 syncWordBank 之后：setBook 只影响「过滤口径」，不涉及覆盖层数据。
    dict.setBook(storage.getBook());
  },

  /**
   * 同步用户题库覆盖层。
   *
   * 为什么放在启动时：题库是**闯关线的题源**，如果只在题库页里加载，
   * 用户改完题库后冷启动进闯关就会拿到旧题库（内置原样）——那就成了假联动。
   * 本地缓存 → 立即生效；云端 → 静默覆盖（失败保持本地，不影响对局）。
   */
  syncWordBank() {
    try {
      dict.refreshOverrides();   // 先用本地缓存（覆盖层 + 自建库列表）生效
    } catch (e) {
      // 读缓存失败：等价于没有覆盖层，继续用内置词库
    }
    if (!auth.isLoggedIn()) return;
    request.get('/api/wordbank/entries').then((d) => {
      dict.setOverrides((d && d.list) || []);
    }).catch(() => {
      // 静默：离线/接口异常时保持本地缓存，词库功能不受影响
    });
    request.get('/api/wordbank/banks').then((d) => {
      dict.setBanks((d && d.list) || []);
    }).catch(() => {
      // 静默：自建库拿不到时只用「学段 + 本地缓存」
    });
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

  // 初始化云开发（wx.cloud.init，callContainer 前置；幂等，失败静默降级）
  initCloud() {
    try {
      if (this._cloudInited) return;
      if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.init !== 'function') {
        return;
      }
      wx.cloud.init({ env: request.CLOUD_CONFIG.envId, traceUser: true });
      this._cloudInited = true;
    } catch (e) {
      // 云开发不可用：静默降级，保证离线可玩不报错
    }
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
