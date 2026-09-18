/**
 * 题库页（2026-09-18，2026-09-18 二次改版：自建库 + 掌握状态）
 *
 * 需求：
 *   1. 直观看到各学段都有哪些词汇，支持编辑/新增/删除；
 *   2. 这些题库就是**闯关线的题源**；
 *   3. 自建库**挂在某个学段下作为附加题源**（用户拍板，不做全局 active 切换）；
 *   4. 每条词条显示掌握状态（✓答对 / ✗答错），可筛「薄弱 / 已掌握」。
 *
 * 数据来源：
 *   · 词条 = 内置词库 ⊕ 我的改动（新增/改写/停用）⊕ 该学段启用的自建库词条（utils/bank.js 合并）
 *   · 掌握状态 = 错题本 wrong_records（questionId = type|q|a 与词条一一对应，见 /api/wordbank/mastery）
 *
 * 存储：云端为真源 + 本地缓存；保存动作「先本地生效 → 再异步推云端」，弱网不卡操作。
 */

var request = require('../../utils/request');
var auth = require('../../utils/auth');
var dict = require('../../utils/dict');
var bank = require('../../utils/bank');
var constants = require('../../utils/constants');

var PAGE_SIZE = 30;
var BASE_KEY = 'base';        // 「内置疑改」这一档的 key

/** 掌握状态：无记录=新词；有错且未满熟练=薄弱；熟练度满=已掌握 */
function statusOf(m) {
  if (!m || (!m.w && !m.r)) return 'new';
  if (m.m >= 100) return 'learned';
  return m.w > 0 ? 'weak' : 'new';
}

