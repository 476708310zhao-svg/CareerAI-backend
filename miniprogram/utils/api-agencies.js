// utils/api-agencies.js
// 求职机构测评模块

const { request, post, _write } = require('./api-client.js');
const feishuContent = require('./api-feishu-content.js');

function requestAgencies(params) {
  const requestParams = Object.assign({}, params || {});
  delete requestParams.skipFeishu;
  return request({ path: '/api/agencies', params: requestParams });
}

function mergeAgencyResponse(baseRes, feishuRes) {
  const baseList = baseRes && Array.isArray(baseRes.data) ? baseRes.data : [];
  const feishuList = feishuRes && Array.isArray(feishuRes.data) ? feishuRes.data : [];
  const seen = {};
  const data = [];
  baseList.slice(0, 4).concat(feishuList, baseList.slice(4)).forEach(item => {
    const key = String((item && (item.name || item.id)) || '').trim().toLowerCase();
    if (!key || seen[key]) return;
    seen[key] = true;
    data.push(item);
  });
  return Object.assign({}, baseRes || { code: 0 }, {
    code: 0,
    data,
    total: Math.max(Number((baseRes && baseRes.total) || 0), data.length)
  });
}

function getAgencies(params) {
  if (params && params.skipFeishu) return requestAgencies(params);

  return requestAgencies(params)
    .then(baseRes => feishuContent.getFeishuAgencies(params || {})
      .then(feishuRes => mergeAgencyResponse(baseRes, feishuRes))
      .catch(() => baseRes))
    .catch(() => feishuContent.getFeishuAgencies(params || {}));
}

function getAgencyDetail(id) {
  return request({ path: `/api/agencies/${id}` }).then(res => {
    if (!res || !res.data || Array.isArray(res.data)) throw new Error('empty agency detail');
    return res;
  }).catch(() => feishuContent.getFeishuAgencyDetail(id));
}

function getAgencyReviews(id, page, pageSize) {
  if (String(id || '').indexOf('rec') === 0) {
    return Promise.resolve({ code: 0, data: [], total: 0 });
  }
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
