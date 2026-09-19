/**
 * utils/avatar-upload.js —— 头像上传（2026-09-19）
 *
 * 解决什么问题：
 *   `<button open-type="chooseAvatar">` 回调给的是**微信临时文件路径**（wxfile://tmp_xxx）。
 *   以前直接把它存进 users.avatar_url，结果是：
 *     · 用户自己重启小程序后路径失效，头像变回默认；
 *     · 排行榜/管理端在**别人手机上**必然裂图。
 *   所以选完头像必须**上传到我们自己的服务**，拿回稳定地址再保存。
 *
 * 流程：选图 → 压缩到 160px（省流量也省库体积）→ 读成 base64 → POST /api/user/avatar → 返回稳定 URL。
 *
 * 失败处理：压缩或上传失败时**抛出异常**，由页面决定怎么提示；
 *          调用方**绝不能**把临时路径当头像存到云端（见 pages/nickname 的保存逻辑）。
 */

'use strict';

var request = require('./request');

/** 头像目标宽度（px）：160 够排行榜 48px 与个人页 120px 显示，且压完只有几十 KB */
var TARGET_WIDTH = 160;
var QUALITY = 80;

/**
 * 从 base64 首字节猜 MIME（压缩后可能是 png / jpeg / webp，微信不保证格式）。
 * 纯函数，便于单测。
 * @param {string} b64
 * @returns {string} 'image/png' | 'image/jpeg' | 'image/webp'，认不出时按 png
 */
function mimeOfBase64(b64) {
  var s = String(b64 || '');
  if (s.indexOf('/9j/') === 0) return 'image/jpeg';        // JPEG magic FFD8FF
  if (s.indexOf('UklGR') === 0) return 'image/webp';       // WEBP: 'RIFF'
  if (s.indexOf('iVBORw0KGgo') === 0) return 'image/png';  // PNG magic
  return 'image/png';
}

/** 读本地文件为 base64（Promise 包装） */
function readBase64(filePath) {
  return new Promise(function (resolve, reject) {
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (r) { resolve(r.data); },
      fail: function (e) { reject(new Error('读取图片失败：' + ((e && e.errMsg) || ''))); }
    });
  });
}

/**
 * 压缩图片（失败时回退原图，不让整个流程断掉）。
 * compressedWidth 需要基础库 2.26.0+；老基础库直接 resolve 原路径。
 */
function compress(filePath) {
  return new Promise(function (resolve) {
    if (!wx.compressImage) { resolve(filePath); return; }
    wx.compressImage({
      src: filePath,
      quality: QUALITY,
      compressedWidth: TARGET_WIDTH,
      success: function (r) { resolve(r.tempFilePath || filePath); },
      fail: function () { resolve(filePath); }      // 压不动就传原图，后端还有 512KB 兜底
    });
  });
}

/**
 * 上传头像。
 * @param {string} tempPath chooseAvatar 给的临时文件路径
 * @returns {Promise<string>} 稳定头像 URL（https://…/api/avatar/<openid>?v=…）
 */
function uploadAvatar(tempPath) {
  return compress(tempPath).then(readBase64).then(function (b64) {
    return request.post('/api/user/avatar', { mime: mimeOfBase64(b64), data: b64 });
  }).then(function (d) {
    if (!d || !d.avatarUrl) throw new Error('服务端未返回头像地址');
    return d.avatarUrl;
  });
}

module.exports = {
  TARGET_WIDTH: TARGET_WIDTH,
  mimeOfBase64: mimeOfBase64,
  uploadAvatar: uploadAvatar
};
