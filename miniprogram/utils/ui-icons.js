/**
 * 固定操作按钮图标：都是 10~20KB 的小图，随包内置以保证首屏/离线立即可见。
 */
'use strict';

var NAMES = ['back', 'next', 'retry', 'pause', 'resume', 'hint', 'home', 'confirm'];
var KNOWN = {};
NAMES.forEach(function (name) { KNOWN[name] = 1; });

function url(name) {
  if (!KNOWN[name]) return '';
  return '/assets/ui-buttons/' + name + '.png';
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
