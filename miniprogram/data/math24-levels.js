/**
 * data/math24-levels.js —— 算 24 点固定关卡库（60 关，自动生成，勿手改）
 *
 * 为什么固定而不是每次随机：固定关卡才能「同题复玩、比步数与星级」。
 * 生成与重新生成：node e2e/gen-math24-levels.js（穷举 1~13 全部四数组合并用精确求解器校验）
 * 关卡库校验：node miniprogram/utils/__tests__/math24-levels.test.js
 *
 * 难度分档：
 *   入门 —— 数字 1~9，整数中间结果即可解（心算友好）
 *   中级 —— 用到 10~13，整数中间结果可解
 *   高级 —— 必须借助分数中间结果（如 3 3 8 8）；1~13 里只有 16 组，故该档 16 关
 */

'use strict';

module.exports = {
  label: '算 24 点',
  total: 60,
  levels: [
    { no: 1, nums: [1, 2, 3, 3], tier: '入门' },
    { no: 2, nums: [2, 2, 2, 3], tier: '入门' },
    { no: 3, nums: [1, 3, 3, 3], tier: '入门' },
    { no: 4, nums: [2, 2, 3, 3], tier: '入门' },
    { no: 5, nums: [2, 3, 3, 3], tier: '入门' },
    { no: 6, nums: [3, 3, 3, 3], tier: '入门' },
    { no: 7, nums: [1, 1, 3, 4], tier: '入门' },
    { no: 8, nums: [1, 2, 2, 4], tier: '入门' },
    { no: 9, nums: [1, 1, 4, 4], tier: '入门' },
    { no: 10, nums: [1, 2, 3, 4], tier: '入门' },
    { no: 11, nums: [2, 2, 2, 4], tier: '入门' },
    { no: 12, nums: [1, 2, 4, 4], tier: '入门' },
    { no: 13, nums: [1, 3, 3, 4], tier: '入门' },
    { no: 14, nums: [2, 2, 3, 4], tier: '入门' },
    { no: 15, nums: [1, 3, 4, 4], tier: '入门' },
    { no: 16, nums: [2, 2, 4, 4], tier: '入门' },
    { no: 17, nums: [1, 4, 4, 4], tier: '入门' },
    { no: 18, nums: [2, 3, 4, 4], tier: '入门' },
    { no: 19, nums: [3, 3, 3, 4], tier: '入门' },
    { no: 20, nums: [2, 4, 4, 4], tier: '入门' },
    { no: 21, nums: [1, 1, 2, 10], tier: '中级' },
    { no: 22, nums: [1, 1, 3, 10], tier: '中级' },
    { no: 23, nums: [1, 2, 2, 10], tier: '中级' },
    { no: 24, nums: [1, 1, 4, 10], tier: '中级' },
    { no: 25, nums: [1, 2, 3, 10], tier: '中级' },
    { no: 26, nums: [2, 2, 2, 10], tier: '中级' },
    { no: 27, nums: [1, 2, 4, 10], tier: '中级' },
    { no: 28, nums: [1, 3, 3, 10], tier: '中级' },
    { no: 29, nums: [2, 2, 3, 10], tier: '中级' },
    { no: 30, nums: [1, 2, 5, 10], tier: '中级' },
    { no: 31, nums: [1, 3, 4, 10], tier: '中级' },
    { no: 32, nums: [2, 2, 4, 10], tier: '中级' },
    { no: 33, nums: [2, 3, 3, 10], tier: '中级' },
    { no: 34, nums: [1, 1, 7, 10], tier: '中级' },
    { no: 35, nums: [1, 2, 6, 10], tier: '中级' },
    { no: 36, nums: [1, 3, 5, 10], tier: '中级' },
    { no: 37, nums: [1, 4, 4, 10], tier: '中级' },
    { no: 38, nums: [2, 2, 5, 10], tier: '中级' },
    { no: 39, nums: [2, 3, 4, 10], tier: '中级' },
    { no: 40, nums: [3, 3, 3, 10], tier: '中级' },
    { no: 41, nums: [1, 2, 7, 10], tier: '中级' },
    { no: 42, nums: [1, 3, 6, 10], tier: '中级' },
    { no: 43, nums: [1, 4, 5, 10], tier: '中级' },
    { no: 44, nums: [2, 2, 6, 10], tier: '中级' },
    { no: 45, nums: [1, 5, 5, 5], tier: '高级' },
    { no: 46, nums: [1, 3, 4, 6], tier: '高级' },
    { no: 47, nums: [1, 4, 5, 6], tier: '高级' },
    { no: 48, nums: [3, 3, 7, 7], tier: '高级' },
    { no: 49, nums: [4, 4, 7, 7], tier: '高级' },
    { no: 50, nums: [1, 6, 6, 8], tier: '高级' },
    { no: 51, nums: [3, 3, 8, 8], tier: '高级' },
    { no: 52, nums: [2, 5, 5, 10], tier: '高级' },
    { no: 53, nums: [2, 4, 10, 10], tier: '高级' },
    { no: 54, nums: [2, 7, 7, 10], tier: '高级' },
    { no: 55, nums: [2, 2, 11, 11], tier: '高级' },
    { no: 56, nums: [5, 5, 7, 11], tier: '高级' },
    { no: 57, nums: [5, 7, 7, 11], tier: '高级' },
    { no: 58, nums: [2, 3, 5, 12], tier: '高级' },
    { no: 59, nums: [1, 8, 12, 12], tier: '高级' },
    { no: 60, nums: [2, 2, 13, 13], tier: '高级' },
  ]
};
