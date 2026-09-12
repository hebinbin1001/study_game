/**
 * game/question.js —— 词力战士出题与干扰项生成
 *
 * 职责：
 *   1. genQuestion(item) → { blankIdx, correct, options }：按题型挖空并生成 4 选项；
 *   2. genDistractors(item, blankIdx, correct) → string[4]：生成 1 正确 + 3 干扰；
 *   3. ensureDistractors(item)：供导入词条缺省干扰项补齐复用；
 *   4. sourceWord(item)：取「挖空/渲染源词」，对带 * 预挖空词条（w2/c2）返回完整
 *      答案词 a，保证出题/题面/判定三者一致且绝不挖出 '*'；
 *   5. 维护 CN_CONFUSE_MAP 形近字表、英语形近对、易混词 conf 配对逻辑；
 *   6. 词级题型（fill/trans/xhy/zc）专属出题：题面为一个词/一句整句而非单字符
 *      挖空，正确项为「整词」，渲染由 renderer 词级分支完成（H2-B 方案）。
 *
 * 词级题型词库形态（见 docs/词库格式规范.md 与 data/*.json）：
 *   - fill：  q 为含 `__` 双下划线占位的英文整句，a 为填入空槽的整词
 *            （如 q:"I __ to school every day." a:"go"）；
 *   - trans： q 为中文词，a 为对应英文整词（看中文选英文）；
 *   - xhy：   q 为歇后语前半句，a 为后半句整词；
 *   - zc：    q 为单字引导（提示），a 为可与之组词的另一单字，hint 为完整组词
 *            q+a（数据约束见 data.test）；此形态下 q 长度恒为 1。
 *
 * 防剧透约定（H1/H2）：xhy 的 hint 往往等于 a、zc 的 hint 恒为 q+a（含答案），
 *   因此 renderer 作答前提示行须使用 safeHint(item) 而非 meaningText(item)，
 *   避免把待选整词/单字直接暴露（safeHint 对剧透 hint 替换为题型引导语）。
 *
 * 兼容性说明：旧测试用 zc 型传「二字词语」q（q.length=2）模拟随机挖格场景；
 *   真实 zc 数据 q 恒为单字。genQuestion 对 q 非单字的 zc 自动回退到旧的
 *   「汉字随机挖一格」逻辑，保证两者互不回归。
 *
 * 平移来源：prototype/index.html
 *   - newQuestion() 第 445-480 行（挖空规则）
 *   - genDistractors() 第 483-550 行（干扰项生成）
 *   - CN_CONFUSE_MAP 第 288-320 行（形近字表）
 *
 * 词库 * 语义（权威，见 utils/__tests__/data.test.js alignIssue）：
 *   w2/c2 的 q 为「带 * 挖空模板」，q.length === a.length，q 中 '*' 表示 a 对应
 *   位置被挖空、非 '*' 字符与 a 同位完全一致；a 永远是完整答案词。
 *   因此含 '*' 词条出题时须以 a 为挖空源词，不得把模板里的 '*' 占位符当作
 *   待挖字（P0 缺陷 2，REQ-GAME-4/5）。
 *
 * 关联需求：
 *   - REQ-GAME-4（挖空规则：英语挖元音/成语挖中间字/单字随机挖）
 *   - REQ-GAME-5（4 选项含 1 正确 + 3 干扰，不重复）
 *   - REQ-DICT-3（无 * 标注词条可默认挖空）
 *   - REQ-IMP-10（ensureDistractors 缺省干扰项补齐）
 */

