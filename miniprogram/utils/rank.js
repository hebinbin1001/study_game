/**
 * 段位计算工具
 * 段位晋升逻辑：累计胜场达到阈值后晋升
 */

/**
 * 根据累计胜场计算当前段位
 * @param {number} wins 累计胜场
 * @param {Array} ranks 段位列表（按 rankId 升序）
 * @returns {object} 当前段位信息 { rankId, rankName }
 */
function rankByWins(wins, ranks) {
  if (!ranks || ranks.length === 0) {
    return { rankId: 1, rankName: "未定阶" };
  }

  // 从高到低遍历，找到第一个满足 minWins <= wins 的段位
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (wins >= ranks[i].minWins) {
      return {
        rankId: ranks[i].rankId,
        rankName: ranks[i].rankName,
      };
    }
  }

  // 默认返回最低段位
  return {
    rankId: ranks[0].rankId,
    rankName: ranks[0].rankName,
  };
}

/**
 * 计算段位晋升进度
 * @param {number} currentRankId 当前段位 ID
 * @param {number} currentWins 当前累计胜场
 * @param {Array} ranks 段位列表
 * @returns {object} 晋升进度信息
 */
function nextRankProgress(currentRankId, currentWins, ranks) {
  if (!ranks || ranks.length === 0) {
    return {
      currentRank: { rankId: 1, rankName: "未定阶" },
      nextRank: null,
      currentWins,
      winsNeeded: 0,
      progressPercent: 100,
      isMaxRank: true,
    };
  }

  const currentRank = ranks.find((r) => r.rankId === currentRankId) || ranks[0];
  const nextRank = ranks.find((r) => r.rankId === currentRankId + 1);

  if (!nextRank) {
    // 已达最高段位
    return {
      currentRank: { rankId: currentRank.rankId, rankName: currentRank.rankName },
      nextRank: null,
      currentWins,
      winsNeeded: 0,
      progressPercent: 100,
      isMaxRank: true,
    };
  }

  const winsNeeded = nextRank.minWins - currentRank.minWins;
  const progressFromCurrent = currentWins - currentRank.minWins;
  const progressPercent =
    winsNeeded > 0 ? Math.min(100, Math.round((progressFromCurrent / winsNeeded) * 100)) : 100;

  return {
    currentRank: { rankId: currentRank.rankId, rankName: currentRank.rankName },
    nextRank: { rankId: nextRank.rankId, rankName: nextRank.rankName },
    currentWins,
    winsNeeded,
    progressPercent,
    isMaxRank: false,
  };
}

module.exports = {
  rankByWins,
  nextRankProgress,
};