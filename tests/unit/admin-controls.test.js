/**
 * admin-controls.test.js —— 管理员运营控制源码护栏
 *
 * 覆盖：页面有玩法开关与用户拉黑入口；前后端接口路径一致；用户列表能拿到
 * 完整 openid 且不能误操作当前管理员；服务端会拒绝被拉黑用户和暂停玩法成绩。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('管理员运营控制');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
}

s.test('管理页接线玩法暂停和用户拉黑接口', () => {
  const js = read('miniprogram/pages/admin/admin.js');
  const wxml = read('miniprogram/pages/admin/admin.wxml');
  s.assert.contains(js, "request.get('/api/admin/controls");
  s.assert.contains(js, "request.post('/api/admin/game-pause");
  s.assert.contains(js, "request.post('/api/admin/user-ban");
  s.assert.contains(js, 'toggleGamePause: function');
  s.assert.contains(js, 'toggleUserBan: function');
  s.assert.contains(wxml, 'class="game-control-row"');
  s.assert.contains(wxml, 'bindtap="toggleGamePause"');
  s.assert.contains(wxml, 'bindtap="toggleUserBan"');
  s.assert.contains(wxml, "{{!item.isSelf}}");
});

s.test('服务端支持控制列表、拉黑与暂停，并返回是否本人', () => {
  const route = read('server/routes/admin.js');
  s.assert.contains(route, 'router.get("/controls"');
  s.assert.contains(route, 'router.post("/user-ban"');
  s.assert.contains(route, 'router.post("/game-pause"');
  s.assert.contains(route, 'isSelf: u.openid === req.openid');
  s.assert.contains(route, 'req.body && req.body.passcode');
});

s.test('被拉黑用户会被统一身份中间件拦截，暂停玩法不能上报成绩', () => {
  const openid = read('server/middlewares/openid.js');
  const score = read('server/routes/score.js');
  s.assert.contains(openid, 'isBanned(value)');
  s.assert.contains(openid, '账号已被管理员暂停');
  s.assert.contains(score, 'pausedGames');
  s.assert.contains(score, '该玩法已暂停开放');
});

s.test('运营控制样式有独立卡片和深色可读按钮', () => {
  const wxss = read('miniprogram/pages/admin/admin.wxss');
  ['control-card', 'game-control-row', 'gc-btn', 'u-ban-btn', 'u-chip--ban'].forEach(function (name) {
    s.assert.contains(wxss, '.' + name);
  });
});

s.done();