// ============ 一、形近字映射表（汉字/成语干扰项，平移原型 288-320 行） ============
const CN_CONFUSE_MAP = {
  '大':['太','犬','天'],'小':['少','示','尔'],'上':['下','止','正'],'下':['上','卜','不'],
  '人':['入','八','大'],'口':['日','曰','中'],'手':['毛','丰','看'],'目':['自','月','且'],
  '一':['二','七','十'],'心':['必','忆','思'],'意':['音','思','忆'],'守':['宇','安','定'],
  '株':['珠','柱','林'],'待':['持','特','时'],'兔':['免','儿','鬼'],'亡':['忘','玄','交'],
  '羊':['半','美','群'],'补':['扑','卜','衬'],'牢':['宇','安','守'],'画':['函','划','图'],
  '蛇':['蚣','蛙','虫'],'添':['沾','泰','沾'],'足':['跑','促','捉'],'拔':['拨','泼','拨'],
  '苗':['田','草','茵'],'助':['功','动','办'],'长':['张','场','帐'],'刻':['刘','则','剌'],
  '舟':['船','航','盘'],'求':['球','救','水'],'剑':['箭','斩','剌'],'自':['目','白','向'],
  '相':['柏','想','箱'],'矛':['柔','务','矜'],'盾':['质','眈','眼'],'井':['共','开','并'],
  '底':['低','抵','下'],'之':['芝','乏','文'],'蛙':['洼','哇','娃'],'狐':['孤','弧','瓜'],
  '假':['暇','霞','叚'],'虎':['虏','虑','虚'],'威':['戒','咸','威'],'对':['树','村','时'],
  '牛':['特','牡','告'],'弹':['坦','旦','弹'],'琴':['瑟','琵琶','玨'],'盲':['育','妄','忘'],
  '摸':['模','莫','幕'],'象':['像','相','橡'],'杯':['怀','木','林'],'弓':['引','弘','弦'],
  '影':['景','形','彩'],'叶':['协','汁','叫'],'公':['共','翁','松'],'好':['妙','妞','如'],
  '龙':['尤','宠','垄'],'滥':['蓝','篮','槛'],'竽':['笋','竿','亏'],'充':['允','流','去'],
  '数':['敲','教','攴'],'买':['卖','实','头'],'椟':['读','续','犊'],'还':['这','进','边'],
  '珠':['蛛','株','朱'],'黔':['默','黑','点'],'驴':['户','马','骡'],'技':['枝','支','伎'],
  '穷':['究','空','穴'],'鹏':['朋','鸟','鸿'],'程':['逞','逞','里'],'万':['方','千','百'],
  '里':['重','野','量'],'闻':['问','间','门'],'鸡':['鸭','鸟','鹅'],'起':['超','赴','走'],
  '舞':['无','午','武'],'卧':['臣','卜','位'],'薪':['新','采','劳'],'尝':['赏','常','甘'],
  '胆':['但','旦','胖'],'破':['坡','波','披'],'釜':['金','父','鑫'],'沉':['沈','深','没'],
  '入':['人','八','乂'],'木':['本','禾','才'],'三':['二','一','四'],'分':['公','半','切'],
  '乐':['东','业','药'],'不':['下','卜','小'],'思':['恩','想','心'],'蜀':['虫','独','蠋'],
  '纸':['低','抵','氏'],'谈':['言','淡','话'],'兵':['乒','乓','丘'],'胸':['脑','背','腹'],
  '有':['右','又','布'],'成':['城','诚','戊'],'竹':['笋','竿','竺'],'水':['冰','永','氺'],
  '滴':['摘','商','嘀'],'石':['右','破','岩'],'穿':['穷','空','突'],'铁':['钱','针','锹'],
  '杵':['杆','桩','柱'],'针':['钉','钟','钊'],'愚':['遇','禺','禹'],'移':['稀','多','禾'],
  '山':['仙','岫','岩'],'精':['睛','情','清'],'卫':['伟','围','韦'],'填':['镇','真','慎'],
  '海':['每','悔','梅'],'夸':['亏','奇','亏'],'父':['交','爸','斧'],'追':['近','进','送'],
  '日':['曰','目','白'],'开':['并','形','门'],'天':['大','夫','夭'],'辟':['壁','避','臂'],
  '地':['池','她','也'],'而':['面','页','尔'],'马':['鸟','乌','闯'],'鸟':['乌','马','鸣']
};

// ============ 二、英语形近字母对（辅音题干扰项，平移原型 508 行） ============
// b↔d、p↔q、n↔m、f↔t、s↔z
const EN_CONFUSE_MAP = {
  b: 'd', d: 'b', p: 'q', q: 'p', n: 'm', m: 'n', f: 't', t: 'f', s: 'z', z: 's'
};

// 英语元音
const VOWELS = ['a', 'e', 'i', 'o', 'u'];

// 汉字兜底干扰池（原型 544 行）
const CN_FALLBACK = ['啊','的','了','是','在','有','和','人','这','中','为','不','我','你','他'];

// ============ 词级题型兜底池（H2-B：fill/trans/xhy/zc） ============
// 词级题「整词」干扰项优先取同段词库同类型词的 a（见 collectWordCandidates）；
// 词库不足或无 bank 时回退到以下内置池，保证永远能凑足 4 个不同选项。

