'use strict';

/**
 * e2e/preview-game.js —— 单词闯关「整屏」预览（HUD + 画布 + 提示 + 选项）
 *
 * 为什么：本机开发者工具截图接口会超时，对局界面的视觉改版看不到效果。
 * 这里把**真实的 app.wxss + pages/game/game.wxss** 转成浏览器 CSS（rpx → px），
 * 画布部分用渲染层导出的纯函数算几何，拼出一整屏给浏览器截图看。
 *
 * 用法：node e2e/preview-game.js → e2e/reports/preview/game.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI = path.join(ROOT, 'miniprogram');
const OUT_DIR = path.join(__dirname, 'reports', 'preview');
const OUT_FILE = path.join(OUT_DIR, 'game.html');

const renderer = require(path.join(MINI, 'game', 'renderer.js'));
const config = require(path.join(MINI, 'game', 'config.js'));
const W = config.W;
const H = config.H;
const MON_W = config.MON_W;
const MON_H = config.MON_H;

function rpx2px(css) {
  return css.replace(/(-?\d*\.?\d+)rpx/g, function (_, n) { return (parseFloat(n) / 2) + 'px'; });
}
function readCss(rel) { return rpx2px(fs.readFileSync(path.join(MINI, rel), 'utf8')); }

/** 给页面 wxss 加作用域（复刻小程序的页面级样式隔离） */
function scopeCss(css, scope) {
  let out = '', i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (/\s/.test(ch)) { out += ch; i++; continue; }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      out += css.slice(i, stop); i = stop; continue;
    }
    const brace = css.indexOf('{', i);
    if (brace < 0) { out += css.slice(i); break; }
    const selector = css.slice(i, brace).trim();
    let depth = 1, j = brace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++; else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(brace + 1, j - 1);
    if (selector.indexOf('@keyframes') === 0) out += selector + '{' + body + '}';
    else if (selector.indexOf('@media') === 0) out += selector + '{' + scopeCss(body, scope) + '}';
    else out += selector.split(',').map(function (s) {
      const t = s.trim();
      if (!t) return t;
      if (t === 'page' || t === ':root') return scope;
      return scope + ' ' + t;
    }).join(', ') + '{' + body + '}';
    i = j;
  }
  return out;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// 三种对局状态
const SCENES = [
  { id: 'idle', label: '作答中（4 个字母选项）', word: 'banana', blank: 2, wide: 0, y: 110,
    tip: '点击下方字母，补全单词，打跑怪兽！', used: [], answer: false, lives: 5, score: 30, q: '第 4/10 题' },
  { id: 'wrong', label: '答错（正确项标绿 / 误选项标红）', word: 'banana', blank: 2, wide: 0, y: 132,
    tip: '怪兽逼近！正确答案是 B', used: [1], answer: true, lives: 4, score: 30, q: '第 4/10 题' },
  { id: 'word', label: '词级题（整词选项）', word: 'sometimes', blank: 3, wide: 1, y: 110,
    tip: '选一个合适的词填进空里', used: [], answer: false, lives: 5, score: 30, q: '第 4/10 题' },
  // 终关 Boss：7 命 + 15 题 —— HUD 最容易放不下的一屏
  { id: 'boss', label: 'Boss 关（7 命 · 第 12/15 题）', word: 'banana', blank: 2, wide: 0, y: 110,
    tip: '点击下方字母，补全单词，打跑怪兽！', used: [], answer: false, lives: 7, score: 110, q: '第 12/15 题' }
];

const MONSTER = { id: 'monster_01', color: '#ff8fae' };
const imgRel = 'assets/skins/' + MONSTER.id + '.png';
const imgSize = pngSize(path.join(MINI, imgRel));

const DATA = SCENES.map(function (sc) {
  const mx = (W - MON_W) / 2;
  const charW = renderer.clamp(34, 10, 170 / Math.max(4, sc.word.length));
  return {
    scene: sc,
    art: renderer.monsterArtLayout(imgSize.w, imgSize.h, mx, sc.y),
    plate: renderer.monsterPlateLayout(sc.word.length * charW, mx, sc.y),
    charW: charW,
    src: '../../../miniprogram/' + imgRel,
    color: MONSTER.color,
    consts: { W: W, H: H, MON_H: MON_H, CANNON_Y: config.CANNON_Y }
  };
});

function optionCls(i, sc) {
  return 'option' + (sc.wide ? ' wide' : '') + ' c' + i
    + (sc.used.indexOf(i) >= 0 ? ' used' : '')
    + (sc.answer && i === 1 ? ' ok' : '')
    + (sc.answer && sc.used.indexOf(i) >= 0 ? ' bad' : '');
}

function pageHtml(sc) {
  const opts = sc.wide
    ? ['always', 'sometimes', 'never', 'often'].map(function (w, i) {
      return '<view class="' + optionCls(i, sc) + '">' + w.toUpperCase() + '</view>';
    }).join('')
    : ['A', 'B', 'C', 'D'].map(function (ch, i) {
      return '<view class="' + optionCls(i, sc) + '">' + ch + '</view>';
    }).join('');
  return [
    '<view class="game-page">',
    '<view class="hud">',
    '<view class="hud-chip hud-lives">' + '❤'.repeat(sc.lives) + '</view>',
    '<view class="hud-chip hud-score">得分 ' + sc.score + '</view>',
    '<view class="hud-chip hud-qnum">' + sc.q + '</view>',
    '<view class="hud-chip hud-icon">🔊</view>',
    '<view class="hud-chip hud-icon hud-pause">⏸</view>',
    '</view>',
    '<canvas class="game-canvas"></canvas>',
    '<view class="bottom-panel">',
    '<view class="tip">' + sc.tip + '</view>',
    '<view class="options">' + opts + '</view>',
    '</view>',
    '</view>'
  ].join('');
}

