/**
 * routes/favorite.js —— 生词本接口（2026-10-28）
 *
 *   POST /api/favorite/add    收藏（幂等，重复收藏 = 更新快照并顶到最前）
 *   POST /api/favorite/remove 取消收藏
 *   GET  /api/favorite/list   列表（分页，按最近收藏倒序）
 *   GET  /api/favorite/count  条数（给入口角标，比 list 轻）
 *
 * 为什么不提供「组一局」的服务端接口：
 *   组题逻辑（utils/quick-quiz.js）在端上，词库包也在端上。服务端只给词条，
 *   端上用同一个种子组题即可 —— 多一条接口只会让「服务端出的题」和「端上出的题」
 *   有两份实现，早晚对不上。
 */
"use strict";

const express = require("express");
const { WordFavorite } = require("../db");
const book = require("../favorite-book");

const router = express.Router();

/** 统一的「没有 openid」响应：所有接口前置判断，避免写出半条 openid 为空的脏记录 */
function needOpenid(res) {
  return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
}

/**
 * POST /api/favorite/add
 * body: { word, grade?, type?, hint?, ipa?, source? }
 * 幂等：同一个词重复收藏不会产生第二条，只刷新快照与时间。
 */
router.post("/add", async (req, res) => {
  const openid = req.openid;
  if (!openid) return needOpenid(res);

  const norm = book.normalizeItem(req.body);
  if (!norm.ok) {
    return res.send({ code: 4000, data: null, message: norm.message });
  }

  try {
    const created = await WordFavorite.findOrCreate({
      where: { openid: openid, word: norm.value.word },
      defaults: Object.assign({ openid: openid }, norm.value),
    });
    const row = created[0];
    const isNew = created[1];

    if (!isNew) {
      // 已收藏过：把快照更新成最新一次（释义可能修过），并顶到列表最前。
      // changed('updatedAt', true) 是必要的 —— 值完全相同的时候 Sequelize 会认为
      // 没有变化、跳过 UPDATE，用户点了「再收藏」却看不到它跳到最上面。
      row.set(norm.value);
      row.changed("updatedAt", true);
      await row.save();
    }

    const total = await WordFavorite.count({ where: { openid: openid } });
    res.send({ code: 0, data: { added: !!isNew, word: row.word, total: total } });
  } catch (err) {
    console.error("POST /api/favorite/add 失败：", err && err.message);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/favorite/remove
 * body: { word }
 * 删不存在的记录也算成功：用户的目标是「它不在生词本里」，本来就达成了。
 */
router.post("/remove", async (req, res) => {
  const openid = req.openid;
  if (!openid) return needOpenid(res);

  const norm = book.normalizeItem({ word: req.body && req.body.word });
  if (!norm.ok) {
    return res.send({ code: 4000, data: null, message: norm.message });
  }

  try {
    const n = await WordFavorite.destroy({
      where: { openid: openid, word: norm.value.word },
    });
    const total = await WordFavorite.count({ where: { openid: openid } });
    res.send({ code: 0, data: { removed: n > 0, total: total } });
  } catch (err) {
    console.error("POST /api/favorite/remove 失败：", err && err.message);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/favorite/list?page=1&pageSize=20
 * 按最近收藏倒序（updatedAt DESC）。重新收藏同一个词会刷新 updatedAt，
 * 所以「刚收的那个」永远在最前面。
 */
router.get("/list", async (req, res) => {
  const openid = req.openid;
  if (!openid) return needOpenid(res);

  const paging = book.parsePaging(req.query);
  if (!paging) {
    return res.send({ code: 4000, data: null, message: "分页参数非法" });
  }

  try {
    const total = await WordFavorite.count({ where: { openid: openid } });
    const rows = await WordFavorite.findAll({
      where: { openid: openid },
      order: [["updatedAt", "DESC"], ["id", "DESC"]],
      offset: (paging.page - 1) * paging.pageSize,
      limit: paging.pageSize,
      raw: true,
    });
    res.send({
      code: 0,
      data: book.buildListResponse(rows.map(book.shapeRow), total, paging.page, paging.pageSize),
    });
  } catch (err) {
    console.error("GET /api/favorite/list 失败：", err && err.message);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/favorite/count
 * 只给入口角标用。列表接口也能算出来，但首页/我的页不该为此拉一整页数据。
 */
router.get("/count", async (req, res) => {
  const openid = req.openid;
  if (!openid) return needOpenid(res);

  try {
    const total = await WordFavorite.count({ where: { openid: openid } });
    res.send({ code: 0, data: { count: total } });
  } catch (err) {
    console.error("GET /api/favorite/count 失败：", err && err.message);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