// fill/trans 英语整词兜底池（常见中学词，避免答案外全部重复）
const EN_WORD_FALLBACK = [
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'can', 'could', 'should', 'go', 'goes', 'went', 'going',
  'like', 'likes', 'play', 'plays', 'make', 'makes', 'made',
  'take', 'takes', 'took', 'get', 'gets', 'got', 'see', 'sees', 'saw',
  'write', 'writes', 'wrote', 'read', 'reads', 'come', 'comes', 'came',
  'say', 'says', 'said', 'look', 'looks', 'looked'
];

// xhy 后半句兜底池（词库不足时用于凑选项）
const XHY_TAIL_FALLBACK = [
  '一场空', '有去无回', '人人喊打', '节节高', '七上八下', '各显神通',
  '一清二白', '里外不是人', '白费力气', '假慈悲', '摸不着头脑',
  '自卖自夸', '不服不行', '无处寻'
];

// zc 干扰字兜底池（单字）
const ZC_CHAR_FALLBACK = ['大', '小', '天', '地', '日', '月', '水', '火', '山', '人', '上', '下'];

// ============ 三、工具函数 ============
// 随机源：默认 Math.random；挑战关卡调用 setRandom(rng) 注入可复现随机源后，
// 同一关（同种子）每次进入挖的格子、选项顺序都一致 —— 重玩刷星公平、可分享复盘。
// 注意：只影响「出题」，不影响引擎的粒子/抖动等表现层随机（那些仍用 Math.random）。
let _rnd = Math.random;
function setRandom(fn) {
  _rnd = (typeof fn === 'function') ? fn : Math.random;
}
function getRandom() {
  return _rnd;
}
const rand = (n) => Math.floor(_rnd() * n);
const randInt = (a, b) => a + rand(b - a + 1);

// ============ 四、题型归类 ============
// 将词条 type 映射到三种挖空逻辑类别：'en' | 'cn' | 'idiom'
// 兼容原型 type(en/cn/idiom) 与 constants.js 8 类型码(w1/w2/c1/c2/xhy/zc/fill/trans)
function typeKind(item) {
  const t = item.type;
  // 原型三分类直接返回
  if (t === 'en') return 'en';
  if (t === 'idiom') return 'idiom';
  if (t === 'cn') return 'cn';
  // 新类型码映射
  if (t === 'w1' || t === 'w2' || t === 'fill' || t === 'trans') return 'en';
  if (t === 'c1' || t === 'c2') {
    // 4 字及以上视为成语（挖中间字更有教学意义），否则按词语/单字随机挖
    const w = item.w || item.q || '';
    return w.length >= 4 ? 'idiom' : 'cn';
  }
  if (t === 'xhy' || t === 'zc') return 'cn';
  // 未知类型默认按汉字处理
  return 'cn';
}

// 取词条的题目文本（兼容 w / q 两种字段命名）
// 注意：对 w2/c2，q 是「带 * 挖空模板」，并非完整词；如需完整词请用 sourceWord()
function getWord(item) {
  return item.w || item.q || '';
}

// ============ 词级题型判定与解析（H2-B） ============
// 词级题型 = 答案为「整词/整句」，而非题面中某个单字符。返回：
//   fill/trans/xhy 恒为词级；zc 仅当 q 为单字引导（真实词库形态）时为词级，
//   兼容旧测试用 zc 型传二字词语（q.length=2）时回退到旧「随机挖一格」。
function isWordLevel(item) {
  if (!item) return false;
  const t = item.type;
  if (t === 'fill' || t === 'trans' || t === 'xhy') return true;
  if (t === 'zc') return String(item.q || '').length === 1;
  return false;
}

// 词级题在题面中嵌入「整词空槽」：
//   fill：q 含 `__` 双下划线，head/tail 为 __ 前后的句子片段；
//   其它词级：head = 题干展示文本，tail = ''（槽位于题干之后）。
// @returns {Object} { head, tail, hasSlot }
function splitWordQuestion(item) {
  if (item.type === 'fill') {
    const q = String(item.q || '');
    const i = q.indexOf('__');
    if (i !== -1) {
      return { head: q.slice(0, i), tail: q.slice(i + 2), hasSlot: true };
    }
    // 数据异常无 __：整体作题干，槽置于末尾（防御）
    return { head: q, tail: '', hasSlot: false };
  }
  return { head: getWord(item), tail: '', hasSlot: true };
}