/** 词条 → 列表行（带来源标签、归属库、掌握状态与稳定 key） */
function toRow(grade, item, banks) {
  var label = '内置';
  var cls = '';
  if (item._disabled) { label = '已停用'; cls = 'off'; }
  else if (item._user) {
    var bk = item._bankId && banks ? banks[item._bankId] : null;
    label = bk ? bk.name : '我的';
    cls = 'mine';
  } else if (item._edited) { label = '已修改'; cls = 'edit'; }
  return {
    k: bank.entryKey(item._bankId, grade, item.type, item.q),
    bankId: item._bankId || '',
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
    bankChips: [],        // [{key,label,off,count}] 第一个是「内置」
    curBank: BASE_KEY,
    curBankName: '内置 · 含我的改动',
    curBankIsCustom: false,
    types: [],
    curType: 'all',
    mFilter: 'all',       // all | weak | learned
    keyword: '',

    // 统计
    totalAll: 0,
    builtinCount: 0,
    mineCount: 0,
    weakCount: 0,
    learnedCount: 0,
    shown: [],
    hasMore: false,
    syncing: false,

    // 编辑弹层
    sheetShow: false,
    sheetMode: 'create',
    sheetBuiltin: false,
    sheetTypeOptions: [],
    fType: 'w1',
    fQ: '',
    fA: '',
    fHint: '',
    fD: '',
    fEx: '',
    sheetTitle: '',

    // 建库弹层
    bankSheetShow: false,
    bankSheetMode: 'create',   // create | rename
    bName: '',
    bGradeIndex: 0,

    // 门禁
    needLogin: false,
    gateText: ''
  },

  _all: [],       // 当前筛选范围内的全部行
  _page: 1,
  _mastery: {},   // questionId → {w,r,m}

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

  // ============ 同步与渲染 ============

  /** 拉云端（改动 + 自建库 + 掌握状态）→ 注入 dict → 渲染；失败退回本地缓存 */
  _syncAndRender: function () {
    var self = this;
    this.setData({ syncing: true });
    var p1 = request.get('/api/wordbank/entries').catch(function () { return null; });
    var p2 = request.get('/api/wordbank/banks').catch(function () { return null; });
    var p3 = request.get('/api/wordbank/mastery').catch(function () { return null; });

    Promise.all([p1, p2, p3]).then(function (res) {
      if (res[0]) dict.setOverrides(res[0].list || []);
      else dict.refreshOverrides();
      if (res[1]) dict.setBanks(res[1].list || []);
      if (res[2]) self._mastery = res[2] || {};
      self.setData({ syncing: false });
      self._render();
    });
  },

  /** 用当前数据重新组装列表（词库 + 题型 + 掌握 + 搜索 → 分页切片） */
  _render: function () {
    var d = this.data;
    var g = d.grades[d.gradeIndex].key;
    var raw = dict.loadBuiltin(g);
    var ov = dict.getOverrides();
    var banks = dict.getBanks();

    // 词库 chips：内置 + 本学段的自建库
    var chips = [{ key: BASE_KEY, label: '内置 · 含我的改动', off: false }];
    Object.keys(banks).forEach(function (id) {
      var b = banks[id];
      if (b.grade !== g) return;
      chips.push({ key: id, label: b.name, off: !b.enabled });
    });
    var curBank = d.curBank;
    // 切学段后选中的库可能不属于本学段 → 回到内置
    if (curBank !== BASE_KEY && !banks[curBank]) curBank = BASE_KEY;
    if (curBank !== BASE_KEY && banks[curBank] && banks[curBank].grade !== g) curBank = BASE_KEY;

    var rows = [];
    if (curBank === BASE_KEY) {
      // 内置档：内置 ⊕ 学段级改动（新增/改写/停用），停用的单独补出来供恢复
      var baseMerged = bank.applyOverrides(raw, g, ov, {});
      var disabled = [];
      raw.forEach(function (it) {
        var e = ov[bank.entryKey('', g, it.type, it.q)];
        if (e && e.action === 'disable') {
          disabled.push(Object.assign({}, it, { _disabled: true }));
        }
      });
      rows = baseMerged.concat(disabled);
    } else {
      // 自建库档：**只展示库内词条本身**（哪怕与内置同题也照常显示；
      // 出题时由 bank.applyOverrides 去重，不会在同一关出重复题）
      Object.keys(ov).forEach(function (k) {
        var e = ov[k];
        if (bank.scopeOf(e) !== curBank || e.action !== 'create') return;
        rows.push({
          type: e.type, q: e.q, a: e.a, hint: e.hint, ex: e.ex, d: e.d,
          _user: true, _bankId: curBank
        });
      });
    }

    var finalRows = rows.map(function (it) {
      var m = this._masteryOf(g, it);
      var row = toRow(g, it, banks);
      row.w = m.w;
      row.r = m.r;
      row.m = m.m;
      row.status = statusOf(m);
      return row;
    }, this);

    var mine = 0;
    finalRows.forEach(function (r) { if (r.srcCls === 'mine') mine += 1; });
    var weak = finalRows.filter(function (r) { return r.status === 'weak'; }).length;
    var learned = finalRows.filter(function (r) { return r.status === 'learned'; }).length;

    var bankName = curBank === BASE_KEY
      ? '内置 · 含我的改动'
      : ((banks[curBank] && banks[curBank].name) || '自建库');
    var isCustom = curBank !== BASE_KEY;

    this.setData({
      bankChips: chips,
      curBank: curBank,
      curBankName: bankName,
      curBankIsCustom: isCustom,
      totalAll: finalRows.length,
      builtinCount: raw.length,
      mineCount: mine,
      weakCount: weak,
      learnedCount: learned
    });
    this._rowsAll = finalRows;
    this._page = 1;
    this._applyFilter();
  },

  /** 取某词条的掌握状态（错题本的 questionId = type|q|a） */
  _masteryOf: function (grade, item) {
    var qid = (item.type || '') + '|' + (item.q || '') + '|' + (item.a || '');
    return this._mastery[qid] || { w: 0, r: 0, m: 0 };
  },

  /** 词库 + 题型 + 掌握 + 关键字 → 分页切片 */
  _applyFilter: function () {
    var d = this.data;
    var kw = String(d.keyword || '').trim().toLowerCase();
    var type = d.curType;
    var mf = d.mFilter;
    var bankKey = d.curBank;

    var list = (this._rowsAll || []).filter(function (r) {
      // 词库维度：内置档显示「不属于任何自建库」的条目；自建库档只显示该库的条目
      if (bankKey === BASE_KEY) {
        if (r.bankId) return false;
      } else if (r.bankId !== bankKey) {
        return false;
      }
      if (type && type !== 'all' && !constants.isItemInGroup(r, type)) return false;
      if (mf === 'weak' && r.status !== 'weak') return false;
      if (mf === 'learned' && r.status !== 'learned') return false;
      if (!kw) return true;
      return (r.q + ' ' + r.a + ' ' + r.hint).toLowerCase().indexOf(kw) >= 0;
    });
    var slice = list.slice(0, this._page * PAGE_SIZE);
    this.setData({ shown: slice, hasMore: list.length > slice.length });
  },

  // ============ 筛选交互 ============
  pickGrade: function (e) {
    var i = parseInt(e.currentTarget.dataset.index, 10) || 0;
    this.setData({ gradeIndex: i, gradeLabel: this.data.grades[i].label, curBank: BASE_KEY });
    this._render();
  },

  pickBank: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.curBank) return;
    this.setData({ curBank: key });
    this._render();
  },

  pickType: function (e) {
    this.setData({ curType: e.currentTarget.dataset.key });
    this._page = 1;
    this._applyFilter();
  },

  pickMFilter: function (e) {
    this.setData({ mFilter: e.currentTarget.dataset.key });
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

  // ============ 词条编辑 ============
  openCreate: function () {
    var t = this.data.curType;
    var code = (t && t !== 'all') ? this._defaultTypeOfGroup(t) : 'w1';
    this.setData({
      sheetShow: true,
      sheetMode: 'create',
      sheetBuiltin: false,
      sheetTitle: this.data.curBankIsCustom
        ? ('新增到「' + this.data.curBankName + '」') : '新增词条到本学段',
      fType: code, fQ: '', fA: '', fHint: '', fD: '', fEx: ''
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
    var row = this._rowOf(e.currentTarget.dataset.k);
    if (!row) return;
    this.setData({
      sheetShow: true,
      sheetMode: 'edit',
      sheetBuiltin: row.isBuiltin,
      sheetTitle: row.isBuiltin ? '编辑内置词条' : ('编辑「' + row.srcLabel + '」词条'),
      fType: row.type, fQ: row.q, fA: row.a, fHint: row.hint, fD: row.d, fEx: row.ex
    });
  },

  closeSheet: function () { this.setData({ sheetShow: false }); },
  noop: function () {},
  pickSheetType: function (e) { this.setData({ fType: e.currentTarget.dataset.code }); },

  onField: function (e) {
    var patch = {};
    patch[e.currentTarget.dataset.f] = e.detail.value;
    this.setData(patch);
  },

  /**
   * 保存词条。
   * 内置 → action=patch（只改释义/答案/干扰项/例句，题目不变指纹才稳定）；
   * 自建库 / 学段级新增 → action=create，并带上归属库。
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
    var bankId = (d.curBank !== BASE_KEY) ? d.curBank : '';
    var entry = bank.makeEntry(action, grade, d.fType, q, {
      a: a,
      hint: String(d.fHint || '').trim(),
      ex: String(d.fEx || '').trim(),
      d: String(d.fD || '').trim(),
      bankId: bankId
    });
    this._commitLocal(entry);
  },

  /** 停用内置条目（可恢复） */
  disableItem: function (e) {
    var row = this._rowOf(e.currentTarget.dataset.k);
    if (!row) return;
    var grade = this.data.grades[this.data.gradeIndex].key;
    this._commitLocal(bank.makeEntry('disable', grade, row.type, row.q));
  },

  restoreItem: function (e) {
    var row = this._rowOf(e.currentTarget.dataset.k);
    if (row) this._removeRemote(row, '已恢复');
  },

  deleteItem: function (e) {
    var row = this._rowOf(e.currentTarget.dataset.k);
    if (!row) return;
    var self = this;
    wx.showModal({
      title: row.isBuiltin ? '撤销改动' : '删除词条',
      content: row.isBuiltin ? '将恢复这条内置词条的原样' : '删除后不可恢复',
      confirmText: '确定',
      success: function (r) { if (r.confirm) self._removeRemote(row, '已删除'); }
    });
  },

  _rowOf: function (k) {
    for (var i = 0; i < (this._all || []).length; i++) {
      if (this._all[i].k === k) return this._all[i];
    }
    for (var j = 0; j < (this._rowsAll || []).length; j++) {
      if (this._rowsAll[j].k === k) return this._rowsAll[j];
    }
    return null;
  },

  /** 先本地生效再推云端 */
  _commitLocal: function (entry) {
    bank.upsertLocal(entry);
    dict.refreshOverrides();
    this.setData({ sheetShow: false });
    this._render();
    wx.showToast({ title: entry.action === 'disable' ? '已停用' : '已保存', icon: 'none' });
    request.post('/api/wordbank/entries', entry).catch(function () {
      wx.showToast({ title: '已保存到本机，联网后同步', icon: 'none' });
    });
  },

  _removeRemote: function (row, tip) {
    var grade = this.data.grades[this.data.gradeIndex].key;
    bank.removeLocal(grade, row.type, row.q, row.bankId);
    dict.refreshOverrides();
    this.setData({ sheetShow: false });
    this._render();
    wx.showToast({ title: tip, icon: 'none' });
    request.request({
      url: '/api/wordbank/entries',
      method: 'DELETE',
      data: { grade: grade, type: row.type, q: row.q, bankId: row.bankId || '' }
    }).catch(function () { /* 本地已生效 */ });
  },

  // ============ 自建库管理 ============
  openCreateBank: function () {
    this.setData({
      bankSheetShow: true,
      bankSheetMode: 'create',
      bName: '',
      bGradeIndex: this.data.gradeIndex
    });
  },

  openRenameBank: function () {
    if (!this.data.curBankIsCustom) return;
    this.setData({
      bankSheetShow: true,
      bankSheetMode: 'rename',
      bName: this.data.curBankName,
      bGradeIndex: this.data.gradeIndex
    });
  },

  closeBankSheet: function () { this.setData({ bankSheetShow: false }); },
  onBankName: function (e) { this.setData({ bName: e.detail.value }); },
  pickBankGrade: function (e) {
    this.setData({ bGradeIndex: parseInt(e.currentTarget.dataset.index, 10) || 0 });
  },

  saveBankSheet: function () {
    var d = this.data;
    var name = String(d.bName || '').trim();
    if (!name) { wx.showToast({ title: '请填题库名', icon: 'none' }); return; }
    var grade = d.grades[d.bGradeIndex].key;
    var isRename = d.bankSheetMode === 'rename';
    var bankId = isRename ? d.curBank : ('cb_' + Date.now().toString(36));

    var local = { bankId: bankId, name: name, grade: grade, enabled: true };
    bank.upsertBankLocal(local);
    dict.refreshOverrides();
    this.setData({ bankSheetShow: false, curBank: bankId, gradeIndex: d.bGradeIndex, gradeLabel: d.grades[d.bGradeIndex].label });
    this._render();
    wx.showToast({ title: isRename ? '已改名' : '已新建题库', icon: 'none' });

    request.post('/api/wordbank/banks', {
      bankId: isRename ? bankId : '', name: name, grade: grade, enabled: true
    }).then(function (r) {
      // 新建时用服务端返回的 bankId（本地那份是临时 id，替换掉避免重复）
      if (!isRename && r && r.bankId && r.bankId !== bankId) {
        bank.removeBankLocal(bankId);
        bank.upsertBankLocal({ bankId: r.bankId, name: name, grade: grade, enabled: true });
        dict.refreshOverrides();
      }
    }).catch(function () {
      wx.showToast({ title: '已建在本机，联网后同步', icon: 'none' });
    });
  },

  toggleBankEnabled: function () {
    var d = this.data;
    if (!d.curBankIsCustom) return;
    var banks = dict.getBanks();
    var b = banks[d.curBank];
    if (!b) return;
    var next = !b.enabled;
    bank.upsertBankLocal({ bankId: b.bankId, name: b.name, grade: b.grade, enabled: next });
    dict.refreshOverrides();
    this._render();
    wx.showToast({ title: next ? '已启用（参与出题）' : '已暂停（不参与出题）', icon: 'none' });
    request.post('/api/wordbank/banks', {
      bankId: b.bankId, name: b.name, grade: b.grade, enabled: next
    }).catch(function () {});
  },

  deleteBank: function () {
    var d = this.data;
    if (!d.curBankIsCustom) return;
    var bankId = d.curBank;
    var self = this;
    wx.showModal({
      title: '删除题库',
      content: '「' + d.curBankName + '」和它里面的词条都会删掉，不可恢复',
      confirmText: '删除',
      success: function (r) {
        if (!r.confirm) return;
        bank.removeBankLocal(bankId);
        dict.refreshOverrides();
        self.setData({ curBank: BASE_KEY });
        self._render();
        wx.showToast({ title: '已删除', icon: 'none' });
        request.request({
          url: '/api/wordbank/banks', method: 'DELETE', data: { bankId: bankId }
        }).catch(function () {});
      }
    });
  },

  onShareAppMessage: function () {
    return { title: '词力战士 - 我的题库，边玩边记', path: '/pages/index/index' };
  }
});
