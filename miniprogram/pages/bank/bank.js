/**
 * 题库页（2026-09-18 新增）
 *
 * 需求：用户要能**直观看到各学段都有哪些词汇**，并支持**编辑 / 新增 / 删除**，
 *      而且这些题库就是**闯关线的题源**。
 *
 * 实现要点：
 *   · 展示的数据 = 内置词库 ⊕ 我的改动（新增/改写/停用），由 utils/bank.js 合并、
 *     utils/dict.js 统一出口 —— 所以这里改完，闯关线/各玩法立刻用新题库出题；
 *   · 存储以云端为真源（跨设备不丢），本地先落一份保证离线可用；
 *     保存动作走「先本地生效 → 再异步推云端」，弱网也不会卡住操作；
 *   · 内置条目可以改写与停用（停用可恢复），我的新增条目可以真删。
 *
 * 关联：utils/bank.js（合并规则）、server/routes/wordbank.js（云端 CRUD）
 */

var request = require('../../utils/request');
var auth = require('../../utils/auth');
var dict = require('../../utils/dict');
var bank = require('../../utils/bank');
var constants = require('../../utils/constants');

var PAGE_SIZE = 30;

/** 把词条转成列表行（带来源标签与稳定 key） */
function toRow(grade, item) {
  var label = '内置';
  var cls = '';
  if (item._disabled) { label = '已停用'; cls = 'off'; }
  else if (item._user) { label = '我的'; cls = 'mine'; }
  else if (item._edited) { label = '已修改'; cls = 'edit'; }
  return {
    k: bank.fingerprint(grade, item.type, item.q),
    type: item.type || '',
    typeLabel: (constants.TYPES[item.type] && constants.TYPES[item.type].name) || item.type || '其它',
    q: item.q || '',
    a: item.a || '',
    hint: item.hint || '',
    d: Array.isArray(item.d) ? item.d.join(',') : (item.d || ''),
    ex: item.ex || '',
    srcLabel: label,
    srcCls: cls,
    isBuiltin: !item._user,
    disabled: !!item._disabled
  };
}

