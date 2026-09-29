/**
 * tools/wechat-mp/lib/editor.js —— 公众号图文编辑器的操作封装
 *
 * 这些动作都是在真实后台里摸索出来的，几个关键点记在这里，改代码前先看：
 *
 * 1. 编辑器是 **ProseMirror**（标题 / 正文各一个 contenteditable）：
 *    - 赋值 innerHTML **没用**（它有自己的 state，不会同步）；
 *    - 要真输入就用 `Input.insertText`（会替换当前选区）；
 *    - 要贴富文本就派发带 DataTransfer 的 `ClipboardEvent('paste')`，它能解析 HTML。
 * 2. 图片只能走公众号自己的上传通道：把文件塞进 `input[type=file]`，
 *    微信上传完会**插到当前光标处** —— 所以「先定位光标、再投喂文件」的顺序不能反。
 * 3. 粘贴长文时公众号会弹「内容结构检测」对话框挡住后续操作，得点掉「继续插入」。
 * 4. 封面要求从正文或图片库里选，所以封面图要么本来就在正文里，要么先插到最前。
 *
 * ⚠️ 视口被固定成 1280×720（setViewport），下面的坐标常量都基于这个尺寸。
 */
'use strict';

const { sleep } = require('./cdp');

/** 固定视口 —— 坐标常量依赖它，别改 */
const VIEWPORT = { width: 1280, height: 720 };

/** 底部「拖拽或选择封面」的位置（滚到页面底部后） */
const COVER_ENTRY = { x: 630, y: 115 };

/** 「选择图片」弹窗里缩略图的网格参数（第 1 张的位置 + 行列间距） */
const THUMB = { firstX: 262, firstY: 277, stepX: 126.5, stepY: 138, cols: 6 };

/** 正文编辑器的定位表达式（ProseMirror 且够高、不是标题那个） */
const BODY_EXPR = "(function(){var eds=document.querySelectorAll('[contenteditable]');"
  + "var b=null;for(var i=0;i<eds.length;i++){var c=String(eds[i].className);"
  + "if(c.indexOf('ProseMirror')>=0&&i!==0&&eds[i].getBoundingClientRect().height>100)b=eds[i];}"
  + "return b;})()";

/** 固定视口（必须在打开页面前调用，否则封面那几步的坐标会漂） */
async function setViewport(cdp) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false
  });
}

/** 从当前 URL 里取 token（公众号后台每个页面都带） */
async function currentToken(cdp) {
  const href = await cdp.eval('location.href');
  const m = /[?&]token=(\d+)/.exec(String(href || ''));
  return m ? m[1] : '';
}

/** 打开「新建图文」页面 */
async function openNewArticle(cdp, token) {
  const url = 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit'
    + '&type=10&isMul=1&token=' + encodeURIComponent(token) + '&lang=zh_CN';
  await cdp.send('Page.navigate', { url: url });
  await sleep(5500);
  return url;
}

/** 按可见文字点按钮；返回是否点到。视口外的按钮自动降级为 JS click */
async function clickByText(cdp, text, opts) {
  const o = opts || {};
  const want = JSON.stringify(text);
  const raw = await cdp.eval(
    "(function(){var all=document.querySelectorAll('button,a,span,div,li');var want=" + want + ";"
    + "for(var i=0;i<all.length;i++){var t=(all[i].innerText||'').trim();"
    + "if(t===want&&all[i].offsetParent!==null&&all[i].children.length===0){"
    + "var r=all[i].getBoundingClientRect();"
    + "return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}}"
    + "return '';})()"
  );
  if (!raw) return false;
  const p = JSON.parse(raw);
  if (p.y > VIEWPORT.height - 6 || p.y < 0) {
    // 折叠区里的按钮（例如封面编辑的「确认」）真实鼠标点不到
    await cdp.eval(
      "(function(){var all=document.querySelectorAll('button,a,span,div,li');var want=" + want + ";"
      + "for(var i=0;i<all.length;i++){var t=(all[i].innerText||'').trim();"
      + "if(t===want&&all[i].offsetParent!==null&&all[i].children.length===0){all[i].click();return 'ok';}}"
      + "return '';})()"
    );
  } else {
    await cdp.click(p.x, p.y);
  }
  if (!o.quiet) await sleep(1200);
  return true;
}

/** 关掉公众号弹的「内容结构检测」之类对话框（不点掉它会挡住后面所有点击） */
async function dismissDialogs(cdp) {
  let hit = false;
  for (const label of ['继续插入', '我知道了', '确定']) {
    if (await clickByText(cdp, label, { quiet: true })) { hit = true; await sleep(900); break; }
  }
  return hit;
}

/** 填标题（选中原内容 → 真实输入替换） */
async function fillTitle(cdp, title) {
  await cdp.eval("(function(){var el=document.querySelectorAll('[contenteditable]')[0];"
    + "el.focus();var r=document.createRange();r.selectNodeContents(el);"
    + "var s=window.getSelection();s.removeAllRanges();s.addRange(r);return 'ok';})()");
  await cdp.insertText(title);
  await sleep(500);
  return cdp.eval("(document.querySelector('#title')||{}).value||''");
}

/** 填作者（普通 input，直接赋值 + 派发事件即可） */
async function fillAuthor(cdp, author) {
  if (!author) return '';
  await cdp.eval("(function(){var a=document.querySelector('#author');if(!a)return 'no author';"
    + "a.value=" + JSON.stringify(author) + ";"
    + "a.dispatchEvent(new Event('input',{bubbles:true}));"
    + "a.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()");
  await sleep(400);
  return cdp.eval("(document.querySelector('#author')||{}).value||''");
}

