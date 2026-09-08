/**
 * game/renderer.js —— 词力战士 Canvas 渲染器
 *
 * 职责：
 *   render(ctx, state, now) 绘制游戏主体：天空、怪兽（身上挖空题目）、
 *   炮台、炮弹、粒子、弹字、✓ 反馈。
 *
 * 平移来源：prototype/index.html
 *   - render() 第 778-786 行
 *   - drawSky() 第 788-794 行
 *   - drawMonster() 第 796-862 行
 *   - drawEye() 第 864-868 行
 *   - drawCannon() 第 870-883 行
 *   - drawBullet() 第 885-893 行
 *   - drawParticles() 第 895-916 行
 *   - drawCheckmark() 第 918-932 行
 *   - roundRect() 第 341-350 行
 *
 * 适配说明：原型用全局变量 G/now，本模块改为 (ctx, state, now) 参数传入，
 *   绘制坐标系以逻辑像素（390×500）为准，与原型完全一致。
 *
 * 关联需求：
 *   - REQ-GAME-2（Canvas 绘制游戏主体）
 *   - REQ-GAME-6（答对反馈：绿色✓/爆炸粒子/冒星星）
 *   - REQ-GAME-7（答错反馈：逼近+抖动+红色闪光）
 *   - REQ-GAME-10（挖空格闪烁+呼吸缩放动画）
 *   - REQ-NFR-1（粒子上限 ≤200 保帧率）
 */

const { CONFIG, W, H, MON_W, MON_H, CANNON_Y } = require('./config');
const { displayChar, meaningText, titleCaseWord } = require('./question');
const { DEFAULT_WARRIOR } = require('../utils/skins');

// ============ 工具函数 ============
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ============ H2-B 词级题型渲染几何与辅助 ============
// 词级题（fill/trans/xhy/zc）在怪兽卡片上不再逐字挖格，而是绘制
// 「题干片段 + 整词空槽 + 尾句片段」，必要时自动折行。几何常量：
const WL_PAD_X = 18;     // 文本区左右内边距（相对怪兽卡片宽 MON_W）
const WL_TOP = 52;       // 文本区顶部相对卡片顶（避开眼睛区 ~22~46）
const WL_BOTTOM = 92;    // 文本区底部（给卡片底部提示行留位）
const WL_REGION_H = WL_BOTTOM - WL_TOP;
const WL_FONT_STEPS = [20, 18, 16, 15, 14, 13, 12, 11]; // 候选字号（大到小）
const WL_HINT_FS = 15;   // 词级底部提示行字号（M6-4 可读性调大）

/** 中/日/韩全角字符判定（布局按全角 ≈ 1 字号估算宽度用） */
function isCJKChar(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 0x2e80 && c <= 0x303e) ||
    (c >= 0x3041 && c <= 0x33ff) ||
    (c >= 0x3400 && c <= 0x4dbf) ||
    (c >= 0x4e00 && c <= 0x9fff) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xff01 && c <= 0xff60);
}

/** 构造词级文本/空槽框使用字体 */
function wlFont(fs) {
  return 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
}

/** 空槽框高度（随字号缩放，保证至少 20px 好点按/看清） */
function wlSlotH(fs) {
  return Math.max(20, Math.round(fs * 1.4));
}

/**
 * 文本宽度：优先用 ctx.measureText（真实渲染/炮弹落点一致），
 * 无 ctx 时按字符宽度估算兜底（仅测试/防御路径）。
 */
function textWidth(ctx, s, fs) {
  if (!s) return 0;
  if (ctx && typeof ctx.measureText === 'function') {
    const prev = ctx.font;
    ctx.font = wlFont(fs);
    const w = ctx.measureText(s).width;
    ctx.font = prev;
    return w;
  }
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') w += fs * 0.3;
    else if (isCJKChar(ch)) w += fs;
    else w += fs * 0.55;
  }
  return w;
}

/** 词级空槽内展示文本：trans 整词首字母大写；fill/xhy/zc 保持原样（句子/中文语境） */
function wlAnswerText(item, raw) {
  if (item.type === 'trans') return titleCaseWord(raw);
  return String(raw || '');
}

/**
 * 将题干切成排版片元：英文按整词、中文按单字、空格独立；
 * 并在「整词空槽」位置插入 slot 片元。slot 只会出现一次。
 */
