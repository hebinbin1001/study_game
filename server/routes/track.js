'use strict';

/**
 * server/routes/track.js —— 埋点上报（2026-11-11 最小数据回路）
 *
 * POST /api/track  body: { events: [ { event, at?, game_type?, grade?, level?, scene?, stars?, win?, duration_ms?, payload? } ] }
 *   · 最多 20 条/批（客户端离线队列按批补发，见 miniprogram/utils/track.js）；
 *   · 游客（未登录）也记 —— 埋点看的是「进入/开局/完局」漏斗，与业务登录态无关；
 *     openid 由云托管网关注入（未识别时整批跳过，不报错，避免端上重试风暴）；
 *   · `visit` 一天只记一次；当天有 visit 且前一天也有 visit 时，**服务端派生**一条 `d1_return`；
 *   · 不接受客户端上报 `d1_return`（避免伪造留存）。
 *
 * 为什么把派生放在上报接口里：容器没有常驻定时任务（最小实例数 1 才有 cron），
 * 「次日回访」在收到今天的 visit 时顺手判一次，是零额外成本、且幂等的做法。
 */

const express = require('express');
const { TrackEvent } = require('../db');
const track = require('../track-events');
const T = require('../beijing-time');
const { CODE } = require('../constants');

const router = express.Router();

/**
 * 防刷上限：同一用户每天最多入库多少条事件（默认 500，可用环境变量覆盖）。
 * 正常用户一天最多几十条（游玩一局 2 条 + 进入 1 条）；被脚本刷时直接丢弃，
 * 但**返回成功**让端上丢弃这批而不是无限重试。超限的数据不可逆，所以宁可少记。
 */
const DAILY_CAP = Math.max(50, parseInt(process.env.TRACK_DAILY_CAP, 10) || 500);

/** 记录一条事件 */
async function saveEvent(openid, ev, day) {
  await TrackEvent.create({
    openid: openid,
    event: ev.event,
    day: day,
    game_type: ev.game_type,
    grade: ev.grade,
    level: ev.level,
    scene: ev.scene,
    stars: ev.stars,
    win: ev.win,
    duration_ms: ev.duration_ms,
    payload: ev.payload
  });
}

/**
 * visit 事件的处理：写入 + 次日回访派生。
 * @returns {Promise<{stored:boolean, d1:boolean}>}
 */
async function handleVisit(openid, ev, day) {
  const stored = true;
  const alreadyVisit = await TrackEvent.count({
    where: { openid: openid, event: 'visit', day: day }
  });
  if (!alreadyVisit) await saveEvent(openid, ev, day);

  // 昨天有 visit → 今天算「次日回访」。d1_return 当天只记一条（幂等）。
  const yesterday = T.dayKeyOffset(-1, ev.at);
  const hadYesterday = await TrackEvent.count({
    where: { openid: openid, event: 'visit', day: yesterday }
  });
  let d1 = false;
  if (hadYesterday) {
    const alreadyD1 = await TrackEvent.count({
      where: { openid: openid, event: 'd1_return', day: day }
    });
    if (track.shouldEmitD1(true, alreadyD1 > 0)) {
      await TrackEvent.create({
        openid: openid,
        event: 'd1_return',
        day: day,
        scene: ev.scene,
        // payload 里留来源，方便区分「次日回访」是不是因为订阅消息召回
        payload: 'from=derived'
      });
      d1 = true;
    }
  }
  return { stored: stored, d1: d1 };
}

router.post('/', async (req, res) => {
  try {
    const list = track.normalizeBatch(req.body);
    if (!list.length) {
      return res.send({ code: CODE.SCORE_INVALID, data: null, message: 'events 为空或格式非法' });
    }
    if (!req.openid) {
      // 网关没注入 openid：不报错、不重试（端上拿到 code=0 会丢弃这批）
      return res.send({ code: CODE.OK, data: { stored: 0, skipped: 'anonymous' } });
    }

    let stored = 0;
    let d1 = false;
    let droppedByCap = 0;
    // 同一批可能跨天（离线补发），按天分别算剩余额度
    const budget = {};
    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      const day = track.dayOf(ev.at);
      if (budget[day] == null) {
        const used = await TrackEvent.count({ where: { openid: req.openid, day: day } });
        budget[day] = Math.max(0, DAILY_CAP - used);
      }
      if (budget[day] <= 0) { droppedByCap++; continue; }
      if (ev.event === 'visit') {
        const r = await handleVisit(req.openid, ev, day);
        if (r.stored) { stored++; budget[day]--; }
        if (r.d1) d1 = true;
        continue;
      }
      await saveEvent(req.openid, ev, day);
      stored++;
      budget[day]--;
    }
    res.send({
      code: CODE.OK,
      data: { stored: stored, d1: d1, droppedByCap: droppedByCap },
      message: 'ok'
    });
  } catch (err) {
    console.error('POST /api/track 失败：', err);
    res.send({ code: CODE.INTERNAL_ERROR, data: null, message: '服务内部错误' });
  }
});

module.exports = router;
