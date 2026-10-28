/**
 * server/subscribe.js —— 订阅消息场景表与下发（2026-10-28）
 *
 * 背景：
 *   一次性订阅（教育类目只能用这个）的规则是「用户点一次允许 = 一张票」，
 *   发一条消耗一张，余额用完微信返回 43101。服务端查不到余额，所以这里的策略是
 *   **直接试着发，失败就算了** —— 不拿记账当初筛，避免漏记导致永久漏发。
 *
 * 模板 ID 全部走环境变量（云托管 → 服务设置 → 环境变量）：
 *   WX_TPL_PK_ACCEPT   战帖被应战
 * 没配 = 该场景静默跳过（端上也拉不到配置、不会弹订阅框），所以
 * 「代码先上、模板后补」是安全的，不会出现点了没反应的半成品。
 *
 * ⚠️ 申请到模板后要改的地方只有一处：对应场景的 `build()` 里那几个 key
 *    （thing4 / thing3 / time5 是模板自带的字段名，每个模板不一样，必须照抄）。
 *    改错会得到 47003，微信不会告诉你哪个 key 错了。
 */
'use strict';

const { sequelize } = require('./db');
const wechat = require('./utils/wechat');
const time = require('./beijing-time');

/** 微信对 thing 类字段的硬限制：20 个字符 */
const THING_MAX = 20;
/** phrase 类：5 个汉字 */
const PHRASE_MAX = 5;

/**
 * 场景表。
 *   env   —— 模板 ID 所在的环境变量名
 *   page  —— 点击卡片跳转的页面（不带前导斜杠）
 *   build —— 把业务值拼成模板 data；key 必须与模板字段名逐字一致
 */
const SCENES = {
  // 战帖被好友应战时通知发起人。事件驱动，不需要定时器。
  pk_accept: {
    env: 'WX_TPL_PK_ACCEPT',
    label: '战帖被应战',
    page: 'pages/pk/pk',
    build: function (v) {
      return {
        // 模板：对战结果通知（ID 157VDX1xjqdaCxA5eEaIRmlXtxvRnaf2Brge9J10lNo）
        thing4: { value: clip(v.opponent, THING_MAX) },
        // 「10 题答对 8 题」比「你输了」信息量大，也不刺激人
        thing3: { value: clip(v.scoreText, THING_MAX) },
        time5: { value: clockText(v.at) }
      };
    }
  }
};

