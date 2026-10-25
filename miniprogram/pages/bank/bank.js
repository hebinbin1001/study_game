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
var storage = require('../../utils/storage');

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
    // 排序键（2026-10-08）：词库在构建期就补好了 py（汉字=全拼、英文=小写本身），
    // 端上直接拿它排 —— 小程序里跑不了拼音库，运行时算不出来。
    // 自建词条是用户在端上新增的，没有 py → 退回用题面本身（会排到中文之前，可接受）。
    py: item.py || String(item.q || '').toLowerCase(),
    // 教材标签（2026-10-09）：让「我的 → 教材版本」的选择在题库里看得见
    book: item.book || '',
    bookLabel: bookNameOf(item.book),
    ipa: item.ipa || '',
    d: Array.isArray(item.d) ? item.d.join(',') : (item.d || ''),
    ex: item.ex || '',
    srcLabel: label,
    srcCls: cls,
    isBuiltin: !item._user,
    disabled: !!item._disabled
  };
}

/** 教材版本 key → 展示名（空串 = 通用，不显示标签） */
function bookNameOf(key) {
  var k = String(key || '');
  if (!k) return '';
  for (var i = 0; i < constants.BOOKS.length; i++) {
    if (constants.BOOKS[i].key === k) return constants.BOOKS[i].name;
  }
  return k;
}

