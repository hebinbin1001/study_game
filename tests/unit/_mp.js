/**
 * tests/unit/_mp.js —— 页面源码的位置解析（2026-10-28）
 *
 * 背景：主包一度涨到 1.76MB（自设红线 1.8MB），而 49 个页面全在主包。
 * 于是把 21 个玩法页 + level / puzzle-level / result 迁进了分包 `pkg-games`。
 * 迁完后一堆源码级护栏测试开始 ENOENT —— 它们都把 `miniprogram/pages/<name>` 写死了。
 *
 * 这里统一收敛「页面源码到底在哪」这一件事：先按 pages/ 找，找不到再按 pkg-games/ 找。
 * 以后再挪目录，只需要改这一个文件，而不是去改十几份测试里的路径字符串。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const ROOT = path.join(REPO, 'miniprogram');
const SUBPKG = 'pkg-games';

/** 去掉可选的 miniprogram/ 前缀，统一成「相对 miniprogram 的路径」 */
function norm(rel) {
  return String(rel || '').replace(/^miniprogram\//, '').replace(/^\/+/, '');
}

/**
 * 读 miniprogram 下的源码文件，自动兼容「页面在主包还是在分包」。
 * @param {string} rel 形如 'pages/index/index.js' / 'miniprogram/pkg-games/link/link.wxml'
 * @returns {string} 文件内容
 */
function readMp(rel) {
  const r = norm(rel);
  const candidates = [path.join(ROOT, r)];
  if (r.indexOf('pages/') === 0) {
    candidates.push(path.join(ROOT, SUBPKG, r.slice('pages/'.length)));
  }
  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return fs.readFileSync(candidates[i], 'utf8');
  }
  throw new Error('找不到页面源码：' + rel + '（已尝试 ' + candidates.join(' 与 ') + '）');
}

/**
 * 页面目录绝对路径（如 'match' → miniprogram/pkg-games/match）。
 * @param {string} name 页面目录名
 */
function pageDir(name) {
  const a = path.join(ROOT, 'pages', name);
  if (fs.existsSync(a)) return a;
  return path.join(ROOT, SUBPKG, name);
}

module.exports = { REPO: REPO, ROOT: ROOT, SUBPKG: SUBPKG, readMp: readMp, pageDir: pageDir };