/** 按字符截断（微信按字符数校验，不是字节） */
function clip(text, max) {
  var s = String(text === undefined || text === null ? '' : text).trim();
  if (!s) return '-';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** 北京时间「2026年10月28日 22:35」——date 类字段的标准格式 */
function dateTimeText(at) {
  var p = time.beijingParts(at);
  return p.y + '年' + (p.m + 1) + '月' + p.d + '日 ' +
    (p.hh < 10 ? '0' : '') + p.hh + ':' + (p.mm < 10 ? '0' : '') + p.mm;
}

/** time 类字段只发 24 小时制「22:35」 */
function clockText(at) {
  var p = time.beijingParts(at);
  return (p.hh < 10 ? '0' : '') + p.hh + ':' + (p.mm < 10 ? '0' : '') + p.mm;
}

/** 取场景模板 ID；未配置返回空串 */
function templateOf(scene) {
  var conf = SCENES[scene];
  if (!conf) return '';
  return String(process.env[conf.env] || '').trim();
}

/**
 * 对外暴露「哪些场景已经能用」，供端上决定要不要弹订阅框。
 * 只返回已配置模板 ID 的场景，不暴露环境变量名。
 * @returns {Object} 形如 { pk_accept: 'TEMPLATE_ID' }
 */
function configuredScenes() {
  var out = {};
  Object.keys(SCENES).forEach(function (key) {
    var tpl = templateOf(key);
    if (tpl) out[key] = tpl;
  });
  return out;
}

/** 场景是否合法（防止端上乱传 key 建出一堆脏记录） */
function isScene(scene) {
  return Object.prototype.hasOwnProperty.call(SCENES, scene);
}

/**
 * 记一次「用户点了允许」。纯统计用途，失败不影响主流程。
 * @param {string} openid
 * @param {string} scene
 * @returns {Promise<boolean>} 是否记成功
 */
async function grant(openid, scene) {
  if (!openid || !isScene(scene)) return false;
  try {
    await sequelize.query(
      'INSERT INTO `subscribe_grants`' +
      ' (`openid`, `scene`, `granted`, `sent`, `failed`, `lastError`, `lastGrantAt`, `lastSendAt`, `createdAt`, `updatedAt`)' +
      ' VALUES (?, ?, 1, 0, 0, \'\', NOW(), NULL, NOW(), NOW())' +
      ' ON DUPLICATE KEY UPDATE `granted` = `granted` + 1, `lastGrantAt` = NOW(), `updatedAt` = NOW()',
      { replacements: [openid, scene] }
    );
    return true;
  } catch (err) {
    // 表还没建 / DB 抖动：只丢一条统计，不影响订阅本身
    console.warn('[subscribe] 记录订阅授权失败（忽略）：', (err && (err.message || err.name)) || String(err));
    return false;
  }
}

/** 记一次发送结果（成功 / 失败各加一） */
async function recordSend(openid, scene, ok, errText) {
  try {
    await sequelize.query(
      'INSERT INTO `subscribe_grants`' +
      ' (`openid`, `scene`, `granted`, `sent`, `failed`, `lastError`, `lastGrantAt`, `lastSendAt`, `createdAt`, `updatedAt`)' +
      ' VALUES (?, ?, 0, ?, ?, ?, NULL, NOW(), NOW(), NOW())' +
      ' ON DUPLICATE KEY UPDATE `sent` = `sent` + VALUES(`sent`),' +
      ' `failed` = `failed` + VALUES(`failed`), `lastError` = VALUES(`lastError`),' +
      ' `lastSendAt` = NOW(), `updatedAt` = NOW()',
      { replacements: [openid, scene, ok ? 1 : 0, ok ? 0 : 1, String(errText || '').slice(0, 60)] }
    );
  } catch (err) {
    console.warn('[subscribe] 记录发送结果失败（忽略）：', (err && (err.message || err.name)) || String(err));
  }
}

/**
 * 下发一条场景消息。
 * 所有异常都在内部吃掉，调用方可以放心地「发完不管」。
 *
 * @param {string} openid 接收人
 * @param {string} scene 场景 key（见 SCENES）
 * @param {Object} values 业务值（由场景的 build 转成模板字段）
 * @param {Object} [opts] { page: 覆盖默认跳转页 }
 * @returns {Promise<{ok:boolean, reason:string, errcode?:number}>}
 */
async function sendScene(openid, scene, values, opts) {
  var conf = SCENES[scene];
  if (!conf) return { ok: false, reason: 'unknown-scene' };
  if (!openid) return { ok: false, reason: 'no-openid' };

  var tpl = templateOf(scene);
  if (!tpl) return { ok: false, reason: 'no-template' }; // 模板未配置：静默跳过

  var page = (opts && opts.page) || conf.page;
  var result;
  try {
    result = await wechat.sendSubscribe(openid, tpl, page, conf.build(values || {}));
  } catch (err) {
    console.error('[subscribe] 发送异常（' + scene + '）：', err && err.message);
    return { ok: false, reason: 'exception' };
  }

  var code = result && typeof result.errcode !== 'undefined' ? Number(result.errcode) : -1;
  var ok = code === 0;
  var errText = ok ? '' : code + ':' + ((result && result.errmsg) || '');
  if (!ok) {
    // 43101 是「用户没有订阅额度」，属于正常业务结果，不该刷 error 日志刷出告警疲劳
    if (code === 43101) {
      console.log('[subscribe] 用户无订阅额度，跳过（' + scene + '）');
    } else {
      console.warn('[subscribe] 发送失败（' + scene + '）：', errText);
    }
  }
  await recordSend(openid, scene, ok, errText);
  return { ok: ok, reason: ok ? 'sent' : 'failed', errcode: code };
}

module.exports = {
  SCENES: SCENES,
  THING_MAX: THING_MAX,
  PHRASE_MAX: PHRASE_MAX,
  clip: clip,
  dateTimeText: dateTimeText,
  clockText: clockText,
  templateOf: templateOf,
  configuredScenes: configuredScenes,
  isScene: isScene,
  grant: grant,
  recordSend: recordSend,
  sendScene: sendScene
};
