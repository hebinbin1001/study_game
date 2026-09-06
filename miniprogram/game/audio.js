/**
 * game/audio.js —— 词力战士音效与发音占位
 *
 * 职责：
 *   提供统一接口 speak(text, lang) 与 speakByItem(item, word)。
 *   M1 为空实现（静默降级），保证离线可玩。
 *
 * 平移来源：prototype/index.html 第 352-361 行 speak/speakByItem。
 *   原型用 window.speechSynthesis，小程序无 Web Speech API，
 *   M1 降级为空实现，预留 wx.createInnerAudioContext / TTS 插件接入点。
 *
 * 关联需求：
 *   - REQ-NFR-2（离线可玩，发音降级不阻塞）
 */

// 英语类题型集合（用于 speakByItem 判断语言）
const EN_TYPES = ['en', 'w1', 'w2', 'fill', 'trans'];

/**
 * 发音统一接口（REQ-NFR-2）。
 *
 * M1 实现：空操作（静默降级）。
 * 后续扩展方向：
 *   1. 优先尝试 wx.createInnerAudioContext() 播放本地预录音频资源；
 *   2. 接入 TTS 插件（如微信同声传译插件）；
 *   3. 资源不存在时静默跳过，绝不抛错。
 *
 * @param {string} text 待发音文本
 * @param {string} [lang='en-US'] 语言代码（'en-US' 英语 / 'zh-CN' 中文）
 */
function speak(text, lang) {
  // M1 静默降级：不做任何操作，保证离线可玩且不报错
  // 预留接入点：M4 实现预录音频 / TTS
  void text;
  void lang;
}

/**
 * 按词条类型发音（平移原型 speakByItem，第 359-361 行）。
 *
 * @param {Object} item 词条（用其 type 判断语言）
 * @param {string} word 待发音的词/字
 */
function speakByItem(item, word) {
  const lang = EN_TYPES.indexOf(item.type) >= 0 ? 'en-US' : 'zh-CN';
  speak(word, lang);
}

module.exports = {
  speak,
  speakByItem,
  EN_TYPES
};