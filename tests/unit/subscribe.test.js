/**
 * subscribe.test.js —— 订阅消息（2026-10-28）
 *
 * 为什么值得测：
 *   · 模板字段是「对不上就静默失败」的东西 —— 微信只回一个 47003，
 *     不告诉你哪个字段超长。所以长度和日期格式必须在这里拦住；
 *   · 模板 ID 走环境变量，「没配就跳过」这条降级路径必须一直成立，
 *     否则以后一次误改会让没申请模板的环境直接报错；
 *   · 场景 key 同时被服务端场景表和端上按钮使用，拼错就是「点了没反应」。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('订阅消息');

const sub = require('../../server/subscribe');
const subClient = require('../../miniprogram/utils/subscribe');

s.test('场景表结构完整：每个场景都有 env / label / page / build', () => {
  const keys = Object.keys(sub.SCENES);
  s.assert.ok(keys.length > 0, '场景表不能为空');
  keys.forEach(function (k) {
    const conf = sub.SCENES[k];
    s.assert.ok(/^WX_TPL_[A-Z_]+$/.test(conf.env), k + ' 的环境变量名不合规：' + conf.env);
    s.assert.ok(!!conf.label, k + ' 缺 label');
    s.assert.ok(!!conf.page, k + ' 缺跳转页');
    s.assert.equal(typeof conf.build, 'function', k + ' 缺 build');
    s.assert.ok(conf.page.indexOf('/') !== 0, k + ' 的 page 不能带前导斜杠（微信会跳转失败）');
  });
});

s.test('模板未配置：templateOf 空串、configuredScenes 不含该场景', () => {
  const saved = process.env.WX_TPL_PK_ACCEPT;
  delete process.env.WX_TPL_PK_ACCEPT;
  s.assert.equal(sub.templateOf('pk_accept'), '');
  s.assert.ok(!sub.configuredScenes().pk_accept, '未配置时不该出现在配置表里');
  if (saved === undefined) delete process.env.WX_TPL_PK_ACCEPT;
  else process.env.WX_TPL_PK_ACCEPT = saved;
});

s.test('模板已配置：templateOf / configuredScenes 能取到', () => {
  const saved = process.env.WX_TPL_PK_ACCEPT;
  process.env.WX_TPL_PK_ACCEPT = 'TPL_TEST_ID_123';
  s.assert.equal(sub.templateOf('pk_accept'), 'TPL_TEST_ID_123');
  s.assert.equal(sub.configuredScenes().pk_accept, 'TPL_TEST_ID_123');
  if (saved === undefined) delete process.env.WX_TPL_PK_ACCEPT;
  else process.env.WX_TPL_PK_ACCEPT = saved;
});

s.test('未知场景一律不认（防止端上乱传 key 建脏记录）', () => {
  s.assert.equal(sub.isScene('pk_accept'), true);
  s.assert.equal(sub.isScene('__proto__'), false);
  s.assert.equal(sub.isScene('toString'), false);
  s.assert.equal(sub.isScene(''), false);
  s.assert.equal(sub.templateOf('nope'), '');
});

s.test('clip：按字符截断到上限，空值给占位符', () => {
  s.assert.equal(sub.clip('', 20), '-');
  s.assert.equal(sub.clip(null, 20), '-');
  s.assert.equal(sub.clip('   ', 20), '-');
  s.assert.equal(sub.clip('小明', 20), '小明');
  const long = '一二三四五六七八九十一二三四五六七八九十一二三四五';
  const cut = sub.clip(long, 20);
  s.assert.ok(cut.length <= 20, '截断后长度 ' + cut.length + ' 超过 20');
  s.assert.ok(cut.slice(-1) === '…', '截断应当以省略号收尾');
});

s.test('dateTimeText：按东八区输出 date 类字段的标准格式', () => {
  // 2026-10-28T14:35:00Z = 北京时间 22:35
  s.assert.equal(sub.dateTimeText(new Date('2026-10-28T14:35:00Z')), '2026年10月28日 22:35');
  // 跨日：UTC 20:00 = 北京次日 04:00
  s.assert.equal(sub.dateTimeText(new Date('2026-10-28T20:00:00Z')), '2026年10月29日 04:00');
  s.assert.ok(/^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/.test(sub.dateTimeText(Date.now())));
});

s.test('clockText：按东八区输出 time 类字段的 HH:mm', () => {
  s.assert.equal(sub.clockText(new Date('2026-10-28T14:35:00Z')), '22:35');
  s.assert.equal(sub.clockText(new Date('2026-10-28T20:00:00Z')), '04:00');
});

s.test('pk_accept 模板数据：thing 不超 20 字符、time 格式合法', () => {
  const data = sub.SCENES.pk_accept.build({
    opponent: '一个特别特别长的昵称超了二十个字符的那种',
    scoreText: '10/10 题 · 你赢了',
    at: new Date('2026-10-28T14:35:00Z')
  });
  const keys = Object.keys(data);
  s.assert.ok(keys.length >= 3, '至少要有 3 个字段');
  keys.forEach(function (k) {
    s.assert.ok(data[k] && typeof data[k].value === 'string', k + ' 的值必须是 { value: string }');
    s.assert.ok(data[k].value.length > 0, k + ' 的值不能为空（空值会被微信判 47003）');
  });
  s.assert.ok(data.thing4.value.length <= 20, 'thing4 超长：' + data.thing4.value.length);
  s.assert.ok(data.thing3.value.length <= 20, 'thing3 超长：' + data.thing3.value.length);
  s.assert.match(data.time5.value, /^\d{2}:\d{2}$/, 'time5 必须是 HH:mm：' + data.time5.value);
});

s.test('pk_accept 模板数据：空对手名不产生空字段', () => {
  const data = sub.SCENES.pk_accept.build({ opponent: '', scoreText: '', at: Date.now() });
  s.assert.equal(data.thing4.value, '-');
  s.assert.equal(data.thing3.value, '-');
});

s.test('端上 isAccepted：只有 accept 系列算同意', () => {
  s.assert.equal(subClient.isAccepted('accept'), true);
  s.assert.equal(subClient.isAccepted('acceptWithAudio'), true);
  s.assert.equal(subClient.isAccepted('acceptWithAlert'), true);
  s.assert.equal(subClient.isAccepted('reject'), false);
  s.assert.equal(subClient.isAccepted('ban'), false);
  s.assert.equal(subClient.isAccepted(undefined), false);
  s.assert.equal(subClient.isAccepted(''), false);
});

s.done();