// 从同段词库（bank）收集同类型整词候选池，排除 exclude。
function collectWordCandidates(bank, type, exclude) {
  const set = new Set();
  if (bank && bank.length) {
    for (const it of bank) {
      if (it && it.type === type && typeof it.a === 'string' && it.a && it.a !== exclude) {
        set.add(it.a);
      }
    }
  }
  return Array.from(set);
}

// 从候选池随机抽 n 个；候选不足时用兜底池补齐（保证 4 选项可成）。
function pickWordDistractors(pool, n) {
  const out = [];
  const arr = pool.slice();
  while (out.length < n && arr.length) {
    const i = rand(arr.length);
    out.push(arr[i]);
    arr.splice(i, 1);
  }
  return out;
}

// 词级 4 选项：1 正确整词 + 3 干扰整词（互不重复、不含正确项）。
function buildWordOptions(item, bank) {
  const t = item.type;
  const correct = item.a || '';
  // 收集同段同类型 a + 兜底池
  let pool = collectWordCandidates(bank, t, correct);
  const fallback = t === 'xhy' ? XHY_TAIL_FALLBACK :
    (t === 'zc' ? ZC_CHAR_FALLBACK : EN_WORD_FALLBACK);
  for (const w of fallback) {
    if (w !== correct && pool.indexOf(w) === -1) pool.push(w);
  }
  // 随机抽 3 个；理论上池足够，仍做防御
  let distract = pickWordDistractors(pool, 3);
  if (distract.length < 3) {
    // 极端防御：字母/数字拼凑，保证 4 个不同选项
    const seen = new Set([correct].concat(distract));
    for (let k = 0; distract.length < 3 && k < 100; k++) {
      const c = String.fromCharCode(97 + rand(26));
      if (!seen.has(c)) { seen.add(c); distract.push(c); }
    }
  }
  return [correct].concat(distract).sort(() => _rnd() - 0.5);
}

// zc 专用：正确单字 + 词库干扰字 d（无 d/不足时从形近字表与兜底池补）。
function buildZcOptions(item, bank) {
  const correct = item.a || '';
  const q = String(item.q || '');
  const seen = new Set([correct]);
  const distract = [];
  // 词库自带 d（3 个干扰字）
  if (Array.isArray(item.d) && item.d.length) {
    for (const ch of item.d) {
      if (ch !== correct && ch !== q && !seen.has(ch)) {
        seen.add(ch);
        distract.push(ch);
      }
    }
  }
  // 形近字映射补充
  if (distract.length < 3 && CN_CONFUSE_MAP[correct]) {
    for (const ch of CN_CONFUSE_MAP[correct]) {
      if (ch !== correct && ch !== q && !seen.has(ch)) { seen.add(ch); distract.push(ch); }
    }
  }
  // 同段词库补字
  if (distract.length < 3 && bank && bank.length) {
    const pool = [];
    for (const it of bank) {
      const w = sourceWord(it);
      for (const ch of w) {
        if (ch !== correct && ch !== q && !seen.has(ch)) pool.push(ch);
      }
    }
    while (distract.length < 3 && pool.length) {
      const i = rand(pool.length);
      const ch = pool[i];
      pool.splice(i, 1);
      if (!seen.has(ch)) { seen.add(ch); distract.push(ch); }
    }
  }
  // 兜底池
  if (distract.length < 3) {
    for (const ch of ZC_CHAR_FALLBACK) {
      if (ch !== correct && ch !== q && !seen.has(ch)) { seen.add(ch); distract.push(ch); }
    }
  }
  // 极端防御
  for (let k = 0; distract.length < 3 && k < 200; k++) {
    const c = CN_FALLBACK[rand(CN_FALLBACK.length)];
    if (!seen.has(c)) { seen.add(c); distract.push(c); }
  }
  return [correct].concat(distract).sort(() => _rnd() - 0.5);
}

// 词级提示防剧透（H2）：hint 为完整答案词/含答案时，替换为不剧透引导语。
//   fill hint=整句中译（不含英文答案）→ 正常；trans hint=词性 → 正常；
//   xhy hint 常 == a（剧透）→ 引导语；zc hint=q+a（剧透）→ 引导语。
function safeHint(item) {
  const hint = meaningText(item);
  if (!hint) return hint;
  const a = item.a;
  if (a && hint === a) return null;          // 完全等于答案 → 调用方给引导语
  if (a && hint.indexOf(a) !== -1) return null; // 含答案 → 同样防剧透
  return hint;
}

