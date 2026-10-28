/**
 * routes/subscribe.js —— 订阅消息的前端配套接口（2026-10-28）
 *
 * 两个接口：
 *   GET  /api/subscribe/config  → 哪些场景已经配好模板 ID（端上据此决定要不要弹订阅框）
 *   POST /api/subscribe/grant   → 用户在弹窗里点了「允许」，记一笔（纯统计）
 *
 * 为什么配置要服务端下发而不是端上写死：
 *   模板 ID 与环境（正式/体验/开发）和 AppID 绑定，写在代码里的话，换模板就得发版。
 *   放服务端环境变量，改完重启即可。
 *
 * 为什么「允许」要单独上报：
 *   微信的订阅额度在它自己那边，我们查不到余额。这里记的是**用户意愿**
 *   （弹出后多少人真的点了允许），用来判断这个入口值不值得留。
 *   授权失败也不会影响推送 —— 推送只看微信侧还有没有票。
 */
'use strict';

const express = require('express');
const subscribe = require('../subscribe');

const router = express.Router();

/**
 * GET /api/subscribe/config
 * 返回 { scenes: { pk_accept: 'TEMPLATE_ID', ... } }，未配置的场景不出现。
 * 端上拿不到某个 key 就表示「这个场景还没上线」，不要弹框。
 */
router.get('/config', (req, res) => {
  res.send({ code: 0, data: { scenes: subscribe.configuredScenes() } });
});

/**
 * POST /api/subscribe/grant
 * body: { scene }
 * 只记不发。scene 非法或写入失败都返回成功 —— 这不是用户能感知的操作，
 * 失败让他看到红字反而莫名其妙。
 */
router.post('/grant', async (req, res) => {
  const openid = req.openid;
  const scene = String((req.body && req.body.scene) || '');
  if (!openid) {
    return res.send({ code: 1001, data: null, message: '未识别用户（openid 缺失）' });
  }
  const ok = await subscribe.grant(openid, scene);
  res.send({ code: 0, data: { recorded: ok } });
});

module.exports = router;
