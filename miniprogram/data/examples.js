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
  }
};
