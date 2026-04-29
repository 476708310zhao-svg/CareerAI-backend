const express = require('express');
const router = express.Router();
const { parseId } = require('../db/utils');
const { ok, fail } = require('../utils/response');
const companyService = require('../services/companyService');

router.get('/', (req, res) => {
  try {
    ok(res, companyService.listCompanies(req.query));
  } catch (err) {
    console.error('[companies:list]', err);
    fail(res, '获取公司列表失败');
  }
});

router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  try {
    const company = companyService.getCompanyById(id);
    if (!company) return res.status(404).json({ code: -1, message: '公司不存在' });
    ok(res, company);
  } catch (err) {
    console.error('[companies:detail]', err);
    fail(res, '获取公司详情失败');
  }
});

module.exports = router;
