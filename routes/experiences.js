const express = require('express');
const router = express.Router();
const experiencesData = require('../data/experiences.json');

// 获取笔经面经列表
router.get('/', (req, res) => {
  try {
    const { 
      keyword, 
      company, 
      type,
      page = 1, 
      pageSize = 10 
    } = req.query;
    
    let filteredExperiences = [...experiencesData.experiences];
    
    // 关键词搜索
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      filteredExperiences = filteredExperiences.filter(exp => 
        exp.title.toLowerCase().includes(lowerKeyword) ||
        exp.company.toLowerCase().includes(lowerKeyword) ||
        exp.position.toLowerCase().includes(lowerKeyword) ||
        exp.content.toLowerCase().includes(lowerKeyword)
      );
    }
    
    // 公司筛选
    if (company) {
      filteredExperiences = filteredExperiences.filter(exp => exp.company === company);
    }
    
    // 类型筛选（笔试/面试）
    if (type) {
      filteredExperiences = filteredExperiences.filter(exp => exp.type === type);
    }
    
    // 按时间排序（最新的在前）
    filteredExperiences.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + parseInt(pageSize);
    const paginatedExperiences = filteredExperiences.slice(startIndex, endIndex);
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: paginatedExperiences,
        total: filteredExperiences.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(filteredExperiences.length / pageSize)
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取笔经面经详情
router.get('/:id', (req, res) => {
  try {
    const expId = parseInt(req.params.id);
    const experience = experiencesData.experiences.find(e => e.id === expId);
    
    if (!experience) {
      return res.status(404).json({
        code: -1,
        message: '内容不存在'
      });
    }
    
    res.json({
      code: 0,
      message: 'success',
      data: experience
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取热门笔经面经
router.get('/hot/list', (req, res) => {
  try {
    // 按点赞数排序
    const hotExperiences = [...experiencesData.experiences]
      .sort((a, b) => b.likesCount - a.likesCount)
      .slice(0, 5);
    
    res.json({
      code: 0,
      message: 'success',
      data: hotExperiences
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 发布笔经面经
router.post('/', (req, res) => {
  try {
    const { 
      company, 
      position, 
      type, 
      round, 
      title, 
      content, 
      tags,
      isAnonymous = false,
      userId = 1 
    } = req.body;
    
    // 验证必填字段
    if (!company || !position || !type || !title || !content) {
      return res.status(400).json({
        code: -1,
        message: '请填写完整信息'
      });
    }
    
    const newExperience = {
      id: experiencesData.experiences.length + 1,
      userId,
      userName: isAnonymous ? '匿名用户' : '留学生小明',
      userAvatar: isAnonymous 
        ? 'https://img.icons8.com/color/96/anonymous-mask.png'
        : 'https://img.icons8.com/color/96/user-male-circle.png',
      company,
      position,
      type,
      round: round || '',
      title,
      content,
      tags: tags || [],
      likesCount: 0,
      commentsCount: 0,
      createdAt: new Date().toISOString().split('T')[0],
      isAnonymous
    };
    
    // 模拟添加到数据库
    experiencesData.experiences.unshift(newExperience);
    
    res.json({
      code: 0,
      message: '发布成功',
      data: newExperience
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 点赞
router.post('/:id/like', (req, res) => {
  try {
    const expId = parseInt(req.params.id);
    const experience = experiencesData.experiences.find(e => e.id === expId);
    
    if (!experience) {
      return res.status(404).json({
        code: -1,
        message: '内容不存在'
      });
    }
    
    experience.likesCount += 1;
    
    res.json({
      code: 0,
      message: '点赞成功',
      data: {
        likesCount: experience.likesCount
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取公司列表（用于筛选）
router.get('/companies/list', (req, res) => {
  try {
    const companies = [...new Set(experiencesData.experiences.map(e => e.company))];
    
    res.json({
      code: 0,
      message: 'success',
      data: companies
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

module.exports = router;
