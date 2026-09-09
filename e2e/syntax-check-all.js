// 批量 JS 语法检查（node --check 风格）：递归收集 .js 并逐个 require 语法探测
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail++;
    console.log('SYNTAX FAIL:', f);
    const msg = String(e.stderr || e.stdout || '');
    console.log(msg.split('\n').slice(0, 4).join('\n'));
  }
}
console.log(`checked ${files.length} js files, ${fail} failed`);
process.exit(fail ? 1 : 0);
