const { request, put } = require('./api-client.js');

function getMessages(type) {
  return request({
    path: '/api/messages',
    params: type ? { type } : {},
    noCache: true
  });
}

function markMessageRead(id) {
  return put({
    path: `/api/messages/${id}/read`
  });
}

function markAllMessagesRead() {
  return put({
    path: '/api/messages/read-all'
  });
}

module.exports = {
  getMessages,
  markMessageRead,
  markAllMessagesRead
};
