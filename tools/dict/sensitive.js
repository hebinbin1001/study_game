/**
 * utils/sensitive.js —— 敏感词过滤
 *
 * 职责：提供精简敏感词库与命中检测，供词库校验器（validator.js）
 *       在导入时过滤含敏感内容的词条。
 *
 * 关联需求：REQ-IMP-8（敏感词命中报「包含敏感内容」）
 *
 * 设计要点：
 *   1. 词库精简（约 80 个词），覆盖政治敏感、色情、暴力、辱骂、毒品、赌博等基本分类。
 *   2. containsSensitive 命中即停（性能优先），返回 boolean。
 *   3. 大小写不敏感：统一转小写后匹配，避免英文大小写绕过。
 *   4. 纯函数、无副作用，便于单测。
 */

// ============ 敏感词库（精简版，约 80 个） ============
// 分类：政治敏感 / 色情低俗 / 暴力恐怖 / 辱骂人身 / 毒品违禁 / 赌博诈骗 / 其他违规
// 注意：词库仅用于词库导入校验场景，不做内容审查；命中即视为该词条不可入库。
const SENSITIVE_WORDS = [
  // —— 政治敏感 ——
  '反动', '颠覆', '政变', '台独', '藏独', '疆独', '港独',
  '分裂国家', '反华', '反共', '法轮', '邪教', '六四', '天安门事件',
  // —— 色情低俗 ——
  '色情', '黄色', '淫秽', '卖淫', '嫖娼', '裸体', '裸聊', '一夜情',
  ' AV ', 'av女优', '色情网站', '黄色网站', '乱伦', '猥亵', '性侵',
  // —— 暴力恐怖 ——
  '暴力', '杀人', '恐怖袭击', '爆炸', '炸弹', '枪杀', '凶杀',
  '自杀方法', '自残', '灭门', '血腥', '虐杀',
  // —— 辱骂人身攻击 ——
  '傻逼', '草泥马', '他妈的', '你妈', '滚蛋', '王八蛋', '杂种',
  '婊子', '贱人', '废物', '去死', '脑残', '智障',
  // —— 毒品违禁 ——
  '毒品', '海洛因', '冰毒', '大麻', '可卡因', '摇头丸', '吸毒',
  '贩毒', '制毒', '迷药',
  // —— 赌博诈骗 ——
  '赌博', '赌场', '博彩', '彩票作弊', '诈骗', '骗钱', '传销',
  '网赚', '刷单', '套现',
  // —— 其他违规 ——
  '黑客', '木马', '病毒制作', '盗号', '外挂', '作弊器'
];

// 预处理：英文词统一小写，便于大小写不敏感匹配
const NORMALIZED_WORDS = SENSITIVE_WORDS.map(function (w) { return w.toLowerCase(); });

/**
 * 检测文本是否包含敏感词，命中即停（性能优先）
 * @param {string} text 待检测文本
 * @returns {boolean} true 表示命中敏感词，false 表示安全
 *
 * 关联需求：REQ-IMP-8
 */
function containsSensitive(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  // 统一转小写，避免英文大小写绕过
  var lower = text.toLowerCase();
  for (var i = 0; i < NORMALIZED_WORDS.length; i++) {
    if (lower.indexOf(NORMALIZED_WORDS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * 检测文本命中的首个敏感词（供错误提示展示具体词）
 * @param {string} text 待检测文本
 * @returns {string|null} 命中的敏感词原文，未命中返回 null
 */
function findSensitive(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  var lower = text.toLowerCase();
  for (var i = 0; i < NORMALIZED_WORDS.length; i++) {
    if (lower.indexOf(NORMALIZED_WORDS[i]) !== -1) {
      return SENSITIVE_WORDS[i];
    }
  }
  return null;
}

module.exports = {
  SENSITIVE_WORDS: SENSITIVE_WORDS,
  containsSensitive: containsSensitive,
  findSensitive: findSensitive
};