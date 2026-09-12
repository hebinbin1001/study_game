/**
 * utils/validator.js —— 词库校验器
 *
 * 职责：对解析器切分出的单行字段数组顺序执行 7 项校验，
 *       命中即记错并继续下一项（不中断），最终全量汇总错误。
 *
 * 关联需求：REQ-IMP-2 ~ REQ-IMP-9
 *
 * 7 项校验顺序：
 *   1. 类型码 ∈ 8 种（REQ-IMP-2）
 *   2. 字段数 ≥ 3（REQ-IMP-3）
 *   3. w2/c2 星位自洽：题面 q 与答案 a 等长、非 '*' 字符与 a 同位一致、至少含 1 个 '*'（REQ-IMP-4）
 *   4. 答案字符 ∈ 题目字符集（REQ-IMP-5）
 *   5. 干扰项不含正确答案（REQ-IMP-6）
 *   6. 敏感词命中（REQ-IMP-8）
 *   7. 重复题目检测（REQ-IMP-7）
 *
 * 返回结构：{ item: WordItem|null, errors: Array<{line, reason}> }
 *   - 全部通过：item 为 { type, q, a, hint, d? }，errors 为 []
 *   - 有任何错误：item 为 null，errors 含全部错误（REQ-IMP-9 全量汇聚）
 */

var constants = require('./constants');
var sensitive = require('./sensitive');

var TYPE_CODES = constants.TYPE_CODES;

// ============ 一、单项校验 ============

/**
 * 校验 1：类型码 ∈ 8 种
 * 关联需求：REQ-IMP-2
 * @param {string[]} fields
 * @returns {string|null} 错误原因，null 表示通过
 */
function checkTypeCode(fields) {
  if (fields.length < 1) {
    return '类型码缺失';
  }
  var code = fields[0];
  if (TYPE_CODES.indexOf(code) === -1) {
    return '类型码「' + code + '」不认识';
  }
  return null;
}

/**
 * 校验 2：字段数 ≥ 3（缺「干扰项」可接受）
 * 关联需求：REQ-IMP-3
 * @param {string[]} fields
 * @returns {string|null}
 */
function checkFieldCount(fields) {
  // 字段数 < 3：连「类型|题目|答案」三段都不全，最严重
  if (fields.length < 3) {
    return '字段不足，至少需要「类型|题目|答案」三段';
  }
  // 字段数 === 3：q/a 齐备但缺第 4 段 hint，按规范报「缺提示/释义」
  if (fields.length === 3) {
    return '字段不足，缺「提示/释义」';
  }
  // 字段数 ≥ 4 即合法（type, q, a, hint；d 可选）
  return null;
}

/**
 * 校验 2.5：题目与答案均不得为空白串
 *
 * 关联需求：REQ-IMP-3（字段内容有效性；修复"空 q/a 可入库"）
 * q 与 a 即使字段存在，若为纯空白/空串也无法出题，必须拒绝。
 * 返回数组以便 q、a 同时为空时全量报两条错误。
 * @param {string[]} fields
 * @returns {string[]} 错误原因数组（元素形如「题目为空」「答案为空」），通过则空数组
 */
function checkNotEmpty(fields) {
  var errs = [];
  var question = String(fields[1] || '').trim();
  var answer = String(fields[2] || '').trim();
  if (question === '') {
    errs.push('题目为空');
  }
  if (answer === '') {
    errs.push('答案为空');
  }
  return errs;
}

/**
 * 校验 3：w2/c2 星位自洽
 * 关联需求：REQ-IMP-4
 *
 * 语义（产品统一语义，与词库权威形态一致，参考 tests/unit/data.test.js
 * alignIssue）：q 为「带 * 挖空模板」，* 表示 a 中对应位置被挖空，即：
 *   1. q.length === a.length（模板与完整答案等长）；
 *   2. q 中非 '*' 字符必须与 a 同位字符完全一致；
 *   3. 至少含 1 个 '*'（否则 w2/c2 无挖空位，失去题型意义）。
 * a 永远是完整答案词。
 * @param {string[]} fields
 * @returns {string|null}
 */
function checkBlankCount(fields) {
  var type = fields[0];
  if (type !== 'w2' && type !== 'c2') {
    return null; // 仅 w2/c2 校验
  }
  var question = fields[1] || '';
  var answer = fields[2] || '';

  // 条件 1：题面与答案必须等长
  if (question.length !== answer.length) {
    return '挖空题面与答案长度不一致（题面 ' + question.length + ' 个字符，答案 ' + answer.length + ' 个字符）';
  }

  // 条件 2/3：逐位校验非 '*' 字符同位一致，并统计 '*' 数量
  var starCount = 0;
  for (var i = 0; i < question.length; i++) {
    var ch = question.charAt(i);
    if (ch === '*') {
      starCount++;
      continue;
    }
    if (ch !== answer.charAt(i)) {
      return '第 ' + (i + 1) + ' 位题面「' + ch + '」与答案「' + answer.charAt(i) + '」不一致';
    }
  }

  // 条件 3：至少 1 个挖空位
  if (starCount === 0) {
    return '挖空题面缺少 * 挖空标记（w2/c2 至少需 1 个 *）';
  }
  return null;
}

