/**
 * tools/ui/strip-back-label.js —— 返回按钮去掉「返回」二字（2026-10-09）
 *
 * 用户反馈：「只留箭头，不留"返回"两个字」。
 *
 * 只处理**文字恰好是「返回」**的按钮；像「全部玩法」「关卡列表」「返回错题本」
 * 这类自带语义的返回按钮保持原样（它们会配 .btn-back--labeled 变体显示文字）。
 *
 * 用法：node tools/ui/strip-back-label.js [--dry]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DRY = process.argv.indexOf('--dry') >= 0;

function walk(dir, out) {
  out = out || [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (f.endsWith('.wxml')) out.push(p);
  }
  return out;
}

// 匹配：<... class="btn-back...">  返回  </...>
const RE = /(class="btn-back[^"]*"[^>]*>)\s*返回\s*(<\/)/g;

let changed = 0;
const files = walk(path.join(ROOT, 'miniprogram'));
files.forEach(function (file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(RE, '$1$2');
  if (out === src) return;
  changed++;
  if (!DRY) fs.writeFileSync(file, out, 'utf8');
  console.log((DRY ? '[dry] ' : '') + path.relative(ROOT, file).replace(/\\/g, '/'));
});

console.log('共处理 ' + changed + ' 个文件' + (DRY ? '（未写入）' : ''));
