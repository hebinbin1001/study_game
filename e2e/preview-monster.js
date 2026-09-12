'use strict';

/**
 * e2e/preview-monster.js —— 对局画面预览：怪兽主体 + 题目名牌
 *
 * 背景：用户反馈「单词挡住怪兽了」。改成「怪兽当主体、题目挂在它肚子上的小名牌」之后，
 * 需要**先看见**再交付 —— 本机模拟器截图接口是坏的，所以这里用浏览器渲染同一套几何。
 *
 * 关键：几何数字**直接调用渲染层导出的纯函数**（monsterArtLayout / monsterPlateLayout），
 * 不是另写一份 —— 这样预览不会与真机漂移；图片尺寸也从 PNG 头里读，避免手填。
 *
 * 用法：node e2e/preview-monster.js  → e2e/reports/preview/monster.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI = path.join(ROOT, 'miniprogram');
const OUT_DIR = path.join(__dirname, 'reports', 'preview');
const OUT_FILE = path.join(OUT_DIR, 'monster.html');

const renderer = require(path.join(MINI, 'game', 'renderer.js'));
const config = require(path.join(MINI, 'game', 'config.js'));
const W = config.W;
const H = config.H;
const MON_W = config.MON_W;
const MON_H = config.MON_H;
const CANNON_Y = config.CANNON_Y;
const MON_START_Y = config.MON_START_Y;

/** 从 PNG 头里读宽高（免依赖、免手填） */
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const MONSTERS = [
  { id: 'monster_01', color: '#ff8fae' },
  { id: 'monster_02', color: '#ff5a5a' },
  { id: 'monster_03', color: '#7ec4ff' },
  { id: 'monster_04', color: '#ffc24d' }
];

// 下沉位置 × 题型（短词 / 长词）
const SCENES = [
  { y: MON_START_Y, word: 'banana', label: '开局 y=22 · 短词' },
  { y: 110, word: 'banana', label: '下沉中 y=110 · 短词' },
  { y: 110, word: 'expensive', label: '下沉中 y=110 · 长词' },
  { y: 300, word: 'banana', label: '逼近 y=300 · 短词' }
];

function buildScene(monster, scene) {
  const rel = 'assets/skins/' + monster.id + '.png';
  const size = pngSize(path.join(MINI, rel));
  const mx = (W - MON_W) / 2;
  const art = renderer.monsterArtLayout(size.w, size.h, mx, scene.y);
  // 与 drawMonster 的字符级排版口径保持一致
  const charW = renderer.clamp(34, 10, 170 / Math.max(4, scene.word.length));
  const textW = scene.word.length * charW;
  const plate = renderer.monsterPlateLayout(textW, mx, scene.y);
  return {
    id: monster.id,
    color: monster.color,
    src: '../../../miniprogram/' + rel,
    art: art,
    plate: plate,
    y: scene.y,
    word: scene.word,
    label: scene.label,
    charW: charW,
    consts: { W: W, H: H, MON_H: MON_H, CANNON_Y: CANNON_Y }
  };
}

const data = [];
MONSTERS.forEach(function (mon) { SCENES.forEach(function (sc) { data.push(buildScene(mon, sc)); }); });

const html = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
  '<title>对局画面预览 · 怪兽主体 + 题目名牌</title>',
  '<style>',
  'body{margin:0;background:#243b53;font-family:"PingFang SC","Microsoft YaHei",sans-serif}',
  '.frames{display:flex;flex-wrap:wrap;gap:16px;padding:16px}',
  '.cap{color:#cbd8e6;font-size:12px;padding:4px 2px}',
  '.frame{width:' + W + 'px;height:' + H + 'px;border-radius:18px;overflow:hidden;',
  '  box-shadow:0 12px 26px rgba(0,0,0,.35);background:#dfe9f5}',
  '</style></head><body><div class="frames" id="wrap"></div>',
  '<script>',
  'var DATA = ' + JSON.stringify(data) + ';',
  'function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);',
  '  c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}',
  'function draw(d,host){',
  '  var wrap=document.createElement("div");',
  '  wrap.innerHTML="<div class=\\"cap\\">"+d.id+" · "+d.label+"</div>";',
  '  var cv=document.createElement("canvas");cv.width=d.consts.W;cv.height=d.consts.H;',
  '  wrap.appendChild(cv);host.appendChild(wrap);',
  '  var c=cv.getContext("2d");var img=new Image();',
  '  img.onload=function(){',
  '    c.fillStyle="#dfe9f5";c.fillRect(0,0,d.consts.W,d.consts.H);',
  '    c.save();c.beginPath();c.rect(0,0,d.consts.W,d.y+d.consts.MON_H);c.clip();',
  '    c.drawImage(img,d.art.x,d.art.y,d.art.w,d.art.h);c.restore();',
  '    c.save();c.shadowColor="rgba(0,0,0,.24)";c.shadowBlur=10;c.shadowOffsetY=5;',
  '    c.globalAlpha=' + renderer.MON_ART.plateAlpha + ';c.fillStyle=d.color;',
  '    roundRect(c,d.plate.x,d.plate.y,d.plate.w,d.plate.h,20);c.fill();c.globalAlpha=1;c.restore();',
  '    c.lineWidth=4;c.strokeStyle="#fff";',
  '    roundRect(c,d.plate.x,d.plate.y,d.plate.w,d.plate.h,20);c.stroke();',
  '    var charW=d.charW,total=d.charW*d.word.length,startX=(d.consts.W-total)/2+charW/2;',
  '    var textY=d.y+d.consts.MON_H*0.62,blank=2;',
  '    c.font="bold "+(d.word.length>5?28:34)+"px \\"PingFang SC\\",\\"Microsoft YaHei\\",sans-serif";',
  '    c.textAlign="center";c.textBaseline="middle";',
  '    for(var i=0;i<d.word.length;i++){var cx=startX+i*charW;',
  '      if(i===blank){',
  '        c.fillStyle="rgba(255,255,255,.62)";',
  '        roundRect(c,cx-(charW-4)/2,textY-22,charW-4,44,10);c.fill();',
  '        c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=2.5;',
  '        roundRect(c,cx-(charW-4)/2,textY-22,charW-4,44,10);c.stroke();',
  '      } else {c.fillStyle="#fff";c.fillText(d.word[i].toUpperCase(),cx,textY+1);}',
  '    }',
  '    c.font="bold 15px \\"PingFang SC\\",\\"Microsoft YaHei\\",sans-serif";',
  '    c.fillStyle="rgba(255,255,255,.9)";',
  '    c.fillText("提示：一种黄色的水果",d.consts.W/2,d.y+d.consts.MON_H-16);',
  '    c.strokeStyle="rgba(0,0,0,.2)";c.lineWidth=1;',
  '    c.beginPath();c.moveTo(0,d.consts.CANNON_Y);c.lineTo(d.consts.W,d.consts.CANNON_Y);c.stroke();',
  '  };',
  '  img.src=d.src;',
  '}',
  'DATA.forEach(function(d){draw(d,document.getElementById("wrap"));});',
  '</script></body></html>'
].join('\n');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf8');
console.log('已生成预览：' + path.relative(ROOT, OUT_FILE));
console.log('怪兽图高度 = ' + renderer.MON_ART.h + 'px，名牌高度 = ' + renderer.MON_ART.plateH + 'px');
