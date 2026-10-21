/**
 * 管理员运营控制（拉黑用户 / 暂停玩法入口）。
 * 表不存在时返回「无控制」，保证老库仍可启动。
 */
'use strict';

const { AdminControl } = require("./db");

async function find(ctype, target) {
  try {
    return await AdminControl.findOne({ where: { ctype, target }, raw: true });
  } catch (e) {
    return null;
  }
}

async function isBanned(openid) {
  if (!openid) return false;
  return !!(await find("ban_user", String(openid)));
}

async function pausedGames() {
  try {
    const rows = await AdminControl.findAll({ where: { ctype: "pause_game" }, raw: true });
    return rows.map((r) => String(r.target));
  } catch (e) {
    return [];
  }
}

async function listControls() {
  try {
    const rows = await AdminControl.findAll({ order: [["updatedAt", "DESC"]], raw: true });
    return {
      banned: rows.filter((r) => r.ctype === "ban_user").map((r) => ({
        openid: r.target,
        reason: r.value || "",
        updatedAt: r.updatedAt,
      })),
      paused: rows.filter((r) => r.ctype === "pause_game").map((r) => ({
        gameKey: r.target,
        reason: r.value || "",
        updatedAt: r.updatedAt,
      })),
    };
  } catch (e) {
    return { banned: [], paused: [] };
  }
}

module.exports = { find, isBanned, pausedGames, listControls };