/**
 * 校验 4：答案字符 ∈ 题目字符集
 * 关联需求：REQ-IMP-5
 *
 * 设计说明：
 *   规范字面要求"答案字符 ∈ 题目（去 *）字符集"，但 8 种题型中
 *   仅 w1（且题目未显式标 *）满足"答案是被挖字符且题目含答案"语义；
 *   其余题型答案本就不是题目子串（如 xhy 前后半句、trans 中英互译、
 *   w2/c2 答案是 * 位置填充字符等）。为避免误报，本项仅对 w1 且
 *   题目无 * 时执行严格判定；其余题型跳过。后续若规范细化题型
 *   白名单，可在此扩展。
 * @param {string[]} fields
 * @returns {string|null}
 */
function checkAnswerInQuestion(fields) {
  var type = fields[0];
  var question = fields[1] || '';
  var answer = fields[2] || '';

  // 仅 w1 且题目无 * 时执行
  if (type !== 'w1') {
    return null;
  }
  if (question.indexOf('*') !== -1) {
    return null; // 显式标 * 的 w1，答案是被挖字符，跳过
  }

  // 题目字符集（去 *，此处无 * 即原样）
  var charSet = {};
  for (var i = 0; i < question.length; i++) {
    charSet[question.charAt(i)] = true;
  }
  // 答案每个字符都应在题目字符集中
  for (var j = 0; j < answer.length; j++) {
    var ch = answer.charAt(j);
    if (!charSet[ch]) {
      return '答案「' + answer + '」不在题目中';
    }
  }
  return null;
}

/**
 * 校验 5：干扰项不含正确答案
 * 关联需求：REQ-IMP-6
 * @param {string[]} fields
 * @param {string[]} distractors 干扰项数组（已按 , 切分）
 * @returns {string|null}
 */
function checkDistractorNotAnswer(fields, distractors) {
  var answer = fields[2] || '';
  if (!distractors || distractors.length === 0) {
    return null; // 无干扰项，跳过
  }
  for (var i = 0; i < distractors.length; i++) {
    if (distractors[i] === answer) {
      return '干扰项重复正确答案';
    }
  }
  return null;
}

/**
 * 校验 6：敏感词命中
 * 关联需求：REQ-IMP-8
 * @param {string[]} fields
 * @param {string[]} distractors
 * @returns {string|null}
 */
function checkSensitive(fields, distractors) {
  // 拼接题目 + 答案 + 提示 + 干扰项，整体检测
  var text = (fields[1] || '') + ' ' + (fields[2] || '') + ' ' + (fields[3] || '');
  if (distractors && distractors.length > 0) {
    text += ' ' + distractors.join(' ');
  }
  if (sensitive.containsSensitive(text)) {
    return '包含敏感内容';
  }
  return null;
}

/**
 * 校验 7：重复题目检测
 * 关联需求：REQ-IMP-7
 * @param {string[]} fields
 * @param {number} lineNo 当前行号
 * @param {Object} seenSet 题目→首次行号 的映射对象（外部传入，会被本函数写入）
 * @returns {string|null}
 */
function checkDuplicate(fields, lineNo, seenSet) {
  var question = fields[1] || '';
  // 空白题目本身会被「题目为空」拦截，不做重复登记/判重，避免污染 seenSet
  if (question.trim() === '') {
    return null;
  }
  if (seenSet.hasOwnProperty(question)) {
    var firstLine = seenSet[question];
    return '与第 ' + firstLine + ' 行题目重复';
  }
  // 记录首次出现行号
  seenSet[question] = lineNo;
  return null;
}

// ============ 二、单行校验主入口 ============

/**
 * 对单行字段顺序执行 7 项校验，全量收集错误。
 *
 * 关联需求：REQ-IMP-2~9
 * @param {string[]} fields 解析器切分出的字段数组 [type, q, a, hint, d?]
 * @param {number} lineNo 行号（1 起）
 * @param {Object} seenSet 题目去重映射（外部维护，跨行共享）
 * @param {string[]} distractors 干扰项数组（已按 , 切分，可选）
 * @returns {{ item: Object|null, errors: Array<{line:number, reason:string}> }}
 */
