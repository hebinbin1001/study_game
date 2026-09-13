/**
 * server/admin-auth.js —— 管理员判定与昵称脱敏（2026-09-13 用户需求）
 *
 * 需求：管理员能看到「别人的微信昵称 + 注册人数 / 在线人数」等信息；普通用户看不到别人的微信名。
 *
 * 为什么用环境变量、不改表：
 *   生产库只在非生产环境跑 `sync({ alter: true })`，加列必须人工执行 DDL（踩过坑）。
 *   管理员名单/口令用云托管的环境变量即可，零 DDL：
 *     · ADMIN_OPENIDS       —— 管理员 openid 白名单（逗号分隔；最稳，推荐上线用）
 *     · ADMIN_PASSCODE      —— 管理口令（管理页输入一次，存本机；query/请求头带上）
 *     · ADMIN_WX_NICKNAMES  —— 管理员**微信名**白名单（用户 2026-09-13 要求：只有微信名为
 *                              h842917647 的账号是管理员）
 *   满足其一即为管理员；都没配则**任何人都不是管理员**（默认安全）。
 *
 * ⚠️ 微信名白名单的风险（必须知道）：微信名用户可自行修改、也可能重名 —— 谁把昵称改成
 *    h842917647 就能进管理端。所以它只适合**开发/测试期的便捷方式**；上线建议改用
 *    ADMIN_OPENIDS（管理页会显示自己的 openid 掩码，后台日志也能查到完整 openid）。
 *
 * 昵称口径（用户明确要求「微信名称只有管理员能看到」）：
 *   · 排行榜等公开接口返回**脱敏昵称**（保留首字 + *，两个字以内只留一个字符）；
 *   · 管理端接口返回完整昵称。
 */
'use strict';

function adminOpenidSet(env) {
  const raw = String((env || process.env).ADMIN_OPENIDS || "");
  const set = new Set();
  raw.split(",").forEach((s) => {
    const v = s.trim();
    if (v) set.add(v);
  });
  return set;
}

/**
 * 是否管理员。
 * @param {string} openid 当前请求用户
 * @param {string} passcode 请求头 x-admin-passcode（可空）
 * @param {Object} [env] 便于单测注入
 * @returns {{ok:boolean, by:string}} by: 'openid' | 'passcode' | ''
 */
function checkAdmin(openid, passcode, env, wxNickname) {
  const e = env || process.env;
  const set = adminOpenidSet(e);
  if (openid && set.has(String(openid))) return { ok: true, by: "openid" };
  const code = String(e.ADMIN_PASSCODE || "");
  if (code && passcode && String(passcode) === code) return { ok: true, by: "passcode" };
  const names = String(e.ADMIN_WX_NICKNAMES || "").split(",")
    .map((s) => s.trim().toLowerCase()).filter(Boolean);
  const nick = String(wxNickname || "").trim().toLowerCase();
  if (names.length && nick && names.indexOf(nick) >= 0) return { ok: true, by: "wxNickname" };
  return { ok: false, by: "" };
}

/**
 * 公开场合展示用的脱敏昵称。
 * 规则：「张三丰」→「张**」；「张」→「*」；空/未命名 → 「用户」。
 */
function maskNickname(name) {
  const s = String(name || "").trim();
  if (!s || s === "未命名") return "用户";
  const first = Array.from(s)[0];
  const rest = Array.from(s).length - 1;
  if (rest <= 0) return "*";
  return first + "*".repeat(Math.min(rest, 3));
}

/** 管理端以外不暴露完整 openid：前 6 后 4 */
function maskOpenid(openid) {
  const s = String(openid || "");
  if (s.length <= 10) return s ? s.slice(0, 3) + "***" : "";
  return s.slice(0, 6) + "****" + s.slice(-4);
}

module.exports = { adminOpenidSet, checkAdmin, maskNickname, maskOpenid };
