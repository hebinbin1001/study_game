/**
 * server/utils/wechat.js —— 微信服务端能力封装（M6）
 *
 * 目前提供：
 *   1. getAccessToken()：用 WX_APPID/WX_SECRET 换取全局 access_token（本地缓存，
 *      提前 120s 过期）；未配置 secret 返回 null。
 *   2. checkContent(content, openid, scene)：调用微信「内容安全」msg_sec_check v2
 *      （https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/sec-center/sec-check.html），
 *      返回 { safe }。
 *
 * 降级策略：WX_SECRET 未配置（本地/联调）或微信接口异常时返回 { safe: true } 放行，
 *   由既有本地敏感词（miniprogram/utils/sensitive.js + server 校验）做基础兜底，
 *   不因平台抖动误伤正常内容。
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");

const WX_APPID = process.env.WX_APPID || "";
const WX_SECRET = process.env.WX_SECRET || "";

// access_token 缓存（基础缓存即可，单实例云托管）
let _token = null;
let _tokenExpireAt = 0;

/** HTTPS GET → JSON */
function httpsGetJson(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("微信接口响应解析失败"));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("微信接口超时")));
  });
}

/** HTTPS POST(JSON) → JSON */
function httpsPostJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = JSON.stringify(body || {});
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("微信接口响应解析失败"));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("微信接口超时")));
    req.write(payload);
    req.end();
  });
}

/**
 * 获取全局 access_token（带本地缓存）。
 * @returns {Promise<string|null>} 未配置 secret 或失败返回 null
 */
async function getAccessToken() {
  if (_token && Date.now() < _tokenExpireAt) return _token;
  if (!WX_SECRET) return null;
  const url =
    "https://api.weixin.qq.com/cgi-bin/token" +
    "?grant_type=client_credential&appid=" +
    encodeURIComponent(WX_APPID) +
    "&secret=" +
    encodeURIComponent(WX_SECRET);
  try {
    const json = await httpsGetJson(url);
    if (json && json.access_token) {
      _token = json.access_token;
      _tokenExpireAt = Date.now() + ((json.expires_in || 7200) - 120) * 1000;
      return _token;
    }
    console.error("[wechat] getAccessToken 失败：", json && json.errmsg);
    return null;
  } catch (err) {
    console.error("[wechat] getAccessToken 异常：", err.message);
    return null;
  }
}

/**
 * 文本内容安全检测（msg_sec_check v2）。
 * @param {string} content 待检文本（建议 ≤ 2500 字，超长截断）
 * @param {string} [openid] 触发用户 openid
 * @param {number} [scene=1] 场景：1 资料 2 评论 3 论坛 4 社交日志
 * @returns {Promise<{safe: boolean}>} 未配置/异常 → 放行 { safe: true }
 */
async function checkContent(content, openid, scene) {
  const text = String(content || "");
  if (!text.trim()) return { safe: true };

  const token = await getAccessToken();
  if (!token) return { safe: true }; // 未配置/取 token 失败：放行，本地敏感词兜底

  const url = "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=" + encodeURIComponent(token);
  try {
    const json = await httpsPostJson(url, {
      version: 2,
      openid: openid || "",
      scene: scene || 1,
      content: text.slice(0, 2500),
    });
    // v2：errcode=0 且 result.suggest=pass 才安全；否则视为违规（非 pass 的 review/risky）
    if (json && json.errcode === 0) {
      const suggest = json.result && json.result.suggest;
      return { safe: suggest === "pass" };
    }
    console.error("[wechat] msgSecCheck 返回异常：", json && json.errmsg);
    return { safe: true }; // 平台错误放行，避免误伤
  } catch (err) {
    console.error("[wechat] msgSecCheck 异常：", err.message);
    return { safe: true };
  }
}

/** HTTP POST(JSON) → Buffer（供小程序码图片等二进制接口使用） */
function wxHttpBuffer(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = JSON.stringify(body || {});
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("微信接口超时")));
    req.write(payload);
    req.end();
  });
}

