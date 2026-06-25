const express = require('express');
const { getPublicFeatureFlags } = require('../utils/featureFlags');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ code: 0, data: getPublicFeatureFlags() });
});

module.exports = router;
