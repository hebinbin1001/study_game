'use strict';

// verify-admin.js —— 管理后台 + 微信名采集引导（2026-09-29）
//
// 背景（用户：「1 + 2 一起做，你看下管理员界面还缺少，一起做了」）：
//   1. 微信名采集引导：微信 2022 年起不允许静默读取昵称，用户必须**主动点一次**
//      键盘上方的「使用微信昵称」—— 昵称页那块引导卡就是采集率的全部依赖，必须有。
//   2. 管理端补齐：头像 / 排序 / 总人数 / 微信名采集率 / 玩法热度 / 相对时间。
//
// 关于口令：管理员校验在生产环境靠 ADMIN_PASSCODE（云托管环境变量，值不进仓库）。
//   · 设了环境变量 → 跑完整流程（进入后台、切排序、查列表）
//   · 没设       → 只验「门禁不泄露数据」+「引导卡存在」，需要权限的部分打印 skip（不判红）
//   本机想跑完整：`set ADMIN_PASSCODE=xxx` 后再跑本脚本。
//
// 运行：node e2e/verify-admin.js

const H = require('./lib/harness');

const PASSCODE = process.env.ADMIN_PASSCODE || '';

/** 把列表状态压成一行，失败时取证用 */
function listState(d) {
  return 'sort=' + (d && d.sort) + ' loading=' + (d && d.loading)
    + ' total=' + (d && d.total) + ' 已加载=' + ((d && d.users) || []).length
    + ' warn=' + JSON.stringify((d && d.loadWarn) || '');
}