function buildWordPieces(q, item) {
  const pieces = [];
  const pushText = (txt) => {
    const s = String(txt || '');
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ') { pieces.push({ t: 'txt', s: ' ' }); i++; continue; }
      if (isCJKChar(ch)) { pieces.push({ t: 'txt', s: ch }); i++; continue; }
      let j = i;
      while (j < s.length && s[j] !== ' ' && !isCJKChar(s[j])) j++;
      pieces.push({ t: 'txt', s: s.slice(i, j) });
      i = j;
    }
  };
  if (q.hasSlot && item.type === 'fill') {
    // fill：槽位于 __ 原位（head __ tail）
    pushText(q.head);
    pieces.push({ t: 'slot' });
    pushText(q.tail);
  } else {
    // trans/xhy/zc：题干后置空槽；fill 数据异常无 __ 时同样补在末尾
    pushText((q.head || '') + (q.tail || ''));
    pieces.push({ t: 'slot' });
  }
  return pieces;
}

/** 空槽宽度：以答案整词宽度 + 内边距计算（未作答前给出稳定的占位宽度） */
function wlSlotWidth(ctx, item, fs) {
  const ansW = textWidth(ctx, wlAnswerText(item, item.a), fs);
  const maxW = (MON_W - 2 * WL_PAD_X) - 4; // 留呼吸余量，保证空槽必能独占一行
  return Math.min(maxW, Math.max(ansW + fs, fs * 2 + 8));
}

/** 按指定字号折行排版；返回 { lines, slotW } */
function wrapWordPieces(ctx, pieces, item, fs) {
  const maxW = MON_W - 2 * WL_PAD_X;
  const slotW = wlSlotWidth(ctx, item, fs);
  const lines = [];
  let cur = [];
  let curW = 0;
  for (const p of pieces) {
    if (p.t === 'slot') {
      if (cur.length && curW + slotW > maxW) { lines.push(cur); cur = []; curW = 0; }
      cur.push({ t: 'slot' });
      curW += slotW;
    } else {
      const w = textWidth(ctx, p.s, fs);
      if (cur.length && curW + w > maxW) { lines.push(cur); cur = []; curW = 0; }
      if (cur.length === 0 && p.s === ' ') continue; // 行首空白丢弃
      cur.push({ t: 'txt', s: p.s, w: w });
      curW += w;
    }
  }
  if (cur.length) lines.push(cur);
  return { lines, slotW };
}

/** 已排版词级布局缓存（同一题在整题生命周期内几何不变，避免每帧重复测量） */
let _wlCache = { key: null, data: null };

/** 取词级布局；ctx 可为空（引擎 blankCenter 无测量时回退估算） */
function getWordLayout(q, m, ctx) {
  if (_wlCache.key === q) return _wlCache.data;
  const layout = layoutWordQuestion(q, m, ctx);
  _wlCache = { key: q, data: layout };
  return layout;
}

/** 计算词级题完整布局：自动选择字号 + 折行 + 空槽定位 */
function layoutWordQuestion(q, m, ctx) {
  void m; // 布局为「相对卡片」几何，与怪兽绝对位置无关
  const item = q.item;
  const pieces = buildWordPieces(q, item);
  let chosen = null;
  for (const fs of WL_FONT_STEPS) {
    const r = wrapWordPieces(ctx, pieces, item, fs);
    const lineH = Math.ceil(fs * 1.3);
    if (r.lines.length * lineH <= WL_REGION_H) {
      chosen = { fs, lineH, lines: r.lines, slotW: r.slotW };
      break;
    }
  }
  if (!chosen) {
    const fs = WL_FONT_STEPS[WL_FONT_STEPS.length - 1];
    const r = wrapWordPieces(ctx, pieces, item, fs);
    chosen = { fs, lineH: Math.ceil(fs * 1.3), lines: r.lines, slotW: r.slotW };
  }
  // 定位 slot：所在行号 + 行内前序宽度（供炮弹落点/命中特效定位）
  let slot = null;
  for (let li = 0; li < chosen.lines.length; li++) {
    const line = chosen.lines[li];
    let acc = 0;
    for (const pc of line) {
      if (pc.t === 'slot') { slot = { line: li, before: acc }; break; }
      acc += pc.w;
    }
    if (slot) break;
  }
  if (slot) slot.w = chosen.slotW;
  chosen.slot = slot;
  chosen.lineTotal = chosen.lines.map((line) => {
    let t = 0;
    for (const pc of line) t += (pc.t === 'slot' ? chosen.slotW : pc.w);
    return t;
  });
  return chosen;
}

