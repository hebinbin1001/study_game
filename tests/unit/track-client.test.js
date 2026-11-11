/**
 * tests/unit/track-client.test.js —— 埋点客户端队列（miniprogram/utils/track.js）
 *
 * 埋点客户端最怕两件事，这里都用断言钉死：
 *   1. **开发者工具（develop）里偷偷上报** —— E2E 每跑一次就污染一次线上库；
 *   2. **失败就丢/重复上报** —— 离线队列要保留补发、成功发送的才移除。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('埋点客户端（utils/track）');

// ---------- 假 wx ----------
const store = {};
let envVersion = 'release';
let httpFail = false;
const sent = [];

global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : '';
  },
  setStorageSync: function (k, v) { store[k] = v; },
  removeStorageSync: function (k) { delete store[k]; },
  getAccountInfoSync: function () {
    return { miniProgram: { envVersion: envVersion } };
  },
  cloud: {
    callContainer: function (req) {
      sent.push({ path: req.path, data: req.data, method: req.method });
      if (httpFail) {
        req.success({ statusCode: 500, data: { code: 5000 } });
        return;
      }
      req.success({
        statusCode: 200,
        data: { code: 0, data: { stored: (req.data && req.data.events || []).length } }
      });
    }
  }
};

const track = require('../../miniprogram/utils/track');
const QUEUE = track.QUEUE_KEY;

function reset() {
  Object.keys(store).forEach(function (k) { delete store[k]; });
  sent.length = 0;
  httpFail = false;
  envVersion = 'release';
  track._resetForTest();
}

function queue() {
  const q = store[QUEUE];
  return Array.isArray(q) ? q : [];
}

s.test('事件白名单：不在表里的名字直接丢弃（不入队）', () => {
  reset();
  track.event('bogus', { level: 1 });
  s.assert.equal(queue().length, 0);
});

s.test('develop 环境（开发者工具/E2E）一律不入队', () => {
  reset();
  envVersion = 'develop';
  track.event('visit', { scene: '1001' });
  s.assert.equal(queue().length, 0, 'develop 不允许上报，避免 E2E 污染线上数据');

  // 本地调试用 ww_track_force=1 强开
  store.ww_track_force = '1';
  track._resetForTest();
  track.event('visit', { scene: '1001' });
  s.assert.equal(queue().length, 1, '强制开关生效');
});

s.test('release/trial 入队；flush 成功后才从队列移除', async () => {
  reset();
  track.event('game_start', { game_type: 'snake', grade: 'g1', level: 2 });
  track.event('game_end', { game_type: 'snake', grade: 'g1', level: 2, stars: 3, win: 1 });
  s.assert.equal(queue().length, 2);
  s.assert.equal(sent.length, 0, '入队不等于立即发送（要等合并窗口）');

  const n = await track.flush();
  s.assert.equal(n, 2);
  s.assert.equal(sent.length, 1, '两个事件合成一个请求');
  s.assert.equal(sent[0].path, '/api/track');
  s.assert.equal(sent[0].data.events.length, 2);
  s.assert.equal(queue().length, 0, '发送成功必须清队列');
});

s.test('发送失败时保留队列，下次还能补发', async () => {
  reset();
  httpFail = true;
  track.event('visit', { scene: '1001' });
  const n = await track.flush();
  s.assert.equal(n, 0);
  s.assert.equal(queue().length, 1, '失败不能丢事件');

  httpFail = false;
  const n2 = await track.flush();
  s.assert.equal(n2, 1);
  s.assert.equal(queue().length, 0);
});

s.test('队列上限 100 条，超出丢最旧（防单 key 撑爆）', () => {
  reset();
  for (let i = 0; i < 105; i++) track.event('game_end', { game_type: 'snake', level: i });
  s.assert.equal(queue().length, track.MAX_QUEUE);
  s.assert.equal(queue()[0].level, 5, '最旧的 5 条应被丢掉');
  s.assert.equal(queue()[track.MAX_QUEUE - 1].level, 104);
});

s.test('字段截断与夹取：非法值不会原样进队列', () => {
  reset();
  track.event('game_end', { game_type: 'X'.repeat(50), level: -3, stars: 99 });
  const ev = queue()[0];
  s.assert.equal(ev.game_type.length, 24);
  s.assert.equal(ev.level, 0);
  s.assert.equal(ev.stars, 3);
});

s.test('launch：记 visit；分享场景补 share_open；5 秒内热启动不重复', () => {
  reset();
  httpFail = true; // 不让 flush 把队列清掉，方便断言
  track.launch({ scene: 1007 });
  s.assert.equal(queue().length, 2, 'visit + share_open');
  s.assert.equal(queue()[0].event, 'visit');
  s.assert.equal(queue()[1].event, 'share_open');

  track.onShow({ scene: 1007 });
  s.assert.equal(queue().length, 2, '同一场景 5 秒内不重复记 share_open');
});

s.test('isShareScene：只认 1007 / 1008 / 1044', () => {
  reset();
  s.assert.equal(track.isShareScene(1007), true);
  s.assert.equal(track.isShareScene('1008'), true);
  s.assert.equal(track.isShareScene(1044), true);
  s.assert.equal(track.isShareScene(1001), false);
  s.assert.equal(track.isShareScene(undefined), false);
});

s.done();