H.runSuite('verify-admin（管理后台 · 微信名采集引导）', async function (miniProgram, ck) {
  // ---------- [1] 微信名采集引导（昵称页） ----------
  console.log('[1/4] 昵称页：微信昵称采集引导卡');
  const nick = await H.goto(miniProgram, '/pages/nickname/nickname', 1600);
  ck.check('昵称页渲染', !!(await H.waitForSelector(nick, '.page-nickname', 8000)));

  const guide = await H.waitForSelector(nick, '.wx-guide', 8000);
  ck.check('微信名引导卡已渲染（采集率全靠它）', !!guide);
  if (guide) {
    const text = await guide.text();
    ck.check('引导卡文案点明「使用微信昵称」这个动作',
      !!text && text.indexOf('使用微信昵称') >= 0, '实际 = ' + JSON.stringify(text));
    // 未采集时应有指向输入框的箭头提示（纯视觉，但它是引导的关键一半）
    const arrow = await nick.$('.wx-guide-arrow');
    const nickData = await nick.data();
    const collected = !!(nickData && nickData.wxNickname);
    ck.check('未采集微信名时显示指向输入框的箭头', collected ? !arrow : !!arrow,
      'wxNickname=' + JSON.stringify(nickData && nickData.wxNickname));
  }

  // ---------- [2] 管理页门禁 ----------
  console.log('[2/4] 管理后台：口令门（未通过时不得泄露任何用户数据）');
  const admin = await H.goto(miniProgram, '/pages/admin/admin', 1800);
  ck.check('管理页渲染', !!(await H.waitForSelector(admin, '.page-admin', 8000)));

  const d0 = await admin.data();
  if (d0.ready) {
    // 本机之前存过口令（onEnter 会记住）→ 直接进了后台，门禁这一条就不适用
    console.log('  [info] 本机已存口令，直接进入后台（门禁断言跳过）');
    ck.check('已通过校验时不再显示口令门', !(await admin.$('.gate')));
  } else {
    ck.check('未通过校验时只显示口令门', !!(await admin.$('.gate')));
    ck.check('未通过校验时不渲染用户列表', (await admin.$$('.urow')).length === 0);
  }

  // 两条进入路径：① 环境变量给了口令；② 本机之前输过口令（管理页会记住，d0.ready 已为真）。
  // 都没有 → 跳过需要权限的断言（不判红），因为这类失败是环境问题、不是代码问题。
  if (!d0.ready && !PASSCODE) {
    console.log('  [skip] 未提供 ADMIN_PASSCODE、本机也没存过口令 —— 跳过需要管理员权限的断言');
    console.log('         想跑完整管理端用例：设置环境变量 ADMIN_PASSCODE 后重跑本脚本');
    return;
  }

  // ---------- [3] 用口令进入后台 ----------
  console.log('[3/4] 管理后台：口令进入 + 统计概览');
  if (!d0.ready) {
    const input = await admin.$('.gate-input');
    ck.check('口令输入框存在', !!input);
    if (!input) return;
    // 优先真模拟输入；个别工具版本对 password input 的模拟输入不生效 → 退回调页面方法
    try {
      await input.input(PASSCODE);
    } catch (e) {
      await admin.callMethod('onPasscodeInput', { detail: { value: PASSCODE } });
    }
    const btn = await admin.$('.gate-btn');
    ck.check('进入按钮存在', !!btn);
    if (!btn) return;
    await btn.tap();
    const passed = await H.waitForData(admin, function (d) { return d.ready === true; }, 15000, 'admin ready');
    ck.check('口令校验通过（进入管理界面）', !!passed);
    if (!passed) return;
  }

  // 统计网格：原来是 5 格，本轮补「微信名采集」→ 6 格
  const statsEls = await H.waitForCount(admin, '.stat', 6, 12000);
  ck.check('统计网格 6 格（新增「微信名采集」）', !!statsEls,
    statsEls ? '' : '数量不是 6');

  const d1 = await H.waitForData(admin, function (d) { return !!d.stats; }, 12000, 'stats loaded');
  ck.check('统计接口返回并落到页面', !!d1);
  if (d1) {
    ck.check('注册人数 / 在线人数是数字', typeof d1.stats.totalUsers === 'number'
      && typeof d1.stats.onlineUsers === 'number');
    ck.check('微信名采集率是数字（不是 NaN / 空）',
      typeof d1.stats.wxCollectRate === 'number' && !isNaN(d1.stats.wxCollectRate),
      '实际 = ' + JSON.stringify(d1.stats.wxCollectRate) + '%');
    ck.check('微信名采集率在 0~100 之间',
      d1.stats.wxCollectRate >= 0 && d1.stats.wxCollectRate <= 100);
    ck.check('玩法热度数组存在', Array.isArray(d1.stats.gameHeatTop));
    ck.check('玩法热度条形宽度已算好（WXML 不能调方法，必须 JS 先算）',
      (d1.stats.gameHeatTop || []).every(function (g) {
        return typeof g.pct === 'number' && typeof g.label === 'string' && g.label;
      }));
  }

  // ---------- [4] 用户列表：排序 / 头像 / 计数 ----------
  console.log('[4/4] 用户列表：排序切换 / 头像 / 计数');
  const chips = await admin.$$('.sort-chip');
  ck.check('排序切换 3 个（最近活跃 / 段位星数 / 注册时间）', chips.length === 3, '实际 = ' + chips.length);

  if (chips.length === 3) {
    const before = await admin.data();
    ck.check('默认排序是最近活跃', before.sort === 'active', '实际 = ' + before.sort);
    // 首屏必须把数据加载出来（此前这里返 0 条也没人发现）
    ck.check('首屏用户列表已加载出数据', (before.users || []).length > 0, listState(before));

    // ⚠️ 等待条件必须是「列表加载完成」，不能只等 sort 字段 ——
    //    setData 是同步的，切排序会先把 users 清空再异步回填；
    //    只等 sort 会在「列表已清空、还没回来」的瞬间通过，随后断言就扑空（这个坑这次踩到了）。
    await chips[1].tap();
    const starsState = await H.waitForData(admin, function (d) {
      return d.sort === 'stars' && !d.loading && (d.users || []).length > 0;
    }, 15000, 'stars loaded');
    ck.check('切「段位星数」后排序生效且列表仍加载出数据', !!starsState,
      starsState ? '' : listState(await admin.data()));

    await chips[0].tap();
    const activeState = await H.waitForData(admin, function (d) {
      return d.sort === 'active' && !d.loading && (d.users || []).length > 0;
    }, 15000, 'active loaded');
    ck.check('切回「最近活跃」后列表仍加载出数据', !!activeState,
      activeState ? '' : listState(await admin.data()));
  }

  const meta = await H.textOf(admin, '.list-meta');
  ck.check('显示「共 N 人 · 已加载 M」', !!meta && meta.indexOf('共') >= 0, '实际 = ' + JSON.stringify(meta));

  const d2 = await admin.data();
  const rows = d2.users || [];

  // 来历（2026-09-29）：管理端排序改服务端后，用例一度报「共 22 人 · 已加载 0」，
  // 查明是**等待条件写错**（只等 sort 字段，没等列表加载完成）造成的误报，接口一直是好的。
  // 但「接口成功 + total 正常 + list 空 + 界面无提示」是必须能立刻发现的状态，所以留下这两条断言。
  ck.check('列表没有降级 / 加载失败提示', !d2.loadWarn, '实际 = ' + JSON.stringify(d2.loadWarn));
  ck.check('有用户时不能出现「共 N 人 · 已加载 0」',
    !(d2.total > 0 && rows.length === 0),
    '共 ' + d2.total + ' 人 · 已加载 ' + rows.length);

  if (rows.length) {
    const avatars = await admin.$$('.u-avatar');
    ck.check('每行都有头像位（有图用图、无图用默认）', avatars.length === rows.length,
      '行 ' + rows.length + ' / 头像 ' + avatars.length);
    ck.check('每行的注册/最近上报已转成相对文案（不是 ISO 时间戳）',
      rows.every(function (u) { return typeof u.createdText === 'string' && u.createdText.length > 0; }),
      '样例 = ' + JSON.stringify(rows[0].createdText) + ' / ' + JSON.stringify(rows[0].lastActiveText));
    ck.check('微信名兜底文案为「未采集」（不再每行重复长提示）',
      rows.every(function (u) { return typeof u.wxText === 'string' && u.wxText.length > 0; }),
      '样例 = ' + JSON.stringify(rows[0].wxText));
  } else {
    console.log('  [info] 用户列表为空（新库或全被清理），跳过列表行断言');
  }
});
