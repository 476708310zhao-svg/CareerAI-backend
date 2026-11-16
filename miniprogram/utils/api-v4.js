// V4 求职画像、岗位匹配与申请 CRM 接口。
// 独立于旧版业务 API，方便页面渐进迁移并保留弱网回退。
const client = require('./api-client.js');
const config = require('./app-config.js');

function get(path, params) {
  return client.request({ path, params: params || {}, noCache: true });
}

function write(method, path, body, timeout = 20000) {
  return client._write({ method, path, body: body || {}, timeout });
}

function getProfile() { return get('/api/v4/profile'); }
function getManualServiceConsent() { return get('/api/v4/manual-services/consent'); }
function getManualServiceRequests() { return get('/api/v4/manual-services'); }
function getManualServiceRequest(id) { return get('/api/v4/manual-services/' + encodeURIComponent(id)); }
function createManualServiceRequest(payload) { return write('POST', '/api/v4/manual-services', payload); }
function revokeManualServiceRequest(id, expectedVersion) { return write('POST', '/api/v4/manual-services/' + encodeURIComponent(id) + '/revoke', { expectedVersion }); }
function getProfileCompletion() { return get('/api/v4/profile/completion'); }
function updateProfile(profile) { return write('PUT', '/api/v4/profile', profile); }

function getJobs(params) { return get('/api/v4/jobs', params); }
function getJobDetail(jobId) { return get('/api/v4/jobs/' + encodeURIComponent(jobId) + '/detail'); }
function calculateJobMatch(jobId) { return write('POST', '/api/v4/jobs/' + encodeURIComponent(jobId) + '/match'); }
function getJobMatch(jobId) { return get('/api/v4/jobs/' + encodeURIComponent(jobId) + '/match'); }