// ============ 词级题型引导语候选池（H2 防剧透固化，#22） ============
// wordLevelGuide 防剧透机制：按序返回第一条「不含 item.a」的候选；该类型
// 全部候选都含 a 时回退到 GUIDE_FALLBACK 通用短句池；仍全含则做字符级剔除。
// 因此返回串保证不含答案 a（zc/xhy 的中文 a、fill/trans 的英文 a 同机制），
// 杜绝作答前提示行把待选答案字/整词直接暴露（如 zc q=写 a=字 的「选字组词」）。
// 各类型第 0 条恒为既有线上文案（旧断言与线上行为不回归），仅当它含 a 才顺延。
// 模板句式与用字尽量分散：把「字/词/选/组/挑/后/半/句/答/项」等常用字错开，
// 避免同一字同时出现在某类型全部候选（否则无法顺延到安全文案）。

// zc：q 为单字引导、a 为与之组词的单字；引导语需内嵌 q 让玩家知道题面字。
function zcGuidePool(q) {
  return [
    '给「' + q + '」选字组词',
    '「' + q + '」和哪个字能组成一个词',
    '帮「' + q + '」找一个组词伙伴',
    '「' + q + '」能拼成什么词语'
  ];
}

// xhy：q 为前半句、a 为后半句整词（中文），模板避免与后半句出现相同子串。
const XHY_GUIDE_POOL = [
  '选出歇后语后半句',
  '想想这句歇后语的下文是什么',
  '挑出对应的歇后语结尾',
  '这句话的下半句应该接什么'
];

// fill：q 为含 __ 的英文句、a 为英文整词；中文模板天然不含英文 a，走第 0 条。
const FILL_GUIDE_POOL = [
  '选择句子空缺的单词',
  '选出句中缺少的那个词',
  '挑一个词把句子补充完整'
];

// trans / 其它：看中文选英文；a 为英文整词，同样天然不命中中文模板。
const TRANS_GUIDE_POOL = [
  '选出对应单词',
  '挑出正确的英文翻译',
  '选出与之对应的英文单词'
];

// 终极兜底短句池：中性作答提示，字面避开可组词的单字（如字/词/选/组等）。
const GUIDE_FALLBACK = ['请作答', '请选择', '继续思考', '挑一下吧', '回忆一下'];

// 剔除 text 中出现的所有 a 子串（单字/多字答案通用），返回剔除后的串。
function stripGuide(text, a) {
  if (!a) return String(text);
  let t = String(text);
  let i;
  while ((i = t.indexOf(a)) !== -1) {
    t = t.slice(0, i) + t.slice(i + a.length);
  }
  return t;
}

// 词级题型引导语（提示行占位，防剧透）
function wordLevelGuide(item) {
  const t = item && item.type;
  const a = item && item.a !== undefined && item.a !== null ? String(item.a) : '';
  const q = String((item && item.q) || '');
  // ① 取该类型候选池（各类型第 0 条为既有文案）
  let pool;
  if (t === 'zc') pool = zcGuidePool(q);
  else if (t === 'xhy') pool = XHY_GUIDE_POOL;
  else if (t === 'fill') pool = FILL_GUIDE_POOL;
  else pool = TRANS_GUIDE_POOL; // trans 及其它类型
  // ② 无答案信息时无从剧透，直接取第 0 条
  if (!a) return pool[0];
  // ③ 按序返回第一条不含答案 a 的引导语
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].indexOf(a) === -1) return pool[i];
  }
  // ④ 该类型全部候选含 a → 用终极兜底短句池
  for (let i = 0; i < GUIDE_FALLBACK.length; i++) {
    if (GUIDE_FALLBACK[i].indexOf(a) === -1) return GUIDE_FALLBACK[i];
  }
  // ⑤ 兜底也全部含 a → 剔除 a 后返回第一条非空（极端防御）
  for (let i = 0; i < GUIDE_FALLBACK.length; i++) {
    const s = stripGuide(GUIDE_FALLBACK[i], a);
    if (s) return s;
  }
  // ⑥ 理论不可达：兜底短句被 a 剔空。任取一个不含 a 的汉字兜底。
  for (let c = 0x4e00; c <= 0x9fa5; c++) {
    const ch = String.fromCharCode(c);
    if (ch.indexOf(a) === -1) return ch;
  }
  return '\u3000';
}