Page({
  data: {
    // 筛选
    grades: [],
    gradeIndex: 0,
    gradeLabel: '',
    types: [],
    curType: 'all',
    keyword: '',

    // 统计 + 列表
    totalAll: 0,
    builtinCount: 0,
    mineCount: 0,
    shown: [],
    hasMore: false,
    loading: false,
    syncing: false,

    // 编辑弹层
    sheetShow: false,
    sheetMode: 'create',        // create | edit
    sheetBuiltin: false,
    sheetTypeOptions: [],
    fType: 'w1',
    fQ: '',
    fA: '',
    fHint: '',
    fD: '',
    fEx: '',
    sheetTitle: '',

    // 门禁
    needLogin: false,
    gateText: ''
  },

  _all: [],      // 当前学段全部行（筛选前）
  _page: 1,

  // ============ 生命周期 ============
  onLoad: function () {
    var grades = constants.GRADES.map(function (g) { return { key: g.key, label: g.label }; });
    var types = constants.TYPE_GROUPS.map(function (t) { return { key: t.key, label: t.label }; });
    var sheetTypes = constants.TYPE_CODES.map(function (c) {
      return { code: c, name: constants.TYPES[c].name };
    });
    this.setData({
      grades: grades,
      gradeLabel: grades[0].label,
      types: types,
      sheetTypeOptions: sheetTypes
    });
  },

  onShow: function () {
    if (!auth.requireLogin(this, '登录后题库才能保存到云端（换设备也不丢）')) return;
    this._syncAndRender();
  },

  onGateLogin: function () {
    var self = this;
    auth.loginFromGate(this, function () { self._syncAndRender(); },
      '登录后题库才能保存到云端（换设备也不丢）');
  },

  // ============ 数据同步 ============

  /**
   * 拉云端覆盖记录 → 注入 dict → 渲染。
   * 失败时退回本地缓存（离线可看可改，联网后自动补推）。
   */
  _syncAndRender: function () {
    var self = this;
    this.setData({ syncing: true });
    request.get('/api/wordbank/entries').then(function (d) {
      dict.setOverrides((d && d.list) || []);
      self.setData({ syncing: false });
      self._render();
    }).catch(function () {
      dict.refreshOverrides();
      self.setData({ syncing: false });
      self._render();
    });
  },

  /** 用当前覆盖层重新组装列表（合并 → 筛选 → 分页切片） */
  _render: function () {
    var g = this.data.grades[this.data.gradeIndex].key;
    var merged = dict.loadByGrade(g);
    var raw = dict.loadBuiltin(g);
    var ov = dict.getOverrides();

    // 被停用的内置条目：合并结果里已经不在，单独补到尾部展示（可恢复）
    var disabled = [];
    raw.forEach(function (it) {
      var e = ov[bank.fingerprint(g, it.type, it.q)];
      if (e && e.action === 'disable') {
        disabled.push(Object.assign({}, it, { _disabled: true }));
      }
    });

    var rows = merged.map(function (it) { return toRow(g, it); })
      .concat(disabled.map(function (it) { return toRow(g, it); }));

    var mine = 0;
    rows.forEach(function (r) { if (r.srcCls === 'mine') mine += 1; });

    this._all = rows;
    this._page = 1;
    this.setData({
      totalAll: rows.length,
      builtinCount: raw.length,
      mineCount: mine
    });
    this._applyFilter();
  },

  /** 关键字 + 题型筛选 → 分页切片 */
  _applyFilter: function () {
    var kw = String(this.data.keyword || '').trim().toLowerCase();
    var type = this.data.curType;
    var list = this._all.filter(function (r) {
      if (type && type !== 'all' && !constants.isItemInGroup(r, type)) return false;
      if (!kw) return true;
      return (r.q + ' ' + r.a + ' ' + r.hint).toLowerCase().indexOf(kw) >= 0;
    });
    var slice = list.slice(0, this._page * PAGE_SIZE);
    this.setData({
      shown: slice,
      hasMore: list.length > slice.length
    });
  },

  // ============ 交互：筛选 ============
  pickGrade: function (e) {
    var i = parseInt(e.currentTarget.dataset.index, 10) || 0;
    this.setData({ gradeIndex: i, gradeLabel: this.data.grades[i].label });
    this._render();
  },

  pickType: function (e) {
    this.setData({ curType: e.currentTarget.dataset.key });
    this._page = 1;
    this._applyFilter();
  },

  onSearch: function (e) {
    this.setData({ keyword: e.detail.value || '' });
    this._page = 1;
    this._applyFilter();
  },

  clearSearch: function () {
    this.setData({ keyword: '' });
    this._page = 1;
    this._applyFilter();
  },

  loadMore: function () {
    this._page += 1;
    this._applyFilter();
  },

  goBack: function () {
    wx.navigateBack();
  },

  // ============ 编辑弹层 ============

  /** 新增：预填当前题型（综合时给 w1） */
  openCreate: function () {
    var t = this.data.curType;
    var code = (t && t !== 'all') ? this._defaultTypeOfGroup(t) : 'w1';
    this.setData({
      sheetShow: true,
      sheetMode: 'create',
      sheetBuiltin: false,
      sheetTitle: '新增词条',
      fType: code,
      fQ: '',
      fA: '',
      fHint: '',
      fD: '',
      fEx: ''
    });
  },

  _defaultTypeOfGroup: function (groupKey) {
    var codes = constants.TYPE_CODES;
    for (var i = 0; i < codes.length; i++) {
      if (constants.isItemInGroup({ type: codes[i] }, groupKey)) return codes[i];
    }
    return 'w1';
  },

  openEdit: function (e) {
    var k = e.currentTarget.dataset.k;
    var row = null;
    for (var i = 0; i < this._all.length; i++) {
      if (this._all[i].k === k) { row = this._all[i]; break; }
    }
    if (!row) return;
    this.setData({
      sheetShow: true,
      sheetMode: 'edit',
      sheetBuiltin: row.isBuiltin,
      sheetTitle: row.isBuiltin ? '编辑内置词条' : '编辑我的词条',
      fType: row.type,
      fQ: row.q,
      fA: row.a,
      fHint: row.hint,
      fD: row.d,
      fEx: row.ex
    });
  },

  closeSheet: function () {
    this.setData({ sheetShow: false });
  },

  /** 阻止点弹层内部时冒泡关闭 */
  noop: function () {},

  pickSheetType: function (e) {
    this.setData({ fType: e.currentTarget.dataset.code });
  },

  onField: function (e) {
    var f = e.currentTarget.dataset.f;
    var patch = {};
    patch[f] = e.detail.value;
    this.setData(patch);
  },

  /**
   * 保存词条。
   * 内置条目 → action='patch'（只改释义/答案/干扰项/例句，题目不变，指纹才稳定）；
   * 我的新增 → action='create'（同指纹覆盖写 = 编辑）。
   */
  saveSheet: function () {
    var d = this.data;
    var q = String(d.fQ || '').trim();
    var a = String(d.fA || '').trim();
    if (!q) { wx.showToast({ title: '题目不能为空', icon: 'none' }); return; }
    if (!a) { wx.showToast({ title: '答案不能为空', icon: 'none' }); return; }
    if (!d.fType) { wx.showToast({ title: '请选择题型', icon: 'none' }); return; }

    var grade = d.grades[d.gradeIndex].key;
    var action = d.sheetBuiltin ? 'patch' : 'create';
    var entry = bank.makeEntry(action, grade, d.fType, q, {
      a: a,
      hint: String(d.fHint || '').trim(),
      ex: String(d.fEx || '').trim(),
      d: String(d.fD || '').trim()
    });
    this._commitLocal(entry, 'saved');
  },

  /** 停用内置条目（可恢复） */
  disableItem: function (e) {
    var row = this._rowOf(e.currentTarget.dataset.k);
    if (!row) return;
    var grade = this.data.grades[this.data.gradeIndex].key;
    var entry = bank.makeEntry('disable', grade, row.type, row.q);
    this._commitLocal(entry, 'disabled');
  },

  /** 恢复被停用的内置条目（= 删掉那条停用记录） */
  restoreItem: function (e) {
    var row = this._rowOf(e.currentTarget.dataset.k);
    if (!row) return;
    this._removeRemote(row, 'restored');
  },

  /** 删除我的条目 / 撤销对内置的改动 */
  deleteItem: function (e) {
    var row = this._rowOf(e.currentTarget.dataset.k);
    if (!row) return;
    var self = this;
    wx.showModal({
      title: row.isBuiltin ? '撤销改动' : '删除词条',
      content: row.isBuiltin ? '将恢复这条内置词条的原样' : '删除后不可恢复',
      confirmText: '确定',
      success: function (r) {
        if (!r.confirm) return;
        self._removeRemote(row, 'removed');
      }
    });
  },

  _rowOf: function (k) {
    for (var i = 0; i < this._all.length; i++) {
      if (this._all[i].k === k) return this._all[i];
    }
    return null;
  },

  /** 先本地生效再推云端（弱网不卡操作；失败只提示，本地已生效） */
  _commitLocal: function (entry, toastKey) {
    var self = this;
    bank.upsertLocal(entry);
    dict.refreshOverrides();
    this.setData({ sheetShow: false });
    this._render();
    wx.showToast({ title: entry.action === 'disable' ? '已停用' : '已保存', icon: 'none' });

    request.post('/api/wordbank/entries', entry).catch(function () {
      wx.showToast({ title: '已保存到本机，联网后同步', icon: 'none' });
    });
    return toastKey;
  },

  _removeRemote: function (row, toastKey) {
    var self = this;
    var grade = this.data.grades[this.data.gradeIndex].key;
    bank.removeLocal(grade, row.type, row.q);
    dict.refreshOverrides();
    this.setData({ sheetShow: false });
    this._render();
    wx.showToast({ title: toastKey === 'restored' ? '已恢复' : '已删除', icon: 'none' });

    request.request({
      url: '/api/wordbank/entries',
      method: 'DELETE',
      data: { grade: grade, type: row.type, q: row.q }
    }).catch(function () { /* 本地已生效，联网后重建时会以云端为准 */ });
  },

  onShareAppMessage: function () {
    return {
      title: '词力战士 - 我的题库，边玩边记',
      path: '/pages/index/index'
    };
  }
});