function getApplicationBoard(params) { return get('/api/v4/applications/board', params); }
async function getCompleteApplicationBoard(params) {
  let cursor;
  const groups = { preparing: [], applied: [], interview: [], offer: [], closed: [] };
  let first;
  do {
    const response = await getApplicationBoard(Object.assign({}, params, { pageSize: 50 }, cursor ? { cursor } : {}));
    if (!response || response.code !== 0 || !response.data || !response.data.groups) return response;
    const page = response.data;
    if (!first) first = response;
    Object.keys(groups).forEach(key => { groups[key].push(...(page.groups[key] || [])); });
    cursor = page.hasMore ? page.nextCursor : null;
    if (page.hasMore && !cursor) throw new Error('申请分页游标缺失');
  } while (cursor);
  return Object.assign({}, first, { data: Object.assign({}, first.data, { groups, hasMore: false, nextCursor: null }) });
}
function createApplication(payload) { return write('POST', '/api/v4/applications', payload); }
function getApplicationDetail(id) { return get('/api/v4/applications/' + encodeURIComponent(id) + '/detail'); }
function getApplicationWorkspace(id) { return get('/api/v4/applications/' + encodeURIComponent(id) + '/workspace'); }
function getApplicationHistory(id, params) { return get('/api/v4/applications/' + encodeURIComponent(id) + '/history', params); }
function updateApplication(id, payload) { return write('PATCH', '/api/v4/applications/' + encodeURIComponent(id), payload); }
function saveApplicationResumeSelection(id, payload) { return write('PUT', '/api/v4/applications/' + encodeURIComponent(id) + '/resume-selection', payload); }
function addApplicationChecklistItem(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/material-checklist', payload); }
function updateApplicationChecklistItem(id, itemId, payload) { return write('PATCH', '/api/v4/applications/' + encodeURIComponent(id) + '/material-checklist/' + encodeURIComponent(itemId), payload); }
function deleteApplicationChecklistItem(id, itemId, payload) { return write('DELETE', '/api/v4/applications/' + encodeURIComponent(id) + '/material-checklist/' + encodeURIComponent(itemId), payload); }
function updateApplicationStatus(id, payload) { return write('PATCH', '/api/v4/applications/' + encodeURIComponent(id) + '/status', payload); }
function confirmApplicationSubmission(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/submission-confirmation', payload); }
function revokeApplicationSubmission(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/submission-confirmation/revoke', payload); }
function addApplicationContact(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/contacts', payload); }
function addApplicationTask(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/tasks', payload); }
function updateApplicationTask(id, taskId, payload) {
  return write('PATCH', '/api/v4/applications/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(taskId), payload);
}
function getApplicationInterviewReports(id) { return get('/api/v4/applications/' + encodeURIComponent(id) + '/interview-reports'); }
function saveApplicationInterviewReport(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/interview-reports', payload); }
function convertApplicationInterviewReportToTask(id, reportId, payload) {
  return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/interview-reports/' + encodeURIComponent(reportId) + '/convert-to-task', payload);
}

function getResumeTemplates() { return get('/api/v4/resumes/templates'); }
function getResumePdfs() { return get('/api/upload/resume-pdfs'); }
function deleteResumePdf(id) { return write('DELETE', '/api/upload/resume-pdf/' + encodeURIComponent(id)); }
function downloadResumePdf(id) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    if (!token) return reject(new Error('请先登录后查看简历'));
    wx.downloadFile({
      url: config.API_BASE_URL + '/api/upload/resume-pdf/' + encodeURIComponent(id) + '/file',
      header: { Authorization: 'Bearer ' + token },
      success(res) {
        if (res.statusCode !== 200) {
          const error = new Error(res.statusCode === 404
            ? '当前接口还不能预览附件，或原文件已不存在。请检查后端是否已更新。'
            : (res.statusCode === 401 || res.statusCode === 403 ? '登录已过期，请重新登录后查看附件' : '附件读取失败，请稍后重试'));
          error.statusCode = res.statusCode;
          return reject(error);
        }
        if (!res.tempFilePath) return reject(new Error('附件下载结果为空，请重试'));
        resolve(res.tempFilePath);
      },
      fail(error) { reject(new Error(/domain|合法域名/i.test(error && error.errMsg || '')
        ? '下载域名未获微信小程序授权，请检查 downloadFile 合法域名配置'
        : '附件下载失败，请检查网络后重试')); }
    });
  });
}
function extractResumePdf(id) { return write('POST', '/api/upload/resume-pdf/' + encodeURIComponent(id) + '/extract'); }
function uploadResumePdf(filePath, originalName) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    if (!token) return reject(new Error('请先登录后再上传简历'));
    wx.uploadFile({
      url: config.API_BASE_URL + '/api/upload/resume-pdf',
      filePath,
      name: 'file',
      header: { Authorization: 'Bearer ' + token },
      formData: { originalName },
      success(res) {
        let body;
        try { body = JSON.parse(res.data); } catch (error) { return reject(new Error('上传响应异常，请稍后重试')); }
        if (Number(res.statusCode) < 200 || Number(res.statusCode) >= 300 || body.code !== 0) {
          return reject(new Error(body.message || '上传失败，请稍后重试'));
        }
        resolve(body);
      },
      fail() { reject(new Error('网络连接失败，请检查网络后重试')); }
    });
  });
}
function getCareerExperiences(params) { return get('/api/v4/resumes/experiences', params); }
function createCareerExperience(payload) { return write('POST', '/api/v4/resumes/experiences', payload); }
function updateCareerExperience(id, payload) { return write('PATCH', '/api/v4/resumes/experiences/' + encodeURIComponent(id), payload); }
function archiveCareerExperience(id) { return write('POST', '/api/v4/resumes/experiences/' + encodeURIComponent(id) + '/archive'); }
function getV4Resumes(params) { return get('/api/v4/resumes', params); }
function createV4Resume(payload) { return write('POST', '/api/v4/resumes', payload); }
function syncResumeProfile(id) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/sync-profile'); }
function updateV4Resume(id, payload) { return write('PATCH', '/api/v4/resumes/' + encodeURIComponent(id), payload); }
function archiveV4Resume(id) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/archive'); }
function setDefaultV4Resume(id) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/default'); }
function linkV4Resume(id, payload) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/links', payload); }
function getResumeVersions(id, params) { return get('/api/v4/resumes/' + encodeURIComponent(id) + '/versions', params); }
function getResumeVersion(id, versionId) { return get('/api/v4/resumes/' + encodeURIComponent(id) + '/versions/' + encodeURIComponent(versionId)); }
async function getCurrentResumeVersion(id, versionId) {
  let selectedId = versionId;
  if (!selectedId) {
    const page = await getResumeVersions(id, { pageSize: 1 });
    if (page && Array.isArray(page.data)) return page;
    selectedId = page && page.data && page.data.list && page.data.list[0] && page.data.list[0].id;
  }
  if (!selectedId) return { code: 0, data: [] };
  const response = await getResumeVersion(id, selectedId);
  if (response && response._status === 404) {
    const legacy = await getResumeVersions(id);
    if (legacy && Array.isArray(legacy.data)) return legacy;
  }
  return Object.assign({}, response, { data: response && response.data ? [response.data] : [] });
}
async function getCompleteResumeVersions(id) {
  const list = [];
  let cursor;
  do {
    const response = await getResumeVersions(id, Object.assign({ pageSize: 50 }, cursor ? { cursor } : {}));
    if (!response || response.code !== 0 || !response.data || !Array.isArray(response.data.list)) return response;
    list.push(...response.data.list);
    cursor = response.data.hasMore ? response.data.nextCursor : null;
    if (response.data.hasMore && !cursor) throw new Error('简历分页游标缺失');
  } while (cursor);
  return { code: 0, data: list };
}
function createResumeVersion(id, payload) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/versions', payload); }
function createResumeChangeSet(id, payload) {
  return client._write({ method: 'POST', path: '/api/v4/resumes/' + encodeURIComponent(id) + '/ai-change-sets',
    body: payload || {}, timeout: 50000, hardTimeoutMs: 55000 });
}
function confirmResumeChangeSet(id, payload) { return write('POST', '/api/v4/resumes/ai-change-sets/' + encodeURIComponent(id) + '/confirm', payload); }
function rejectResumeChangeSet(id, payload) { return write('POST', '/api/v4/resumes/ai-change-sets/' + encodeURIComponent(id) + '/reject', payload); }
function getMaterialQuota() { return get('/api/v4/materials/quota'); }
function getMaterialDrafts(params) { return get('/api/v4/materials/drafts', params); }
function createMaterialDraft(payload) { return write('POST', '/api/v4/materials/drafts', payload); }
function generateApplicationAnswer(payload) { return write('POST', '/api/v4/materials/answers/draft', payload); }
function getApplicationAnswerDrafts(applicationId) { return get('/api/v4/materials/answers/drafts', { applicationId }); }
function updateApplicationAnswerDraft(id, payload) { return write('PATCH', '/api/v4/materials/answers/drafts/' + encodeURIComponent(id), payload); }
function confirmMaterialDraft(id, payload) { return write('POST', '/api/v4/materials/drafts/' + encodeURIComponent(id) + '/confirm', payload); }
function rejectMaterialDraft(id) { return write('POST', '/api/v4/materials/drafts/' + encodeURIComponent(id) + '/reject'); }
function trackOfficialApply(id) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/official-apply'); }
function getInterviewSpaces() { return get('/api/v4/interviews/spaces'); }
function ensureInterviewSpace(applicationId) { return write('POST', '/api/v4/interviews/spaces', { applicationId }); }
function getInterviewSpace(id) { return get('/api/v4/interviews/spaces/' + encodeURIComponent(id)); }
function updateInterviewSpace(id, payload) { return write('PATCH', '/api/v4/interviews/spaces/' + encodeURIComponent(id), payload); }
function startInterviewSession(id, payload) { return write('POST', '/api/v4/interviews/spaces/' + encodeURIComponent(id) + '/sessions', payload); }
function answerInterviewQuestion(id, payload) { return write('POST', '/api/v4/interviews/sessions/' + encodeURIComponent(id) + '/answers', payload); }
function completeInterviewSession(id, payload) { return write('POST', '/api/v4/interviews/sessions/' + encodeURIComponent(id) + '/complete', payload); }
function cancelInterviewSession(id) { return write('POST', '/api/v4/interviews/sessions/' + encodeURIComponent(id) + '/cancel'); }
function getInterviewReports() { return get('/api/v4/interviews/reports'); }
function getInterviewTrends() { return get('/api/v4/interviews/trends'); }
function getTodayTasks() { return get('/api/v4/today/tasks'); }
function syncTodayTasks(payload) { return write('POST', '/api/v4/today/tasks/sync', payload); }
function updateTodayTask(id, payload) { return write('PATCH', '/api/v4/today/tasks/' + encodeURIComponent(id), payload); }
function deferTodayTask(id, days) { return write('POST', '/api/v4/today/tasks/' + encodeURIComponent(id) + '/defer', { days }); }
function getCareerCoachDashboard() { return get('/api/v4/career/dashboard'); }
function getCareerDiagnostic() { return get('/api/v4/career/diagnostic'); }
function createCareerDiagnosticTasks(dimensions) { return write('POST', '/api/v4/career/diagnostic/tasks', { dimensions }); }
function getDynamicCareerPlan() { return get('/api/v4/career/plan'); }
function getCareerWeeklyReport() { return get('/api/v4/career/weekly-report'); }
function generateCareerTodayTasks() { return write('POST', '/api/v4/career/today/generate'); }
function getNetworkingDashboard() { return get('/api/v4/networking/dashboard'); }
function createNetworkingContact(payload) { return write('POST', '/api/v4/networking/contacts', payload); }
function updateNetworkingContact(id, payload) { return write('PATCH', '/api/v4/networking/contacts/' + encodeURIComponent(id), payload); }
function updateNetworkingStage(id, payload) { return write('POST', '/api/v4/networking/contacts/' + encodeURIComponent(id) + '/stage', payload); }
function createNetworkingDraft(id, payload) { return write('POST', '/api/v4/networking/contacts/' + encodeURIComponent(id) + '/drafts', payload); }
function updateNetworkingDraft(id, payload) { return write('PATCH', '/api/v4/networking/drafts/' + encodeURIComponent(id), payload); }
function markNetworkingDraftSent(id, payload) { return write('POST', '/api/v4/networking/drafts/' + encodeURIComponent(id) + '/mark-sent', payload); }
function recordNetworkingReferral(id, payload) { return write('POST', '/api/v4/networking/contacts/' + encodeURIComponent(id) + '/referral', payload); }
function getAgents() { return get('/api/v4/agents'); }
function getAgentTasks() { return get('/api/v4/agents/tasks'); }
function createAgentTask(payload) { return write('POST', '/api/v4/agents/tasks', payload); }
function retryAgentTask(id, payload) { return write('POST', '/api/v4/agents/tasks/' + encodeURIComponent(id) + '/retry', payload); }
function cancelAgentTask(id) { return write('POST', '/api/v4/agents/tasks/' + encodeURIComponent(id) + '/cancel'); }
function confirmAgentTask(id, payload) { return write('POST', '/api/v4/agents/tasks/' + encodeURIComponent(id) + '/confirm', payload); }
function getMembershipPlans() { return get('/api/v4/membership/plans'); }
function getMembershipStatus() { return get('/api/v4/membership/status'); }
function getMembershipOrders() { return get('/api/v4/membership/orders'); }
function getCommerceLedger(params) { return get('/api/v4/membership/ledger', params); }
function requestMembershipRefund(payload) { return write('POST', '/api/v4/membership/refunds', payload); }
function getOaDashboard() { return get('/api/v4/oa/dashboard'); }
function createOaPlan(payload) { return write('POST', '/api/v4/oa/plans', payload); }
function updateOaPlan(id, payload) { return write('PATCH', '/api/v4/oa/plans/' + encodeURIComponent(id), payload); }
function startOaSession(id, payload) { return write('POST', '/api/v4/oa/plans/' + encodeURIComponent(id) + '/sessions', payload); }
function completeOaSession(id, payload) { return write('POST', '/api/v4/oa/sessions/' + encodeURIComponent(id) + '/complete', payload); }
function abandonOaSession(id) { return write('POST', '/api/v4/oa/sessions/' + encodeURIComponent(id) + '/abandon'); }
function updateOaMistake(id, payload) { return write('PATCH', '/api/v4/oa/mistakes/' + encodeURIComponent(id), payload); }
function getProjectDashboard() { return get('/api/v4/projects/dashboard'); }
function createEvidenceProject(payload) { return write('POST', '/api/v4/projects', payload); }
function updateProjectMilestone(id, milestoneId, payload) {
  return write('PATCH', '/api/v4/projects/' + encodeURIComponent(id) + '/milestones/' + encodeURIComponent(milestoneId), payload);
}
function completeEvidenceProject(id, payload) { return write('POST', '/api/v4/projects/' + encodeURIComponent(id) + '/complete', payload); }
function exportProjectExperience(id, payload) { return write('POST', '/api/v4/projects/' + encodeURIComponent(id) + '/export-experience', payload); }
function getJobTrust(jobId) { return get('/api/v4/jobs/' + encodeURIComponent(jobId) + '/trust'); }
function recordJobTrustObservation(jobId, payload) {
  return write('POST', '/api/v4/jobs/' + encodeURIComponent(jobId) + '/trust/observations', payload);
}

module.exports = {
  getProfile,
  getManualServiceConsent,
  getManualServiceRequests,
  getManualServiceRequest,
  createManualServiceRequest,
  revokeManualServiceRequest,
  getProfileCompletion,
  updateProfile,
  getJobs,
  getJobDetail,
  calculateJobMatch,
  getJobMatch,
  getApplicationBoard,
  getCompleteApplicationBoard,
  createApplication,
  getApplicationDetail,
  getApplicationWorkspace,
  getApplicationHistory,
  updateApplication,
  saveApplicationResumeSelection,
  addApplicationChecklistItem,
  updateApplicationChecklistItem,
  deleteApplicationChecklistItem,
  updateApplicationStatus,
  confirmApplicationSubmission,
  revokeApplicationSubmission,
  addApplicationContact,
  addApplicationTask,
  updateApplicationTask,
  getApplicationInterviewReports,
  saveApplicationInterviewReport,
  convertApplicationInterviewReportToTask,
  getResumeTemplates,
  getResumePdfs,
  deleteResumePdf,
  downloadResumePdf,
  extractResumePdf,
  uploadResumePdf,
  getCareerExperiences,
  createCareerExperience,
  updateCareerExperience,
  archiveCareerExperience,
  getV4Resumes,
  createV4Resume,
  syncResumeProfile,
  updateV4Resume,
  archiveV4Resume,
  setDefaultV4Resume,
  linkV4Resume,
  getResumeVersions,
  getResumeVersion,
  getCurrentResumeVersion,
  getCompleteResumeVersions,
  createResumeVersion,
  createResumeChangeSet,
  confirmResumeChangeSet,
  rejectResumeChangeSet,
  getMaterialQuota,
  getMaterialDrafts,
  createMaterialDraft,
  generateApplicationAnswer,
  getApplicationAnswerDrafts,
  updateApplicationAnswerDraft,
  confirmMaterialDraft,
  rejectMaterialDraft,
  trackOfficialApply,
  getInterviewSpaces,
  ensureInterviewSpace,
  getInterviewSpace,
  updateInterviewSpace,
  startInterviewSession,
  answerInterviewQuestion,
  completeInterviewSession,
  cancelInterviewSession,
  getInterviewReports,
  getInterviewTrends,
  getTodayTasks,
  syncTodayTasks,
  updateTodayTask,
  deferTodayTask,
  getCareerCoachDashboard,
  getCareerDiagnostic,
  createCareerDiagnosticTasks,
  getDynamicCareerPlan,
  getCareerWeeklyReport,
  generateCareerTodayTasks,
  getNetworkingDashboard,
  createNetworkingContact,
  updateNetworkingContact,
  updateNetworkingStage,
  createNetworkingDraft,
  updateNetworkingDraft,
  markNetworkingDraftSent,
  recordNetworkingReferral,
  getAgents,
  getAgentTasks,
  createAgentTask,
  retryAgentTask,
  cancelAgentTask,
  confirmAgentTask,
  getMembershipPlans,
  getMembershipStatus,
  getMembershipOrders,
  getCommerceLedger,
  requestMembershipRefund,
  getOaDashboard,
  createOaPlan,
  updateOaPlan,
  startOaSession,
  completeOaSession,
  abandonOaSession,
  updateOaMistake,
  getProjectDashboard,
  createEvidenceProject,
  updateProjectMilestone,
  completeEvidenceProject,
  exportProjectExperience,
  getJobTrust,
  recordJobTrustObservation,
};