// 词级「整词答案」展示文本：英语整词保留原文（renderer 槽内/回执用）
function wordAnswer(item) {
  if (!item) return '';
  return item.a || '';
}

/**
 * 词级「完整成果」展示文本（答对/答错回执时用，不剧透语义）：
 *   - zc：q + a 组成完整词（如 明 + 天 → 明天）；
 *   - 其余词级：英语转大写整词 / 中文原文。
 * @param {Object} item 词条
 * @returns {string} 用于回执展示的完整答案词
 */
function displayAnswer(item) {
  if (!item) return '';
  if (item.type === 'zc') return String(item.q || '') + String(item.a || '');
  const a = item.a || '';
  // fill（句子填空）保持原始大小写；其余英文整词首字母大写展示
  if (item.type === 'fill') return a;
  return typeKind(item) === 'en' ? titleCaseWord(a) : a;
}

/**
 * 词级题型答对/答错回执的完整文案（H2-B）。
 * 回执发生在作答完成后，允许揭示答案整词，与作答前防剧透（safeHint）不冲突。
 * @param {Object} item 词条
 * @returns {string} 例：zc → "明+天=明天"；xhy → "竹篮打水 → 一场空"；
 *                   trans → "苹果 = APPLE"；fill → "GO（我每天去学校）"
 */
function wordLevelFeedback(item) {
  if (!item) return '';
  const t = item.type;
  if (t === 'zc') {
    return String(item.q || '') + '+' + String(item.a || '') + '=' + displayAnswer(item);
  }
  if (t === 'xhy') {
    return String(item.q || '') + ' → ' + String(item.a || '');
  }
  if (t === 'trans') {
    return String(item.q || '') + ' = ' + displayAnswer(item);
  }
  // fill：答案整词 +（整句中文释义）
  const h = meaningText(item);
  return displayAnswer(item) + (h ? '（' + h + '）' : '');
}

/**
 * 取词条的「挖空/渲染源词」（即题面应展示的完整词）。
 *
 * 语义（对齐词库权威 * 语义，data.test.js alignIssue）：
 *   - 无 '*' 词条（w1/c1/fill/trans/zc/xhy 及原型 en/cn/idiom）：q 本身即完整
 *     展示词，直接返回 q（保持既有行为，不回归）；
 *   - 含 '*' 词条（w2/c2 带星挖空模板，权威语义 q.length === a.length 且 a 为
 *     完整答案词）：以完整答案 a 为挖空/渲染源，避免把模板占位符 '*' 当作可挖
 *     字或题面字符（P0 缺陷 2）。
 *
 * @param {Object} item 词条
 * @returns {string} 用于出题挖空、题面渲染与提示的完整词
 */
function sourceWord(item) {
  const q = getWord(item);
  if (q.indexOf('*') === -1) return q;
  // 带星模板：a 是完整答案词（w2/c2 权威语义）；a 缺失时退化返回 q 防崩溃
  return item.a || item.answer || q;
}

// ============ 五、挖空与出题 ============
/**
 * 生成一道题：计算挖空位置 + 正确答案 + 4 个选项。
 *
 * 挖空规则（REQ-GAME-4）：
 *   - 英语单词：优先挖元音（a/e/i/o/u），无元音则随机挖；
 *   - 成语：挖中间某字（避开首字），更有教学意义；
 *   - 单字/词语：随机挖一格；
 *   - 词级题型（fill/trans/xhy/zc）：整词挖空（H2-B），见 isWordLevel。
 *   - 无对应规则：随机挖。
 *
 * @param {Object} item 词条 { w|q, type, conf?, d? }
 * @param {Array} [bank] 同段词库（供词级干扰整词 / 汉字干扰补齐，可选）
 * @returns {Object} 词级题额外带 wordLevel/head/tail/safeHint 渲染提示字段
 */
