const express = require('express');
const router = express.Router();
const usersData = require('../data/users.json');
const jobsData = require('../data/jobs.json');

// 获取用户的申请列表
router.get('/', (req, res) => {
  try {
    const { userId = 1, status } = req.query;
    
    let applications = [...usersData.applications];
    
    // 状态筛选
    if (status) {
      applications = applications.filter(app => app.status === status);
    }
    
    // 关联职位信息
    const applicationsWithJob = applications.map(app => {
      const job = jobsData.jobs.find(j => j.id === app.jobId);
      return {
        ...app,
        job: job || null
      };
    });
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: applicationsWithJob,
        total: applicationsWithJob.length,
        statistics: {
          total: applications.length,
          applied: applications.filter(a => a.status === 'applied').length,
          viewed: applications.filter(a => a.status === 'viewed').length,
          interview: applications.filter(a => a.status === 'interview').length,
          offer: applications.filter(a => a.status === 'offer').length,
          rejected: applications.filter(a => a.status === 'rejected').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取申请详情
router.get('/:id', (req, res) => {
  try {
    const appId = parseInt(req.params.id);
    const application = usersData.applications.find(a => a.id === appId);
    
    if (!application) {
      return res.status(404).json({
        code: -1,
        message: '申请记录不存在'
      });
    }
    
    const job = jobsData.jobs.find(j => j.id === application.jobId);
    const resume = usersData.resumes.find(r => r.id === application.resumeId);
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        ...application,
        job,
        resume
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 创建新申请（投递简历）
router.post('/', (req, res) => {
  try {
    const { jobId, resumeId = 1, userId = 1 } = req.body;
    
    // 检查是否已经申请过
    const existingApp = usersData.applications.find(
      a => a.jobId === jobId && a.userId === userId
    );
    
    if (existingApp) {
      return res.status(400).json({
        code: -1,
        message: '您已经投递过该职位'
      });
    }
    
    // 创建新申请
    const newApplication = {
      id: usersData.applications.length + 1,
      userId,
      jobId,
      resumeId,
      status: 'applied',
      statusText: '已投递',
      appliedAt: new Date().toISOString().split('T')[0],
      viewedAt: null
    };
    
    // 模拟添加到数据库
    usersData.applications.push(newApplication);
    
    res.json({
      code: 0,
      message: '投递成功',
      data: newApplication
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 撤回申请
router.delete('/:id', (req, res) => {
  try {
    const appId = parseInt(req.params.id);
    const appIndex = usersData.applications.findIndex(a => a.id === appId);
    
    if (appIndex === -1) {
      return res.status(404).json({
        code: -1,
        message: '申请记录不存在'
      });
    }
    
    const application = usersData.applications[appIndex];
    
    // 只能撤回未被查看的申请
    if (application.status !== 'applied') {
      return res.status(400).json({
        code: -1,
        message: '该申请已被查看，无法撤回'
      });
    }
    
    // 模拟从数据库删除
    usersData.applications.splice(appIndex, 1);
    
    res.json({
      code: 0,
      message: '撤回成功'
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

module.exports = router;
