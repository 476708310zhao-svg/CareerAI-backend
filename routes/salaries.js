const express = require('express');
const router = express.Router();
const salariesData = require('../data/salaries.json');

// 获取薪资列表
router.get('/', (req, res) => {
  try {
    const { 
      company, 
      position, 
      location,
      page = 1, 
      pageSize = 10 
    } = req.query;
    
    let filteredSalaries = [...salariesData.salaries];
    
    // 公司筛选
    if (company) {
      filteredSalaries = filteredSalaries.filter(s => 
        s.company.toLowerCase().includes(company.toLowerCase())
      );
    }
    
    // 职位筛选
    if (position) {
      filteredSalaries = filteredSalaries.filter(s => 
        s.position.toLowerCase().includes(position.toLowerCase())
      );
    }
    
    // 地点筛选
    if (location) {
      filteredSalaries = filteredSalaries.filter(s => 
        s.location.toLowerCase().includes(location.toLowerCase())
      );
    }
    
    // 按时间排序
    filteredSalaries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + parseInt(pageSize);
    const paginatedSalaries = filteredSalaries.slice(startIndex, endIndex);
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: paginatedSalaries,
        total: filteredSalaries.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(filteredSalaries.length / pageSize)
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取薪资统计
router.get('/statistics', (req, res) => {
  try {
    res.json({
      code: 0,
      message: 'success',
      data: salariesData.statistics
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取公司薪资详情
router.get('/company/:company', (req, res) => {
  try {
    const company = req.params.company;
    const companySalaries = salariesData.salaries.filter(s => 
      s.company.toLowerCase() === company.toLowerCase()
    );
    
    if (companySalaries.length === 0) {
      return res.status(404).json({
        code: -1,
        message: '暂无该公司的薪资数据'
      });
    }
    
    // 计算统计数据
    const avgBaseSalary = Math.round(
      companySalaries.reduce((sum, s) => sum + s.baseSalary, 0) / companySalaries.length
    );
    const avgTotalComp = Math.round(
      companySalaries.reduce((sum, s) => sum + s.totalCompensation, 0) / companySalaries.length
    );
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        company,
        salaries: companySalaries,
        statistics: {
          count: companySalaries.length,
          avgBaseSalary,
          avgTotalCompensation: avgTotalComp,
          currency: companySalaries[0].currency
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

// 获取职位薪资详情
router.get('/position/:position', (req, res) => {
  try {
    const position = req.params.position;
    const positionSalaries = salariesData.salaries.filter(s => 
      s.position.toLowerCase().includes(position.toLowerCase())
    );
    
    if (positionSalaries.length === 0) {
      return res.status(404).json({
        code: -1,
        message: '暂无该职位的薪资数据'
      });
    }
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        position,
        salaries: positionSalaries,
        count: positionSalaries.length
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 分享薪资
router.post('/', (req, res) => {
  try {
    const { 
      company, 
      position, 
      location,
      yearsOfExperience,
      baseSalary,
      bonus,
      stock,
      currency = 'CNY',
      userId = 1 
    } = req.body;
    
    // 验证必填字段
    if (!company || !position || !location || baseSalary === undefined) {
      return res.status(400).json({
        code: -1,
        message: '请填写完整信息'
      });
    }
    
    const totalCompensation = (baseSalary * 12) + (bonus || 0) + (stock || 0);
    
    const newSalary = {
      id: salariesData.salaries.length + 1,
      company,
      position,
      location,
      yearsOfExperience: yearsOfExperience || 0,
      baseSalary,
      bonus: bonus || 0,
      stock: stock || 0,
      totalCompensation,
      currency,
      createdAt: new Date().toISOString().split('T')[0]
    };
    
    // 模拟添加到数据库
    salariesData.salaries.unshift(newSalary);
    
    res.json({
      code: 0,
      message: '分享成功，感谢您的贡献！',
      data: newSalary
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

// 获取筛选选项
router.get('/filters/options', (req, res) => {
  try {
    const companies = [...new Set(salariesData.salaries.map(s => s.company))];
    const positions = [...new Set(salariesData.salaries.map(s => s.position))];
    const locations = [...new Set(salariesData.salaries.map(s => s.location))];
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        companies,
        positions,
        locations
      }
    });
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: error.message
    });
  }
});

module.exports = router;
