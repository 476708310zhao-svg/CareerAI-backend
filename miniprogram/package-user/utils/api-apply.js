// utils/api-apply.js — 半自动投递 API 封装
const { request, post, _write } = require('../../utils/api-client');
const config = require('../../utils/config');

function getMyPdfs() {
  return request({ path: '/api/upload/resume-pdfs', noCache: true });
}

function deletePdf(id) {
  return _write({ method: 'DELETE', path: `/api/upload/resume-pdf/${id}` });
}

function fetchApplyForm({ source, slug, jobId }) {
  return request({
    path: '/api/apply/form',
    params: { source, slug, jobId },
    noCache: true,
    cacheTTL: 0,
  });
}

function submitApply(body) {
  return post({ path: '/api/apply/submit', body, timeout: 45000 });
}

function uploadPdf(filePath) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    wx.uploadFile({
      url: config.API_BASE_URL + '/api/upload/resume-pdf',
      filePath,
      name: 'file',
      header: token ? { Authorization: 'Bearer ' + token } : {},
      success(res) {
        try {
          const data = JSON.parse(res.data);
          if (data.code === 0) resolve(data);
          else reject(new Error(data.message || '上传失败'));
        } catch (e) {
          reject(new Error('响应解析失败'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '上传失败'));
      },
    });
  });
}

module.exports = { getMyPdfs, deletePdf, fetchApplyForm, submitApply, uploadPdf };
