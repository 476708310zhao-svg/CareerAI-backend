// utils/config.js
// API 密钥已迁移至服务器，客户端不再持有任何密钥

// 环境判断：模拟器用 127.0.0.1，开发/体验真机用电脑局域网地址，正式版走生产。
// 手机无法访问电脑的 127.0.0.1，本地真机联调时需要和电脑处在同一 Wi-Fi。
const { envVersion } = wx.getAccountInfoSync().miniProgram;
const IS_SIMULATOR = (typeof wx !== 'undefined' && wx.getSystemInfoSync().platform === 'devtools');
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3001';
const LAN_API_BASE_URL = 'http://192.168.110.47:3001';
const PROD_API_BASE_URL = 'https://api.zhiyincareer.com';

module.exports = {
  // 模拟器走本地后端；手机预览/体验版/正式版全部走线上
  API_BASE_URL: IS_SIMULATOR ? LOCAL_API_BASE_URL : PROD_API_BASE_URL,

  // LeetCode 题库（无需密钥，直接请求）
  LEETCODE_API_URL: 'https://leetcode.cn/graphql',

  // 微信订阅消息模板 ID（在微信公众平台 → 订阅消息 → 我的模板 中获取后填入）
  // 留空则跳过订阅请求，不影响投递主流程
  WX_TPL_APPLICATION: '',   // 申请状态更新模板 ID
  WX_TPL_INTERVIEW:   '',   // AI面试完成提醒模板 ID
  WX_TPL_SYSTEM:      ''    // 系统通知模板 ID
};
