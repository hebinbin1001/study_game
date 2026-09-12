/**
 * assets-limit.test.js —— 资源包体阈值护栏（用户硬性要求，禁止被改宽）
 *
 * 背景：用户 2026-09-12 明确要求「图片和音频大小不能超过 200K」。
 * 这条规则由 `e2e/check-assets.js` 在静态层强制执行（超标退出码 1），
 * 但阈值本身写在脚本常量里 —— 万一以后有人为了「先让流水线绿」把它改宽，
 * 规则就悄悄失效了。这个用例把阈值本身也当成契约守起来。
 *
 * 做法：静态读取 `e2e/check-assets.js` 源码断言阈值与覆盖范围，
 * 再真扫一遍 `miniprogram/` 里的图片/音频，确认当前素材没有超标的
 * （与 check-assets 的判定同口径，任一侧失效都能发现）。
 *
 * 运行：node tests/unit/assets-limit.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('资源包体上限（图片/音频 ≤200KB）');

const ROOT = path.resolve(__dirname, '../..');
const CHECK_SRC = path.join(ROOT, 'e2e', 'check-assets.js');
const MINIPROGRAM = path.join(ROOT, 'miniprogram');

const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.flac', '.amr'];
const SKIP_DIRS = ['assets-src', 'node_modules', 'miniprogram_npm'];

/** 从校验脚本里抠出某个常量的字面量值（避免直接 require：脚本 main() 会执行） */
function constOf(src, name) {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);'));
  return m ? m[1].trim() : '';
}

function scanAssets(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.indexOf(ent.name) !== -1) return;
      scanAssets(p, out);
      return;
    }
    const ext = path.extname(ent.name).toLowerCase();
    const isImage = IMG_EXT.indexOf(ext) !== -1;
    const isAudio = AUDIO_EXT.indexOf(ext) !== -1;
    if (!isImage && !isAudio) return;
    out.push({
      file: path.relative(MINIPROGRAM, p).split(path.sep).join('/'),
      kb: fs.statSync(p).size / 1024,
      isImage: isImage,
      isAudio: isAudio,
    });
  });
  return out;
}

s.test('校验脚本：单文件硬限必须是 200KB（不能被改宽）', () => {
  const src = fs.readFileSync(CHECK_SRC, 'utf8');
  const cap = constOf(src, 'MAX_FILE_KB');
  s.assert.ok(cap, 'e2e/check-assets.js 里应有 MAX_FILE_KB 常量（找不到说明被改名了，护栏要跟着改）');
  s.assert.equal(Number(cap), 200, '单文件硬限必须是 200KB（用户要求），实际 MAX_FILE_KB = ' + cap);
  s.assert.ok(Number(cap) <= 200, '规则只能更严，不能放宽到 200KB 以上');
});

s.test('校验脚本：音频格式必须在扫描范围内', () => {
  const src = fs.readFileSync(CHECK_SRC, 'utf8');
  const m = src.match(/AUDIO_EXT\s*=\s*\[([^\]]*)\]/);
  s.assert.ok(m, 'e2e/check-assets.js 里应有 AUDIO_EXT 列表（否则音频超标不会被发现）');
  const list = m ? m[1] : '';
  ['.mp3', '.wav', '.m4a'].forEach((ext) => {
    s.assert.ok(list.indexOf(ext) !== -1, '常见音频格式 ' + ext + ' 必须被扫描到');
  });
  s.assert.ok(/f\.isAudio/.test(src) || /isAudio/.test(src), '校验逻辑要真的用上音频判定');
});

s.test('校验脚本：整包阈值不能放宽到 2MB 以上', () => {
  const src = fs.readFileSync(CHECK_SRC, 'utf8');
  const mb = Number(constOf(src, 'MAX_PACKAGE_MB'));
  s.assert.ok(mb > 0, '找不到 MAX_PACKAGE_MB');
  s.assert.ok(mb <= 1.8, '整包阈值要留余量（微信主包 2MB 硬限），实际 ' + mb + 'MB');
});

s.test('当前素材：没有任何图片或音频超过 200KB', () => {
  const all = scanAssets(MINIPROGRAM, []);
  s.assert.ok(all.length > 0, '没扫到任何素材，扫描逻辑或目录结构可能变了');
  const over = all.filter((f) => f.kb > 200).sort((a, b) => b.kb - a.kb);
  s.assert.equal(over.length, 0,
    '超标文件：' + over.slice(0, 5).map((f) => f.file + '(' + f.kb.toFixed(0) + 'KB)').join('、'));
  // 素材都在包内，报告一下实际占用，便于判断余量
  const totalKB = all.reduce((n, f) => n + f.kb, 0);
  const audios = all.filter((f) => f.isAudio).length;
  s.assert.ok(totalKB < 1024,
    '素材总量应远小于 1MB（当前 ' + totalKB.toFixed(0) + 'KB / 音频 ' + audios + ' 个）');
});
