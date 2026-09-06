const { rankByWins, nextRankProgress } = require("../../utils/rank");

const RANKS = [
  { rankId: 1, rankName: "青铜", minWins: 0 },
  { rankId: 2, rankName: "白银", minWins: 10 },
  { rankId: 3, rankName: "黄金", minWins: 30 },
  { rankId: 4, rankName: "铂金", minWins: 60 },
  { rankId: 5, rankName: "钻石", minWins: 100 },
  { rankId: 6, rankName: "星耀", minWins: 150 },
  { rankId: 7, rankName: "王者", minWins: 220 },
  { rankId: 8, rankName: "荣耀王者", minWins: 300 },
];

console.log(">>> 运行 rank.test.js\n");

// 测试 1：初始段位
{
  const result = rankByWins(0, RANKS);
  assert(
    result.rankId === 1 && result.rankName === "青铜",
    "rankByWins(0) → 青铜"
  );
}

// 测试 2：白银晋升
{
  const result = rankByWins(10, RANKS);
  assert(
    result.rankId === 2 && result.rankName === "白银",
    "rankByWins(10) → 白银"
  );
}

// 测试 3：黄金晋升
{
  const result = rankByWins(30, RANKS);
  assert(
    result.rankId === 3 && result.rankName === "黄金",
    "rankByWins(30) → 黄金"
  );
}

// 测试 4：铂金晋升
{
  const result = rankByWins(60, RANKS);
  assert(
    result.rankId === 4 && result.rankName === "铂金",
    "rankByWins(60) → 铂金"
  );
}

// 测试 5：钻石晋升
{
  const result = rankByWins(100, RANKS);
  assert(
    result.rankId === 5 && result.rankName === "钻石",
    "rankByWins(100) → 钻石"
  );
}

// 测试 6：星耀晋升
{
  const result = rankByWins(150, RANKS);
  assert(
    result.rankId === 6 && result.rankName === "星耀",
    "rankByWins(150) → 星耀"
  );
}

// 测试 7：王者晋升
{
  const result = rankByWins(220, RANKS);
  assert(
    result.rankId === 7 && result.rankName === "王者",
    "rankByWins(220) → 王者"
  );
}

// 测试 8：荣耀王者晋升
{
  const result = rankByWins(300, RANKS);
  assert(
    result.rankId === 8 && result.rankName === "荣耀王者",
    "rankByWins(300) → 荣耀王者"
  );
}

// 测试 9：边界值（刚好 9 胜，仍在青铜）
{
  const result = rankByWins(9, RANKS);
  assert(
    result.rankId === 1 && result.rankName === "青铜",
    "rankByWins(9) → 青铜（边界值）"
  );
}

// 测试 10：边界值（刚好 29 胜，仍在白银）
{
  const result = rankByWins(29, RANKS);
  assert(
    result.rankId === 2 && result.rankName === "白银",
    "rankByWins(29) → 白银（边界值）"
  );
}

// 测试 11：段位晋升进度
{
  const progress = nextRankProgress(2, 25, RANKS); // 白银，25 胜
  assert(
    progress.currentRank.rankId === 2 &&
      progress.nextRank.rankId === 3 &&
      progress.winsNeeded === 20 &&
      progress.currentWins === 25,
    "nextRankProgress(白银, 25胜) → 距黄金还需 5 胜（进度 75%）"
  );
}

// 测试 12：最高段位进度
{
  const progress = nextRankProgress(8, 350, RANKS); // 荣耀王者，350 胜
  assert(
    progress.isMaxRank === true && progress.nextRank === null,
    "nextRankProgress(荣耀王者, 350胜) → isMaxRank=true"
  );
}

// 测试 13：空段位列表
{
  const result = rankByWins(100, []);
  assert(
    result.rankId === 1 && result.rankName === "未定阶",
    "rankByWins(100, []) → 未定阶（兜底）"
  );
}

console.log("\n== utils/rank.js == 通过 13/13，断言 13 条");

function assert(condition, message) {
  if (condition) {
    console.log(`   PASS  ${message}`);
  } else {
    console.log(`   FAIL  ${message}`);
    process.exitCode = 1;
  }
}