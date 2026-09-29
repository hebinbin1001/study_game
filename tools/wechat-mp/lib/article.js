/**
 * tools/wechat-mp/lib/article.js —— 公众号文章的配置解析与 HTML 生成
 *
 * 这里只有**纯函数**（无网络、无文件写入、无浏览器），所以能被单测覆盖：
 * 配置写错了要能在动手操作浏览器之前就报出来，而不是填到一半才发现。
 *
 * 配置文件格式（JSON）：
 *   {
 *     "title":      "标题（≤64 字，公众号硬限制）",
 *     "author":     "作者（可空）",
 *     "cover":      "final/01-cover.jpg",   // 封面图；若已在 blocks 里就直接选它，否则插到正文最前
 *     "summary":    "摘要（可空，留空由公众号自动取正文前 120 字）",
 *     "blocks": [
 *       { "type": "h2",  "text": "一、小节标题" },
 *       { "type": "p",   "text": "段落", "bold": false },
 *       { "type": "img", "src": "final/02-ch-monster.jpg" }
 *     ]
 *   }
 *
 * 图片路径一律**相对于配置文件所在目录**。
 */
'use strict';

const path = require('path');

/** 公众号标题上限（超出会被截断，所以在本地就拦下） */
const TITLE_MAX = 64;

/** 支持的正文块类型 */
const BLOCK_TYPES = ['h2', 'p', 'img'];

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 解析并校验配置。**不抛错**，把问题收集成 errors 返回，便于一次报全。
 * @param {Object} raw JSON.parse 后的原始配置
 * @returns {{errors: string[], config: Object}}
 */
function parseConfig(raw) {
  const errors = [];
  const config = { title: '', author: '', cover: '', summary: '', blocks: [] };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: ['配置根部必须是一个对象'], config: config };
  }

  const title = String(raw.title == null ? '' : raw.title).trim();
  if (!title) errors.push('缺少 title');
  else if (Array.from(title).length > TITLE_MAX) {
    errors.push('title 有 ' + Array.from(title).length + ' 字，超过公众号上限 ' + TITLE_MAX);
  }
  config.title = title;
  config.author = String(raw.author == null ? '' : raw.author).trim();
  config.cover = String(raw.cover == null ? '' : raw.cover).trim();
  config.summary = String(raw.summary == null ? '' : raw.summary).trim();

  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (!blocks.length) errors.push('blocks 为空，没有正文内容');

  blocks.forEach(function (b, i) {
    const where = 'blocks[' + i + ']';
    if (!b || typeof b !== 'object') { errors.push(where + ' 不是对象'); return; }
    const type = String(b.type == null ? '' : b.type).trim();
    if (BLOCK_TYPES.indexOf(type) < 0) {
      errors.push(where + ' 类型不支持：' + (type || '(空)') + '（只支持 ' + BLOCK_TYPES.join('/') + '）');
      return;
    }
    if (type === 'img') {
      const src = String(b.src == null ? '' : b.src).trim();
      if (!src) { errors.push(where + ' 缺少 src'); return; }
      config.blocks.push({ type: 'img', src: src });
      return;
    }
    const text = String(b.text == null ? '' : b.text).trim();
    if (!text) { errors.push(where + ' 缺少 text'); return; }
    config.blocks.push({ type: type, text: text, bold: !!b.bold });
  });

  if (config.cover && !String(config.cover).trim()) errors.push('cover 为空字符串');
  return { errors: errors, config: config };
}

/**
 * 生成要粘进公众号编辑器的正文 HTML。
 *
 * 图片不给真实地址 —— 公众号只认它自己上传的图，所以这里放 `@@IMG:n@@` 占位标记，
 * 随后由 publish-draft 逐张上传、替换标记。n 从 1 开始，与 imageTasks 的顺序一致。
 *
 * @param {Object} config parseConfig 出来的 config
 * @returns {string} HTML
 */
function buildBodyHtml(config) {
  let seq = 0;
  return (config.blocks || []).map(function (b) {
    if (b.type === 'img') {
      seq++;
      return '<p>@@IMG:' + seq + '@@</p>';
    }
    const text = escapeHtml(b.text);
    if (b.type === 'h2') return '<h2>' + text + '</h2>';
    return '<p>' + (b.bold ? '<strong>' + text + '</strong>' : text) + '</p>';
  }).join('');
}

/**
 * 正文里需要上传的图片清单（顺序 = 出现顺序）。
 * @param {Object} config
 * @param {string} baseDir 配置文件所在目录（图片相对它的路径）
 * @returns {Array<{id: string, src: string, file: string}>}
 */
function imageTasks(config, baseDir) {
  const tasks = [];
  let seq = 0;
  (config.blocks || []).forEach(function (b) {
    if (b.type !== 'img') return;
    seq++;
    tasks.push({
      id: String(seq),
      src: b.src,
      file: path.resolve(baseDir || '.', b.src)
    });
  });
  return tasks;
}

/** 纯文本版正文（粘贴时作为 text/plain 附带，编辑器取不到 HTML 时兜底） */
function bodyPlainText(config) {
  return (config.blocks || []).map(function (b) {
    return b.type === 'img' ? '' : b.text;
  }).filter(Boolean).join('\n');
}

/**
 * 封面在正文缩略图列表里是第几张（1-based）。
 * 公众号的「从正文选择」必须点缩略图，所以要知道序号。
 * @returns {number|null} 不在正文里就返回 null（调用方据此决定要不要先插到最前）
 */
function coverIndexInBody(config) {
  if (!config.cover) return null;
  const target = String(config.cover).trim();
  let seq = 0;
  let hit = null;
  (config.blocks || []).forEach(function (b) {
    if (b.type !== 'img') return;
    seq++;
    // 路径写法可能不同（./ 前缀、反斜杠），统一成 posix 再比
    const a = String(b.src).replace(/\\/g, '/').replace(/^\.\//, '');
    const c = target.replace(/\\/g, '/').replace(/^\.\//, '');
    if (a === c) hit = seq;
  });
  return hit;
}

module.exports = {
  TITLE_MAX: TITLE_MAX,
  BLOCK_TYPES: BLOCK_TYPES,
  parseConfig: parseConfig,
  buildBodyHtml: buildBodyHtml,
  imageTasks: imageTasks,
  bodyPlainText: bodyPlainText,
  coverIndexInBody: coverIndexInBody,
  escapeHtml: escapeHtml
};
