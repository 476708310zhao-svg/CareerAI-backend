const express = require('express');
const { ensureV4Schema } = require('../../db/v4Schema');

ensureV4Schema();

const router = express.Router();
router.use('/profile', require('./profile'));
router.use('/jobs', require('./jobs'));
router.use('/applications', require('./applications'));
router.use('/resumes', require('./resumes'));
router.use('/materials', require('./materials'));
router.use('/interviews', require('./interviews'));
router.use('/agents', require('./agents'));
router.use('/membership', require('./membership'));

router.get('/health', (_req, res) => {
  res.json({ code: 0, message: 'V4 API 运行正常', data: { version: '4.0.0', sprint: 4 } });
});

module.exports = router;
