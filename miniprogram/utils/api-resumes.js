// utils/api-resumes.js — 多份简历接口
const { request, post, _write } = require('./api-client.js');

function getResumes() {
  return request({ path: '/api/resumes', noCache: true });
}
function getResume(id) {
  return request({ path: `/api/resumes/${id}`, noCache: true });
}
function createResume(data) {
  return post({ path: '/api/resumes', body: data });
}
function updateResume(id, data) {
  return _write({ method: 'PUT', path: `/api/resumes/${id}`, body: data });
}
function deleteResume(id) {
  return _write({ method: 'DELETE', path: `/api/resumes/${id}` });
}

module.exports = { getResumes, getResume, createResume, updateResume, deleteResume };
