/**
 * run-all.js —— 批量运行 tests/unit 下全部单测文件
 *
 * 每个测试文件在独立子进程中运行（隔离模块缓存与退出码）。
 * 用法：node tests/unit/run-all.js
 *
 * 位置说明（2026-09-12 迁移）：单测原先放在 `miniprogram/utils/__tests__/`，
 * 而 `miniprogram/` 是**打包目录**、只该放会被打进包的运行时代码 —— 已整体搬到
 * 仓库根的 `tests/unit/`，并在 `e2e/check-assets.js` 加了护栏防止再放回去。
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter((f) => /\.test\.js$/.test(f))
  .sort();

console.log('共发现 ' + files.length + ' 个测试文件\n');
let anyFail = false;

for (const f of files) {
  const filePath = path.join(dir, f);
  console.log('>>> 运行 ' + f);
  const r = spawnSync(process.execPath, [filePath], { encoding: 'utf8', timeout: 120000 });
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  if (r.status !== 0) anyFail = true;
  console.log('<<< ' + f + (r.status === 0 ? ' [退出码 0]' : ' [退出码 ' + r.status + ']') + '\n');
}

console.log(anyFail ? '存在失败的测试文件。' : '全部测试文件通过。');
process.exit(anyFail ? 1 : 0);
