'use strict';

/**
 * e2e/preview-boards.js —— 棋盘 / 卡牌视觉预览（需求⑥ 第二期用）
 *
 * 为什么存在：本机开发者工具的截图接口会超时（多次实测），棋盘类页面的视觉改版
 * 「看不到效果」就只能盲改。这里换个路子：把**真实的 wxss 原样转成浏览器 CSS**，
 * 用真实结构渲染成 6 个手机尺寸的画框，再用浏览器截图看结果。
 *
 * 关键点：CSS 直接来自 `miniprogram/**` 的真实文件（rpx → px 按 750rpx = 375px 换算），
 * 所以这里看到的效果与真机是同一套样式，不是另画一份稿子。
 *
 * 用法：
 *   node e2e/preview-boards.js          # 生成 e2e/reports/preview/boards.html
 *   node e2e/preview-boards.js --open   # 顺便打印文件路径
 *
 * 注意：产物写在 `e2e/reports/`（已在 .gitignore 里），属于临时可视化产物，不入库。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI = path.join(ROOT, 'miniprogram');
const OUT_DIR = path.join(__dirname, 'reports', 'preview');
const OUT_FILE = path.join(OUT_DIR, 'boards.html');

/** rpx → px：小程序设计稿 750rpx = 屏幕宽，预览按 375px 宽的机型换算 */
function rpx2px(css) {
  return css.replace(/(-?\d*\.?\d+)rpx/g, function (_, n) {
    return (parseFloat(n) / 2) + 'px';
  });
}

function readCss(rel) {
  return rpx2px(fs.readFileSync(path.join(MINI, rel), 'utf8'));
}

/**
 * 给某个页面的 wxss 加上作用域前缀。
 *
 * 为什么必须做：小程序里每个页面的 wxss 是**页面级隔离**的，但预览是把 6 个页面的
 * css 拼到一张 HTML 上 —— `.cell` / `.tile` / `.board` 这些同名类会互相串，
 * 后加载的页面样式会盖住前面的（2026-09-12 就因此得出了「选中态没生效」的错误结论）。
 * 这里给每个选择器加上 `.pg-<id>` 前缀，复刻小程序的作用域语义。
 *
 * 处理规则：@keyframes 原样保留（动画名是全局的）；@media 里的规则递归加前缀。
 */
function scopeCss(css, scope) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (/\s/.test(ch)) { out += ch; i++; continue; }
    if (ch === '/' && css[i + 1] === '*') {                 // 注释
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    // 读选择器（到 { 为止）
    const brace = css.indexOf('{', i);
    if (brace < 0) { out += css.slice(i); break; }
    const selector = css.slice(i, brace).trim();
    // 找配对的 }
    let depth = 1, j = brace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(brace + 1, j - 1);
    if (selector.indexOf('@keyframes') === 0) {
      out += selector + '{' + body + '}';
    } else if (selector.indexOf('@media') === 0) {
      out += selector + '{' + scopeCss(body, scope) + '}';
    } else {
      const scoped = selector.split(',').map(function (s) {
        const t = s.trim();
        if (!t) return t;
        // 顶层 page / :root 这类选择器不需要再套作用域
        if (t === 'page' || t === ':root') return scope;
        return scope + ' ' + t;
      }).join(', ');
      out += scoped + '{' + body + '}';
    }
    i = j;
  }
  return out;
}

// ============ 各页面的棋盘片段（与真实 wxml 同结构、同类名） ============

function repeat(n, fn) {
  let out = '';
  for (let i = 0; i < n; i++) out += fn(i);
  return out;
}

function head(title, chip) {
  return '<view class="g-head"><button class="back-pill">‹</button>'
    + '<view class="g-title">' + title + '</view>'
    + '<view class="g-chip">' + chip + '</view></view>';
}

function hud(chips) {
  return '<view class="hud">' + chips.map((c) => '<view class="hud-chip">' + c + '</view>').join('') + '</view>';
}

