const express = require('express');
const router = express.Router();
const usersData = require('../data/users.json');

// 获取用户信息
router.get('/profile', (req, res) => {
  try {
    const userId = req.query.userId || 1;
    const user = usersData.users.find(u => u.id === parseInt(userId));
    
    if (!user) {
      return res.status(404).json({
        code: -1,
        message: '用户不存在'
      });
    }
    
    res.json({
      code: 0,
      message: 'success',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 更新用户信息
router.put('/profile', (req, res) => {
  try {
    const { userId = 1, nickname, email, phone, education, jobPreference } = req.body;
    const userIndex = usersData.users.findIndex(u => u.id === parseInt(userId));
    
    if (userIndex === -1) {
      return res.status(404).json({
        code: -1,
        message: '用户不存在'
      });
    }
    
    // 更新用户信息
    if (nickname) usersData.users[userIndex].nickname = nickname;
    if (email) usersData.users[userIndex].email = email;
    if (phone) usersData.users[userIndex].phone = phone;
    if (education) usersData.users[userIndex].education = education;
    if (jobPreference) usersData.users[userIndex].jobPreference = jobPreference;
    
    res.json({
      code: 0,
      message: '更新成功',
      data: usersData.users[userIndex]
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取用户简历列表
router.get('/resumes', (req, res) => {
  try {
    const userId = req.query.userId || 1;
    const userResumes = usersData.resumes.filter(r => r.userId === parseInt(userId));
    
    res.json({
      code: 0,
      message: 'success',
      data: userResumes
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取简历详情
router.get('/resumes/:id', (req, res) => {
  try {
    const resumeId = parseInt(req.params.id);
    const resume = usersData.resumes.find(r => r.id === resumeId);
    
    if (!resume) {
      return res.status(404).json({
        code: -1,
        message: '简历不存在'
      });
    }
    
    res.json({
      code: 0,
      message: 'success',
      data: resume
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 创建/更新简历
router.post('/resumes', (req, res) => {
  try {
    const { 
      userId = 1, 
      name, 
      language = 'zh',
      education,
      experience,
      skills 
    } = req.body;
    
    const newResume = {
      id: usersData.resumes.length + 1,
      userId: parseInt(userId),
      name: name || '我的简历',
      language,
      education: education || [],
      experience: experience || [],
      skills: skills || [],
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    };
    
    usersData.resumes.push(newResume);
    
    res.json({
      code: 0,
      message: '简历创建成功',
      data: newResume
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 模拟登录
router.post('/login', (req, res) => {
  try {
    const { code } = req.body;
    
    // 模拟微信登录，返回测试用户
    const user = usersData.users[0];
    
    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token: 'mock_token_' + Date.now(),
        user
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取用户收藏
router.get('/favorites', (req, res) => {
  try {
    // 模拟收藏数据
    const favorites = {
      jobs: [1, 3, 5],
      experiences: [1, 2]
    };
    
    res.json({
      code: 0,
      message: 'success',
      data: favorites
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 添加收藏
router.post('/favorites', (req, res) => {
  try {
    const { type, id } = req.body;
    
    res.json({
      code: 0,
      message: '收藏成功'
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 取消收藏
router.delete('/favorites', (req, res) => {
  try {
    const { type, id } = req.body;
    
    res.json({
      code: 0,
      message: '已取消收藏'
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

module.exports = router;
