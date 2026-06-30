const DEFAULT_SHARE = {
  title: '职引 | 留学生求职与 AI 面试助手',
  imageUrl: '/images/banner1.jpg'
};

const ROUTE_SHARES = {
  'pages/index/index': {
    title: '职引 | 留学生 AI 求职助手'
  },
  'pages/jobs/jobs': {
    title: '高薪岗位与校招机会 | 职引'
  },
  'package-user/pages/job-detail/job-detail': {
    title: '职位详情 | 职引'
  },
  'package-user/pages/job-progress/job-progress': {
    title: '我的求职进度 | 职引'
  },
  'package-user/pages/favorites/favorites': {
    title: '我的收藏夹 | 职引'
  },
  'package-ai/pages/daily-brief/daily-brief': {
    title: '每日求职简报 | 职引'
  },
  'package-ai/pages/application-materials/application-materials': {
    title: '我的申请材料库 | 职引'
  },
  'package-ai/pages/interview-notebook/interview-notebook': {
    title: '面试错题本与每日练习 | 职引'
  }
};

module.exports = {
  DEFAULT_SHARE,
  ROUTE_SHARES
};
