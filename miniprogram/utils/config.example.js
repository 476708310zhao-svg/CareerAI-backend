// utils/config.example.js - 配置模板（可提交到仓库）
// 使用方法：复制此文件为 config.js，填入真实 Key

module.exports = {
  // RapidAPI (JSearch 职位搜索) — 前往 https://rapidapi.com 申请
  RAPID_API_KEY: 'YOUR_RAPID_API_KEY_HERE',
  RAPID_API_URL: 'https://jsearch.p.rapidapi.com',

  // DeepSeek AI — 前往 https://platform.deepseek.com 申请
  DEEPSEEK_API_KEY: 'YOUR_DEEPSEEK_API_KEY_HERE',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',

  // LeetCode (题库接口，无需 API Key)
  LEETCODE_API_URL: 'https://leetcode.cn/graphql'
};
