const express = require("express");
const { WordEntry } = require("../db");
const { checkContent } = require("../utils/wechat");

const router = express.Router();

// 合法题型码（与 docs/词库格式规范.md 的 8 类型码一致）
const TYPE_CODES = ["w1", "w2", "c1", "c2", "xhy", "zc", "fill", "trans"];
// 合法学段 key（与端上 utils/constants.js 的 GRADES 一致）
const GRADE_KEYS = [
  "kindergarten", "primary12", "primary34", "primary56", "junior", "senior", "college",
];
const ACTIONS = ["create", "patch", "disable"];

/** 词条指纹：与端上 utils/bank.js 的 fingerprint() 必须完全一致 */
function fingerprint(grade, type, q) {
  return String(grade || "") + "|" + String(type || "") + "|" + String(q || "");
}

/** 截断辅助：DB 列有长度上限，超长截断而不是报 5000 */
function cut(v, n) {
  return String(v == null ? "" : v).trim().slice(0, n);
}

/**
 * 校验并归一化一条覆盖记录。
 * @returns {Object|null} 合法则返回待写库字段；非法返回 null
 */
function normalize(body) {
  const b = body || {};
  const action = String(b.action || "");
  const grade = String(b.grade || "");
  const type = String(b.type || "");
  const q = cut(b.q, 255);
  if (ACTIONS.indexOf(action) < 0) return null;
  if (GRADE_KEYS.indexOf(grade) < 0) return null;
  if (type && TYPE_CODES.indexOf(type) < 0) return null;
  if (!q) return null;

  const out = {
    action,
    grade,
    type,
    q,
    a: "",
    hint: "",
    ex: "",
    d: "",
    itemKey: fingerprint(grade, type, q),
  };
  // 停用只需指纹，内容字段无需校验
  if (action === "disable") return out;

  out.a = cut(b.a, 255);
  if (!out.a) return null;                       // 新增/改写必须有答案
  out.hint = cut(b.hint, 255);
  out.ex = cut(b.ex, 512);
  out.d = cut(b.d, 255);
  return out;
}

/**
 * GET /api/wordbank/entries?grade=xxx —— 我的题库改动
 * 不带 grade 返回全部（端上首次登录后一次性拉全量，按学段缓存）。
 */
router.get("/entries", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const where = { openid };
    const grade = req.query && req.query.grade;
    if (grade) where.grade = String(grade);

    const rows = await WordEntry.findAll({ where, order: [["updatedAt", "ASC"]] });
    res.send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          action: r.action,
          grade: r.grade,
          type: r.type || "",
          q: r.q || "",
          a: r.a || "",
          hint: r.hint || "",
          ex: r.ex || "",
          d: r.d || "",
          key: r.itemKey,
        })),
      },
    });
  } catch (err) {
    console.error("GET /api/wordbank/entries 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/wordbank/entries —— 保存一条改动（新增/改写/停用）
 * 同一 (openid, 指纹) 覆盖写：重复保存只保留最新一条。
 */
router.post("/entries", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const item = normalize(req.body);
    if (!item) {
      return res.send({ code: 4000, data: null, message: "词条参数非法（题型/学段/题目/答案）" });
    }

    // 内容安全：题目 + 答案 + 释义一起送检（未配置 secret 时放行）
    if (item.action !== "disable") {
      const sec = await checkContent([item.q, item.a, item.hint].join(" "), openid, 2);
      if (!sec.safe) {
        return res.send({ code: 4000, data: null, message: "词条包含违规内容，请修改后重试" });
      }
    }

    const [row, created] = await WordEntry.findOrCreate({
      where: { openid, itemKey: item.itemKey },
      defaults: Object.assign({ openid }, item),
    });
    if (!created) {
      await row.update(item);
    }
    res.send({ code: 0, data: { created, key: item.itemKey }, message: "ok" });
  } catch (err) {
    console.error("POST /api/wordbank/entries 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * DELETE /api/wordbank/entries —— 删除一条改动
 * body: { grade, type, q }
 * 语义：删掉的是「我的改动」这条记录 ——
 *   · 用户新增的条目 → 词条消失（等同删除）；
 *   · 改写/停用的内置条目 → 恢复内置原样。
 */
router.delete("/entries", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const b = req.body || {};
    const itemKey = fingerprint(String(b.grade || ""), String(b.type || ""), cut(b.q, 255));
    const n = await WordEntry.destroy({ where: { openid, itemKey } });
    res.send({ code: 0, data: { removed: n }, message: "ok" });
  } catch (err) {
    console.error("DELETE /api/wordbank/entries 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