function genQuestion(item, bank) {
  // H2-B：词级题型走整词分支（fill/trans/xhy 恒词级；zc 单字引导形态词级）
  if (isWordLevel(item)) {
    return genWordLevelQuestion(item, bank);
  }
  // 挖空/渲染源词：含 '*' 的 w2/c2 以完整答案 a 为源，杜绝挖到 '*' 占位符
  const w = sourceWord(item);
  let blankIdx, correct;
  const kind = typeKind(item);

  if (kind === 'idiom') {
    // 成语：挖 [1, len-1] 随机位（避开首字）
    blankIdx = randInt(1, w.length - 1);
    correct = w[blankIdx];
  } else if (kind === 'cn') {
    // 词语/单字：随机挖一格
    blankIdx = rand(w.length);
    correct = w[blankIdx];
  } else {
    // 英语：优先挖元音
    const vi = [];
    for (let i = 0; i < w.length; i++) {
      if (VOWELS.includes(w[i].toLowerCase())) vi.push(i);
    }
    blankIdx = vi.length ? vi[rand(vi.length)] : rand(w.length);
    correct = w[blankIdx];
  }

  const options = genDistractors(item, blankIdx, correct, bank);
  return { blankIdx, correct, options, wordLevel: false };
}

/**
 * 词级题型专属出题（H2-B）。
 *
 * 词级题没有「单字符挖空」概念：题面展示 head+整词空槽+tail，
 * 玩家从 4 个整词候选中选择，correct 为 item.a。
 *
 * @param {Object} item 词条
 * @param {Array} [bank] 同段词库（用于同类型整词干扰）
 * @returns {Object} 见下方字段注释
 */
function genWordLevelQuestion(item, bank) {
  const correct = item.a || '';
  const { head, tail, hasSlot } = splitWordQuestion(item);
  // 干扰项：zc 用字级干扰（d），其余词级用整词池
  let options;
  if (item.type === 'zc') {
    options = buildZcOptions(item, bank);
  } else {
    options = buildWordOptions(item, bank);
  }
  return {
    // —— 兼容旧结构三键 ——
    blankIdx: 0,          // 词级无字符级空位（renderer 走词级分支，不用此值）
    correct,
    options,
    // —— 词级渲染/回执字段 ——
    wordLevel: true,
    hasSlot,
    head,
    tail,
    answer: wordAnswer(item),   // 槽内待显示整词
    hintSafe: safeHint(item),   // 防剧透提示（null 时用 wordLevelGuide）
    guide: wordLevelGuide(item)
  };
}

// ============ 六、干扰项生成 ============
/**
 * 生成 4 个选项（1 正确 + 3 干扰），选项两两不同，正确答案恰好出现一次。
 *
 * 策略（平移原型 genDistractors，REQ-GAME-5）：
 *   - 英语元音题：从其余元音选；
 *   - 英语辅音题：优先用形近字母（EN_CONFUSE_MAP），再补同类型辅音；
 *   - 易混词：用 item.conf 配对词对应位置字母；
 *   - 汉字/成语：优先用 CN_CONFUSE_MAP 形近字，再从同年级词库补字；
 *   - 不足时兜底补齐至 4 选项。
 *
 * @param {Object} item 词条
 * @param {number} blankIdx 挖空位置
 * @param {string} correct 正确答案
 * @param {Array} [bank] 同年级词库（供汉字干扰项补齐，可选）
 * @returns {string[]} 4 个选项（已打乱）
 */
function genDistractors(item, blankIdx, correct, bank) {
  const set = new Set([correct]);
  const kind = typeKind(item);
  const isEnglish = kind === 'en';

  if (isEnglish) {
    const lower = correct.toLowerCase();
    const isVowel = VOWELS.includes(lower);

    // 易混词：用配对词对应位置的字母作为干扰之一
    if (item.conf && item.conf[blankIdx] && item.conf[blankIdx] !== correct) {
      set.add(item.conf[blankIdx]);
    }

    if (isVowel) {
      // 元音题：干扰从其他元音选
      const others = VOWELS.filter((v) => v !== lower && !set.has(v));
      while (set.size < 4 && others.length) {
        const i = rand(others.length);
        set.add(others[i]);
        others.splice(i, 1);
      }
    } else {
      // 辅音题：优先用形近字母
      if (EN_CONFUSE_MAP[lower] && !set.has(EN_CONFUSE_MAP[lower])) {
        set.add(EN_CONFUSE_MAP[lower]);
      }
      // 不够再补同类型辅音
      const consonants = 'bcdfghjklmnpqrstvwxyz'.split('').filter((c) => !set.has(c));
      while (set.size < 4 && consonants.length) {
        const i = rand(consonants.length);
        set.add(consonants[i]);
        consonants.splice(i, 1);
      }
    }
  } else {
    // 汉字/成语题：优先用形近字映射
    const confs = CN_CONFUSE_MAP[correct] || [];
    for (const c of confs) {
      if (set.size < 4 && !set.has(c)) set.add(c);
    }
    // 退化为同年级词库中其他汉字（跳过英语词）
    if (set.size < 4 && bank && bank.length) {
      const pool = [];
      bank.forEach((it) => {
        if (typeKind(it) === 'en') return;
        // 用完整词收集（sourceWord 对 w2/c2 取 a），避免把模板 '*' 收进候选
        const w = sourceWord(it);
        for (const ch of w) {
          if (ch !== correct && !set.has(ch)) pool.push(ch);
        }
      });
      while (set.size < 4 && pool.length) {
        const i = rand(pool.length);
        set.add(pool[i]);
        pool.splice(i, 1);
      }
    }
  }

  // 兜底：还不够 4 个
  if (set.size < 4) {
    if (isEnglish) {
      while (set.size < 4) set.add(String.fromCharCode(97 + rand(26)));
    } else {
      while (set.size < 4) set.add(CN_FALLBACK[rand(CN_FALLBACK.length)]);
    }
  }

  // 打乱后返回（Array.from + sort 随机）
  return Array.from(set).sort(() => _rnd() - 0.5);
}