/**
 * 绘制词级题：题干/整词空槽/尾句（可折行），空槽闪烁+呼吸，
 * 作答后槽内填入整词；底部提示行用防剧透 hintText。
 */
function drawWordQuestion(ctx, state, now) {
  const m = state.monster;
  const q = state.question;
  const item = q.item;
  const layout = getWordLayout(q, m, ctx);
  const fs = layout.fs;
  const lineH = layout.lineH;
  const idle = state.state === 'idle';
  const blink = idle ? (0.5 + 0.5 * Math.sin(now * 0.006 + m.blinkSeed)) : 0.2;
  const startY = m.y + WL_TOP + (WL_REGION_H - layout.lines.length * lineH) / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let li = 0; li < layout.lines.length; li++) {
    const line = layout.lines[li];
    const y = startY + lineH * (li + 0.5);
    let x = (W - layout.lineTotal[li]) / 2;
    for (const pc of line) {
      if (pc.t === 'slot') {
        const breathe = idle ? (1 + 0.06 * Math.sin(now * 0.005 + m.blinkSeed)) : 1;
        const boxW = layout.slotW * breathe;
        const boxH = wlSlotH(fs) * breathe;
        ctx.fillStyle = q.filled
          ? 'rgba(255,255,255,0.25)'
          : 'rgba(255,255,255,' + (0.3 + 0.5 * blink).toFixed(3) + ')';
        roundRect(ctx, x + (layout.slotW - boxW) / 2, y - boxH / 2, boxW, boxH, 8); ctx.fill();
        ctx.strokeStyle = q.filled ? (q.filledColor || '#fff') : 'rgba(255,255,255,.9)';
        ctx.lineWidth = 2;
        roundRect(ctx, x + (layout.slotW - boxW) / 2, y - boxH / 2, boxW, boxH, 8); ctx.stroke();
        if (q.filled) {
          ctx.fillStyle = q.filledColor || '#fff';
          ctx.font = wlFont(fs);
          ctx.textAlign = 'center';
          ctx.fillText(wlAnswerText(item, q.answer), x + layout.slotW / 2, y + 1);
          ctx.textAlign = 'left';
        }
        x += layout.slotW;
      } else {
        ctx.font = wlFont(fs);
        ctx.fillStyle = '#fff';
        ctx.fillText(pc.s, x, y + 1);
        x += pc.w;
      }
    }
  }

  // 底部提示（防剧透）：词级题提示由 engine 预置为 safeHint/引导语
  const hint = (q.hintText != null && q.hintText !== '') ? q.hintText : meaningText(item);
  ctx.font = wlFont(WL_HINT_FS);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.textAlign = 'center';
  ctx.fillText('提示：' + hint, W / 2, m.y + MON_H - 16);
}

/**
 * 圆角矩形路径（平移原型 roundRect，第 341-350 行）。
 * 注意：仅构造路径，需由调用方 fill() 或 stroke()。
 * @param {CanvasRenderingContext2D} c
 * @param {number} x 左上角 x
 * @param {number} y 左上角 y
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} r 圆角半径
 */
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ============ 主渲染入口 ============
/**
 * 渲染一帧游戏画面。
 * 顺序：清屏 → 天空 → 怪兽 → 炮台 → 炮弹 → 粒子 → ✓反馈。
 *
 * @param {CanvasRenderingContext2D} ctx Canvas 2D 上下文
 * @param {Object} state 全局状态 G
 * @param {number} now 当前时间戳（毫秒，来自 rAF）
 */
function render(ctx, state, now) {
  ctx.clearRect(0, 0, W, H);
  drawSky(ctx);
  if (state.monster && state.question) drawMonster(ctx, state, now);
  drawCannon(ctx, state);
  if (state.bullet) drawBullet(ctx, state.bullet);
  drawParticles(ctx, state);
  drawCheckmark(ctx, state);
}

