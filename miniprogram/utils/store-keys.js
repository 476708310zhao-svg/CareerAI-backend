// utils/store-keys.js — 全局 Storage Key 常量
// 所有 wx.getStorageSync / wx.setStorageSync 的 key 统一在此定义，避免拼写错误

module.exports = {
  // ── 用户信息 ──────────────────────────────────────────
  USER_PROFILE:          'userProfile',        // 个人资料 { nickName, avatarUrl, school, major }
  DEVICE_USER_ID:        'deviceUserId',       // 设备级匿名 ID

  // ── VIP ───────────────────────────────────────────────
  VIP_INFO:              'vipInfo',            // { isVip, planName, expireDate, purchaseDate }

  // ── 收藏 ──────────────────────────────────────────────
  USER_FAVORITES:        'userFavorites',      // { job:[], experience:[], company:[] }
  COLLECTED_QUESTIONS:   'collectedQuestions', // [questionId, ...]  题库收藏
  BOOKMARKED_QUESTIONS:  'bookmarkedQuestions',// [{ qid, question, answer, feedback, score }]

  // ── 题目做题记录 ────────────────────────────────────────
  DONE_QUESTIONS:        'doneQuestions',      // [questionId, ...]  已做标记

  // ── 简历 ──────────────────────────────────────────────
  ONLINE_RESUME:         'onlineResume',       // 在线简历对象
  RESUME_FILES:          'resumeFiles',        // 附件简历列表

  // ── 面试 ──────────────────────────────────────────────
  INTERVIEW_HISTORY:     'interviewHistory',   // 历次 AI 面试记录

  // ── 投递记录 ────────────────────────────────────────────
  LOCAL_APPLICATIONS:    'localApplications',  // 本地添加的投递记录

  // ── 消息 ──────────────────────────────────────────────
  USER_MESSAGES:         'userMessages',       // 通知消息列表
  UNREAD_MESSAGES:       'unreadMessages',     // 未读消息数（number）

  // ── 浏览 / 搜索历史 ────────────────────────────────────
  SEARCH_HISTORY:        'jobSearchHistory',   // 搜索关键词历史
  VIEW_HISTORY:          'viewHistory',        // 职位浏览历史
  JOB_BROWSE_HISTORY:    'jobBrowseHistory',   // 职位浏览详情历史

  // ── 缓存 ──────────────────────────────────────────────
  CACHED_JOBS_LIST:      'cachedJobsList',     // 职位列表缓存
  CACHED_RECOMMEND_JOBS: 'cachedRecommendJobs',// 首页推荐职位缓存
  LAST_AI_REPORT:        'lastAiReport',       // 最近一次 AI 报告

  // ── 当前传递数据（页面间跳转） ──────────────────────────
  CURRENT_QUESTION:      'currentQuestion',    // 跳转题目详情页前暂存的题目对象

  // ── 求职机构测评 ────────────────────────────────────────
  AGENCIES_CACHE:        'agenciesCache',      // 机构列表缓存（含筛选参数快照）
  AGENCY_DETAIL_PREFIX:  'agencyDetail_',      // 机构详情缓存前缀，拼接 id 使用
};