// ============ 七、缺省干扰项补齐（REQ-IMP-10） ============
/**
 * 供导入词条缺省干扰项补齐：对 item 做一次挖空并返回 4 个选项。
 * 导入词条未带干扰项时调用此函数，保证可出题。
 *
 * @param {Object} item 词条
 * @returns {string[]} 4 个选项（1 正确 + 3 干扰）
 */
function ensureDistractors(item) {
  const { options } = genQuestion(item);
  return options;
}

// ============ 八、显示辅助（英文单词首字母大写展示，汉字原样） ============

/**
 * 英文单词友好展示：首字母大写、其余小写（Title Case）。
 * 用于题面 / 选项词 / 回执等「整词」展示——比全大写更易读，便于区分词形。
 * 注意：作答判定仍基于词库原始大小写，本函数只作用于展示层。
 * @param {string} raw 原始词
 * @returns {string} 空串原样；否则首字母大写、其余小写
 */
function titleCaseWord(raw) {
  const s = String(raw || '');
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * 显示字符：英语单字符转大写，汉字原样（用于选项字母按钮等单字符场景）。
 * @param {string} ch 字符
 * @param {Object} item 词条（用其 type 判断）
 * @returns {string} 显示用字符
 */
function displayChar(ch, item) {
  return typeKind(item) === 'en' ? ch.toUpperCase() : ch;
}

/**
 * 显示整词：英文单词首字母大写（Title Case），汉字原样。
 * 基于 sourceWord(item)（完整词），w2/c2 展示完整答案而非带 * 模板。
 * @param {Object} item 词条
 * @returns {string} 显示用整词
 */
function displayWord(item) {
  const w = sourceWord(item);
  return typeKind(item) === 'en' ? titleCaseWord(w) : w;
}

/**
 * 取词条的「释义/提示」文本，供题面下方提示行、答对/答错回执等处展示。
 *
 * 词库统一字段为 hint（如 w1 'ability' → hint '能力'；c2 '*心*意' →
 * hint '形容专心'，见 utils/dict.js WordItem 结构）。旧版原型曾用 zh 存释义，
 * 这里向后兼容：hint 缺失时回退 zh，再缺为空串。
 *
 * 注意：不得回退到 item.a —— a 是完整答案词（w1 整词 / w2/c2 完整成语），
 * 直接展示会把待填答案整词剧透（H1 缺陷）。
 *
 * @param {Object} item 词条
 * @returns {string} 释义/提示文本
 */
function meaningText(item) {
  if (!item) return '';
  return item.hint || item.zh || '';
}

module.exports = {
  // 出题
  genQuestion,
  genDistractors,
  ensureDistractors,
  // 随机源注入（挑战关卡固定题面用）
  setRandom,
  getRandom,
  // 词级题型（H2-B）
  isWordLevel,
  splitWordQuestion,
  genWordLevelQuestion,
  safeHint,
  wordLevelGuide,
  wordAnswer,
  // 题型归类与字段兼容
  typeKind,
  getWord,
  sourceWord,
  // 显示辅助
  displayChar,
  displayWord,
  displayAnswer,
  titleCaseWord,
  wordLevelFeedback,
  meaningText,
  // 形近字表（供外部扩展/测试）
  CN_CONFUSE_MAP,
  EN_CONFUSE_MAP
};
