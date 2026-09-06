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
  { group: "level/review", method: "GET",  path: "/api/level/review/reviews", needUser: true },
  { group: "wrong",        method: "GET",  path: "/api/wrong/list", needUser: true },
  { group: "wrong",        method: "GET",  path: "/api/wrong/stats", needUser: true },
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
    if (auth.json && auth.json.code === 1001) {
      problems.push("authed still 1001 (openid chain broken)");
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