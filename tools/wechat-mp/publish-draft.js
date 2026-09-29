#!/usr/bin/env node
/**
 * tools/wechat-mp/publish-draft.js —— 把一篇配置好的文章排进公众号草稿箱
 *
 * 用法：
 *   node tools/wechat-mp/publish-draft.js --config=文章.json [--port=9222] [--dry-run]
 *
 * 前置条件（只做一次）：
 *   1. 用带调试端口的浏览器登录公众号后台（命令见 README，Chrome 136+ 必须用独立 profile）；
 *   2. 那个浏览器保持开着、停在公众号后台任意页面（脚本要从 URL 里取 token）。
 *
 * ⚠️ 这个工具**只写到草稿**，刻意不实现「发表」——
 *    群发是不可逆的，那一下必须由人点。改代码时也别加，除非用户明确要求。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { connectToPage, sleep } = require('./lib/cdp');
const E = require('./lib/editor');
const A = require('./lib/article');

function arg(name, def) {
  const hit = process.argv.find(function (a) { return a.indexOf('--' + name + '=') === 0; });
  return hit ? hit.slice(name.length + 3) : def;
}

function fail(msg, code) {
  console.error(msg);
  process.exit(code || 1);
}

async function main() {
  const configPath = path.resolve(arg('config', ''));
  const port = Number(arg('port', '9222')) || 9222;
  const dryRun = process.argv.indexOf('--dry-run') >= 0;

  if (!arg('config', '') || !fs.existsSync(configPath)) {
    fail('用法：node tools/wechat-mp/publish-draft.js --config=文章.json [--port=9222] [--dry-run]\n'
      + '找不到配置文件：' + configPath, 2);
  }

  // ---------- 一、先校验配置和素材（动手之前就该知道能不能跑） ----------
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    fail('配置文件不是合法 JSON：' + e.message, 2);
  }

  const parsed = A.parseConfig(raw);
  if (parsed.errors.length) {
    console.error('配置有问题，先改好再跑：');
    parsed.errors.forEach(function (e) { console.error('  - ' + e); });
    process.exit(2);
  }
  const config = parsed.config;
  const baseDir = path.dirname(configPath);
  const tasks = A.imageTasks(config, baseDir);

  const missing = tasks.filter(function (t) { return !fs.existsSync(t.file); });
  if (config.cover && !fs.existsSync(path.resolve(baseDir, config.cover))) {
    missing.push({ file: path.resolve(baseDir, config.cover), id: '封面' });
  }
  if (missing.length) {
    console.error('这些图片找不到：');
    missing.forEach(function (t) { console.error('  - ' + t.file); });
    process.exit(2);
  }

  const h2Count = config.blocks.filter(function (b) { return b.type === 'h2'; }).length;
  const pCount = config.blocks.filter(function (b) { return b.type === 'p'; }).length;
  const coverIndex = A.coverIndexInBody(config);

  if (dryRun) {
    console.log('【dry-run】不碰浏览器，只报告计划：');
    console.log('  标题    ' + config.title);
    console.log('  作者    ' + (config.author || '(空)'));
    console.log('  正文    ' + h2Count + ' 个小节标题 + ' + pCount + ' 段文字');
    console.log('  图片    ' + tasks.length + ' 张（按顺序插入）');
    tasks.forEach(function (t) {
      console.log('          ' + t.id + '  ' + path.basename(t.file));
    });
    console.log('  封面    ' + (config.cover
      ? (coverIndex ? config.cover + '（正文第 ' + coverIndex + ' 张，直接选它）'
        : config.cover + '（不在正文里，会先插到正文最前再选）')
      : '(不设)'));
    console.log('');
    console.log('确认无误就去掉 --dry-run 真跑。');
    return;
  }

  // ---------- 二、连浏览器 ----------
  console.log('连接调试端口 127.0.0.1:' + port + ' ...');
  const cdp = await connectToPage(port);
  await E.setViewport(cdp);

  const token = await E.currentToken(cdp);
  if (!token) {
    cdp.close();
    fail('当前页面不是公众号后台（URL 里没有 token）。\n'
      + '请先用带调试端口的浏览器打开并登录 https://mp.weixin.qq.com/ ，再重跑。', 3);
  }
  console.log('已连上后台（token ' + token + '）');

  try {
    // ---------- 三、新建图文 ----------
    console.log('打开新建图文页 ...');
    await E.openNewArticle(cdp, token);
    const titleOk = await E.fillTitle(cdp, config.title);
    if (titleOk !== config.title) {
      throw new Error('标题没填进去（页面里是「' + titleOk + '」）');
    }
    console.log('  标题 OK');

    if (config.author) {
      const a = await E.fillAuthor(cdp, config.author);
      console.log('  作者 ' + (a === config.author ? 'OK' : ('异常：' + a)));
    }

    // ---------- 四、正文 ----------
    console.log('填正文 ...');
    await E.fillBody(cdp, A.buildBodyHtml(config), A.bodyPlainText(config));
    await E.dismissDialogs(cdp);
    let stats = await E.bodyStats(cdp);
    console.log('  正文 ' + (stats.len || 0) + ' 字 / 标记 ' + (stats.markers || 0) + ' 个');
    if ((stats.markers || 0) !== tasks.length) {
      throw new Error('正文里的图片标记数（' + (stats.markers || 0) + '）与配置的图片数（'
        + tasks.length + '）对不上，先别继续');
    }

    // ---------- 五、逐张插图 ----------
    let uploaded = 0;
    for (const t of tasks) {
      const at = await E.locateMarker(cdp, t.id);
      if (at !== 'ok') {
        console.log('  第 ' + t.id + ' 张定位失败（' + at + '），跳过');
        continue;
      }
      await E.uploadImage(cdp, t.file);
      uploaded++;
      console.log('  第 ' + t.id + ' 张已插入：' + path.basename(t.file));
    }
    stats = await E.bodyStats(cdp);
    console.log('  剩余未替换标记 ' + (stats.markers || 0) + ' 个（应为 0）');

    // ---------- 六、封面 ----------
    let coverResult = '(不设)';
    if (config.cover) {
      let idx = coverIndex;
      if (!idx) {
        // 封面图不在正文里 → 先插到正文最前，它就成了第 1 张
        await E.caretAtBodyStart(cdp);
        await E.uploadImage(cdp, path.resolve(baseDir, config.cover), 7000);
        idx = 1;
      }
      await E.scrollTo(cdp, 99999);
      await E.saveDraft(cdp);            // 先存一次，避免设封面出错把正文弄丢
      coverResult = await E.setCoverFromBody(cdp, idx);
      console.log('  封面 ' + (coverResult === 'ok' ? '已设置（正文第 ' + idx + ' 张）' : '失败：' + coverResult));
    }

    // ---------- 七、存草稿 ----------
    const saved = await E.saveDraft(cdp);

    console.log('');
    console.log('=== 完成 ===');
    console.log('  标题    ' + config.title);
    console.log('  正文    ' + (stats.len || 0) + ' 字');
    console.log('  图片    ' + uploaded + ' / ' + tasks.length + ' 张');
    console.log('  封面    ' + coverResult);
    console.log('  草稿    ' + (saved ? '已保存' : '保存失败，请手动点「保存为草稿」'));
    console.log('');
    console.log('⚠️ 没有点「发表」—— 请去「内容管理 → 图文消息」预览确认后再自己发布。');
  } finally {
    cdp.close();
  }
}

main().catch(function (e) {
  console.error('');
  console.error('执行中断：' + (e && e.message));
  console.error('（浏览器可能停在半成品页面，去后台删掉这篇草稿重跑即可）');
  process.exit(1);
});