// 数独：6×6，含「给定 / 选中 / 填错」三态
function sudokuFrame() {
  const vals = ['5', '3', '', '6', '', '', '', '1', '9', '8', '', '4', '7', '', '6', '', '', '3'];
  const cells = repeat(36, (i) => {
    const cls = i === 2 ? ' given' : (i === 7 ? ' b-sel' : (i === 20 ? ' err' : ''));
    return '<view class="cell b-face' + cls + '">' + (i === 20 ? '4' : (vals[i] || '')) + '</view>';
  });
  return '<view class="page-sudoku">' + head('数独', '4×4')
    + hud(['❤3', '剩 5 格', '计时中'])
    + '<view class="board-wrap"><view class="board b-tray b-in" style="grid-template-columns:repeat(6,1fr)">' + cells + '</view></view>'
    + '<view class="num-pad" style="grid-template-columns:repeat(6,1fr)">'
    + repeat(6, (i) => '<view class="num-btn b-face b-press">' + (i + 1) + '</view>') + '</view>'
    + '</view>';
}

// 2048：4×4，覆盖低中高档位数字
function g2048Frame() {
  const vals = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 0, 2, 4, 0, 0, 0];
  const cells = vals.map((v) => '<view class="cell c' + v + ' b-face">' + (v || '') + '</view>').join('');
  return '<view class="page-2048">' + head('2048', '第 3 关')
    + hud(['目标 128', '步数 12', '最佳 100'])
    + '<view class="board b-tray b-in">' + cells + '</view>'
    + '<view class="tip">👆 朝上下左右滑动棋盘 · 相同数字合体</view>'
    + '</view>';
}

// 24 点：四张牌，含「选中 / 刚合并」两态
function math24Frame() {
  const cards = [
    { t: '3', cls: '' }, { t: '3', cls: ' b-sel' }, { t: '8', cls: ' merged' }, { t: '1', cls: '' }
  ].map((c) => '<view class="card b-face b-press' + c.cls + '">' + c.t + '</view>').join('');
  return '<view class="page-24">' + head('算 24 点', '第 7 关')
    + hud(['剩 4 牌', '步数 2', '最少 3 步'])
    + '<view class="cards">' + cards + '</view>'
    + '<view class="expr-box">8 × 3 = 24</view>'
    + '<view class="keys">'
    + ['＋', '−', '×', '÷'].map((k) => '<view class="key k-op">' + k + '</view>').join('')
    + '<view class="key k-del">撤销</view><view class="key k-clr">重来</view>'
    + '<view class="key k-sym">提示</view><view class="key k-sym">＝</view>'
    + '</view></view>';
}

// 连连看：4×4，含「词 / 义 / 选中 / 消掉 / 错配」
function linkFrame() {
  const items = [
    { l: 'CAT', w: 1 }, { l: '猫', w: 0 }, { l: 'DOG', w: 1 }, { l: '狗', w: 0 },
    { l: 'BIRD', w: 1 }, { l: '鸟', w: 0, sel: 1 }, { l: 'FISH', w: 1, sel: 1 }, { l: '鱼', w: 0 },
    { l: 'APPLE', w: 1 }, { l: '苹果', w: 0 }, { l: 'MILK', w: 1, gone: 1 }, { l: '牛奶', w: 0, gone: 1 },
    { l: 'RED', w: 1, err: 1 }, { l: '红色', w: 0, err: 1 }, { l: 'BLUE', w: 1 }, { l: '蓝色', w: 0 }
  ];
  const tiles = items.map((it) => '<view class="tile'
    + ' b-face b-press' + (it.w ? ' word' : '') + (it.sel ? ' b-sel' : '')
    + (it.gone ? ' gone' : '') + (it.err ? ' err' : '')
    + '">' + it.l + '</view>').join('');
  return '<view class="page-link">' + head('词语连连看', '小学三年级 · 换局')
    + hud(['❤3', '剩 14 牌', '连连看配对'])
    + '<view class="board b-tray b-in">' + tiles + '</view>'
    + '<view class="tip">点两张配对的牌把它们消掉</view></view>';
}

