#!/usr/bin/env node
/**
 * tools/art/resize-png.js —— 纯 Node 的 PNG 等比缩放（不依赖 Pillow / ImageMagick）
 *
 * 为什么需要（2026-10-17）：
 *   项目原有的 `e2e/compress-assets.py` 依赖 Pillow，而当前开发机装不上（pip 无网络）。
 *   美术批次又只出 512×512 原图，直接扔给 CDN 会让首页为一张 55px 的 Boss 卡下载 350KB。
 *   这个脚本做两件事：解码 PNG（RGBA）→ 双线性缩放到指定尺寸 → 重新编码 PNG。
 *
 * 用法：
 *   node tools/art/resize-png.js <输入目录> <输出目录> <目标边长> [文件名前缀] [--trim]
 * 例：
 *   node tools/art/resize-png.js "E:/Code/小程序/study_game/assets-src/skins" art/skins 320 boss_ --trim
 *
 * --trim：先按 alpha 裁掉四周透明边（留 6% 安全边），再等比缩放。
 *   美术交的图常见「主体只占画面 60%，四周大片透明」，直接用会显得比旧素材小一圈；
 *   裁边后所有立绘在同一容器里的视觉占比才一致。
 *
 * 约束：
 *   · 只处理 8bit RGBA（colorType 6）的 PNG —— 美术批次统一是这种；
 *   · 等比缩放到「长边 = 目标边长」，保持透明通道；
 *   · 双线性采样在**预乘 alpha** 空间做，避免透明边缘出现黑边。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG 解码（仅 8bit RGBA） ----------
function decodePNG(file) {
  const b = fs.readFileSync(file);
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || ctype !== 6) {
    throw new Error(path.basename(file) + ' 不是 8bit RGBA（depth=' + depth + ', colorType=' + ctype + '）');
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const bb = prev ? prev[x] : 0;
      const c = (prev && x >= 4) ? prev[x - 4] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + bb) & 255;
      else if (filter === 3) v = (v + ((a + bb) >> 1)) & 255;
      else if (filter === 4) {
        const p0 = a + bb - c;
        const pa = Math.abs(p0 - a);
        const pb = Math.abs(p0 - bb);
        const pc = Math.abs(p0 - c);
        v = (v + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c))) & 255;
      }
      cur[x] = v;
    }
  }
  return { w, h, data: out };
}

// ---------- 裁掉透明边（保留 padRatio 安全边） ----------
function trim(img, padRatio) {
  const { w, h, data } = img;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img;   // 全透明，原样返回

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const pad = Math.round(Math.max(bw, bh) * (padRatio || 0));
  const cw = Math.min(w, bw + pad * 2);
  const ch = Math.min(h, bh + pad * 2);
  // 居中：以主体中心为基准扩展
  const cx = Math.round((minX + maxX) / 2);
  const cy = Math.round((minY + maxY) / 2);
  let x0 = Math.max(0, Math.min(w - cw, cx - Math.round(cw / 2)));
  let y0 = Math.max(0, Math.min(h - ch, cy - Math.round(ch / 2)));

  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    data.copy(
      out,
      y * cw * 4,
      ((y0 + y) * w + x0) * 4,
      ((y0 + y) * w + x0 + cw) * 4
    );
  }
  return { w: cw, h: ch, data: out };
}

// ---------- 双线性缩放（预乘 alpha） ----------
function resize(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.w, img.h));
  const dw = Math.max(1, Math.round(img.w * scale));
  const dh = Math.max(1, Math.round(img.h * scale));
  if (dw === img.w && dh === img.h) return { w: dw, h: dh, data: img.data };

  const src = img.data;
  const dst = Buffer.alloc(dw * dh * 4);
  const sx = img.w / dw;
  const sy = img.h / dh;

  for (let y = 0; y < dh; y++) {
    const fy = Math.min(img.h - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(img.h - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(img.w - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(img.w - 1, x0 + 1);
      const wx = fx - x0;

      // 预乘后插值：透明像素的 RGB 不参与颜色，避免边缘发黑
      let r = 0, g = 0, b = 0, a = 0;
      const pts = [
        [x0, y0, (1 - wx) * (1 - wy)],
        [x1, y0, wx * (1 - wy)],
        [x0, y1, (1 - wx) * wy],
        [x1, y1, wx * wy]
      ];
      for (let i = 0; i < 4; i++) {
        const p = pts[i];
        const o = (p[1] * img.w + p[0]) * 4;
        const al = src[o + 3] / 255;
        const wt = p[2] * al;
        r += src[o] * wt;
        g += src[o + 1] * wt;
        b += src[o + 2] * wt;
        a += p[2] * al;
      }
      const o2 = (y * dw + x) * 4;
      if (a > 0) {
        dst[o2] = Math.round(r / a);
        dst[o2 + 1] = Math.round(g / a);
        dst[o2 + 2] = Math.round(b / a);
        dst[o2 + 3] = Math.round(a * 255);
      } else {
        dst[o2] = 0; dst[o2 + 1] = 0; dst[o2 + 2] = 0; dst[o2 + 3] = 0;
      }
    }
  }
  return { w: dw, h: dh, data: dst };
}

// ---------- PNG 编码（RGBA, filter 0） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = img.w * 4;
  const raw = Buffer.alloc((stride + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (stride + 1)] = 0;  // filter: none
    img.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- 主流程 ----------
function main() {
  const args = process.argv.slice(2);
  const trimFlag = args.indexOf('--trim') >= 0;
  const bare = args.filter((a) => a !== '--trim');
  const [srcDir, outDir, sizeArg, prefix] = bare;
  if (!srcDir || !outDir || !sizeArg) {
    console.log('用法: node tools/art/resize-png.js <输入目录> <输出目录> <目标边长> [文件名前缀] [--trim]');
    process.exit(2);
  }
  const maxSide = parseInt(sizeArg, 10);
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .filter((f) => !prefix || f.indexOf(prefix) === 0);

  if (!files.length) {
    console.log('没有匹配的 PNG（前缀 ' + (prefix || '无') + '）');
    process.exit(1);
  }

  let ok = 0;
  files.forEach((f) => {
    const src = path.join(srcDir, f);
    const dst = path.join(outDir, f);
    try {
      const img = decodePNG(src);
      // --trim：先裁透明边（6% 安全边），再等比缩到目标边长
      const cropped = trimFlag ? trim(img, 0.06) : img;
      const small = resize(cropped, maxSide);
      fs.writeFileSync(dst, encodePNG(small));
      console.log('  OK  ' + f + '  ' + img.w + 'x' + img.h
        + (trimFlag ? ' → 裁边 ' + cropped.w + 'x' + cropped.h : '')
        + ' → ' + small.w + 'x' + small.h
        + '  ' + (fs.statSync(src).size / 1024).toFixed(0) + 'KB → ' + (fs.statSync(dst).size / 1024).toFixed(0) + 'KB');
      ok++;
    } catch (e) {
      console.log('  ERR ' + f + '  ' + e.message);
    }
  });
  console.log('\n完成 ' + ok + '/' + files.length + ' 张 → ' + outDir);
  process.exit(ok === files.length ? 0 : 1);
}

main();
