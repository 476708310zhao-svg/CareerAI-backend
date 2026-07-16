const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { ok, fail } = require('../../utils/response');
const { getProfile, saveProfile } = require('../../services/v4Profile');
const analytics = require('../../services/v4Analytics');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  return ok(res, profile);
});

router.put('/', authMiddleware, (req, res) => {
  try {
    const profile = saveProfile(req.user.userId, req.body || {});
    if (!profile) return fail(res, '用户不存在', 404);
    analytics.track(req.user.userId, profile.completion >= 80 ? 'profile_completed' : 'profile_started', { completion: profile.completion }, '/api/v4/profile');
    return ok(res, profile, '求职画像已更新');
  } catch (error) {
    console.error('[v4/profile] update failed:', error.message);
    return fail(res, '求职画像更新失败', 500);
  }
});

router.get('/completion', authMiddleware, (req, res) => {
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  const required = ['school', 'major', 'degree', 'graduationYear', 'targetRoles', 'targetCities', 'visaStatus', 'skills'];
  const missing = required.filter(key => !profile[key] || (Array.isArray(profile[key]) && !profile[key].length));
  return ok(res, { completion: profile.completion, missing });
});

module.exports = router;
