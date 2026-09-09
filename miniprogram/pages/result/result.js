// 结算页逻辑（T16）
//
// 职责：
//   1. 接收游戏页参数，展示星级/得分/答对题数/正确率（REQ-GAME-15）
//   2. 生命耗尽展示失败态，不计星不写档（REQ-GAME-11）
//   3. 答完 10 题按正确率评定星级（REQ-GAME-12）
//   4. 通关时按「年级+关卡」写 ww_stars 取历史最大值（REQ-GAME-13）
//   5. 结算后调用 POST /api/score 上报成绩，无网静默降级（REQ-API-4）
//
// 关联需求：REQ-GAME-11、REQ-GAME-12、REQ-GAME-13、REQ-GAME-15、REQ-API-4

var constants = require('../../utils/constants');
var storage = require('../../utils/storage');
var request = require('../../utils/request');
var auth = require('../../utils/auth');

Page({
  data: {
    failed: false,          // 是否失败态（生命耗尽，REQ-GAME-11）
    titleText: '关卡完成!', // 结算标题
    stars: 0,               // 星级 0~3
    starArr: [false, false, false],  // 星级布尔数组（渲染用）
    score: 0,               // 得分
    correctCount: 0,        // 答对题数
    totalQ: 10,             // 总题数
    maxCombo: 0,            // 最高连击数（结算数据卡展示，REQ-GAME-15）
    ratePercent: 0,         // 正确率百分比
    grade: '',              // 学段 key
    level: 1                // 关卡序号
  },

  onLoad: function (options) {
    // 解析游戏页传入的参数：
    //   win: '1'=通关，'0'=生命耗尽失败
    //   score / correctCount / totalQ / grade / level
    var win = options.win === '1' || options.win === 1;
    var score = parseInt(options.score || 0, 10) || 0;
    var correctCount = parseInt(options.correctCount || 0, 10) || 0;
    var totalQ = parseInt(options.totalQ || 10, 10) || 10;
    var grade = options.grade || '';
    var level = parseInt(options.level || 1, 10) || 1;
    var maxCombo = parseInt(options.maxCombo || 0, 10) || 0;
    // 题型分类（题型分类关卡，2026-09-08：空串/'all' = 综合）
    this._type = options.type || '';

    // 计算正确率
    var rate = totalQ > 0 ? (correctCount / totalQ * 100) : 0;
    var ratePercent = Math.round(rate);

    // 失败态：生命耗尽（REQ-GAME-11）
    if (!win) {
      this.setData({
        failed: true,
        titleText: '再接再厉！',
        stars: 0,
        starArr: [false, false, false],
        score: score,
        correctCount: correctCount,
        totalQ: totalQ,
        maxCombo: maxCombo,
        ratePercent: ratePercent,
        grade: grade,
        level: level
      });
      // 失败不计星、不写存档，但仍上报成绩（REQ-GAME-11）
      this.reportScore(score, correctCount, totalQ, 0, maxCombo, grade, level);
      return;
    }

    // 通关：按正确率评定星级（REQ-GAME-12）
    //   >=90% 3 星、>=70% 2 星、>=40% 1 星、<40% 0 星
    var stars = constants.starsByRate(rate);
    var starArr = [stars >= 1, stars >= 2, stars >= 3];

    this.setData({
      failed: false,
      titleText: stars >= 3 ? '完美通关!' : (stars >= 1 ? '关卡完成!' : '通关成功!'),
      stars: stars,
      starArr: starArr,
      score: score,
      correctCount: correctCount,
      totalQ: totalQ,
      maxCombo: maxCombo,
      ratePercent: ratePercent,
      grade: grade,
      level: level
    });

    // 通关写星级存档（取历史最大值；分类关卡写 grade@type@level，综合沿用旧 key，REQ-GAME-13）
    if (grade && level >= 1) {
      var typeKey = (this._type && this._type !== 'all') ? this._type : undefined;
      storage.saveStars(grade, level, stars, typeKey);
    }

    // 上报成绩（REQ-API-4）
    this.reportScore(score, correctCount, totalQ, stars, maxCombo, grade, level);

    // B2 拍板：移除「任意闯关自动打卡」——打卡唯一入口=每日一题（见 pages/daily-question）
    // 通关仍同步段位/胜场/星（排行榜与头像解锁数据来源）
    this.rankSync(stars);
  },

  // 通关同步段位：RankRecord.wins+1、stars 累加（世界榜/我的排名/段位皮肤解锁依赖）
  rankSync: function (stars) {
    if (!auth.isLoggedIn()) return;
    request.post('/api/rank/sync', { stars: stars || 0 }).catch(function () {
      // 静默：网络失败下次通关自动补
    });
  },

  // 上报成绩到后端（REQ-API-4、REQ-NFR-2）
  //
  // 错误契约（utils/request.js v2）：
  //   - 上报成功 → resolve(data)：无需入队，随后 flush 补发历史滞留成绩；
  //   - 上报失败（网络/业务）→ reject(err)，err 携带 isNetwork/isBusiness/code/message，
  //     本局成绩本地入队等待补报；入队本身若失败（存储满等）打 warning 降级，
  //     不阻塞结算页主流程。
  reportScore: function (score, correctCount, totalQ, stars, maxCombo, grade, level) {
    var data = {
      grade: grade,
      level: level,
      score: score,
      correctCount: correctCount,
      totalQ: totalQ,
      stars: stars,
      maxCombo: maxCombo
    };


    request.post('/api/score', data).then(function () {
      // 上报成功：顺手 flush 历史滞留队列（同一上报通道补发）
      return storage.flushPendingScores(function (queued) {
        return request.post('/api/score', queued);
      });
    }).catch(function (err) {
      // 失败（无网/未接线/后端业务码）：本地入队，等待 App.onShow / 下次成功后补报
      var enqueued = storage.addPendingScore(data);
      if (!enqueued) {
        // 存储不可写（超 1MB/序列化失败）：尽力而为，打 warning，不抛错
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[result] 成绩入队失败（本地存储不可用），本局成绩将无法补报。', err && err.code);
        }
      }
    });
  },

  // 再玩一次：用 game 替换当前结算页，携带原学段+关卡参数避免页面栈增长
  playAgain: function () {
    var grade = this.data.grade;
    var level = this.data.level;
    var url = '/pages/game/game';
    if (grade) {
      url += '?grade=' + grade + '&level=' + level;
      if (this._type && this._type !== 'all') {
        url += '&type=' + this._type;
      }
    }
    wx.redirectTo({ url: url });
  },

  // 回首页：重启到首页，清空页面栈
  goHome: function () {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
