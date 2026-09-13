/**
 * auth-guard.test.js —— 受限页门禁的单测（M5 T2.3 / T2.4）
 *
 * 覆盖 utils/auth.js 新增的两个方法：
 *   1. requireLogin(page, desc)：未登录 → 不放行、页面打上 needLogin 标记；
 *      已登录 → 放行、清掉标记（门禁只在未登录时生效，登录用户不受影响）；
 *   2. loginFromGate(page, reload, desc)：取消登录 → 仍被拦住且**不加载数据**；
 *      登录成功 → 解除门禁并以 page 为 this 重新加载一次。
 *
 * 为什么要单测：门禁写错的代价是「登录用户被自己的门禁拦住」或
 *   「取消登录后照样把数据拉回来」——两种都不会报错，只会静默坏掉。
 *
 * 说明：本文件用最小 wx 运行时桩（内存存储 + 可编排的 showModal），
 *   不依赖微信开发者工具，`node tests/unit/auth-guard.test.js` 可直接跑。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('受限页门禁（utils/auth.js requireLogin / loginFromGate）');

// ============ wx 运行时桩 ============
const store = {};
let modalReplies = [];
const toasts = [];
let loginCalls = 0;

global.wx = {
  getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  // showModal 的应答由用例预置（弹几次就 shift 几次），默认「取消」
  showModal: (o) => {
    const r = modalReplies.shift() || { confirm: false };
    if (o && typeof o.success === 'function') o.success(r);
  },
  showToast: (o) => { toasts.push(o && o.title); },
  navigateTo: () => {},
  login: (o) => {
    loginCalls++;
    if (o && typeof o.success === 'function') o.success({ code: 'CODE_TEST' });
  },
  cloud: {
    callContainer: (o) => {
      // /api/login 的返回值（token 由后端签发）
      o.success({
        statusCode: 200,
        data: { code: 0, data: { token: 'tk_test', openid: 'o_test', nickname: '小明', needProfile: false } }
      });
    }
  }
};
global.getApp = () => ({ globalData: {} });

const auth = require('../../miniprogram/utils/auth');
const storage = require('../../miniprogram/utils/storage');

function fakePage() {
  return {
    data: {},
    setData(patch) { Object.assign(this.data, patch); }
  };
}

async function main() {
  // ---------- 用例 1：未登录 → 拦在门外，页面拿到默认引导文案 ----------
  const p1 = fakePage();
  s.test('未登录：requireLogin 不放行，并打上 needLogin / 默认文案', () => {
    s.assert.equal(auth.isLoggedIn(), false, '初始应为游客态');
    s.assert.equal(auth.requireLogin(p1), false);
    s.assert.true(p1.data.needLogin);
    s.assert.contains(p1.data.gateText, '登录后');
  });

  // ---------- 用例 2：每个页面可以有自己的话术 ----------
  const p2 = fakePage();
  s.test('未登录：自定义文案原样写进 gateText', () => {
    auth.requireLogin(p2, '登录后可查看排行榜');
    s.assert.equal(p2.data.gateText, '登录后可查看排行榜');
    s.assert.true(p2.data.needLogin);
  });

  // ---------- 用例 3：点「去登录」但取消 → 仍被拦住、数据不加载 ----------
  const p3 = fakePage();
  let reload3 = 0;
  modalReplies = [{ confirm: false }];
  const r3 = await auth.loginFromGate(p3, () => { reload3++; }, '登录后可查看错题本');
  s.test('取消登录：不放行、不重新加载（避免取消后照样拉数据）', () => {
    s.assert.equal(r3, null);
    s.assert.true(p3.data.needLogin, '取消后引导条必须还在');
    s.assert.equal(reload3, 0, '取消登录不能触发加载');
    s.assert.equal(auth.isLoggedIn(), false);
  });

  // ---------- 用例 4：点「去登录」并确认 → 解除门禁 + 重新加载一次 ----------
  const p4 = fakePage();
  let reload4 = 0;
  let reloadThis = null;
  // 两次弹窗：promptLogin 的「登录解锁」+ 首次登录的隐私协议确认
  modalReplies = [{ confirm: true }, { confirm: true }];
  const r4 = await auth.loginFromGate(p4, function () { reload4++; reloadThis = this; }, '登录后可查看成就');
  s.test('登录成功：解除门禁、以页面为 this 重新加载、拿到用户资料', () => {
    s.assert.equal(loginCalls, 1, '应真正走了一次 wx.login');
    s.assert.ok(r4, '应返回登录用户');
    s.assert.equal(r4.nickname, '小明');
    s.assert.equal(auth.isLoggedIn(), true);
    s.assert.equal(p4.data.needLogin, false, '登录后引导条必须收起');
    s.assert.equal(reload4, 1, '登录成功后要自动补加载一次');
    s.assert.equal(reloadThis, p4, 'reload 必须以页面实例为 this');
  });

  // ---------- 用例 5：已登录用户不受门禁影响（回归：别把自己人拦住） ----------
  const p5 = fakePage();
  s.test('已登录：requireLogin 直接放行且不显示引导条', () => {
    s.assert.equal(auth.requireLogin(p5, '登录后可查看排行榜'), true);
    s.assert.equal(p5.data.needLogin, false);
  });

  // ---------- 用例 6：退出登录后又会被拦住 ----------
  const p6 = fakePage();
  auth.logout();
  s.test('退出登录后：门禁重新生效', () => {
    s.assert.equal(auth.isLoggedIn(), false);
    s.assert.equal(auth.requireLogin(p6), false);
    s.assert.true(p6.data.needLogin);
  });

  // ---------- 用例 7：门禁不触碰 token / 用户缓存（只读判定） ----------
  s.test('门禁只做判定：不写 token、不清用户缓存', () => {
    s.assert.equal(storage.getToken(), '', '未登录时 token 必须仍为空');
    const p7 = fakePage();
    auth.requireLogin(p7);
    s.assert.equal(storage.getToken(), '');
    s.assert.equal(auth.isLoggedIn(), false);
  });
}

main().then(() => {
  s.done();
}, (err) => {
  console.error('用例执行异常：', err && err.stack ? err.stack : err);
  s.assert.fail('用例执行异常：' + ((err && err.message) || err));
  s.done();
});
