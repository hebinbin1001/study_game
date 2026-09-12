/**
 * e2e/smoke-api.js
 *
 * Smoke test for the "Word Warrior" backend deployed on WeChat Cloud Hosting.
 *
 * Purpose:
 *   - Verify the 12 route groups return HTTP 200 (no 503/502/500 crash).
 *   - Verify the response body is valid JSON matching the unified {code, data, message} convention.
 *   - Verify the DB is reachable (health check + a real DB query on /api/ranklist/world).
 *   - Verify the openid chain: with a trusted source + valid openid, user-scoped endpoints
 *     must NOT return code=1001 anymore.
 *
 * Constraints:
 *   - Uses only Node built-in modules (https / url). No external npm deps.
 *   - All console output is ASCII to avoid Windows PowerShell encoding issues.
 *   - Always exits normally (exit code 0); a single endpoint FAIL does not crash the process.
 */

"use strict";

const https = require("https");
const { URL } = require("url");

const BASE_URL = "https://express-g0hk-309012-5-1304586666.sh.run.tcloudbase.com";
const TEST_OPENID = "test_openid_0000000001";
const OPENID_HEADERS = { "x-wx-source": "weixin", "x-wx-openid": TEST_OPENID };
const TIMEOUT_MS = 20000;

// Human-readable note per business code (see server/constants.js).
const CODE_NOTE = {
  0: "OK",
  1001: "USER_UNKNOWN (no openid)",
  1002: "OPENID_INVALID",
  1003: "SOURCE_UNTRUSTED",
  2001: "NICKNAME_INVALID",
  3001: "SCORE_INVALID",
  4000: "MISSING_PARAMS",
  4001: "NOT_FOUND",
  4002: "UNLOCK_CONDITION_NOT_MET",
  4003: "NO_PERMISSION",
  5000: "INTERNAL_ERROR",
  5001: "HEALTH_DB_DOWN",
};

/**
 * Perform a single HTTPS request and resolve with { status, body, json, error }.
 * Never rejects: network/timeout/parse failures are captured in the result object.
 */
function doRequest(method, path, body, headers) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(BASE_URL + path);
    } catch (e) {
      return resolve({ status: -1, body: "", json: null, error: "bad url: " + e.message });
    }

    const payload = body !== undefined && body !== null ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: Object.assign(
        { "Content-Type": "application/json", "User-Agent": "smoke-api" },
        payload ? { "Content-Length": Buffer.byteLength(payload) } : {},
        headers || {}
      ),
    };

    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        data += c;
      });
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = null;
        }
        done({ status: res.statusCode, body: data, json });
      });
    });
    req.on("error", (err) => done({ status: -1, body: "", json: null, error: err.message }));
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

// Route cases (grouped by the 12 route groups mounted in server/index.js).
const CASES = [
  { group: "health",       method: "GET",  path: "/api/health", special: "health" },
  { group: "user",         method: "POST", path: "/api/user", body: {}, needUser: true },
  { group: "nickname",     method: "GET",  path: "/api/nickname", needUser: true },
  { group: "nickname",     method: "POST", path: "/api/nickname", body: { nickname: "SmokeTester" }, needUser: true },
  { group: "score",        method: "POST", path: "/api/score", body: { grade: "primary", level: 1, correctCount: 3, totalQ: 5 }, needUser: true },
  { group: "score",        method: "GET",  path: "/api/score/best?grade=primary&level=1", needUser: true },
  { group: "avatar",       method: "GET",  path: "/api/avatar/list", needUser: true },
  { group: "rank",         method: "GET",  path: "/api/rank/info", needUser: true },
  { group: "rank",         method: "GET",  path: "/api/rank/progress", needUser: true },
  { group: "rank",         method: "POST", path: "/api/rank/sync", body: { stars: 3 }, needUser: true },
  { group: "ranklist",     method: "GET",  path: "/api/ranklist/world", special: "world" },
  { group: "ranklist",     method: "GET",  path: "/api/ranklist/me", needUser: true },
  { group: "level",        method: "GET",  path: "/api/level/list", needUser: true },
  { group: "level",        method: "POST", path: "/api/level", body: { title: "Smoke Level", grade: "primary", items: [{ q: "1+1", a: "2" }] }, needUser: true },
  // 普通用户查审核队列返回 4003 NO_PERMISSION 属预期业务响应，故放宽该用例的业务码
  { group: "level/review", method: "GET",  path: "/api/level/review/reviews", needUser: true, acceptCodes: [0, 4003] },
  { group: "wrong",        method: "GET",  path: "/api/wrong/list", needUser: true },
  // 需求② 错题本优化：分页协议（带参数时返回 items/page/pageSize/total/hasMore/scope/counts）
  { group: "wrong",        method: "GET",  path: "/api/wrong/list?scope=pending&page=1&pageSize=5", needUser: true },
  { group: "wrong",        method: "GET",  path: "/api/wrong/stats", needUser: true },
  // 删除接口（幂等：不存在的 recordId 也返回 code=0 + removed=0）
  { group: "wrong",        method: "POST", path: "/api/wrong/remove", body: { recordId: "00000000-0000-0000-0000-000000000000" }, needUser: true },
  { group: "checkin",      method: "GET",  path: "/api/checkin", needUser: true },
  { group: "achievement",  method: "GET",  path: "/api/achievement/list", needUser: true },
];

