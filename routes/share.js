const router = require('express').Router();
const { getPublicShareConfig } = require('../utils/shareConfig');

router.get('/configs', (_req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.json({ code: 0, message: 'success', data: getPublicShareConfig() });
});

module.exports = router;
