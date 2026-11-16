const { post, request } = require('./api-client.js');

function getMyFeedback(cursor) {
  return request({
    path: '/api/feedback/mine',
    params: cursor ? { limit: 20, cursor } : { limit: 20 },
    noCache: true,
    noStale: true
  });
}

function submitFeedback(payload) {
  return post({
    path: '/api/feedback',
    body: payload
  });
}

module.exports = {
  submitFeedback,
  getMyFeedback
};