// ============ 天空（云朵） ============
function drawSky(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  roundRect(ctx, 20, 70, 70, 22, 11); ctx.fill();
  roundRect(ctx, 300, 120, 60, 20, 10); ctx.fill();
  roundRect(ctx, 40, 180, 50, 16, 8); ctx.fill();
}

// ============ 怪兽（题目卡片） ============
function drawMonster(ctx, state, now) {
  const m = state.monster;
  const q = state.question;
  const item = q.item;
  const angry = m.anger ? 1 : 0;
  // 答错抖动：随机水平偏移（REQ-GAME-7）
  const sx = m.shake ? (Math.random() - 0.5) * m.shake : 0;
  const scale = 1 + angry * 0.08;
  const x = m.x + sx, y = m.y;

  ctx.save();
  ctx.translate(W / 2, y + MON_H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -(y + MON_H / 2));

  // 身体（题目卡片）
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.22)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = m.color;
  roundRect(ctx, x, y, MON_W, MON_H, 26); ctx.fill();
  ctx.restore();
  // 描边：答错时红色闪光（REQ-GAME-7）
  ctx.lineWidth = 4;
  ctx.strokeStyle = angry ? '#ff3b30' : '#fff';
  roundRect(ctx, x, y, MON_W, MON_H, 26); ctx.stroke();

  // 头顶角
  ctx.fillStyle = m.color;
  ctx.beginPath();
  ctx.moveTo(x + 28, y + 8); ctx.lineTo(x + 40, y - 14); ctx.lineTo(x + 56, y + 10);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = angry ? '#ff3b30' : '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + MON_W - 28, y + 8); ctx.lineTo(x + MON_W - 40, y - 14); ctx.lineTo(x + MON_W - 56, y + 10);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // 眼睛
  const eyeY = y + 34;
  drawEye(ctx, x + MON_W * 0.3, eyeY, angry);
  drawEye(ctx, x + MON_W * 0.7, eyeY, angry);

  // 怪兽皮肤徽章（emoji 占位）：置于卡片顶部中央，标识当前 boss 皮肤
  if (m.emoji) {
    ctx.font = '16px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.emoji, x + MON_W / 2, y + 18);
  }

  // H2-B：词级题（fill/trans/xhy/zc）—— 整词空槽布局，不走逐字挖格
  if (q.wordLevel) {
    drawWordQuestion(ctx, state, now);
    ctx.restore();
    return;
  }

  // 题目字符（含挖空格闪烁+呼吸缩放动画，REQ-GAME-10）
  const w = q.w;
  // 英文单词展示用首字母大写（Title Case）逐字，中文原样（M6-4 可读性）
  const isEnWord = (item.type === 'w1' || item.type === 'w2' || item.type === 'en');
  const titleW = isEnWord ? titleCaseWord(w) : w;
  const charW = clamp(34, 10, 170 / Math.max(4, w.length));
  const total = w.length * charW;
  const startX = (W - total) / 2 + charW / 2;
  const textY = y + MON_H * 0.62;
  const fontSize = w.length > 5 ? 28 : 34;
  ctx.font = 'bold ' + fontSize + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < w.length; i++) {
    if (i === q.blankIdx) {
      const bx = startX + i * charW;
      // 空格框：闪烁 + 呼吸缩放（待填感更强），填充后停止动画
      const idle = state.state === 'idle';
      const blink = idle ? (0.5 + 0.5 * Math.sin(now * 0.006 + m.blinkSeed)) : 0.2;
      const breathe = idle ? (1 + 0.08 * Math.sin(now * 0.005 + m.blinkSeed)) : 1;
      const boxW = (charW - 4) * breathe;
      const boxH = 44 * breathe;
      ctx.fillStyle = q.filled ? m.color : 'rgba(255,255,255,' + (0.35 + 0.55 * blink) + ')';
      roundRect(ctx, bx - boxW / 2, textY - boxH / 2, boxW, boxH, 10); ctx.fill();
      ctx.strokeStyle = angry ? '#ff3b30' : 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2.5;
      roundRect(ctx, bx - boxW / 2, textY - boxH / 2, boxW, boxH, 10); ctx.stroke();
      if (q.filled) {
        // 填充后显示正确/所选字符（绿色=答对，粉色=答错）
        ctx.fillStyle = q.filledColor || '#fff';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(titleW[q.blankIdx] || displayChar(q.correct, item), bx, textY + 1);
        ctx.font = 'bold ' + fontSize + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      }
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillText(titleW[i] || displayChar(w[i], item), startX + i * charW, textY + 1);
    }
  }

  // 释义提示（用 hint 而非 a/zh：a 是完整答案词，直接展示会剧透待填字，见 meaningText）
  ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillText('提示：' + meaningText(item), W / 2, y + MON_H - 16);
  ctx.restore();
}

