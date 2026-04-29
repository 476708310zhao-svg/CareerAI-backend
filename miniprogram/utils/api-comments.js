// utils/api-comments.js
// 面经评论模块

const { request, post, _write } = require('./api-client.js');

// 评论列表不走缓存，保证看到最新评论
function getExperienceComments(experienceId) {
  return request({ path: `/api/comments/${experienceId}`, noCache: true });
}

function createExperienceComment(data) {
  return post({ path: '/api/comments', body: data });
}

function replyExperienceComment(commentId, content) {
  return post({ path: `/api/comments/${commentId}/reply`, body: { content } });
}

function likeExperienceComment(commentId) {
  return post({ path: `/api/comments/${commentId}/like`, body: {} });
}

function deleteExperienceComment(commentId) {
  return _write({ method: 'DELETE', path: `/api/comments/${commentId}` });
}

module.exports = {
  getExperienceComments,
  createExperienceComment,
  replyExperienceComment,
  likeExperienceComment,
  deleteExperienceComment
};
