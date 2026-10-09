const api = require('./api-v4.js');
const progress = require('./job-progress.js');
const pending = new Map();

function readApplication(response) {
  if (!response || response.code !== 0 || !response.data) throw new Error('申请保存失败，请重试');
  const app = response.data.application || response.data;
  if (!app.id || !app.status) throw new Error('申请状态暂不可用，请重试');
  return app;
}

// 同一岗位只创建一条申请；重试遇到 409 时读取已有记录，不覆盖后续状态。
function queueJob(job) {
  const token = wx.getStorageSync('token');
  if (!token) return Promise.reject(new Error('请先登录'));
  const jobId = String(job && (job.id || job.job_id) || '');
  if (!jobId) return Promise.reject(new Error('缺少岗位信息'));
  const key = token + ':' + jobId;
  if (pending.has(key)) return pending.get(key);
  const request = api.createApplication({
    jobId, status: 'preparing', sourceType: 'mobile_job',
    deadline: job.deadline || '',
    nextAction: '准备申请材料并前往官方招聘页投递',
    jobSnapshot: {
      id: jobId, title: job.title, company: job.company,
      location: job.city || job.location || '', salary: job.salary || '',
      applyUrl: job.applyLink || job.applyUrl || '', deadline: job.deadline || ''
    }
  }).then(readApplication).catch(error => {
    const id = error && error.body && error.body.data && error.body.data.applicationId;
    if (error.statusCode !== 409 || !id) throw error;
    return api.getApplicationDetail(id).then(readApplication);
  }).then(app => {
    if (wx.getStorageSync('token') !== token) throw new Error('登录状态已变化，请重试');
    if (app.status !== 'interested') return app;
    return api.updateApplicationStatus(app.id, {
      status: 'preparing', note: '小程序加入待投递',
      expectedState: { status: app.status, historyId: app.historyId }
    }).then(response => Object.assign({}, app, readApplication(response)));
  }).then(app => {
    if (wx.getStorageSync('token') !== token) throw new Error('登录状态已变化，请重试');
    // 只缓存已确认的服务端记录，不同时通过旧接口写第二次。
    progress.mergeRemoteList([app]);
    return app;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

module.exports = { queueJob, readApplication };