// 怪兽眼睛
function drawEye(ctx, cx, cy, angry) {
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 3, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = angry ? '#ff3b30' : '#333'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy - 2, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
}

// ============ 炮台（战士皮肤） ============
function drawCannon(ctx, state) {
  // 战士皮肤：取 state.warriorSkin（engine 注入的 { emoji, color }），无则回退默认
  const skin = (state && state.warriorSkin) || DEFAULT_WARRIOR;
  const cx = W / 2, cy = CANNON_Y;
  ctx.save();
  // 底座（卡通硬阴影平台，保留"炮台"站位感）
  ctx.fillStyle = '#5c7f9e';
  roundRect(ctx, cx - 30, cy - 4, 60, 18, 8); ctx.fill();
  // 皮肤角色：emoji 占位（战士本体）
  ctx.font = '30px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(skin.emoji, cx, cy - 24);
  ctx.restore();
}

// ============ 炮弹 ============
function drawBullet(ctx, b) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.25)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = b.correct ? '#7bd389' : '#ffb703';
  ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(b.x - 3, b.y - 3, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ============ 粒子 + 弹字 ============
function drawParticles(ctx, state) {
  // 粒子（爆炸圆点 + 星星 ★，REQ-GAME-6 冒星星）
  for (const p of state.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    if (p.star) {
      // 星星粒子：画 ★
      ctx.font = 'bold ' + Math.round(p.size * 2) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', p.x, p.y);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // 弹字（+100 / -1命 / 连击提示）
  for (const p of state.popups) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.font = 'bold 22px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

// ============ ✓ 反馈（绿色，放大淡出，REQ-GAME-6） ============
function drawCheckmark(ctx, state) {
  if (!state.checkmark) return;
  const ck = state.checkmark;
  const progress = ck.t / ck.life;
  const scale = 1 + progress * 1.5; // 放大
  const alpha = 1 - progress;        // 淡出
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.font = 'bold ' + Math.round(48 * scale) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4cae4c';
  ctx.fillText('✓', ck.x, ck.y);
  ctx.restore();
}

// ============ 挖空格中心坐标（供 engine 计算炮弹目标） ============
/**
 * 计算当前挖空格中心坐标（平移原型 blankCenter，第 587-595 行）。
 *
 * 词级题（H2-B）：返回「整词空槽」中心，与 renderer 词级布局完全一致；
 * 字符级题：沿用逐字挖空坐标。
 *
 * @param {Object} state 全局状态 G
 * @param {Object} [ctx] Canvas 2D 上下文（供 measureText 精确测量；缺省用估算）
 * @returns {{ x: number, y: number }} 空槽/空格中心
 */
function blankCenter(state, ctx) {
  const m = state.monster;
  const q = state.question;
  if (q && q.wordLevel) {
    const layout = getWordLayout(q, m, ctx || null);
    if (layout && layout.slot) {
      const lineH = layout.lineH;
      const startY = m.y + WL_TOP + (WL_REGION_H - layout.lines.length * lineH) / 2;
      const y = startY + lineH * (layout.slot.line + 0.5);
      const x = (W - layout.lineTotal[layout.slot.line]) / 2 +
        layout.slot.before + layout.slot.w / 2;
      return { x: x, y: y };
    }
    // 防御：布局异常时退回卡片中心
    return { x: W / 2, y: m.y + MON_H * 0.55 };
  }
  const w = q.w;
  const charW = clamp(34, 10, 170 / Math.max(4, w.length));
  const total = w.length * charW;
  const startX = (W - total) / 2 + charW / 2;
  const textY = m.y + MON_H * 0.55;
  return { x: startX + q.blankIdx * charW, y: textY };
}

module.exports = {
  render,
  blankCenter,
  // 导出工具函数供 engine 复用
  roundRect,
  clamp
};