const { request } = require('./api-client.js');

function unwrapList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && res.data && Array.isArray(res.data.list)) return res.data.list;
  return [];
}

function fetchRemoteInterviewQuestions(params) {
  return request({
    path: '/api/career-assets/interview-questions',
    params: params || {},
    cacheTTL: 10 * 60 * 1000,
    timeout: 8000
  }).then(unwrapList);
}

function fetchRemoteStarTemplates(params) {
  return request({
    path: '/api/career-assets/star-templates',
    params: params || {},
    cacheTTL: 10 * 60 * 1000,
    timeout: 8000
  }).then(unwrapList);
}

module.exports = {
  fetchRemoteInterviewQuestions,
  fetchRemoteStarTemplates
};
