/**
 * data/examples.js —— 词条例句（2026-10-28 起，分批补）
 *
 * 为什么单独一个文件，而不是写进 data/*.js 的每个词条里：
 *   1. 例句是**内容**，改动频率和词库结构完全不同。混在一起的话，以后补例句要改 14 个
 *      数据文件，diff 一片红，还没法一眼看出「这次补了哪些词」；
 *   2. 校对要能通读。单独一个文件就是一份清单，人可以直接从上往下看；
 *   3. 悬空好查。`tests/unit/examples.test.js` 逐个比对「例句的键必须在对应年级词库里
 *      真的存在」，词库删词/改词会立刻红，不会留一堆对不上的死数据。
 *
 * 格式约定（护栏会逐条校验，违反就红）：
 *   · 每个值是「英文例句 + 一个空格 + 中文翻译」，两句都要在；
 *   · 英文句必须**包含该词**（大小写不敏感，允许 -s/-es/-ed/-ing/-er 这类变形）；
 *   · 总长 ≤ 100 字符 —— 结算页错题卡是一行两行的小字，超了会挤成三行；
 *   · 难度贴年级：kg/g1 用 3~6 个词的主谓宾，不出现从句；g3 往上才允许
 *     because/when/after 这类连接词。
 *
 * 键 = 词库里的 `a`（答案，完整词形）。大小写与连字符按词库原样写，
 * 查找时做一次小写兜底（见 utils/dict.js）。
 *
 * 批次记录：
 *   · 第一批 2026-10-28：kg~g5，共 100 条；
 *   · 第二批 2026-11-06（D11）：g6~college，共 101 条 → 合计 201/300；
 *   · 剩余约 99 条留给第三批（可以先补 g6~g9 的常用词，再看质量）。
 */