Page({
  data: {
    viewMode: 'library',
    libraryCards: [],
    activeLibraryKey: 'book:all',
    activeLibraryLabel: '',
    // 筛选
    grades: [],
    gradeIndex: 0,
    gradeLabel: '',
    gradeKey: '',
    gradePickerVisible: false,
    bookFilter: 'all',    // 教材筛选：all / generic / pep / wys
    bookChips: [],        // [{key,label,n}]
    bookSelectable: true, // 当前年级能否选版本（初高中统一，不展示教材筛选）
    curBookName: '',      // 「我的」里选的教材版本（影响出题，这里只做提示）
    bankChips: [],        // [{key,label,off,count}] 第一个是「内置」
    curBank: BASE_KEY,
    curBankName: '内置 · 含我的改动',
    curBankIsCustom: false,
    types: [],
    curType: 'all',
    mFilter: 'all',       // all | weak | learned
    keyword: '',
    searchOpen: false,     // 搜索框是否展开（2026-10-25：收进顶栏 🔍，把首屏让给词条列表）
    filterShow: false,     // 筛选弹层（题型 + 排序）

    // 统计
    totalAll: 0,
    builtinCount: 0,
    mineCount: 0,
    weakCount: 0,
    learnedCount: 0,
    shown: [],
    hasMore: false,
    // 排序 / 翻页（2026-10-08）
    sortKey: 'py',        // 排序键（英文按字母、中文按拼音，构建期已补 py 字段）
    sortDesc: false,      // 是否倒序（2026-10-08：把「只有一个选项」的排序栏变成正/倒序切换）
    totalPages: 1,
    pageNum: 1,           // 当前页（与 js 的 _page 同步；WXML 只能读 data）
    filteredTotal: 0,     // 当前筛选条件下的条数（与 totalAll 不同：那是全部）
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

  _rowsForBank: function (g, bankKey, raw, ov) {
    var rows = [];
    if (bankKey === BASE_KEY) {
      var baseMerged = bank.applyOverrides(raw, g, ov, {});
      var disabled = [];
      raw.forEach(function (it) {
        var e = ov[bank.entryKey('', g, it.type, it.q)];
        if (e && e.action === 'disable') {
          disabled.push(Object.assign({}, it, { _disabled: true }));
        }
      });
      return baseMerged.concat(disabled);
    }
    Object.keys(ov).forEach(function (k) {
      var e = ov[k];
      if (bank.scopeOf(e) !== bankKey || e.action !== 'create') return;
      rows.push({
        type: e.type, q: e.q, a: e.a, hint: e.hint, ex: e.ex, d: e.d,
        _user: true, _bankId: bankKey
      });
    });
    return rows;
  },

  _decorateRows: function (g, rows, banks) {
    return (rows || []).map(function (it) {
      var m = this._masteryOf(g, it);
      var row = toRow(g, it, banks);
      row.w = m.w;
      row.r = m.r;
      row.m = m.m;
      row.status = statusOf(m);
      return row;
    }, this);
  },

  _summary: function (rows) {
    var list = rows || [];
    return {
      total: list.length,
      weak: list.filter(function (r) { return r.status === 'weak'; }).length,
      learned: list.filter(function (r) { return r.status === 'learned'; }).length,
      progress: list.length
        ? Math.round(list.filter(function (r) { return r.status === 'learned'; }).length / list.length * 100)
        : 0
    };
  },

  _buildLibraryCards: function (g, raw, ov, banks) {
    var baseRows = this._decorateRows(g, this._rowsForBank(g, BASE_KEY, raw, ov), banks);
    var cards = [];
    var all = this._summary(baseRows);
    cards.push(Object.assign({
      key: 'book:all', mode: 'book', bookFilter: 'all', bankKey: BASE_KEY,
      label: '全部词库', desc: '内置词汇 + 我的改动', emoji: '📚'
    }, all));

    if (constants.isBookSelectable(g)) {
      constants.BOOKS.forEach(function (b) {
        var key = b.key || '';
        var rows = baseRows.filter(function (r) { return String(r.book || '') === key; });
        if (!rows.length) return;
        // 没有独立教材词时，「通用词表」与「全部词库」是同一批词，不重复展示。
        if (!key && rows.length === baseRows.length) return;
        cards.push(Object.assign({
          key: 'book:' + (key || 'generic'),
          mode: 'book',
          bookFilter: key || 'generic',
          bankKey: BASE_KEY,
          label: b.name,
          desc: key ? '教材同步词库' : '无教材标签的通用词',
          emoji: '📘'
        }, this._summary(rows)));
      }, this);
    }

    Object.keys(banks).forEach(function (id) {
      var b = banks[id];
      if (b.grade !== g) return;
      var rows = this._decorateRows(g, this._rowsForBank(g, id, raw, ov), banks);
      cards.push(Object.assign({
        key: 'bank:' + id,
        mode: 'bank',
        bankKey: id,
        bookFilter: 'all',
        label: b.name,
        desc: b.enabled ? '我的自建题库' : '已暂停出题',
        emoji: '📒'
      }, this._summary(rows)));
    }, this);
    return cards;
  },

  // ============ 生命周期 ============
  onLoad: function () {
    var grades = constants.GRADES.map(function (g) { return { key: g.key, label: g.label }; });
    var types = constants.TYPE_GROUPS.map(function (t) { return { key: t.key, label: t.label }; });
    var sheetTypes = constants.TYPE_CODES.map(function (c) {
      return { code: c, name: constants.TYPES[c].name };
    });
    // 年级跟随全局设置（2026-10-18）：词库不再自己维护一份学段
    var saved = storage.getLastGrade();
    var gIdx = 0;
    for (var gi = 0; gi < grades.length; gi++) {
      if (grades[gi].key === saved) { gIdx = gi; break; }
    }
    this.setData({
      grades: grades,
      gradeIndex: gIdx,
      gradeKey: grades[gIdx].key,
      gradeLabel: grades[gIdx].label,
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

    var rows = this._rowsForBank(g, curBank, raw, ov);
    var finalRows = this._decorateRows(g, rows, banks);
    var libraryCards = this._buildLibraryCards(g, raw, ov, banks);

    var mine = 0;
    finalRows.forEach(function (r) { if (r.srcCls === 'mine') mine += 1; });
    var weak = finalRows.filter(function (r) { return r.status === 'weak'; }).length;
    var learned = finalRows.filter(function (r) { return r.status === 'learned'; }).length;

    // 教材版本分布（2026-10-09）：用户把「我的 → 教材版本」切成人教版后，
    // 以前在题库页完全看不出差别（这里原本只显示内置全量）。
    // 现在按教材标签分组统计，切换 chip 就能直接看到 人教版/外研版/通用 各有多少条。
    //
    // 2026-10-18：初高中不区分版本（中考/高考词汇统一），这时不展示教材筛选 ——
    // 否则会摆出「人教版 0 / 外研版 0」两枚空 chip，纯噪音，还让人以为同步失败。
    var bookSelectable = constants.isBookSelectable(g);
    var bookCount = { generic: 0 };
    finalRows.forEach(function (r) {
      var b = r.book || 'generic';
      bookCount[b] = (bookCount[b] || 0) + 1;
    });
    var bookChips = [{ key: 'all', label: '全部', n: finalRows.length }];
    if (bookSelectable) {
      constants.BOOKS.forEach(function (b) {
        var key = b.key || 'generic';
        bookChips.push({ key: key, label: b.name, n: bookCount[key] || 0 });
      });
    }
    var picked = (d.bookFilter || 'all');
    if (!bookSelectable) picked = 'all';
    // 切到别的学段后，原教材档位可能一条都没有 → 自动回到「全部」，别让用户对着空列表发呆
    var pickedCount = null;
    bookChips.forEach(function (c) { if (c.key === picked) pickedCount = c.n; });
    if (picked !== 'all' && !pickedCount) picked = 'all';

    var curBook = storage.getBook();
    var curBookName = !bookSelectable
      ? '初高中统一（不分版本）'
      : (curBook ? bookNameOf(curBook) : '通用词表');

    var bankName = curBank === BASE_KEY
      ? '内置 · 含我的改动'
      : ((banks[curBank] && banks[curBank].name) || '自建库');
    var isCustom = curBank !== BASE_KEY;
    var activeLibraryKey = curBank === BASE_KEY
      ? ('book:' + (picked === 'all' ? 'all' : picked))
      : ('bank:' + curBank);
    var activeCard = libraryCards.filter(function (c) { return c.key === activeLibraryKey; })[0];

    this.setData({
      libraryCards: libraryCards,
      activeLibraryKey: activeLibraryKey,
      activeLibraryLabel: activeCard ? activeCard.label : bankName,
      bookFilter: picked,
      bookChips: bookChips,
      bookSelectable: bookSelectable,
      curBookName: curBookName,
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
      // 教材维度（2026-10-09）：generic = 没有教材标签的通用词条；其余按 book 精确匹配
      var bf = d.bookFilter || 'all';
      if (bf !== 'all') {
        var want = bf === 'generic' ? '' : bf;
        if (String(r.book || '') !== want) return false;
      }
      if (type && type !== 'all' && !constants.isItemInGroup(r, type)) return false;
      if (mf === 'weak' && r.status !== 'weak') return false;
      if (mf === 'learned' && r.status !== 'learned') return false;
      if (!kw) return true;
      return (r.q + ' ' + r.a + ' ' + r.hint).toLowerCase().indexOf(kw) >= 0;
    });
    // 排序（2026-10-08 用户要求「按字母顺序和汉字拼音顺序排序」）：
    //   · py 是构建期补好的 —— 英文词条 = 小写本身（按字母），中文 = 全拼（按拼音）；
    //   · 取不到 py 的（用户新建、带符号的题面）排最后，别混在正常序里。
    var sortKey = d.sortKey || 'py';
    var desc = !!d.sortDesc;
    if (sortKey === 'py') {
      list.sort(function (a, b) {
        var pa = a.py || '\uffff';   // 没有键的排最后
        var pb = b.py || '\uffff';
        if (pa === pb) return 0;
        // 没有排序键的词条（用户新建、带符号的题面）无论正序倒序都沉底，
        // 免得倒序时它们跑到列表最前面抢视线。
        if (!a.py || !b.py) return pa < pb ? -1 : 1;
        var cmp = pa < pb ? -1 : 1;
        return desc ? -cmp : cmp;
      });
    }

    // 翻页（2026-10-08）：原来是「加载更多」追加，改成页码替换
    var page = Math.max(1, this._page || 1);
    var start = (page - 1) * PAGE_SIZE;
    var slice = list.slice(start, start + PAGE_SIZE);
    this.setData({
      shown: slice,
      hasMore: start + slice.length < list.length,
      filteredTotal: list.length,
      pageNum: page,     // 翻页控件要显示「第 N / M 页」；_page 是 js 属性，WXML 读不到
      totalPages: Math.max(1, Math.ceil(list.length / PAGE_SIZE))
    });
  },

  /** 切换排序方向（正序 / 倒序）。sortKey 保留，便于以后加「掌握度优先」这类排序 */
  pickSort: function (e) {
    var dir = parseInt(e.currentTarget.dataset.dir, 10) || 1;
    this.setData({ sortKey: 'py', sortDesc: dir < 0, filterShow: false });
    this._page = 1;
    this._applyFilter();
  },

  /**
   * 切换教材筛选（2026-10-09）。
   * 这是让「我的 → 教材版本」在题库页看得见的入口：选人教版就只剩 PEP 词条，
   * 选通用就只剩没有教材标签的原题库词条 —— 用户切换的到底是哪套词，一目了然。
   */
  pickBookFilter: function (e) {
    var key = e.currentTarget.dataset.key || 'all';
    this.setData({ bookFilter: key });
    this._page = 1;
    this._applyFilter();
  },

  /** 翻页：上一页 / 下一页 */
  goPage: function (e) {
    var dir = parseInt(e.currentTarget.dataset.dir, 10) || 0;
    var target = (this._page || 1) + dir;
    if (target < 1 || target > (this.data.totalPages || 1)) return;
    this._page = target;
    this._applyFilter();
  },

  // ============ 筛选交互 ============
  // 年级是全局设置（2026-10-18）：词库页只读展示 + 点开选择器
  openGradePicker: function () {
    this.setData({ gradePickerVisible: true });
  },
  onGradeClose: function () {
    this.setData({ gradePickerVisible: false });
  },
  onGradePick: function (e) {
    var key = (e && e.detail && e.detail.key) || '';
    if (!key) return;
    var grades = this.data.grades || [];
    var idx = 0;
    for (var i = 0; i < grades.length; i++) { if (grades[i].key === key) { idx = i; break; } }
    storage.setLastGrade(key);
    this.setData({
      gradeIndex: idx,
      gradeKey: key,
      gradeLabel: grades[idx].label,
      gradePickerVisible: false,
      curBank: BASE_KEY,
      bookFilter: 'all',
      viewMode: 'library'
    });
    this._render();
  },

  openLibrary: function (e) {
    var key = e.currentTarget.dataset.key || 'book:all';
    if (key.indexOf('bank:') === 0) {
      this.setData({
        curBank: key.slice(5),
        bookFilter: 'all',
        viewMode: 'detail'
      });
    } else {
      var book = key.slice(5);
      this.setData({
        curBank: BASE_KEY,
        bookFilter: book || 'all',
        viewMode: 'detail'
      });
    }
    this._render();
  },

  goLibraryShelf: function () {
    this.setData({ viewMode: 'library' });
  },

  pickBank: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.curBank) return;
    this.setData({ curBank: key });
    this._render();
  },

  /** 展开 / 收起搜索框（2026-10-25：搜索原来常驻占一行，现在收进顶栏 🔍） */
  toggleSearch: function () {
    this.setData({ searchOpen: !this.data.searchOpen });
  },

  /** 打开筛选弹层（题型 + 排序） */
  openFilter: function () {
    this.setData({ filterShow: true });
  },

  closeFilter: function () {
    this.setData({ filterShow: false });
  },

  pickType: function (e) {
    this.setData({ curType: e.currentTarget.dataset.key, filterShow: false });
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

  /** 兼容老 wxml 的「加载更多」入口（现在等价于下一页） */
  loadMore: function () {
    this.goPage({ currentTarget: { dataset: { dir: 1 } } });
  },

  goBack: function () {
    wx.navigateBack();
  },

  onHeaderBack: function () {
    if (this.data.viewMode === 'detail') {
      this.goLibraryShelf();
      return;
    }
    this.goBack();
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

  openItemMore: function (e) {
    var key = e.currentTarget.dataset.k;
    var row = this._rowOf(key);
    if (!row) return;
    var self = this;
    var actions = [{ label: '编辑', act: 'edit' }];
    if (row.disabled) {
      actions.push({ label: '恢复', act: 'restore' });
    } else if (row.isBuiltin) {
      actions.push({ label: '停用', act: 'disable' });
      actions.push({ label: '撤销改动', act: 'remove' });
    } else {
      actions.push({ label: '删除', act: 'remove' });
    }
    wx.showActionSheet({
      itemList: actions.map(function (x) { return x.label; }),
      success: function (res) {
        var act = actions[res.tapIndex];
        if (!act) return;
        var ev = { currentTarget: { dataset: { k: key } } };
        if (act.act === 'edit') self.openEdit(ev);
        else if (act.act === 'restore') self.restoreItem(ev);
        else if (act.act === 'disable') self.disableItem(ev);
        else self.deleteItem(ev);
      }
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
    this.setData({
      bankSheetShow: false,
      curBank: bankId,
      bookFilter: 'all',
      viewMode: 'detail',
      gradeIndex: d.bGradeIndex,
      gradeLabel: d.grades[d.bGradeIndex].label
    });
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
        self.setData({ curBank: BASE_KEY, bookFilter: 'all', viewMode: 'library' });
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