/** 清空 + 粘贴正文 HTML（图片位置是 @@IMG:n@@ 标记，随后再逐张替换） */
async function fillBody(cdp, html, plain) {
  const r = await cdp.eval(
    "(function(){var b=" + BODY_EXPR + ";if(!b)return 'no body';"
    + "b.focus();var range=document.createRange();range.selectNodeContents(b);"
    + "var s=window.getSelection();s.removeAllRanges();s.addRange(range);"
    + "document.execCommand('delete');"
    + "var dt=new DataTransfer();"
    + "dt.setData('text/html'," + JSON.stringify(html) + ");"
    + "dt.setData('text/plain'," + JSON.stringify(plain || '') + ");"
    + "b.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));"
    + "return 'ok';})()"
  );
  await sleep(2200);
  return r;
}

/** 读正文统计（字数 / 图片数 / 剩余标记），用于每步之后自检 */
async function bodyStats(cdp) {
  const raw = await cdp.eval(
    "(function(){var b=" + BODY_EXPR + ";if(!b)return '';"
    + "return JSON.stringify({len:b.innerText.length,"
    + "imgs:b.querySelectorAll('img').length,"
    + "markers:(b.innerText.match(/@@IMG:\\d+@@/g)||[]).length});})()"
  );
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

/** 把光标定位到 @@IMG:id@@ 标记上并选中它（图片会插在这里并替换掉标记） */
async function locateMarker(cdp, id) {
  return cdp.eval(
    "(function(){var t='@@IMG:" + id + "@@';var b=" + BODY_EXPR + ";if(!b)return 'no body';"
    + "b.focus();var w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT,null);var n;"
    + "while(n=w.nextNode()){var k=n.nodeValue.indexOf(t);"
    + "if(k>=0){var r=document.createRange();r.setStart(n,k);r.setEnd(n,k+t.length);"
    + "var s=window.getSelection();s.removeAllRanges();s.addRange(r);return 'ok';}}"
    + "return 'missing';})()"
  );
}

/** 把光标放到正文最前面（给「封面图不在正文里」的情况用） */
async function caretAtBodyStart(cdp) {
  return cdp.eval(
    "(function(){var b=" + BODY_EXPR + ";if(!b)return 'no body';"
    + "b.focus();var r=document.createRange();r.setStart(b,0);r.collapse(true);"
    + "var s=window.getSelection();s.removeAllRanges();s.addRange(r);return 'ok';})()"
  );
}

/** 把图片塞进上传控件并等微信处理完（不等的话下一张会插错位置） */
async function uploadImage(cdp, filePath, waitMs) {
  await cdp.setFileInput('input[type=file]', filePath);
  await sleep(waitMs || 5500);
}

/** 滚到页面某个位置（编辑器用 window 滚动，不是内层容器） */
function scrollTo(cdp, y) {
  return cdp.eval('window.scrollTo(0,' + Number(y) + ');"ok"');
}

/**
 * 设置封面：从正文里选第 thumbIndex 张。
 * 流程 = 滚到底 → 点封面区 → 「从正文选择」→ 点第 N 张 → 下一步 → 确认
 */
async function setCoverFromBody(cdp, thumbIndex) {
  await scrollTo(cdp, 99999);
  await sleep(1300);
  await cdp.click(COVER_ENTRY.x, COVER_ENTRY.y);
  await sleep(1800);
  if (!await clickByText(cdp, '从正文选择')) return 'no-menu';
  await sleep(2200);

  const col = (thumbIndex - 1) % THUMB.cols;
  const row = Math.floor((thumbIndex - 1) / THUMB.cols);
  await cdp.click(
    Math.round(THUMB.firstX + col * THUMB.stepX),
    Math.round(THUMB.firstY + row * THUMB.stepY)
  );
  await sleep(1300);
  if (!await clickByText(cdp, '下一步')) return 'no-next';
  await sleep(2600);
  if (!await clickByText(cdp, '确认', { quiet: true })) return 'no-confirm';
  await sleep(2600);
  return 'ok';
}

/** 保存为草稿（**只保存，不发表** —— 发表是不可逆动作，工具不碰） */
async function saveDraft(cdp) {
  const ok = await clickByText(cdp, '保存为草稿');
  await sleep(5000);
  return ok;
}

/** 点「预览」拿到预览二维码（可选，用于人工检查） */
async function openPreview(cdp) {
  const ok = await clickByText(cdp, '预览');
  await sleep(2500);
  return ok;
}

module.exports = {
  VIEWPORT: VIEWPORT,
  COVER_ENTRY: COVER_ENTRY,
  THUMB: THUMB,
  setViewport: setViewport,
  currentToken: currentToken,
  openNewArticle: openNewArticle,
  clickByText: clickByText,
  dismissDialogs: dismissDialogs,
  fillTitle: fillTitle,
  fillAuthor: fillAuthor,
  fillBody: fillBody,
  bodyStats: bodyStats,
  locateMarker: locateMarker,
  caretAtBodyStart: caretAtBodyStart,
  uploadImage: uploadImage,
  scrollTo: scrollTo,
  setCoverFromBody: setCoverFromBody,
  saveDraft: saveDraft,
  openPreview: openPreview
};