module.exports = {
  // 幼儿园：3~5 个词，全部现在时，只认 s 结尾的第三人称单数
  kg: {
    cat: 'The cat is sleeping. 猫在睡觉。',
    dog: 'I like my dog. 我喜欢我的狗。',
    sun: 'The sun is hot. 太阳很热。',
    moon: 'The moon is in the sky. 月亮在天上。',
    star: 'I see a star. 我看见一颗星星。',
    book: 'This is my book. 这是我的书。',
    car: 'My car is red. 我的车是红色的。',
    hat: 'I have a new hat. 我有一顶新帽子。',
    pen: 'Give me a pen, please. 请给我一支笔。',
    ball: 'We play with a ball. 我们玩球。'
  },

  // 一年级：食物 + 家人 + 教室，仍然全是现在时
  g1: {
    apple: 'I eat an apple every day. 我每天吃一个苹果。',
    banana: 'The banana is yellow. 香蕉是黄色的。',
    orange: 'This orange is very sweet. 这个橘子很甜。',
    pear: 'My mother buys a pear. 我妈妈买了一个梨。',
    bread: 'I have bread for breakfast. 我早餐吃面包。',
    rice: 'We eat rice at lunch. 我们午饭吃米饭。',
    egg: 'There is an egg on the plate. 盘子里有一个鸡蛋。',
    milk: 'I drink milk in the morning. 我早上喝牛奶。',
    juice: 'Can I have some juice? 我可以喝点果汁吗？',
    cake: 'The birthday cake is big. 生日蛋糕很大。',
    family: 'This is my family photo. 这是我的全家福。',
    father: 'My father is a teacher. 我爸爸是老师。',
    mother: 'My mother likes flowers. 我妈妈喜欢花。',
    brother: 'My brother is six years old. 我弟弟六岁。',
    pencil: 'I need a pencil now. 我现在需要一支铅笔。',
    ruler: 'The ruler is on the desk. 尺子在桌子上。',
    desk: 'My book is on the desk. 我的书在桌上。',
    chair: 'Please sit on the chair. 请坐在椅子上。',
    classroom: 'Our classroom is clean. 我们的教室很干净。',
    friend: 'She is my best friend. 她是我最好的朋友。'
  },

  // 二年级：地点 + 季节 + 交通 + 家具
  g2: {
    house: 'My house has a red door. 我家有一扇红色的门。',
    room: 'My room is small but nice. 我的房间小但漂亮。',
    park: 'We play in the park. 我们在公园里玩。',
    shop: 'The shop is near my home. 商店在我家附近。',
    spring: 'Flowers open in spring. 春天花开了。',
    summer: 'Summer is very hot here. 这里的夏天很热。',
    winter: 'It snows in winter. 冬天会下雪。',
    morning: 'I run every morning. 我每天早上跑步。',
    night: 'Good night, Mum and Dad. 爸爸妈妈，晚安。',
    bike: 'I go to school by bike. 我骑自行车上学。',
    train: 'The train is very fast. 火车很快。',
    coat: 'Put on your coat outside. 出门穿上你的外套。',
    table: 'Dinner is on the table. 晚饭在桌上。',
    clock: 'The clock on the wall is new. 墙上的钟是新的。',
    photo: 'This photo is about my dog. 这张照片是我的狗。',
    computer: 'I use a computer to study. 我用电脑学习。',
    zoo: 'We saw a panda at the zoo. 我们在动物园看到了熊猫。',
    library: 'The library is very quiet. 图书馆很安静。'
  },

  // 三年级：副词 + 动物 + 食物，开始出现 after/before 这类时间短语
  g3: {
    different: 'The two bags are different. 这两个包不一样。',
    wonderful: 'We had a wonderful day. 我们度过了美好的一天。',
    interesting: 'This book is very interesting. 这本书很有趣。',
    together: 'We study together after school. 放学后我们一起学习。',
    often: 'I often read before bed. 我常在睡前看书。',
    quickly: 'He runs quickly to the bus. 他快速跑向公交车。',
    carefully: 'Please listen carefully in class. 上课请仔细听。',
    purple: 'She has a purple bag. 她有一个紫色的包。',
    squirrel: 'A squirrel is in the tree. 一只松鼠在树上。',
    turtle: 'The turtle walks very slowly. 乌龟走得很慢。',
    butterfly: 'A butterfly is on the flower. 一只蝴蝶在花上。',
    penguin: 'Penguins live in cold places. 企鹅住在寒冷的地方。',
    dolphin: 'The dolphin jumps out of the water. 海豚跳出水面。',
    watermelon: 'Watermelon is sweet in summer. 夏天的西瓜很甜。',
    strawberry: 'I like strawberry ice cream. 我喜欢草莓冰淇淋。',
    hamburger: 'He eats a hamburger for lunch. 他午饭吃汉堡。',
    sandwich: 'I made a sandwich for you. 我给你做了一个三明治。',
    balloon: 'The red balloon flew away. 红气球飞走了。',
    robot: 'My robot can walk and talk. 我的机器人会走会说。',
    picture: 'There is a picture on the wall. 墙上有一幅画。'
  },

  // 四年级：运动 + 天气 + 动物 + 学校生活
  g4: {
    basketball: 'We play basketball after class. 我们下课后打篮球。',
    umbrella: 'Take an umbrella with you. 带把伞出门。',
    weather: 'The weather is nice today. 今天天气很好。',
    sunny: 'It is sunny and warm today. 今天晴朗又暖和。',
    cloudy: 'The sky is cloudy this morning. 今天早上天很阴。',
    tiger: 'The tiger is the king of the forest. 老虎是森林之王。',
    giraffe: 'A giraffe has a very long neck. 长颈鹿有很长的脖子。',
    tomato: 'I put a tomato in the salad. 我在沙拉里放了个西红柿。',
    carrot: 'Rabbits like to eat carrots. 兔子喜欢吃胡萝卜。',
    breakfast: 'I have breakfast at seven. 我七点吃早饭。',
    homework: 'I finish my homework before dinner. 我在晚饭前写完作业。',
    playground: 'Children run on the playground. 孩子们在操场上跑。',
    restaurant: 'We had dinner in a restaurant. 我们在一家餐馆吃晚饭。',
    airport: 'My uncle works at the airport. 我叔叔在机场工作。',
    castle: 'The old castle stands on the hill. 古老的城堡立在山丘上。',
    letter: 'I wrote a letter to my friend. 我给朋友写了一封信。'
  },

  // 五年级：频率副词 + 场所 + 职业
  g5: {
    comfortable: 'This chair is very comfortable. 这把椅子很舒服。',
    probably: 'It will probably rain tomorrow. 明天可能会下雨。',
    finally: 'We finally finished the work. 我们终于完成了工作。',
    suddenly: 'Suddenly the light went out. 灯突然灭了。',
    immediately: 'Please come here immediately. 请马上过来。',
    holiday: 'We go to the beach on holiday. 假期我们去海边。',
    vacation: 'The summer vacation is long here. 这里的暑假很长。',
    season: 'Autumn is my favourite season. 秋天是我最喜欢的季节。',
    gym: 'We have PE class in the gym. 我们在体育馆上体育课。',
    canteen: 'We eat lunch in the canteen. 我们在食堂吃午饭。',
    lab: 'We do experiments in the lab. 我们在实验室做实验。',
    farmer: 'The farmer works hard in the field. 农民在田里辛勤劳作。',
    nurse: 'The nurse takes care of the patients. 护士照顾病人。',
    climb: 'We climb the hill on Sunday. 周日我们去爬山。',
    borrow: 'May I borrow your ruler? 我可以借你的尺子吗？',
    delicious: 'The soup is really delicious. 这汤真好喝。'
  },

  // ===== 第二批（2026-11-06，D11）：g6 → college，共 101 条 =====
  // 难度口径：g6~g8 用主谓宾 + 常见时间/地点状语；g9 起允许一个从句；
  // g10~college 才用抽象名词与学术动词（analyse / demonstrate / attribute…）。
  // 每个年级的键都来自该年级词库的 `a`，改词库时 tests/unit/examples.test.js 会立刻红。

  // 六年级：场所 + 环保 + 媒介
  g6: {
    museum: 'We visited a museum last Sunday. 上周日我们参观了博物馆。',
    bookstore: 'She buys books at the bookstore. 她在书店买书。',
    hospital: 'My aunt works in a hospital. 我姑姑在医院工作。',
    magazine: 'I read a magazine after dinner. 晚饭后我读了一本杂志。',
    newspaper: 'Dad reads the newspaper every morning. 爸爸每天早上看报纸。',
    postcard: 'I sent a postcard to my friend. 我给朋友寄了一张明信片。',
    recycle: 'We recycle paper and plastic at school. 我们在学校回收纸和塑料。',
    rubbish: 'Please put the rubbish in the bin. 请把垃圾放进垃圾桶。',
    energy: 'Saving energy is good for the earth. 节约能源对地球有好处。',
    plastic: 'This bottle is made of plastic. 这个瓶子是塑料做的。',
    dictionary: 'I look up new words in a dictionary. 我用词典查生词。',
    holiday: 'We had a great holiday by the sea. 我们在海边度过了一个愉快的假期。',
    improve: 'Reading every day can improve your English. 每天阅读能提高你的英语。'
  },

  // 七年级：抽象名词 + 学习态度
  g7: {
    ability: 'She has the ability to solve hard problems. 她有解决难题的能力。',
    achieve: 'You can achieve your goal with hard work. 努力就能实现目标。',
    ancient: 'We saw ancient buildings in the city. 我们在城里看到了古建筑。',
    attention: 'Please pay attention to the teacher. 请注意听老师讲。',
    attitude: 'A good attitude helps you learn faster. 好态度让你学得更快。',
    balance: 'It is hard to balance study and play. 学习和玩耍很难平衡。',
    breathe: 'Breathe slowly when you feel nervous. 紧张时慢慢呼吸。',
    calculate: 'I can calculate the answer in my head. 我能心算这个答案。',
    career: 'She wants a career in science. 她想从事科学方面的职业。',
    celebrate: 'We celebrate the Spring Festival together. 我们一起庆祝春节。',
    century: 'The old tree is over a century old. 这棵老树有一百多年了。',
    climate: 'The climate here is warm and wet. 这里气候温暖潮湿。'
  },

  // 八年级：交流 + 成长 + 环境
  g8: {
    communicate: 'We communicate with friends by WeChat. 我们用微信和朋友交流。',
    compare: 'Compare the two pictures and find differences. 比较两幅图并找出不同。',
    confident: 'Be confident when you speak English. 说英语时要自信。',
    consider: 'Please consider my advice carefully. 请认真考虑我的建议。',
    continue: 'Let us continue the game after lunch. 午饭后我们继续游戏。',
    create: 'They create a new app every year. 他们每年开发一个新应用。',
    develop: 'Reading helps develop your imagination. 阅读有助于发展想象力。',
    education: 'Education changes lives in many ways. 教育在很多方面改变生活。',
    environment: 'We must protect the environment. 我们必须保护环境。',
    encourage: 'Teachers encourage us to ask questions. 老师鼓励我们提问。',
    distance: 'The distance between the two cities is long. 两座城市之间的距离很长。',
    decision: 'It was a wise decision to save money. 存钱是个明智的决定。'
  },

  // 九年级：社会 + 文化
  g9: {
    experience: 'Travel gives you new experience. 旅行给你新的经验。',
    generation: 'Every generation has its own music. 每一代人都有自己的音乐。',
    government: 'The government built a new library. 政府建了一座新图书馆。',
    influence: 'Good friends have a great influence on you. 好朋友对你影响很大。',
    introduce: 'Let me introduce my new classmate. 让我介绍一下我的新同学。',
    knowledge: 'Knowledge is power in the modern world. 知识就是现代世界的力量。',
    literature: 'She loves Chinese literature very much. 她非常喜欢中国文学。',
    forest: 'We walked through the green forest. 我们穿过绿色的森林。',
    fashion: 'Short hair is in fashion this year. 今年短发很流行。',
    field: 'Farmers work hard in the field. 农民在田野里辛勤劳作。',
    foreign: 'She speaks two foreign languages well. 她两门外语说得很好。',
    gather: 'We gather in the hall every Monday. 我们每周一在大厅集合。'
  },

  // 高一：学术动词 + 抽象名词
  g10: {
    abandon: 'He decided to abandon the old plan. 他决定放弃旧计划。',
    accurate: 'The weather report is not always accurate. 天气预报并不总是准确。',
    acquire: 'Children acquire language very quickly. 孩子学语言非常快。',
    adjust: 'You can adjust the seat to fit you. 你可以调整座椅来适应自己。',
    admire: 'I admire her courage very much. 我非常钦佩她的勇气。',
    adopt: 'They adopt a dog from the shelter. 他们从收容所领养了一只狗。',
    advocate: 'Doctors advocate eating less sugar. 医生提倡少吃糖。',
    agenda: 'Our agenda has three main topics. 我们的议程有三个主要议题。',
    agriculture: 'Agriculture is important in this area. 农业在这个地区很重要。',
    alternative: 'We need an alternative way to go home. 我们需要另一个回家的办法。',
    ambition: 'Her ambition is to become a doctor. 她的雄心是成为一名医生。',
    analyse: 'Scientists analyse the data carefully. 科学家仔细分析数据。',
    anxiety: 'Exam anxiety affects many students. 考试焦虑影响许多学生。'
  },

  // 高二：论证 + 组织类词汇
  g11: {
    ambiguous: 'His answer was ambiguous and unclear. 他的回答含糊不清。',
    analogy: 'The teacher used an analogy to explain it. 老师用类比来解释。',
    ancestor: 'Our ancestors lived in this village. 我们的祖先住在这个村子。',
    anniversary: 'They celebrated their tenth anniversary. 他们庆祝了十周年纪念日。',
    anticipate: 'We anticipate a busy week ahead. 我们预计接下来会很忙。',
    architect: 'The architect designed a beautiful museum. 建筑师设计了一座漂亮的博物馆。',
    arbitrary: 'The rule seems arbitrary to us. 这条规则对我们来说很随意。',
    assemble: 'Workers assemble the machine in the factory. 工人在工厂组装机器。',
    assess: 'Teachers assess progress each term. 老师每学期评估进步。',
    asset: 'Good health is your best asset. 健康是你最好的财富。',
    assume: 'Do not assume that everyone agrees with you. 别假设每个人都同意你。',
    attempt: 'He made an attempt to climb the hill. 他尝试爬那座山。',
    audience: 'The audience clapped after the show. 演出结束后观众鼓掌。'
  },

  // 高三：议论与说明文常用词
  g12: {
    authentic: 'This is an authentic Chinese painting. 这是一幅真正的中国画。',
    authority: 'The local authority closed the old road. 地方政府关闭了那条旧路。',
    available: 'Tickets are available at the box office. 票在售票处有售。',
    crucial: 'Sleep is crucial for healthy growth. 睡眠对健康成长至关重要。',
    cultivate: 'Reading helps cultivate a calm mind. 阅读有助于培养平静的心。',
    curriculum: 'The school changed its curriculum this year. 学校今年改变了课程。',
    declare: 'The judge declared the result at noon. 法官中午宣布了结果。',
    decline: 'Sales decline sharply in winter. 冬天销量急剧下降。',
    deliver: 'They deliver fresh milk every morning. 他们每天早上送鲜奶。',
    demonstrate: 'The teacher demonstrated the experiment twice. 老师演示了两次实验。',
    desire: 'Her desire to travel is very strong. 她旅行的愿望非常强烈。',
    dignity: 'Everyone should be treated with dignity. 每个人都应被有尊严地对待。',
    discipline: 'Discipline makes study easier. 自律让学习更轻松。'
  },

  // 大学：学术高频词
  college: {
    abundance: 'The region has an abundance of fresh water. 该地区有丰富的淡水。',
    anonymous: 'The gift came from an anonymous person. 这份礼物来自一位匿名人士。',
    ascend: 'The climbers ascend the mountain at dawn. 登山者在黎明时登山。',
    assertion: 'His assertion was not supported by evidence. 他的断言没有证据支持。',
    assimilate: 'Immigrants often assimilate into a new culture. 移民常常融入新文化。',
    attribute: 'Scientists attribute the rise to human activity. 科学家把上升归因于人类活动。',
    autonomy: 'The region has a high degree of autonomy. 该地区享有高度自治。',
    benchmark: 'This test sets a benchmark for quality. 这项测试设定了质量标准。',
    bias: 'The report may show some bias. 这份报告可能带有一些偏见。',
    catalyst: 'The discovery acted as a catalyst for change. 这一发现成为变革的催化剂。',
    collaborate: 'Students collaborate on the research project. 学生们合作开展研究项目。',
    commodity: 'Water is a precious commodity here. 水在这里是珍贵的商品。',
    compensate: 'The company will compensate the customers. 公司会补偿顾客。'
  }
};
