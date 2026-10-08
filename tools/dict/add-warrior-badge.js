/**
 * tools/dict/add-warrior-badge.js —— 给玩法页批量接入「战士徽章」（2026-10-08）
 *
 * 背景：皮肤原来只在字母射击里露脸（其他玩法界面没有角色的位置）。
 * 现在给每个玩法页右上角挂一个「我的战士」徽章（点一下去换皮肤），
 * 组件已在 app.json 全局注册，页面这边只要加一行 wxml。
 *
 * 字母射击（game）**不加** —— 那页本来就有大立绘，再挂一个徽章是重复的。
 *
 * 用途：一次性；以后新增玩法页时手工加这一行即可。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/** 玩法页（不含 game：那页已有大立绘） */
const PAGES = [
  'link', 'match', 'word-build', 'idiom-build', 'snake', 'quiz',
  'math24', 'sudoku', 'math-sprint', 'math-balance',
  'memory-grid', 'one-stroke', 'g2048', 'klotski'
];

const SNIPPET = [
  '',
  '<!-- 战士徽章（2026-10-08）：玩法页常驻「我的战士」，点一下去换皮肤。',
  '     皮肤原来只在字母射击能看见，因为别的玩法界面没有角色的位置 —— 这个徽章就是那个位置。 -->',
  '<warrior-badge fixed="{{true}}" size="sm" />',
  ''
].join('\n');

let done = 0;
PAGES.forEach(function (p) {
  const file = path.join(ROOT, 'miniprogram', 'pages', p, p + '.wxml');
  if (!fs.existsSync(file)) {
    console.log('跳过（文件不存在）：' + p);
    return;
  }
  const txt = fs.readFileSync(file, 'utf8');
  if (txt.indexOf('<warrior-badge') >= 0) {
    console.log('已接入，跳过：' + p);
    return;
  }
  fs.writeFileSync(file, txt.replace(/\s*$/, '') + '\n' + SNIPPET, 'utf8');
  done++;
  console.log('已接入：' + p);
});
console.log('');
console.log('完成 ' + done + ' 个玩法页');
