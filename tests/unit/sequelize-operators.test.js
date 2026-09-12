/**
 * sequelize-operators.test.js —— Sequelize v6 操作符用法回归
 *
 * 背景（线上真实故障）：
 *   server/routes/ranklist.js 的 /me 用了旧式操作符别名
 *     where: { stars: { $gt: myRecord.stars } }
 *     where: { openid: { $ne: openid } }
 *   项目用的是 Sequelize 6.x，而 $gt / $ne 这类别名在 v6 已被移除 ——
 *   它们不会被识别成操作符，而是当作普通对象键参与序列化，
 *   最终生成 `WHERE stars = '[object Object]'` 这样的错误 SQL，
 *   MySQL 侧报错 → 接口返回 5000。表现为「我的排名」在线上一直不可用。
 *
 * 本文件锁定两件事：
 *   ① 静态扫描 server/ 全量源码，禁止再出现旧式 $xxx 操作符别名；
 *   ② 正例校验：用 Op.gt / Op.ne 能生成正确的 > 与 <> 比较。
 *
 * 运行：node tests/unit/sequelize-operators.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('server Sequelize 操作符');

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.resolve(__dirname, '../../server');

/** 递归收集目录下的 .js（跳过 node_modules / 隐藏目录） */
function collectJs(dir, out) {
  out = out || [];
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return out;
  }
  names.forEach(function (name) {
    if (name === 'node_modules' || name.charAt(0) === '.') return;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) collectJs(p, out);
    else if (name.endsWith('.js')) out.push(p);
  });
  return out;
}

// Sequelize 从 server/node_modules 解析（根目录没有该依赖）
const sequelizePkg = require(path.join(SERVER_DIR, 'node_modules', 'sequelize'));
const { Sequelize, DataTypes, Op } = sequelizePkg;

function makeProbe() {
  const seq = new Sequelize('db', 'user', 'pass', { dialect: 'mysql', logging: false });
  const model = seq.define(
    'RankRecordProbe',
    {
      stars: DataTypes.INTEGER,
      openid: DataTypes.STRING,
      createdAt: DataTypes.DATE
    },
    { tableName: 'rank_records', timestamps: false }
  );
  return { qg: seq.getQueryInterface().queryGenerator, model: model };
}

s.test('静态扫描：server/ 源码不得使用旧式 $gt/$ne 等操作符别名', () => {
  const files = collectJs(SERVER_DIR, []);
  s.assert.ok(files.length > 10, '应扫描到 server 源码文件，实际 ' + files.length + ' 个');

  const re = /[{,]\s*\$(gt|gte|lt|lte|ne|eq|in|nin|or|and|like|between|not|is)\s*:/g;
  const hits = [];
  files.forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8');
    const found = src.match(re);
    if (found) {
      hits.push(path.relative(SERVER_DIR, f).replace(/\\/g, '/') + ' → ' + found.join(', '));
    }
  });
  s.assert.deepEqual(hits, [],
    '发现旧式操作符别名，Sequelize v6 会生成 `= \'[object Object]\'` 的错误 SQL');
});

s.test('正例：Op.gt 生成 > 比较', () => {
  const probe = makeProbe();
  const sql = probe.qg.selectQuery(
    'rank_records',
    { where: { stars: { [Op.gt]: 3 } } },
    probe.model
  );
  s.assert.ok(sql.indexOf('> 3') !== -1, '应生成 `> 3`，实际：' + sql);
  s.assert.ok(sql.indexOf('[object Object]') === -1, '不得出现 [object Object]');
});

s.test('正例：Op.ne 生成不等比较', () => {
  const probe = makeProbe();
  const sql = probe.qg.selectQuery(
    'rank_records',
    { where: { openid: { [Op.ne]: 'o_test' } } },
    probe.model
  );
  // MySQL 方言下 Sequelize 生成 `!=`（等价于 `<>`），两种写法都接受
  s.assert.ok(sql.indexOf('!=') !== -1 || sql.indexOf('<>') !== -1, '应生成不等比较，实际：' + sql);
  s.assert.ok(sql.indexOf('o_test') !== -1, '应带上比较值，实际：' + sql);
});

s.test('反例留档：旧式 $gt 无法生成正确比较（抛错或退化为 [object Object]）', () => {
  const probe = makeProbe();
  let sql = null;
  let err = null;
  try {
    sql = probe.qg.selectQuery('rank_records', { where: { stars: { $gt: 3 } } }, probe.model);
  } catch (e) {
    err = e;
  }
  const broken = !!err || (sql || '').indexOf('[object Object]') !== -1;
  // 若此断言失败，说明 Sequelize 版本行为变了，需要重新评估上面那条静态扫描规则
  s.assert.ok(broken, '旧式 $gt 竟然生成了正常 SQL，请复核结论；实际：' + (sql || (err && err.message)));
});

s.done();
