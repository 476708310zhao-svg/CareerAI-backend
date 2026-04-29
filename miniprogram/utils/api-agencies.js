// utils/api-agencies.js
// 求职机构测评模块

const { request, post, _write } = require('./api-client.js');

function getAgencies(params) {
  return request({ path: '/api/agencies', params });
}

function getAgencyDetail(id) {
  return request({ path: `/api/agencies/${id}` });
}

function getAgencyReviews(id, page, pageSize) {
  return request({ path: `/api/agencies/${id}/reviews`, params: { page, pageSize } });
}

function submitAgencyReview(id, data) {
  return post({ path: `/api/agencies/${id}/reviews`, body: data });
}

function likeAgencyReview(agencyId, reviewId) {
  return post({ path: `/api/agencies/${agencyId}/reviews/${reviewId}/like`, body: {} });
}

function deleteAgencyReview(reviewId) {
  return _write({ path: `/api/agencies/reviews/${reviewId}`, method: 'DELETE', body: {} });
}

function triggerAgencyAiEval(id) {
  return post({ path: `/api/agencies/${id}/ai-eval`, body: {} });
}

function getAgenciesBatchInfo(ids) {
  return post({ path: '/api/agencies/batch-info', body: { ids } });
}

function getAgenciesCompare(ids) {
  return request({ path: '/api/agencies/compare', params: { ids: ids.join(',') } });
}

module.exports = {
  getAgencies, getAgencyDetail, getAgencyReviews, submitAgencyReview,
  likeAgencyReview, deleteAgencyReview, triggerAgencyAiEval,
  getAgenciesBatchInfo, getAgenciesCompare
};