const css = [readCss('app.wxss'), scopeCss(readCss('pages/game/game.wxss'), '.pg-game')].join('\n');

const html = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
  '<title>单词闯关 · 整屏预览</title>',
  '<style>',
  'body{margin:0;background:#243b53;font-family:"PingFang SC","Microsoft YaHei",sans-serif}',
  '.wrap{display:flex;flex-wrap:wrap;gap:16px;padding:16px}',
  '.cap{color:#cbd8e6;font-size:12px;padding:4px 2px}',
  '.frame{width:375px;height:667px;overflow:hidden;border-radius:20px;background:#fff;',
  '  box-shadow:0 12px 26px rgba(0,0,0,.35)}',
  '.frame .game-page{min-height:667px;height:667px}',
  css,
  '</style></head><body><div class="wrap" id="wrap"></div>',
  '<script>',
  'var DATA = ' + JSON.stringify(DATA) + ';',
  'var PAGES = ' + JSON.stringify(SCENES.map(pageHtml)) + ';',
  'var PLATE_ALPHA = ' + renderer.MON_ART.plateAlpha + ';',
  'function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);',
  '  c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}',
  'function drawCanvas(cv,d,img){',
  '  var c=cv.getContext("2d");cv.width=d.consts.W;cv.height=d.consts.H;',
  '  var g=c.createLinearGradient(0,0,0,d.consts.H);g.addColorStop(0,"#dff0ff");',
  '  g.addColorStop(1,"#f4fbff");c.fillStyle=g;c.fillRect(0,0,d.consts.W,d.consts.H);',
  '  c.save();c.beginPath();c.rect(0,0,d.consts.W,d.scene.y+d.consts.MON_H);c.clip();',
  '  c.drawImage(img,d.art.x,d.art.y,d.art.w,d.art.h);c.restore();',
  '  c.save();c.shadowColor="rgba(0,0,0,.24)";c.shadowBlur=10;c.shadowOffsetY=5;',
  '  c.globalAlpha=PLATE_ALPHA;c.fillStyle=d.color;',
  '  roundRect(c,d.plate.x,d.plate.y,d.plate.w,d.plate.h,20);c.fill();c.globalAlpha=1;c.restore();',
  '  c.lineWidth=4;c.strokeStyle="#fff";',
  '  roundRect(c,d.plate.x,d.plate.y,d.plate.w,d.plate.h,20);c.stroke();',
  '  var charW=d.charW,total=charW*d.scene.word.length,startX=(d.consts.W-total)/2+charW/2;',
  '  var textY=d.scene.y+d.consts.MON_H*0.62;',
  '  c.font="bold "+(d.scene.word.length>5?28:34)+"px sans-serif";',
  '  c.textAlign="center";c.textBaseline="middle";',
  '  for(var i=0;i<d.scene.word.length;i++){var cx=startX+i*charW;',
  '    if(i===d.scene.blank){',
  '      c.fillStyle="rgba(255,255,255,.62)";',
  '      roundRect(c,cx-(charW-4)/2,textY-22,charW-4,44,10);c.fill();',
  '      c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=2.5;',
  '      roundRect(c,cx-(charW-4)/2,textY-22,charW-4,44,10);c.stroke();',
  '      if(d.scene.answer){c.fillStyle="#ff5d8f";c.font="bold 30px sans-serif";',
  '        c.fillText("C",cx,textY+1);c.font="bold 28px sans-serif";}',
  '    } else {c.fillStyle="#fff";c.fillText(d.scene.word[i].toUpperCase(),cx,textY+1);}',
  '  }',
  '  c.font="bold 15px sans-serif";c.fillStyle="rgba(255,255,255,.9)";',
  '  c.fillText("提示：一种黄色的水果",d.consts.W/2,d.scene.y+d.consts.MON_H-16);',
  '  c.fillStyle="#5c7f9e";roundRect(c,d.consts.W/2-52,d.consts.CANNON_Y-6,104,22,11);c.fill();',
  '  c.font="56px sans-serif";c.fillText("🔫",d.consts.W/2,d.consts.CANNON_Y-40);',
  '}',
  'DATA.forEach(function(d,i){',
  '  var host=document.getElementById("wrap");',
  '  var box=document.createElement("div");',
  '  var cap=document.createElement("div");cap.className="cap";cap.textContent=d.scene.label;',
  '  var frame=document.createElement("div");frame.className="frame pg-game";',
  '  frame.innerHTML=PAGES[i];',
  '  box.appendChild(cap);box.appendChild(frame);host.appendChild(box);',
  '  var cv=frame.querySelector("canvas");',
  '  var img=new Image();img.onload=function(){drawCanvas(cv,d,img);};img.src=d.src;',
  '});',
  '</script></body></html>'
].join('\n');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf8');
console.log('已生成预览：' + path.relative(ROOT, OUT_FILE));
