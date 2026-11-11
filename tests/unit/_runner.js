/**
 * _runner.js —— 轻量测试运行器（无第三方依赖）
 *
 * 用法：
 *   const { suite } = require('./_runner');
 *   const s = suite('模块名');
 *   s.test('用例名', () => { s.assert.equal(...) });
 *   s.done(); // 输出汇总并设置进程退出码（有失败为 1）
 *
 * 说明：所有断言都会计数；suite.done() 打印 PASS/FAIL 与断言总数。
 * 文件可直接 `node xxx.test.js` 运行，也可由 run-all.js 批量调度。
 */
'use strict';

const nodeAssert = require('node:assert/strict');

function suite(moduleName) {
  const stats = { name: moduleName, passed: 0, failed: 0, assertions: 0, failures: [] };

  // 包装 node:assert/strict，所有调用自动计数
  const assert = {};
  const methods = [
    'equal', 'notEqual', 'deepEqual', 'notDeepEqual', 'ok', 'fail',
    'strictEqual', 'notStrictEqual', 'match', 'doesNotMatch',
    'throws', 'rejects', 'doesNotReject'
  ];
  for (const m of methods) {
    assert[m] = (...args) => {
      stats.assertions++;
      nodeAssert[m](...args);
    };
  }
  // 便捷断言
  assert.true = (v, msg) => { stats.assertions++; nodeAssert.equal(v, true, msg || ('expected true, got ' + v)); };
  assert.false = (v, msg) => { stats.assertions++; nodeAssert.equal(v, false, msg || ('expected false, got ' + v)); };
  assert.contains = (haystack, needle, msg) => {
    stats.assertions++;
    const h = haystack === null || haystack === undefined ? String(haystack) : String(haystack);
    nodeAssert.ok(h.indexOf(String(needle)) !== -1, msg || ('expected "' + h + '" to contain "' + needle + '"'));
  };
  assert.allDistinct = (arr, msg) => {
    stats.assertions++;
    nodeAssert.equal(new Set(arr).size, arr.length, msg || ('array not all distinct: ' + JSON.stringify(arr)));
  };

  let tail = Promise.resolve(); // 异步用例的串行链
  let hasAsync = false;

  function pass(name) {
    stats.passed++;
    console.log('   PASS  ' + name);
  }

  function fail(name, e) {
    stats.failed++;
    const message = (e && e.message) ? e.message : String(e);
    stats.failures.push({ name: name, message: message });
    console.log('   FAIL  ' + name);
    console.log('         ' + String(message).split('\n').join('\n         '));
  }

  /** 执行一个用例：同步用例立即返回；async 用例返回 promise（结果已在内部记账） */
  function runGuarded(name, fn) {
    let result;
    try {
      result = fn();
    } catch (e) {
      fail(name, e);
      return undefined;
    }
    if (result && typeof result.then === 'function') {
      return result.then(function () { pass(name); }, function (e) { fail(name, e); });
    }
    pass(name);
    return undefined;
  }

  /**
   * 注册并执行一个用例。
   *
   * 2026-11-11：支持 async 用例（埋点客户端的 flush 是 Promise），同时保持既有文件的
   * 「同步用例立即执行」语义 —— auth-guard.test.js 这类文件在 `await` 之间注册用例，
   * 如果全部延后执行，断言会跑到后续状态上（实测挂 2 条）。
   * 规则：没有 async 用例在跑 → 立即执行；一旦出现 async 用例 → 后续用例排队，
   * 等前面的 promise 结束再跑（否则下一个用例的 reset() 会打断上一个的 await）。
   */
  function test(name, fn) {
    if (hasAsync) {
      tail = tail.then(function () { return runGuarded(name, fn); });
      return;
    }
    const result = runGuarded(name, fn);
    if (result && typeof result.then === 'function') {
      hasAsync = true;
      tail = result;
    }
  }

  function printSummary() {
    const total = stats.passed + stats.failed;
    console.log('');
    console.log('== ' + stats.name + ' == 通过 ' + stats.passed + '/' + total + '，断言 ' + stats.assertions + ' 条');
    if (stats.failed > 0) {
      process.exitCode = 1;
    }
    return stats;
  }

  function done() {
    return tail.then(printSummary);
  }

  return { test: test, done: done, assert: assert, stats: stats };
}

module.exports = { suite: suite };