function codeNote(j) {
  if (j == null) return "N/A";
  const c = j.code;
  if (CODE_NOTE[c] !== undefined) return CODE_NOTE[c];
  return "code=" + c;
}

function describe(r) {
  if (r.status === -1) return "ERR(" + r.error + ")";
  if (r.json == null) return "HTTP " + r.status + " INVALID_JSON";
  const c = typeof r.json.code === "undefined" ? "?" : r.json.code;
  return "HTTP " + r.status + " code=" + c + " " + codeNote(r.json);
}

/**
 * Judge a single case against the smoke criteria.
 * Returns an array of problem strings (empty = PASS).
 *
 * 业务码断言（踩坑记录 · 假绿灯修复）：
 *   旧版只校验「HTTP 200 + JSON 里有 code 字段」，于是 /api/score 返回
 *   5000 INTERNAL_ERROR 也被判成 PASS —— 线上「成绩上报整条链路失效」被冒烟长期漏报。
 *   现按用例期望业务码判定：
 *     · needUser 用例：authed 必须为 0（或在 acceptCodes 显式放宽），anon 必须为 1001；
 *     · 1001 出现在 authed 一律判失败（openid 链路断了）。
 */
function judgeCase(c, anon, auth) {
  const problems = [];

  if (anon.status !== 200) {
    problems.push("anon " + (anon.status === -1 ? "ERR(" + anon.error + ")" : "HTTP " + anon.status));
  }
  if (auth.status !== 200) {
    problems.push("authed " + (auth.status === -1 ? "ERR(" + auth.error + ")" : "HTTP " + auth.status));
  }

  if (anon.json == null) {
    problems.push("anon invalid JSON");
  } else if (typeof anon.json.code === "undefined") {
    problems.push("anon missing code field");
  }
  if (auth.json == null) {
    problems.push("authed invalid JSON");
  } else if (typeof auth.json.code === "undefined") {
    problems.push("authed missing code field");
  }

  if (c.special === "health") {
    const j = auth.json;
    if (!j || j.code !== 0 || !j.data || j.data.db !== "connected") {
      problems.push("health code!=0 or db!=connected");
    }
  }

  if (c.special === "world") {
    const j = anon.json;
    if (!j || j.code !== 0 || !j.data || !Array.isArray(j.data.list)) {
      problems.push("world anon code!=0 or data.list missing");
    }
  }

  if (c.needUser) {
    const j = auth.json;
    if (j && j.code === 1001) {
      problems.push("authed still 1001 (openid chain broken)");
    } else if (j && typeof j.code !== "undefined" && (c.acceptCodes || [0]).indexOf(j.code) === -1) {
      problems.push("authed code=" + j.code + " 非预期（期望 " + (c.acceptCodes || [0]).join("/") + "）"
        + " " + codeNote(j));
    }
    const a = anon.json;
    if (a && typeof a.code !== "undefined" && (c.acceptAnonCodes || [1001]).indexOf(a.code) === -1) {
      problems.push("anon code=" + a.code + " 非预期（期望 "
        + (c.acceptAnonCodes || [1001]).join("/") + "） " + codeNote(a));
    }
  }

  return problems;
}

