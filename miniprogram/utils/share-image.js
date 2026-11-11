'use strict';

/**
 * utils/share-image.js —— 分享图卡（5:4，2026-11-11）
 *
 * 背景：全站分享原来只有纯文案标题，在聊天信息流里是一张灰扑扑的默认缩略图，
 * 点开率远低于「带图卡」的分享。这里用离屏 canvas 2D 画一张 5:4（微信推荐的分享图比例）
 * 的炫耀卡，`onShareAppMessage` 返回它的临时路径作 `imageUrl`。
 *
 * 设计约束：
 *   1. **纯前端、不新增美术素材**：全部用渐变 + 文字 + 星形绘制，不依赖 `art/` 图片，
 *      也不会给包体加 1KB；
 *   2. **不阻塞分享**：图没画好 / canvas 取不到 / 老基础库不支持时，分享照旧走纯文案
 *      （`imageUrl` 留空），绝不出现「点分享没反应」；
 *   3. **缓存 60 秒**：结算页/段位页的 onShow 很频繁，重新画一次要 10~30ms，没必要；
 *   4. 文案与页面上的数字同源（由页面传进来），不在这里二次计算。
 *
 * 用法（页面）：
 *   wxml: <canvas type="2d" id="shareCanvas" class="share-canvas"></canvas>
 *   js:   var shareImage = require('../../utils/share-image');
 *         shareImage.build(this, 'result', { stars: 3, score: 100, ... });
 *         onShareAppMessage: return { title, path, imageUrl: this._shareImage || '' }
 *   wxss: .share-canvas { position: fixed; left: -9999px; width: 500px; height: 400px; }
 */

/** 逻辑尺寸（微信分享图推荐 5:4） */
var W = 500;
var H = 400;
var DPR = 2;              // 背板 2 倍，聊天/朋友圈里放大也清楚
var CACHE_MS = 60 * 1000; // 同一页 60 秒内不重复画

/** 主色（与 app.wxss 的 --sky-1 / --sky-deep 一致，避免分享图绿/紫乱飞） */
var C_BG_TOP = '#2d74b8';
var C_BG_BOTTOM = '#1e5c96';
var C_GOLD = '#ffc53d';
var C_WHITE = '#ffffff';

/** 圆角矩形路径 */
function roundRect(ctx, x, y, w, h, r) {
  var rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 五角星（filled=false 画半透明白，用作「没拿到的星」） */
function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var ang = -Math.PI / 2 + i * Math.PI / 5;
    var rad = i % 2 === 0 ? r : r * 0.46;
    var x = cx + Math.cos(ang) * rad;
    var y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = C_GOLD;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
  }
}

/** 单行文字（align 默认居中） */
function text(ctx, str, x, y, font, color, align) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(str), x, y);
}