function validateLine(fields, lineNo, seenSet, distractors) {
  var errors = [];
  // distractors 缺省为空数组
  if (!distractors) {
    distractors = (fields.length >= 5 && fields[4]) ? fields[4].split(',').map(function (s) {
      return s.trim();
    }).filter(function (s) { return s !== ''; }) : [];
  }

  // —— 校验 1：类型码 ——
  var e1 = checkTypeCode(fields);
  if (e1) errors.push({ line: lineNo, reason: e1 });

  // —— 校验 2：字段数 ——
  var e2 = checkFieldCount(fields);
  if (e2) errors.push({ line: lineNo, reason: e2 });

  // 字段数不足时，后续依赖 q/a 的校验无法执行，直接返回
  if (fields.length < 3) {
    return { item: null, errors: errors };
  }

  // —— 校验 2.5：题目/答案不得为空白串（REQ-IMP-3；q、a 同时为空则报两条） ——
  var e25 = checkNotEmpty(fields);
  for (var k = 0; k < e25.length; k++) {
    errors.push({ line: lineNo, reason: e25[k] });
  }

  // —— 校验 3：星位自洽 ——（依赖类型码，类型码非法时跳过）
  if (e1 === null) {
    var e3 = checkBlankCount(fields);
    if (e3) errors.push({ line: lineNo, reason: e3 });
  }

  // —— 校验 4：答案 ∈ 题目 ——（依赖类型码）
  if (e1 === null) {
    var e4 = checkAnswerInQuestion(fields);
    if (e4) errors.push({ line: lineNo, reason: e4 });
  }

  // —— 校验 5：干扰项不含答案 ——
  var e5 = checkDistractorNotAnswer(fields, distractors);
  if (e5) errors.push({ line: lineNo, reason: e5 });

  // —— 校验 6：敏感词 ——
  var e6 = checkSensitive(fields, distractors);
  if (e6) errors.push({ line: lineNo, reason: e6 });

  // —— 校验 7：重复题目 ——
  var e7 = checkDuplicate(fields, lineNo, seenSet);
  if (e7) errors.push({ line: lineNo, reason: e7 });

  // 全部通过则产出词条，否则返回 null
  if (errors.length > 0) {
    return { item: null, errors: errors };
  }

  // 构造统一 WordItem 结构（与内置 JSON 共用，REQ-DICT-3）
  var item = {
    type: fields[0],
    q: fields[1],
    a: fields[2],
    hint: fields[3] || ''
  };
  // 干扰项可选：有则附加 d 字段
  if (distractors.length > 0) {
    item.d = distractors;
  }
  // M6-M：可选例句字段（第 6 段 ex，纯透传，向后兼容旧 5 段格式）
  if (fields.length >= 6 && String(fields[5] || '').trim() !== '') {
    item.ex = String(fields[5]).trim();
  }
  return { item: item, errors: [] };
}

// ============ 三、批量校验（配合 parser.js） ============

/**
 * 对解析器输出的 items 批量校验，返回 { items, errors }。
 *
 * 关联需求：REQ-IMP-9（错误全量汇聚）
 * @param {Array<{lineNo:number, fields:string[], distractors:string[]}>} parsedItems parser.parseText 输出的 items
 * @param {Array<{line:number, reason:string}>} parseErrors parser.parseText 输出的 errors（解析阶段错误，原样保留）
 * @returns {{ items: Array<Object>, errors: Array<{line:number, reason:string}> }}
 */
function validateAll(parsedItems, parseErrors) {
  var validItems = [];
  var allErrors = (parseErrors || []).slice(); // 保留解析阶段错误

  var seenSet = {}; // 题目→首次行号，跨行共享

  for (var i = 0; i < parsedItems.length; i++) {
    var parsed = parsedItems[i];
    var result = validateLine(parsed.fields, parsed.lineNo, seenSet, parsed.distractors);
    if (result.item) {
      validItems.push(result.item);
    }
    // 累加该行所有错误
    for (var j = 0; j < result.errors.length; j++) {
      allErrors.push(result.errors[j]);
    }
  }

  return { items: validItems, errors: allErrors };
}

module.exports = {
  validateLine: validateLine,
  validateAll: validateAll,
  // 导出单项校验便于单测
  checkTypeCode: checkTypeCode,
  checkFieldCount: checkFieldCount,
  checkNotEmpty: checkNotEmpty,
  checkBlankCount: checkBlankCount,
  checkAnswerInQuestion: checkAnswerInQuestion,
  checkDistractorNotAnswer: checkDistractorNotAnswer,
  checkSensitive: checkSensitive,
  checkDuplicate: checkDuplicate
};