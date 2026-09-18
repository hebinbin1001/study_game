const express = require("express");
const { WordEntry, WordBank, WrongRecord } = require("../db");
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
    // 归属范围：自建库（bankId）或学段级改动（base）
    bankId: b.bankId ? String(b.bankId).slice(0, 64) : null,
    scopeKey: b.bankId ? String(b.bankId).slice(0, 64) : "base",
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
          bankId: r.bankId || "",
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
      where: { openid, scopeKey: item.scopeKey, itemKey: item.itemKey },
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
    const scopeKey = b.bankId ? String(b.bankId).slice(0, 64) : "base";
    const n = await WordEntry.destroy({ where: { openid, scopeKey, itemKey } });
    res.send({ code: 0, data: { removed: n }, message: "ok" });
  } catch (err) {
    console.error("DELETE /api/wordbank/entries 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

// ============ 自建题库（挂在学段下作为附加题源） ============

/** 库名/学段校验 */
function normalizeBank(body) {
  const b = body || {};
  const name = cut(b.name, 64);
  const grade = String(b.grade || "");
  if (!name) return null;
  if (GRADE_KEYS.indexOf(grade) < 0) return null;
  return { name, grade, enabled: b.enabled === undefined ? true : !!b.enabled };
}

/** GET /api/wordbank/banks —— 我的自建库（可按 ?grade= 过滤） */
router.get("/banks", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const where = { openid };
    const grade = req.query && req.query.grade;
    if (grade) where.grade = String(grade);
    const rows = await WordBank.findAll({ where, order: [["createdAt", "ASC"]] });
    res.send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          bankId: r.bankId,
          name: r.name,
          grade: r.grade,
          enabled: !!r.enabled,
        })),
      },
    });
  } catch (err) {
    console.error("GET /api/wordbank/banks 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/wordbank/banks —— 新建 / 重命名 / 启停自建库
 * body: { bankId?, name, grade, enabled? }
 * 传 bankId = 改这个库；不传 = 新建。
 */
router.post("/banks", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const body = req.body || {};
    const fields = normalizeBank(body);
    if (!fields) {
      return res.send({ code: 4000, data: null, message: "库名不能为空、且需指定合法学段" });
    }
    // 内容安全：库名也过一遍（未配置 secret 时放行）
    const sec = await checkContent(fields.name, openid, 2);
    if (!sec.safe) {
      return res.send({ code: 4000, data: null, message: "库名包含违规内容，请修改后重试" });
    }

    const bankId = body.bankId ? String(body.bankId).slice(0, 64) : "";
    if (bankId) {
      const row = await WordBank.findOne({ where: { bankId, openid } });
      if (!row) {
        return res.send({ code: 4004, data: null, message: "题库不存在" });
      }
      await row.update(fields);
      return res.send({ code: 0, data: { bankId, updated: true }, message: "ok" });
    }
    const created = await WordBank.create(Object.assign({ openid }, fields));
    res.send({ code: 0, data: { bankId: created.bankId, created: true }, message: "ok" });
  } catch (err) {
    console.error("POST /api/wordbank/banks 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/** DELETE /api/wordbank/banks —— 删除自建库（连带库内词条） */
router.delete("/banks", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const bankId = String((req.body && req.body.bankId) || (req.query && req.query.bankId) || "");
    if (!bankId) {
      return res.send({ code: 4000, data: null, message: "缺少 bankId" });
    }
    const row = await WordBank.findOne({ where: { bankId, openid } });
    if (!row) {
      return res.send({ code: 4004, data: null, message: "题库不存在" });
    }
    const entries = await WordEntry.destroy({ where: { openid, scopeKey: bankId } });
    await row.destroy();
    res.send({ code: 0, data: { removed: entries }, message: "ok" });
  } catch (err) {
    console.error("DELETE /api/wordbank/banks 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/wordbank/mastery —— 我的词条掌握状态（题库页「薄弱 / 已掌握」用）
 *
 * 数据源就是错题本（wrong_records）：错题记录天然带着「题目标识 = type|q|a」，
 * 与题库页的词条一一对应，不用再建一套统计表。
 * @returns {{[questionId]: {w:number, r:number, m:number}}}
 */
router.get("/mastery", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const rows = await WrongRecord.findAll({
      where: { openid },
      attributes: ["questionId", "wrongCount", "reviewCount", "mastery"],
      raw: true,
    });
    const map = {};
    rows.forEach((r) => {
      if (!r.questionId) return;
      map[r.questionId] = {
        w: Number(r.wrongCount) || 0,
        r: Number(r.reviewCount) || 0,
        m: Number(r.mastery) || 0,
      };
    });
    res.send({ code: 0, data: map });
  } catch (err) {
    console.error("GET /api/wordbank/mastery 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