// 消消乐：4×4，含「词 / 义 / 选中 / 命中 / 未命中」
function matchFrame() {
  const items = [
    { l: 'SUN', w: 1 }, { l: '太阳', w: 0 }, { l: 'MOON', w: 1 }, { l: '月亮', w: 0 },
    { l: 'STAR', w: 1, sel: 1 }, { l: '星星', w: 0, sel: 1 }, { l: 'RAIN', w: 1, hit: 1 }, { l: '雨', w: 0, hit: 1 },
    { l: 'SNOW', w: 1 }, { l: '雪', w: 0 }, { l: 'WIND', w: 1, miss: 1 }, { l: '风', w: 0, miss: 1 },
    { l: 'SEA', w: 1 }, { l: '海', w: 0 }, { l: 'SKY', w: 1 }, { l: '天空', w: 0 }
  ];
  const tiles = items.map((it) => '<view class="tile'
    + ' b-face b-press' + (it.w ? ' word' : '') + (it.sel ? ' b-sel' : '')
    + (it.hit ? ' hit' : '') + (it.miss ? ' miss' : '')
    + '">' + it.l + '</view>').join('');
  return '<view class="page-match">' + head('词义消消乐', '小学三年级')
    + hud(['❤3', '剩 12 卡', '得分 80'])
    + '<view class="board b-tray b-in">' + tiles + '</view>'
    + '<view class="tip">点一张词卡和它对应的义卡</view></view>';
}

// 贪吃蛇：10×10，含蛇头 / 蛇身 / 应拼字母 / 干扰字母
function snakeFrame() {
  const snake = [34, 35, 36, 45, 46];
  const cells = repeat(100, (i) => {
    let cls = '';
    if (i === 34) cls = ' head';
    else if (snake.indexOf(i) >= 0) cls = ' body';
    else if (i === 18) cls = ' food-ok';
    else if (i === 63) cls = ' food-bad';
    let ch = '';
    if (cls === ' food-ok') ch = 'A';
    if (cls === ' food-bad') ch = 'Q';
    return '<view class="cell' + cls + '">' + ch + '</view>';
  });
  return '<view class="page-snake">' + head('单词贪吃蛇', '小学三年级')
    + '<view class="target-bar"><view class="t-emoji">🐍</view>'
    + '<view class="t-main"><view class="t-word">sometimes</view><view class="t-tip">有时</view></view></view>'
    + '<view class="board-touch"><view class="grid b-tray b-in">' + cells + '</view></view>'
    + '</view>';
}

const FRAMES = [
  { id: 'sudoku', title: '数独', html: sudokuFrame },
  { id: 'g2048', title: '2048', html: g2048Frame },
  { id: 'math24', title: '算 24 点', html: math24Frame },
  { id: 'link', title: '词语连连看', html: linkFrame },
  { id: 'match', title: '词义消消乐', html: matchFrame },
  { id: 'snake', title: '单词贪吃蛇', html: snakeFrame }
];

function main() {
  const PAGE_IDS = ['sudoku', 'g2048', 'math24', 'link', 'match', 'snake'];
  const css = [
    '/* 自动生成，勿手改：来自 miniprogram/app.wxss + 6 个页面 wxss */',
    readCss('app.wxss'),
    // 页面样式按 `.pg-<id>` 作用域隔离，复刻小程序的页面级样式隔离
    PAGE_IDS.map((p) => scopeCss(readCss('pages/' + p + '/' + p + '.wxss'), '.pg-' + p)).join('\n')
  ].join('\n');

  const html = [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<title>棋盘 / 卡牌视觉预览</title>',
    '<style>',
    'body { margin:0; background:#243b53; font-family:"PingFang SC","Microsoft YaHei",sans-serif; }',
    '.frames { display:flex; flex-wrap:wrap; gap:18px; padding:18px; align-items:flex-start; }',
    '.frame { width:375px; height:667px; overflow:hidden; border-radius:22px;',
    '  box-shadow:0 14px 30px rgba(0,0,0,.35); position:relative; background:#fff; }',
    '.frame > * { height:667px; }',
    '.cap { color:#cbd8e6; font-size:12px; padding:6px 2px 0; }',
    css,
    '</style></head><body><div class="frames">',
    // 注意：作用域类加在 frame 上（页面的根节点就是 .page-xxx，等价于页面的样式作用域）
    FRAMES.map((f) => '<div><div class="cap">' + f.title + '</div><div class="frame pg-' + f.id + '">'
      + f.html() + '</div></div>').join(''),
    '</div></body></html>'
  ].join('\n');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');
  console.log('已生成预览：' + path.relative(ROOT, OUT_FILE));
  console.log('（用浏览器打开这个文件即可看效果）');
}

main();
