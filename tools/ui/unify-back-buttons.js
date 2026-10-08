/**
 * tools/ui/unify-back-buttons.js —— 把各页的返回按钮统一成 .btn-back（2026-10-08）
 *
 * 背景（用户反馈）：「返回按钮统一设计下，现在太普通了」。
 * 摸下来全项目一共有 **11 种**返回写法：
 *   back-pill / btn-back / back / bk-back / pl-back / ri-back / qz-back / ex-back / back-link / hud-back
 * —— 同一件事十种长相，所以看着才乱。
 *
 * 规范已在 app.wxss 定好：`.btn-back` = 白色胶囊 + 左箭头（::before）+ 文字。
 *
 * 这个脚本只改 wxml 的类名与文案：
 *   · 类名 → btn-back
 *   · 文案 → 「返回」（原来只写一个 ‹ 的圆钮，统一带上文字 —— 箭头由 CSS 的 ::before 出，
 *     所以要把手写的 ‹ 去掉，否则会出现两个箭头）
 *
 * 各页 wxss 里那些旧类名会变成死代码 —— 不一起删，是为了让这次改动小且可回滚；
 * 下轮清死代码时一起处理（它们已经不会被任何 wxml 引用了）。
 *
 * 用法：node tools/ui/unify-back-buttons.js [--dry]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES_DIR = path.join(ROOT, 'miniprogram', 'pages');
const DRY = process.argv.indexOf('--dry') >= 0;

/**
 * 要统一掉的返回按钮类名。
 *
 * ⚠️ 刻意不含 `back` 和 `back-link`：
 *   · `back` 在 word-build.wxml 里是个**布局容器**，不是按钮；
 *   · `back-link` 在昵称页还兼着「退出登录 / 注销账号」两行，一刀切会把它们也变成返回样式。
 *   这两处手工改（脚本干跑时抓出来的）。
 */
const OLD_CLASSES = [
  'back-pill', 'btn-back', 'bk-back', 'pl-back',
  'ri-back', 'qz-back', 'ex-back', 'hud-back'
];

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); return; }
    if (/\.wxml$/.test(e.name)) out.push(p);
  });
  return out;
}

let changedFiles = 0;
let changedAttrs = 0;

walk(PAGES_DIR, []).forEach(function (file) {
  let txt = fs.readFileSync(file, 'utf8');
  const before = txt;

  OLD_CLASSES.forEach(function (cls) {
    // 只匹配「class 属性里恰好就是这个类名」的情况：
    //   class="ri-back"                  → class="btn-back"
    //   class="ri-back xxx"              → class="btn-back xxx"
    // 带其它类名的一并保留（那是布局用的，不属于按钮外观）
    const re = new RegExp('class="' + cls + '(\\s[^"]*)?"', 'g');
    if (re.test(txt)) {
      changedAttrs++;
      txt = txt.replace(re, function (m, rest) {
        return 'class="btn-back' + (rest || '') + '"';
      });
    }
  });

  // 手写的 ‹ 要去掉：.btn-back 的箭头由 ::before 提供，留着会变两个
  // 只处理「按钮标签里只有 ‹ 或 ‹ 空格」这种纯箭头按钮 → 补上「返回」
  txt = txt.replace(/(<button[^>]*class="btn-back[^"]*"[^>]*>)\s*‹\s*(<\/button>)/g, '$1返回$2');
  txt = txt.replace(/(<view[^>]*class="btn-back[^"]*"[^>]*>)\s*‹\s*(<\/view>)/g, '$1返回$2');
  // 「‹ 返回」「‹ 全部玩法」这类：只去掉箭头字符，保留原有文案
  txt = txt.replace(/(<button[^>]*class="btn-back[^"]*"[^>]*>)\s*‹\s*/g, '$1');
  // ↩ 同理（数独的「↩ 关卡列表」）
  txt = txt.replace(/(<[a-z]+[^>]*class="btn-back[^"]*"[^>]*>)\s*↩\s*/g, '$1');

  if (txt !== before) {
    changedFiles++;
    console.log((DRY ? '[dry] ' : '') + path.relative(ROOT, file));
    if (!DRY) fs.writeFileSync(file, txt, 'utf8');
  }
});

console.log('');
console.log((DRY ? '（干跑，未写入）' : '已改写') + ' ' + changedFiles + ' 个 wxml，处理 ' + changedAttrs + ' 处类名');
