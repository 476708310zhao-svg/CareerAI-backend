// utils/api-experiences.js
// 面经列表、详情、点赞模块

const { request, post } = require('./api-client.js');

function getExperiences(params) {
  return request({ path: '/api/experiences', params: params || {} });
}

function getExperienceDetail(id) {
  return request({ path: `/api/experiences/${id}`, noCache: true });
}

function likeExperience(id) {
  return post({ path: `/api/experiences/${id}/like`, body: {} });
}

function createExperience(data) {
  return post({ path: '/api/experiences', body: data });
}

module.exports = { getExperiences, getExperienceDetail, likeExperience, createExperience };
