const express = require("express");
const { CustomLevel, User } = require("../db");
const { checkContent } = require("../utils/wechat");

const router = express.Router();

// 分享码生成字符集
const SHARE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHARE_CODE_LEN = 6;

/**
 * 生成 6 位分享码
 */
function generateShareCode() {
  let code = "";
  for (let i = 0; i < SHARE_CODE_LEN; i++) {
    code += SHARE_CODE_CHARS.charAt(
      Math.floor(Math.random() * SHARE_CODE_CHARS.length)
    );
  }
  return code;
}

/**
 * POST /api/level —— 创建/更新关卡
 */
router.post("/", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { levelId, title, description, grade, items } = req.body;

    // 校验必填字段
    if (!title || !grade || !items) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    // M6-B 内容安全：标题/描述/词条聚合检测（微信 msgSecCheck，未配置 secret 时放行）
    const contentParts = [title, description];
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        contentParts.push(it.q || "", it.a || "", it.hint || "");
      }
    }
    const sec = await checkContent(contentParts.join(" "), openid, 2);
    if (!sec.safe) {
      return res.send({
        code: 4000,
        data: null,
        message: "关卡包含违规内容，请修改后保存",
      });
    }

    if (levelId) {
      // 更新已有关卡
      const level = await CustomLevel.findOne({
        where: { levelId, authorOpenid: openid },
      });
      if (!level) {
        return res.send({
          code: 4001,
          data: null,
          message: "关卡不存在或无权修改",
        });
      }

      level.title = title;
      level.description = description;
      level.grade = grade;
      level.items = items;
      level.totalQ = items.length;
      await level.save();

      return res.send({ code: 0, data: level });
    }

    // 创建新关卡
    const newLevelId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const level = await CustomLevel.create({
      levelId: newLevelId,
      title,
      description,
      grade,
      items,
      totalQ: items.length,
      authorOpenid: openid,
      status: "draft",
    });

    res.send({ code: 0, data: level });
  } catch (err) {
    console.error("POST /api/level 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/level/list —— 获取我的关卡列表
 */
router.get("/list", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const levels = await CustomLevel.findAll({
      where: { authorOpenid: openid },
      order: [["updatedAt", "DESC"]],
    });

    res.send({ code: 0, data: levels });
  } catch (err) {
    console.error("GET /api/level/list 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/level/submit —— 提交审核
 */
router.post("/submit", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { levelId } = req.body;
    if (!levelId) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    const level = await CustomLevel.findOne({
      where: { levelId, authorOpenid: openid },
    });
    if (!level) {
      return res.send({
        code: 4001,
        data: null,
        message: "关卡不存在",
      });
    }

    // B4 拍板：提交审核必须是「10 个一组」——不足/超出一律拒绝，并给出明确原因
    if (!Array.isArray(level.items) || level.items.length !== 10) {
      return res.send({
        code: 4000,
        data: null,
        message: "提交审核需凑满 10 题一组（当前 " + ((level.items || []).length) + "/10）",
      });
    }

    level.status = "pending";
    await level.save();

    res.send({ code: 0, data: level });
  } catch (err) {
    console.error("POST /api/level/submit 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/level/share —— 生成分享码
 */
router.post("/share", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { levelId } = req.body;
    if (!levelId) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    const level = await CustomLevel.findOne({
      where: { levelId, authorOpenid: openid },
    });
    if (!level) {
      return res.send({
        code: 4001,
        data: null,
        message: "关卡不存在",
      });
    }

    // 生成分享码
    let shareCode = "";
    let attempts = 0;
    do {
      shareCode = generateShareCode();
      const existing = await CustomLevel.findOne({
        where: { shareCode },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    level.shareCode = shareCode;
    await level.save();

    res.send({ code: 0, data: { shareCode } });
  } catch (err) {
    console.error("POST /api/level/share 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/level/import —— 导入关卡
 */
router.get("/import", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    const level = await CustomLevel.findOne({
      where: { shareCode: code.toUpperCase(), status: "approved" },
    });

    if (!level) {
      return res.send({
        code: 4001,
        data: null,
        message: "关卡不存在或未通过审核",
      });
    }

    // 获取作者信息
    const author = await User.findOne({
      where: { openid: level.authorOpenid },
      attributes: ["nickname"],
    });

    res.send({
      code: 0,
      data: {
        levelId: level.levelId,
        title: level.title,
        description: level.description,
        grade: level.grade,
        items: level.items,
        totalQ: level.totalQ,
        authorName: author ? author.nickname : "匿名",
      },
    });
  } catch (err) {
    console.error("GET /api/level/import 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/level/public —— 公开关卡广场（B4：approved 全量，全网可见可玩）
 * ?page=1&pageSize=20（含作者昵称与题数）
 */
router.get("/public", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { count, rows } = await CustomLevel.findAndCountAll({
      where: { status: "approved" },
      order: [["updatedAt", "DESC"]],
      limit: pageSize,
      offset,
    });

    const openids = rows.map((r) => r.authorOpenid);
    const users = openids.length
      ? await User.findAll({ where: { openid: openids }, attributes: ["openid", "nickname"] })
      : [];
    const nameMap = new Map(users.map((u) => [u.openid, u.nickname]));

    const list = rows.map((r) => ({
      levelId: r.levelId,
      title: r.title,
      description: r.description || "",
      grade: r.grade,
      totalQ: r.totalQ || 0,
      shareCode: r.shareCode || "",
      authorName: nameMap.get(r.authorOpenid) || "匿名",
      updatedAt: r.updatedAt,
    }));

    res.send({
      code: 0,
      data: {
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
        list,
      },
    });
  } catch (err) {
    console.error("GET /api/level/public 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;