(async () => {
  console.log("=== Smoke API Test ===");
  console.log("BASE_URL : " + BASE_URL);
  console.log("OPENID   : " + TEST_OPENID);
  console.log("");

  const groupResults = {};

  for (const c of CASES) {
    let anon, auth;
    try {
      anon = await doRequest(c.method, c.path, c.body, null);
      auth = await doRequest(c.method, c.path, c.body, OPENID_HEADERS);
    } catch (e) {
      anon = { status: -1, body: "", json: null, error: e.message };
      auth = { status: -1, body: "", json: null, error: e.message };
    }

    const problems = judgeCase(c, anon, auth);
    const pass = problems.length === 0;

    console.log("[" + (pass ? "PASS" : "FAIL") + "] " + c.method.padEnd(4) + " " + c.path);
    console.log("      anon  : " + describe(anon));
    console.log("      authed: " + describe(auth));
    if (!pass) {
      console.log("      WHY   : " + problems.join("; "));
    }

    if (!groupResults[c.group]) {
      groupResults[c.group] = { pass: true, problems: [] };
    }
    if (!pass) {
      groupResults[c.group].pass = false;
      groupResults[c.group].problems.push(c.method + " " + c.path + " -> " + problems.join("; "));
    }
  }

  console.log("");
  // ===== 错题本完整链路（需求②）：新增 → 分页列表 → 复习 → 删除 → 幂等删除 → 老协议 =====
  // 说明：小程序模拟器是游客态（没有 openid），UI 层拿不到错题数据，
  // 所以错题本的端到端放在这里对着真实部署跑（与 CASES 用同一个测试 openid）。
  const wb = { pass: true, problems: [] };
  const wbProblem = (msg) => { wb.pass = false; wb.problems.push(msg); };
  const wbPost = (path, body) => doRequest("POST", path, body, OPENID_HEADERS);
  const wbGet = (path) => doRequest("GET", path, null, OPENID_HEADERS);
  const qid = "smoke_wrong_" + Date.now();
  const recIdOf = (r) => (r && r.json && r.json.data ? r.json.data.recordId : null);

  console.log("");
  console.log("=== Wrong-book Flow (add -> list(page) -> review -> remove -> legacy) ===");

  const addRes = await wbPost("/api/wrong/add", {
    questionId: qid,
    question: { type: "w1", q: "smoke", a: "smoke", hint: "smoke" },
  });
  const recordId = recIdOf(addRes);
  console.log("[flow] add          : " + describe(addRes) + " recordId=" + (recordId || "-"));
  if (!recordId) wbProblem("add did not return recordId");

  if (recordId) {
    const paged = await wbGet("/api/wrong/list?scope=pending&page=1&pageSize=50");
    const pd = paged.json && paged.json.data;
    const pagedOk = paged.json && paged.json.code === 0 && pd && Array.isArray(pd.items);
    console.log("[flow] list(page)   : " + describe(paged));
    if (!pagedOk) {
      wbProblem("paged list shape invalid (expect items/page/pageSize/total/hasMore/scope/counts)");
    } else {
      console.log("[flow] page data    : page=" + pd.page + " size=" + pd.pageSize
        + " total=" + pd.total + " hasMore=" + pd.hasMore + " counts=" + JSON.stringify(pd.counts));
      if (pd.page !== 1 || pd.pageSize !== 50) wbProblem("page/pageSize echo wrong");
      if (typeof pd.total !== "number" || !pd.counts || typeof pd.counts.pending !== "number") {
        wbProblem("total / counts missing");
      }
      if (!pd.items.some((it) => it.recordId === recordId)) wbProblem("new record missing from pending list");
      if (pd.items.some((it) => (it.mastery || 0) >= 100)) wbProblem("pending scope leaked mastered records");
      if (pd.scope !== "pending") wbProblem("scope echo wrong");
    }

    const reviewRes = await wbPost("/api/wrong/review", { recordId, correct: true });
    console.log("[flow] review ok    : " + describe(reviewRes));
    if (!reviewRes.json || reviewRes.json.code !== 0) wbProblem("review failed");

    const badPage = await wbGet("/api/wrong/list?scope=pending&page=0&pageSize=5");
    console.log("[flow] page=0 (4000): " + describe(badPage));
    if (!badPage.json || badPage.json.code !== 4000) wbProblem("page=0 should be rejected with code 4000");

    const rm1 = await wbPost("/api/wrong/remove", { recordId });
    const rm1Removed = rm1.json && rm1.json.data ? rm1.json.data.removed : null;
    console.log("[flow] remove #1    : " + describe(rm1) + " removed=" + rm1Removed);
    if (!rm1.json || rm1.json.code !== 0 || rm1Removed !== 1) wbProblem("first remove should return removed=1");

    const rm2 = await wbPost("/api/wrong/remove", { recordId });
    const rm2Removed = rm2.json && rm2.json.data ? rm2.json.data.removed : null;
    console.log("[flow] remove #2    : " + describe(rm2) + " removed=" + rm2Removed);
    if (!rm2.json || rm2.json.code !== 0 || rm2Removed !== 0) {
      wbProblem("second remove should be idempotent (code=0, removed=0)");
    }

    const legacy = await wbGet("/api/wrong/list");
    const ld = legacy.json && legacy.json.data;
    const legacyOk = legacy.json && legacy.json.code === 0 && ld
      && Array.isArray(ld.pending) && Array.isArray(ld.mastered);
    console.log("[flow] list(legacy)  : " + describe(legacy));
    if (!legacyOk) {
      wbProblem("legacy list (no params) should return { pending, mastered, total }");
    } else if (ld.pending.some((it) => it.recordId === recordId)) {
      wbProblem("removed record still present in legacy list");
    }
  }
  groupResults["wrong-book-flow"] = wb;

  console.log("");
  console.log("=== Per-Group Summary ===");
  let passCount = 0;
  let failCount = 0;
  for (const g of Object.keys(groupResults)) {
    const gr = groupResults[g];
    if (gr.pass) {
      passCount++;
    } else {
      failCount++;
    }
    console.log("[" + (gr.pass ? "PASS" : "FAIL") + "] " + g);
    if (!gr.pass) {
      gr.problems.forEach((p) => console.log("       - " + p));
    }
  }

  console.log("");
  console.log("=== FINAL: " + Object.keys(groupResults).length + " groups, " + passCount + " passed, " + failCount + " failed ===");
  process.exit(0);
})();
