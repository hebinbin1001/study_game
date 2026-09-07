/**
 * game/audio.js —— 词力战士 发音(TTS) + 合成音效（M6-C / M6-H）
 *
 * 发音：speak/speakByItem 接入微信「同声传译」TTS 插件。
 *   【当前状态】插件声明已从 app.json 移除（小程序后台未授权该插件，避免平台
 *   编译报「插件未授权」）。需要发音时：① 在 app.json 恢复 plugins 声明
 *   { "WechatSI": { "version":"0.3.5", "provider":"wx069ba97219f66d99" } }；
 *   ② 在小程序后台「设置→第三方设置→插件管理」添加该插件。
 *   未声明 / 未授权 / 不可用 → 本模块 try/catch 静默降级，绝不抛错（REQ-NFR-2）。
 *
 * 音效：WebAudio（wx.createWebAudioContext）合成短音，无音频资源依赖：
 *   playCorrect（答对）/ playWrong（答错）/ playCombo（连击）/ playWin（通关）。
 *
 * 关联需求：REQ-NFR-2（离线可玩，发音降级不阻塞）、M6-C/M6-H
 */

// 英语类题型集合（用于 speakByItem 判断语言）
const EN_TYPES = ['en', 'w1', 'w2', 'fill', 'trans'];

// ============ 一、TTS 发音（微信同声传译插件） ============

/** 获取 TTS 插件（未声明/不可用时返回 null，调用方静默降级） */
function getTTS() {
  try {
    if (typeof requirePlugin !== 'function') return null;
    const p = requirePlugin('WechatSI');
    return p && typeof p.textToSpeech === 'function' ? p : null;
  } catch (e) {
    return null;
  }
}

/** 语言映射：兼容 'en-US'/'zh-CN' 风格 → 插件 'en_US'/'zh_CN' */
function mapLang(lang) {
  if (!lang) return 'zh_CN';
  const l = String(lang).toLowerCase().replace('-', '_');
  return l.indexOf('en') === 0 ? 'en_US' : 'zh_CN';
}

/**
 * 发音统一接口（REQ-NFR-2）。
 * @param {string} text 待发音文本
 * @param {string} [lang='zh_CN'] 'en_US' 或 'zh_CN'（兼容 'en-US'/'zh-CN'）
 */
function speak(text, lang) {
  if (!text) return;
  const tts = getTTS();
  if (!tts) return; // 插件未配置/不可用：静默降级
  try {
    tts.textToSpeech({
      lang: mapLang(lang),
      tts: true,
      content: String(text),
      success: function () {},
      fail: function () {}
    });
  } catch (e) {
    // 静默：发音失败不影响游戏
  }
}

/**
 * 按词条类型发音（答对/答错回执时朗读整词）。
 * @param {Object} item 词条（用其 type 判断语言）
 * @param {string} word 待发音的词/字
 */
function speakByItem(item, word) {
  if (!item || !word) return;
  const lang = EN_TYPES.indexOf(item.type) >= 0 ? 'en_US' : 'zh_CN';
  speak(word, lang);
}

// ============ 二、WebAudio 合成音效（无资源依赖） ============

let _ctx = null;

/** 惰性获取 WebAudio 上下文（基础库需 ≥ 2.19.0；不可用返回 null） */
function audioCtx() {
  if (_ctx) return _ctx;
  try {
    if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
      _ctx = wx.createWebAudioContext();
    }
  } catch (e) {
    _ctx = null;
  }
  return _ctx || null;
}

/** 播放一个短音：频率/时长/波形/音量/延迟 */
function tone(freq, dur, type, vol, delay) {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) {
    // 静默
  }
}

/** 答对：上行双音（C6→D6） */
function playCorrect() {
  tone(880, 0.12, 'triangle', 0.22);
  tone(1174.66, 0.2, 'triangle', 0.22, 0.1);
}

/** 答错：低频下滑（警示） */
function playWrong() {
  tone(220, 0.3, 'sawtooth', 0.16);
}

/** 连击：高音提示 */
function playCombo() {
  tone(1318.51, 0.16, 'triangle', 0.22);
}

/** 通关：上行琶音 */
function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < notes.length; i++) {
    tone(notes[i], 0.18, 'triangle', 0.22, i * 0.12);
  }
}

module.exports = {
  speak,
  speakByItem,
  EN_TYPES,
  playCorrect,
  playWrong,
  playCombo,
  playWin
};