/** 文字超宽时截断加省略号 */
function fitText(ctx, str, maxWidth, font) {
  ctx.font = font;
  var s = String(str == null ? '' : str);
  if (ctx.measureText(s).width <= maxWidth) return s;
  var out = s;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

/** 画背景：渐变 + 两个半透明装饰圆（让信息流里看起来有层次） */
function drawBg(ctx) {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C_BG_TOP);
  g.addColorStop(1, C_BG_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(64, 54, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(452, 350, 120, 0, Math.PI * 2);
  ctx.fill();
}

/** 顶部品牌行 */
function drawBrand(ctx) {
  text(ctx, '词力战士 · WORD WARRIOR', W / 2, 34,
    '600 15px "PingFang SC", "Microsoft YaHei", sans-serif', 'rgba(255,255,255,0.72)');
}

/** 底部提示条（白色半透明胶囊） */
function drawFooter(ctx, msg) {
  var font = '600 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  var label = fitText(ctx, msg, 400, font);
  ctx.font = font;
  var tw = ctx.measureText(label).width;
  var pw = Math.min(440, tw + 56);
  roundRect(ctx, (W - pw) / 2, 330, pw, 46, 23);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();
  text(ctx, label, W / 2, 353, font, 'rgba(255,255,255,0.92)');
}

/** 通关结算卡 */
function drawResult(ctx, d) {
  var stars = Math.max(0, Math.min(3, parseInt(d.stars, 10) || 0));
  var failed = !!d.failed;

  drawBg(ctx);
  drawBrand(ctx);

  // 三颗星：拿到的金色、没拿到的半透明
  var starY = 118;
  var gap = 88;
  for (var i = 0; i < 3; i++) {
    star(ctx, W / 2 + (i - 1) * gap, starY, 34, i < stars);
  }

  // 主标题：先说「拿了几颗星」，这是炫耀的核心
  var title = failed
    ? '差一点就通关了！'
    : (stars > 0 ? ('拿下了 ' + stars + ' 颗星！') : '刚打完一局！');
  text(ctx, title, W / 2, 196, 'bold 40px "PingFang SC", "Microsoft YaHei", sans-serif', C_WHITE);

  // 副标题：学段 + 关卡 + 得分
  var bits = [];
  if (d.gradeLabel) bits.push(d.gradeLabel);
  if (d.level) bits.push('第 ' + d.level + ' 关');
  if (d.score) bits.push('得分 ' + d.score);
  var sub = bits.join(' · ');
  if (sub) {
    text(ctx, fitText(ctx, sub, 420, '600 23px "PingFang SC", sans-serif'), W / 2, 244,
      '600 23px "PingFang SC", "Microsoft YaHei", sans-serif', 'rgba(255,255,255,0.88)');
  }
  if (typeof d.rate === 'number' && d.rate > 0) {
    text(ctx, '正确率 ' + d.rate + '%', W / 2, 282,
      '600 21px "PingFang SC", "Microsoft YaHei", sans-serif', 'rgba(255,255,255,0.72)');
  }

  drawFooter(ctx, '打开小程序，来挑战我');
}

/** 晒段位卡 */
function drawRank(ctx, d) {
  drawBg(ctx);
  drawBrand(ctx);

  // 段位名（如「白银 Ⅲ」）是这张卡的主角
  var name = fitText(ctx, d.name || '未定级', 380,
    'bold 52px "PingFang SC", "Microsoft YaHei", sans-serif');
  text(ctx, name, W / 2, 138, 'bold 52px "PingFang SC", "Microsoft YaHei", sans-serif', C_WHITE);

  // 星数
  var stars = parseInt(d.stars, 10) || 0;
  var starFont = '600 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  text(ctx, '⭐ ' + stars + ' 星', W / 2, 202, starFont, C_GOLD);

  // 一句话（带「你能追上吗」的挑衅，分享文案的钩子）
  text(ctx, '你能追上我吗？', W / 2, 252,
    '600 24px "PingFang SC", "Microsoft YaHei", sans-serif', 'rgba(255,255,255,0.88)');

  // 卡在晋级考试时补一句，点进来的人能看到进下一段的条件
  if (d.needExam && d.nextName) {
    text(ctx, fitText(ctx, '考试通过后即可进入「' + d.nextName + '」', 420,
      '500 19px "PingFang SC", sans-serif'), W / 2, 288,
      '500 19px "PingFang SC", "Microsoft YaHei", sans-serif', 'rgba(255,255,255,0.66)');
  }

  drawFooter(ctx, '打开小程序，接受挑战');
}

/**
 * 生成/刷新一个页面的分享图。
 * @param {Object} page 页面实例（this）
 * @param {string} type 'result' | 'rank'
 * @param {Object} data 画面数据（由页面传入，字段见 drawResult / drawRank）
 * @param {string} [key] 数据签名：页面数据变了（如服务端段位回来后）要重画，
 *                       否则 60 秒缓存会让图卡停留在旧数据上（段位页踩过：图是青铜、标题是王者）
 */
function build(page, type, data, key) {
  if (!page || typeof wx === 'undefined' || !wx.createSelectorQuery) return;
  var now = Date.now();
  var sig = type + '|' + (key || '');

  // 正在画/正在导出：先记下最新数据，等这次结束再补画（否则数据一变就永久停在旧图上）
  if (page._shareBuilding) {
    page._sharePending = { type: type, data: data, key: key };
    page._sharePendingSig = sig;
    return;
  }
  if (page._shareImage && page._shareImageKey === sig && page._shareImageAt
      && now - page._shareImageAt < CACHE_MS) {
    return;
  }
  page._shareBuilding = true;

  function finish() {
    page._shareBuilding = false;
    var pend = page._sharePending;
    page._sharePending = null;
    if (pend && (pend.type + '|' + (pend.key || '')) !== page._shareImageKey) {
      build(page, pend.type, pend.data, pend.key);
    }
  }

  wx.createSelectorQuery().in(page).select('#shareCanvas')
    .fields({ node: true, size: true })
    .exec(function (res) {
      var node = res && res[0] && res[0].node;
      if (!node || !node.getContext) {
        // 老基础库 / 节点没就绪：放弃，分享走纯文案
        finish();
        return;
      }
      try {
        node.width = W * DPR;
        node.height = H * DPR;
        var ctx = node.getContext('2d');
        ctx.scale(DPR, DPR);
        if (type === 'rank') drawRank(ctx, data || {});
        else drawResult(ctx, data || {});
      } catch (e) {
        finish();
        return;
      }
      page._shareImageKey = sig;
      wx.canvasToTempFilePath({
        canvas: node,
        x: 0,
        y: 0,
        width: W * DPR,
        height: H * DPR,
        destWidth: W * DPR,
        destHeight: H * DPR,
        fileType: 'png',
        success: function (r) {
          page._shareImage = r.tempFilePath;
          page._shareImageAt = Date.now();
          finish();
        },
        fail: function () {
          finish();
        }
      }, page);
    });
}

module.exports = {
  build: build,
  SIZE: { width: W, height: H },
  // 测试用（纯函数）
  _fitText: fitText,
  _roundRect: roundRect
};
