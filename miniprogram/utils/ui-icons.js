/**
 * 固定操作按钮图标：走云托管静态资源，加载失败时由调用方保留文字。
 */
'use strict';

var art = require('./art');

var NAMES = ['back', 'next', 'retry', 'pause', 'resume', 'hint', 'home', 'confirm'];
var KNOWN = {};
NAMES.forEach(function (name) { KNOWN[name] = 1; });

function url(name) {
  if (!KNOWN[name]) return '';
  return art.artUrl('/assets/ui-buttons/' + name + '.png');
}

function urls() {
  var result = {};
  NAMES.forEach(function (name) { result[name] = url(name); });
  return result;
}

module.exports = {
  NAMES: NAMES,
  url: url,
  urls: urls
};
