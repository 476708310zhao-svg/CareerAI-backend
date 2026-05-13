const { post } = require('./api-client.js');

function submitFeedback(payload) {
  return post({
    path: '/api/feedback',
    body: payload
  });
}

module.exports = {
  submitFeedback
};
