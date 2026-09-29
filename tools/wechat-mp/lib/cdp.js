/**
 * tools/wechat-mp/lib/cdp.js —— Chrome DevTools Protocol 客户端
 *
 * 为什么不直接用 agent-browser：它连 Chrome 111+ 会卡在 WebSocket 握手 ——
 * Chrome 对带 Origin 头的 DevTools 连接有白名单校验，而 Playwright 系的客户端会带 Origin，
 * 于是「进程起来了、端口在听、就是连不上」。这里用 Node 20+ 内置的 WebSocket 直连（不带 Origin），
 * 稳定且没有额外依赖。
 *
 * 用量最大的三个能力：Runtime.evaluate（在页面里跑 JS）、
 * Input.*（真实鼠标/键盘事件）、DOM.setFileInputFiles（塞文件进上传控件）。
 */
'use strict';

const http = require('http');

/** 读 /json/list，列出当前浏览器的所有 target */
function listTargets(port) {
  return new Promise(function (resolve, reject) {
    const req = http.get({ host: '127.0.0.1', port: port, path: '/json/list', timeout: 5000 }, function (r) {
      let b = '';
      r.on('data', function (c) { b += c; });
      r.on('end', function () {
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('无法解析 /json/list：' + e.message)); }
      });
    });
    req.on('error', function (e) {
      reject(new Error('连不上 127.0.0.1:' + port + '（' + e.code + '）—— 浏览器没开或调试端口没生效'));
    });
    req.on('timeout', function () { req.destroy(); reject(new Error('读取 /json/list 超时')); });
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.waiting = new Map();
    const self = this;
    ws.onmessage = function (ev) {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && self.waiting.has(msg.id)) {
        const w = self.waiting.get(msg.id);
        self.waiting.delete(msg.id);
        if (msg.error) w.reject(new Error(msg.error.message)); else w.resolve(msg.result);
      }
    };
  }

  static connect(wsUrl) {
    return new Promise(function (resolve, reject) {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(function () { reject(new Error('WebSocket 握手超时')); }, 10000);
      ws.onopen = function () { clearTimeout(timer); resolve(new Cdp(ws)); };
      ws.onerror = function () { clearTimeout(timer); reject(new Error('WebSocket 连接失败')); };
    });
  }

  /** 发一条 CDP 命令；默认 30 秒超时 */
  send(method, params, timeoutMs) {
    const self = this;
    const id = ++this.seq;
    return new Promise(function (resolve, reject) {
      self.waiting.set(id, { resolve: resolve, reject: reject });
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function () {
        if (self.waiting.has(id)) {
          self.waiting.delete(id);
          reject(new Error('CDP 超时：' + method));
        }
      }, timeoutMs || 30000);
    });
  }

  /**
   * 在页面里执行表达式并取回值（只能回传可序列化的东西，不能回传 DOM 节点）。
   * @returns {*} 页面里 return 出来的值
   */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: expression, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error('页面 JS 报错：' + (r.exceptionDetails.text || ''));
    }
    return r.result ? r.result.value : undefined;
  }

  /** 真实鼠标点击（合成的 MouseEvent 有些组件不认） */
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: x, y: y, button: 'left', clickCount: 1
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: x, y: y, button: 'left', clickCount: 1
    });
  }

  /** 真实键盘输入（会替换当前选区）—— 富文本编辑器认这个，不认 innerHTML 赋值 */
  insertText(text) {
    return this.send('Input.insertText', { text: text });
  }

  /** 把本地文件塞进页面里的 input[type=file] */
  async setFileInput(selector, filePath) {
    const doc = await this.send('DOM.getDocument', { depth: -1 });
    const q = await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: selector });
    if (!q || !q.nodeId) throw new Error('页面里找不到 ' + selector);
    await this.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [filePath] });
  }

  /** 截图存到文件 */
  async screenshot(filePath, clip) {
    const fs = require('fs');
    const opts = { format: 'png' };
    if (clip) opts.clip = clip;
    const r = await this.send('Page.captureScreenshot', opts);
    fs.writeFileSync(filePath, Buffer.from(r.data, 'base64'));
  }

  close() {
    try { this.ws.close(); } catch (e) { /* 忽略 */ }
  }
}

/**
 * 连到浏览器里第一个 page target。
 * @param {number} port 调试端口
 * @returns {Promise<Cdp>}
 */
async function connectToPage(port) {
  const targets = await listTargets(port);
  const pages = targets.filter(function (t) { return t.type === 'page'; });
  if (!pages.length) throw new Error('浏览器里没有可用的 page target');
  return Cdp.connect(pages[0].webSocketDebuggerUrl);
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

module.exports = {
  Cdp: Cdp,
  listTargets: listTargets,
  connectToPage: connectToPage,
  sleep: sleep
};
