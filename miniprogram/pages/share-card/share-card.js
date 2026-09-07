// 战绩分享卡页（M6-K）：Canvas 2D 绘制竖版海报 → 导出临时图 → 保存相册/转发
//
// 画布逻辑坐标系 600×900；onReady 里按实际 CSS 尺寸与 dpr 做等比缩放，
// 绘制完成后 wx.canvasToTempFilePath 导出为图片展示（参照 game.js onReady 的 node 用法）。

var LOGIC_W = 600;
var LOGIC_H = 900;

Page({
  data: {
    nickname: '游客',
    rankName: '未定阶',
    stars: 0,
    tmpPath: '',   // 导出的临时图片路径（成功后显示并用于分享）
    saving: false
  },

  // 供 onShareAppMessage 使用的导出图
  _tmpPath: '',

  onLoad: function (options) {
    options = options || {};
    var nick = decodeURIComponent(options.nickname || '').trim();
    this.setData({
      nickname: nick || '游客',
      rankName: decodeURIComponent(options.rankName || '').trim() || '未定阶',
      stars: parseInt(options.stars, 10) || 0
    });
  },

  onReady: function () {
    this.drawCard();
  },

  // 绘制并把 canvas 导出为临时图片
  drawCard: function () {
    var self = this;
    wx.createSelectorQuery().in(this)
      .select('#share-canvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          wx.showToast({ title: '画布初始化失败', icon: 'none' });
          return;
        }
        var node = res[0].node;
        var ctx = node.getContext('2d');
        var cssW = res[0].width;
        var cssH = res[0].height;
        var dpr = wx.getSystemInfoSync().pixelRatio || 1;

        node.width = cssW * dpr;
        node.height = cssH * dpr;
        // 逻辑 600×900 → 物理像素
        ctx.scale((dpr * cssW) / LOGIC_W, (dpr * cssH) / LOGIC_H);

        self._paint(ctx);

        // 导出（等一帧保证绘制完成）
        setTimeout(function () {
          wx.canvasToTempFilePath({
            canvas: node,
            success: function (r) {
              self._tmpPath = r.tempFilePath;
              self.setData({ tmpPath: r.tempFilePath });
            },
            fail: function () {
              wx.showToast({ title: '生成图片失败，请重试', icon: 'none' });
            }
          }, self);
        }, 150);
      });
  },

  // 核心绘制（坐标系 0..600 × 0..900）
  _paint: function (ctx) {
    var W = LOGIC_W;
    var H = LOGIC_H;
    var d = this.data;
    ctx.clearRect(0, 0, W, H);

    // 天空渐变
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#7ec8ff');
    sky.addColorStop(0.55, '#b9e3ff');
    sky.addColorStop(1, '#e4f6ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 装饰云朵
    this._cloud(ctx, 90, 180, 46);
    this._cloud(ctx, 470, 300, 36);
    this._cloud(ctx, 120, 640, 30);

    // 顶部标题
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillText('⚔️ 词力战士', W / 2, 150);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 中部信息卡（白底大圆角）
    var cardX = 70;
    var cardY = 300;
    var cardW = W - cardX * 2;
    var cardH = 330;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.14)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    this._roundRect(ctx, cardX, cardY, cardW, cardH, 28);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 昵称
    var nick = this._ellipsis(ctx, d.nickname, 10, 40);
    ctx.fillStyle = '#3a3a5c';
    ctx.font = 'bold 46px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(nick, W / 2, cardY + 88);

    // 分隔线
    ctx.strokeStyle = '#eef2f8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cardX + 50, cardY + 150);
    ctx.lineTo(cardX + cardW - 50, cardY + 150);
    ctx.stroke();

    // 段位
    ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#5c7f9e';
    ctx.fillText('段位：' + d.rankName, W / 2, cardY + 208);

    // 累计星
    ctx.font = 'bold 40px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#ffb703';
    ctx.fillText('累计 ★ × ' + d.stars, W / 2, cardY + 270);

    // 底部 slogan
    ctx.fillStyle = 'rgba(60,90,120,0.75)';
    ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('打怪学字词，一起来挑战！', W / 2, H - 80);
  },

  // 圆角矩形路径
  _roundRect: function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  // 简化云朵（三个圆）
  _cloud: function (ctx, cx, cy, r) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + r * 1.15, cy - r * 0.25, r * 0.8, 0, Math.PI * 2);
    ctx.arc(cx - r * 1.15, cy - r * 0.2, r * 0.7, 0, Math.PI * 2);
    ctx.arc(cx + r * 1.6, cy + r * 0.15, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  },

  // 超长昵称截断（粗略按字符估算 + measureText 精修）
  _ellipsis: function (ctx, text, maxLen, fontSize) {
    var s = String(text || '');
    if (!s) return s;
    ctx.font = 'bold ' + fontSize + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    var ell = '…';
    while (s.length > 1 && ctx.measureText(s).width > 400) {
      s = s.slice(0, -1);
    }
    if (String(text).length > s.length) s = s.slice(0, -1) + ell;
    return s;
  },

  // 保存到相册（需授权；拒绝引导去设置）
  saveToAlbum: function () {
    var self = this;
    if (!this._tmpPath) {
      wx.showToast({ title: '图片尚未生成，请稍候', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: this._tmpPath,
      success: function () {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '';
        if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启「保存到相册」权限后重试',
            confirmText: '去设置',
            success: function (r) {
              if (r.confirm && wx.openSetting) {
                wx.openSetting({});
              }
            }
          });
        } else {
          wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        }
      }
    });
  },

  // 转发给好友（携带当前战绩参数，分享图用导出的临时图片）
  onShareAppMessage: function () {
    var q =
      'nickname=' + encodeURIComponent(this.data.nickname) +
      '&rankName=' + encodeURIComponent(this.data.rankName) +
      '&stars=' + this.data.stars;
    return {
      title: '我在「词力战士」段位 ' + this.data.rankName + '，快来挑战！',
      path: '/pages/share-card/share-card?' + q,
      imageUrl: this._tmpPath || undefined
    };
  },

  goBack: function () {
    wx.navigateBack();
  }
});
