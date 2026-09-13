// 批量 JS 语法检查（node --check 风格）：递归收集 .js 并逐个做语法探测
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['miniprogram', 'server', 'e2e'];
const skipDir = new Set(['node_modules', '.git', '__tests__']);
let files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (skipDir.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith('.js')) files.push(p);
  }
}
roots.forEach(walk);

let fail = 0;
for (const f of files) {
  // 说明（2026-09-13）：这里原来用 execFileSync(stdio:'pipe')。它内部要建管道，
  // 而受限/沙箱环境会以 EPERM 拒绝建管道 —— 于是**每个文件都被判语法失败**
  // （156/156 假红），真正有语法错误的文件反而被淹没。
  // 改成 spawnSync + stdio:'inherit'：不建管道（子进程直接继承当前终端），
  // 语法错误信息照样原样打印到控制台，退出码判定不变，两个环境都能用。
  const r = spawnSync(process.execPath, ['--check', f], { stdio: 'inherit' });
  if (r.status !== 0) {
    fail++;
    console.log('SYNTAX FAIL:', f);
    if (r.error) console.log('  (spawn error: ' + r.error.code + ')');
  }
}
console.log(`checked ${files.length} js files, ${fail} failed`);
process.exit(fail ? 1 : 0);
