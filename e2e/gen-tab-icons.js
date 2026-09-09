// 生成 4 Tab 图标（81×81 PNG）：active #4285F4 / inactive #AAB6C8
// 图形（白色）：home=房子, play=▶三角, study=柱状图, mine=人形
// 运行：node e2e/gen-tab-icons.js   （输出到 miniprogram/assets/tab/）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 81;
const ACTIVE = [66, 133, 244];   // #4285F4
const INACTIVE = [170, 182, 200]; // #AAB6C8

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// —— 形状函数：返回 (x,y) 是否在白色图形内（归一化 0..81）——
const shapes = {
  home(x, y) { // 房子：斜顶 + 主体
    const top = (Math.abs(x - 40.5) + Math.abs(y - 26)) < 26;      // 屋顶菱形
    const body = (x > 16 && x < 65 && y > 34 && y < 62);
    const door = (x > 35 && x < 46 && y > 44 && y < 62);
    return (top || body) && !door;
  },
  play(x, y) { // 圆角三角 ▶（向右）
    const px = (x - 20) / 30, py = (y - 40.5) / 32;
    return (Math.abs(py) < 0.72) && (px > 0) && (px + Math.abs(py) * 0.7 < 1);
  },
  study(x, y) { // 柱状图 3 柱
    const bars = [
      [14, 24, 30, 56], [34, 38, 30, 56], [54, 14, 30, 56],
    ];
    return bars.some(([bx, by, bw, bh]) => x > bx && x < bx + bw && y > by && y < bh);
  },
  mine(x, y) { // 人形：头圆 + 肩/身
    const head = (x - 40.5) * (x - 40.5) + (y - 26) * (y - 26) < 11 * 11;
    const body = Math.abs(x - 40.5) < 18 && y > 46 && y < 66;
    return head || body;
  },
};

function render(kind, color) {
  const rgba = Buffer.alloc(S * S * 4);
  const r = color[0], g = color[1], b = color[2];
  const fn = shapes[kind];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const on = fn(x + 0.5, y + 0.5);
      const cx = x - 40.5, cy = y - 40.5;
      const inCircle = cx * cx + cy * cy <= 40.5 * 40.5;
      if (!inCircle) continue; // 透明（圆内裁剪，避免直角）
      rgba[i] = on ? 255 : r;
      rgba[i + 1] = on ? 255 : g;
      rgba[i + 2] = on ? 255 : b;
      rgba[i + 3] = on ? 255 : 255;
    }
  }
  return encodePNG(S, S, rgba);
}

const kinds = ['home', 'play', 'study', 'mine'];
const states = [['on', ACTIVE], ['off', INACTIVE]];
const outDir = path.join(__dirname, '..', 'miniprogram', 'assets', 'tab');
fs.mkdirSync(outDir, { recursive: true });
kinds.forEach((k) => {
  states.forEach(([suffix, color]) => {
    const file = path.join(outDir, `tab-${k}-${suffix}.png`);
    fs.writeFileSync(file, render(k, color));
    console.log('written', file, fs.statSync(file).size, 'bytes');
  });
});
console.log('done.');
