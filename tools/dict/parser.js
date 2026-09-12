/**
 * utils/parser.js —— 纯文本词库解析器
 *
 * 职责：将用户粘贴/导入的纯文本词库预处理并逐行切分为字段数组，
 *       供 validator.js 做 7 项校验。解析器只负责「切分正确」，
 *       不负责「内容合法」（合法性交校验器）。
 *
 * 关联需求：REQ-IMP-1（纯文本词库导入解析）
 *
 * 输出结构：{ items: Array<{ lineNo, fields }>, errors: Array<{ line, reason }> }
 *   - items：成功切分的行，保留行号与字段数组，交校验器进一步判定
 *   - errors：解析阶段自身的错误（如空字段），校验阶段错误由 validator 产生
 *
 * 字段约定（docs/词库格式规范.md）：
 *   类型码|题目|答案|提示/释义|干扰项(可选)|例句ex(可选)
 *   - 字段间用 ASCII 半角 | 分隔
 *   - 干扰项用 , 分隔
 *   - 挖空位置在题目中用 * 标记
 */

// ============ 一、文本预处理 ============

/**
 * 预处理输入文本：
 *   1. 全角 ｜ 替换为半角 |（避免中文输入法误输）
 *   2. 统一换行符：\r\n → \n，\r → \n
 *   3. 按行切分
 * 关联需求：REQ-IMP-1
 * @param {string} text 原始文本
 * @returns {string[]} 行数组（未去空行/注释，保留行号对应关系）
 */
function splitLines(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  // 全角 ｜ → 半角 |（U+FF5C → U+007C）
  var normalized = text.replace(/\uff5c/g, '|');
  // 统一换行符
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split('\n');
}

/**
 * 判断某行是否应跳过（空行或 # 开头注释行）
 * 关联需求：REQ-IMP-1（去除空行与 # 开头注释行）
 * @param {string} line 单行文本
 * @returns {boolean} true 表示跳过
 */
function shouldSkip(line) {
  // 去除首尾空白后判断
  var trimmed = line.trim();
  if (trimmed === '') {
    return true; // 空行
  }
  if (trimmed.charAt(0) === '#') {
    return true; // 注释行
  }
  return false;
}

// ============ 二、逐行解析 ============

/**
 * 将单行按 | 切分为字段数组，并去除每段首尾空白。
 * @param {string} line 单行文本（非空、非注释）
 * @returns {string[]} 字段数组，至少包含 1 个元素
 */
function splitFields(line) {
  return line.split('|').map(function (seg) {
    return seg.trim();
  });
}

/**
 * 将干扰项字符串按 , 分隔为数组（去除空白项）。
 * @param {string} dStr 干扰项原始字符串，如 "珠,柱,林"
 * @returns {string[]} 干扰项数组，如 ["珠","柱","林"]；空串返回 []
 */
function splitDistractors(dStr) {
  if (!dStr) {
    return [];
  }
  return dStr.split(',').map(function (s) {
    return s.trim();
  }).filter(function (s) {
    return s !== '';
  });
}

// ============ 三、对外主入口 ============

/**
 * 解析纯文本词库，输出行级字段数组。
 *
 * 流程：
 *   1. 预处理（全角｜→半角|、统一换行、按行切分）
 *   2. 跳过空行与 # 注释行（保留原始行号用于报错定位）
 *   3. 逐行按 | 切分为 [type, q, a, hint, d?, ex?]
 *   4. d（干扰项）按 , 分隔为数组
 *   5. ex（可选例句，第 6 段）非空时原样保留
 *   6. 返回 { items, errors }，items 含 lineNo 与 fields
 *
 * 关联需求：REQ-IMP-1
 * @param {string} text 原始纯文本
 * @returns {{ items: Array<{lineNo:number, fields:string[], distractors:string[], ex?:string}>, errors: Array<{line:number, reason:string}> }}
 */
function parseText(text) {
  var lines = splitLines(text);
  var items = [];
  var errors = [];

  for (var i = 0; i < lines.length; i++) {
    var lineNo = i + 1; // 行号从 1 起，便于用户定位
    var raw = lines[i];

    // 跳过空行与注释行
    if (shouldSkip(raw)) {
      continue;
    }

    // 按 | 切分字段
    var fields = splitFields(raw);

    // 解析阶段仅做最低限度检查：至少要有 1 个字段
    // 字段数 ≥ 3 等业务校验交 validator.js
    if (fields.length < 1 || (fields.length === 1 && fields[0] === '')) {
      errors.push({ line: lineNo, reason: '空行（无可解析字段）' });
      continue;
    }

    // 干扰项（第 5 字段，下标 4）按 , 分隔
    var distractors = [];
    if (fields.length >= 5) {
      distractors = splitDistractors(fields[4]);
    }

    var parsedItem = {
      lineNo: lineNo,
      fields: fields,
      distractors: distractors
    };

    // M6-M：可选第 6 段「例句 ex」——非空时透传给校验器
    if (fields.length >= 6 && String(fields[5] || '').trim() !== '') {
      parsedItem.ex = String(fields[5]).trim();
    }

    items.push(parsedItem);
  }

  return { items: items, errors: errors };
}

module.exports = {
  parseText: parseText,
  // 导出内部函数便于单测
  splitLines: splitLines,
  shouldSkip: shouldSkip,
  splitFields: splitFields,
  splitDistractors: splitDistractors
};