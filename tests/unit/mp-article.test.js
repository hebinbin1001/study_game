/**
 * mp-article.test.js —— 公众号排版工具的配置解析（纯函数部分）
 *
 * 为什么值得测：这套工具会去操作真实的公众号后台草稿。配置写错（标题超 64 字、
 * 图片路径打错、块类型拼错）如果拖到浏览器阶段才报，会留下一个半成品草稿，
 * 还得手动收拾。所以在动手之前先把配置校验干净。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('公众号文章配置（tools/wechat-mp）');

const A = require('../../tools/wechat-mp/lib/article');

const BASE = 'E:\\Code\\小程序\\study_game\\assets-src\\wechat-article';

s.test('正常配置：标题 / 作者 / 封面 / 摘要都归一化（去首尾空格）', () => {
  const r = A.parseConfig({
    title: '  背单词能不能像打游戏一样上瘾？  ',
    author: ' 词力战士 ',
    cover: ' final/01-cover.jpg ',
    summary: '  摘要文字  ',
    blocks: [{ type: 'p', text: '第一段' }]
  });
  s.assert.deepEqual(r.errors, []);
  s.assert.equal(r.config.title, '背单词能不能像打游戏一样上瘾？');
  s.assert.equal(r.config.author, '词力战士');
  s.assert.equal(r.config.cover, 'final/01-cover.jpg');
  s.assert.equal(r.config.summary, '摘要文字');
});

s.test('标题缺失 / 超长都要拦下来（64 字是公众号硬限制）', () => {
  s.assert.equal(A.parseConfig({ blocks: [{ type: 'p', text: 'x' }] }).errors[0], '缺少 title');
  const long = '字'.repeat(65);
  const r = A.parseConfig({ title: long, blocks: [{ type: 'p', text: 'x' }] });
  s.assert.equal(r.errors.length, 1);
  s.assert.contains(r.errors[0], '超过公众号上限 64');
  // 正好 64 字要放行
  s.assert.deepEqual(A.parseConfig({ title: '字'.repeat(64), blocks: [{ type: 'p', text: 'x' }] }).errors, []);
});

s.test('blocks 为空 / 非数组都要报错', () => {
  s.assert.contains(A.parseConfig({ title: 't' }).errors[0], 'blocks 为空');
  s.assert.contains(A.parseConfig({ title: 't', blocks: 'x' }).errors[0], 'blocks 为空');
});

s.test('未知块类型 / 缺字段都指名道姓地报（带上下标）', () => {
  const r = A.parseConfig({
    title: 't',
    blocks: [
      { type: 'p', text: 'ok' },
      { type: 'video', text: 'x' },
      { type: 'img' },
      { type: 'h2', text: '   ' },
      null
    ]
  });
  s.assert.equal(r.errors.length, 4);
  s.assert.contains(r.errors[0], 'blocks[1]');
  s.assert.contains(r.errors[0], '类型不支持：video');
  s.assert.contains(r.errors[1], 'blocks[2] 缺少 src');
  s.assert.contains(r.errors[2], 'blocks[3] 缺少 text');
  s.assert.contains(r.errors[3], 'blocks[4] 不是对象');
  s.assert.equal(r.config.blocks.length, 1);   // 只有合法的那一条进来
});

s.test('生成正文 HTML：图片按顺序编号占位、h2 用标题标签、bold 包 strong', () => {
  const cfg = A.parseConfig({
    title: 't',
    blocks: [
      { type: 'h2', text: '一、小节' },
      { type: 'p', text: '普通段落' },
      { type: 'p', text: '加粗段落', bold: true },
      { type: 'img', src: 'a.jpg' },
      { type: 'img', src: 'b.jpg' }
    ]
  }).config;
  const html = A.buildBodyHtml(cfg);
  s.assert.equal(html,
    '<h2>一、小节</h2><p>普通段落</p><p><strong>加粗段落</strong></p>'
    + '<p>@@IMG:1@@</p><p>@@IMG:2@@</p>');
});

s.test('正文 HTML 做转义（尖括号 / & 不能把结构撑坏）', () => {
  const cfg = A.parseConfig({
    title: 't',
    blocks: [{ type: 'p', text: 'a < b & c > d' }]
  }).config;
  s.assert.equal(A.buildBodyHtml(cfg), '<p>a &lt; b &amp; c &gt; d</p>');
});

s.test('图片清单：顺序与标记一致，路径相对配置文件目录解析', () => {
  const cfg = A.parseConfig({
    title: 't',
    blocks: [
      { type: 'img', src: 'final/01.jpg' },
      { type: 'p', text: '中间文字' },
      { type: 'img', src: 'final/02.jpg' }
    ]
  }).config;
  const tasks = A.imageTasks(cfg, BASE);
  s.assert.equal(tasks.length, 2);
  s.assert.deepEqual(tasks.map(function (t) { return t.id; }), ['1', '2']);
  s.assert.equal(tasks[0].file, BASE + '\\final\\01.jpg');
  s.assert.equal(tasks[1].src, 'final/02.jpg');
});

s.test('封面定位：在正文里能算出是第几张（公众号「从正文选择」要点序号）', () => {
  const cfg = A.parseConfig({
    title: 't',
    cover: 'final/02.jpg',
    blocks: [
      { type: 'img', src: 'final/01.jpg' },
      { type: 'img', src: './final/02.jpg' },   // 写法不同也要能对上
      { type: 'img', src: 'final/03.jpg' }
    ]
  }).config;
  s.assert.equal(A.coverIndexInBody(cfg), 2);
});

s.test('封面定位：不在正文里返回 null（调用方据此先插到正文最前）', () => {
  const cfg = A.parseConfig({
    title: 't',
    cover: 'final/cover.jpg',
    blocks: [{ type: 'img', src: 'final/01.jpg' }]
  }).config;
  s.assert.equal(A.coverIndexInBody(cfg), null);
  s.assert.equal(A.coverIndexInBody(A.parseConfig({ title: 't', blocks: [{ type: 'p', text: 'x' }] }).config), null);
});

s.test('纯文本兜底：去掉图片占位、保留段落', () => {
  const cfg = A.parseConfig({
    title: 't',
    blocks: [
      { type: 'h2', text: '一' },
      { type: 'img', src: 'a.jpg' },
      { type: 'p', text: '正文' }
    ]
  }).config;
  s.assert.equal(A.bodyPlainText(cfg), '一\n正文');
});

s.done();