/**
 * 生成小程序码（getwxacodeunlimit）。
 * 通道：微信云托管「开放接口服务」云调用——容器内走 http（内网明文）且免 access_token，
 *   无密钥/证书负担；前提：云托管控制台「开放接口服务」白名单已配置 /wxa/getwxacodeunlimit。
 * 参考：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/qr-code/getUnlimitedCode.html
 * @param {string} scene 场景值（≤32 可见字符，推荐如 inv=openid；扫码后 onLoad options.scene 需 decodeURIComponent）
 * @param {string} page 落地页路径，默认 pages/index/index
 * @param {string} [env='release'] release | trial | develop
 * @returns {Promise<Buffer>} PNG 字节；失败抛 Error（message 携带微信 errmsg）
 */
async function getMiniCode(scene, page, env) {
  const body = {
    scene: String(scene || ""),
    page: page || "pages/index/index",
    check_path: false,
    env_version: env || "release",
  };
  const r = await wxHttpBuffer("http://api.weixin.qq.com/wxa/getwxacodeunlimit", body);
  if (!r.buf || r.buf.length === 0) throw new Error("小程序码返回为空");
  const head = r.buf.slice(0, 16).toString("utf8").trim();
  if (head.charAt(0) === "{") {
    let msg = "生成小程序码失败";
    try {
      const j = JSON.parse(r.buf.toString("utf8"));
      msg = (j && j.errmsg) || ("errcode " + (j && j.errcode));
    } catch (e) {
      // 忽略
    }
    const err = new Error(msg);
    err.wxErr = true;
    throw err;
  }
  return r.buf; // PNG
}

/** HTTP POST(JSON) → JSON（云托管内网明文通道，免 access_token） */
function httpPostJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = JSON.stringify(body || {});
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("微信接口响应解析失败（HTTP " + res.statusCode + "）"));
          }
        });
      }
    );
    req.on("error", reject);
    // 6s 而不是 10s：发送是旁路动作，不能把主流程的响应拖住
    req.setTimeout(6000, () => req.destroy(new Error("微信接口超时")));
    req.write(payload);
    req.end();
  });
}

const SUBSCRIBE_SEND_PATH = "/cgi-bin/message/subscribe/send";

/**
 * 发送订阅消息（subscribeMessage.send）。
 *
 * 通道优先级：
 *   ① 微信云托管「开放接口服务」云调用 —— 容器内 http 内网、免 access_token，
 *      与 getMiniCode 同一套（前提：控制台白名单加了 POST /cgi-bin/message/subscribe/send）；
 *   ② 公网 https + access_token —— 本地开发，或白名单没配时兜底，需要 WX_SECRET。
 *
 * @param {string} touser 接收者 openid
 * @param {string} templateId 模板 ID（公众平台 → 订阅消息 → 我的模板）
 * @param {string} [page] 点击卡片跳转页面（如 'pages/pk/pk'，可带参数，不带前导斜杠）
 * @param {Object} [data] 模板数据，形如 { thing1: { value: '…' }, date2: { value: '…' } }
 * @param {string} [state] developer | trial | formal（默认 formal）
 * @returns {Promise<{errcode:number, errmsg:string}>} 失败不抛异常，用 errcode 表达
 */
async function sendSubscribe(touser, templateId, page, data, state) {
  if (!touser || !templateId) {
    return { errcode: -1, errmsg: "缺少 touser 或 template_id" };
  }
  const body = {
    touser: String(touser),
    template_id: String(templateId),
    page: page || "",
    data: data || {},
    miniprogram_state: state || "formal",
    lang: "zh_CN",
  };

  // ① 云托管内网（推荐）：不带 access_token
  try {
    const j = await httpPostJson("http://api.weixin.qq.com" + SUBSCRIBE_SEND_PATH, body);
    // 40001/40014 是凭证类错误，正常的内网云调用不会出现；出现说明实际打到了公网站点，交 ② 兜底
    if (j && j.errcode !== 40001 && j.errcode !== 40014) return j;
  } catch (err) {
    // 白名单未配置 / 不在云托管内 / 网络不通 → 落 ②
  }

  // ② 公网 https + access_token
  const token = await getAccessToken();
  if (!token) {
    return { errcode: -1, errmsg: "无可用调用凭证（开放接口不可用且未配置 WX_SECRET）" };
  }
  try {
    return await httpsPostJson(
      "https://api.weixin.qq.com" + SUBSCRIBE_SEND_PATH + "?access_token=" + encodeURIComponent(token),
      body
    );
  } catch (err) {
    return { errcode: -1, errmsg: "发送请求异常：" + err.message };
  }
}

module.exports = {
  getAccessToken,
  checkContent,
  getMiniCode,
  sendSubscribe,
};
