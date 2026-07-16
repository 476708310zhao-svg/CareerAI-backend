// V4 求职画像、岗位匹配与申请 CRM 接口。
// 独立于旧版业务 API，方便页面渐进迁移并保留弱网回退。
const client = require('./api-client.js');

function get(path, params) {
  return client.request({ path, params: params || {}, noCache: true });
}

function write(method, path, body) {
  return client._write({ method, path, body: body || {}, timeout: 20000 });
}

function getProfile() { return get('/api/v4/profile'); }
function getProfileCompletion() { return get('/api/v4/profile/completion'); }
function updateProfile(profile) { return write('PUT', '/api/v4/profile', profile); }

function getJobs(params) { return get('/api/v4/jobs', params); }
function getJobDetail(jobId) { return get('/api/v4/jobs/' + encodeURIComponent(jobId) + '/detail'); }
function calculateJobMatch(jobId) { return write('POST', '/api/v4/jobs/' + encodeURIComponent(jobId) + '/match'); }
function getJobMatch(jobId) { return get('/api/v4/jobs/' + encodeURIComponent(jobId) + '/match'); }

function getApplicationBoard(params) { return get('/api/v4/applications/board', params); }
function createApplication(payload) { return write('POST', '/api/v4/applications', payload); }
function getApplicationDetail(id) { return get('/api/v4/applications/' + encodeURIComponent(id) + '/detail'); }
function updateApplication(id, payload) { return write('PATCH', '/api/v4/applications/' + encodeURIComponent(id), payload); }
function updateApplicationStatus(id, payload) { return write('PATCH', '/api/v4/applications/' + encodeURIComponent(id) + '/status', payload); }
function addApplicationContact(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/contacts', payload); }
function addApplicationTask(id, payload) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/tasks', payload); }
function updateApplicationTask(id, taskId, payload) {
  return write('PATCH', '/api/v4/applications/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(taskId), payload);
}

function getResumeTemplates() { return get('/api/v4/resumes/templates'); }
function getCareerExperiences(params) { return get('/api/v4/resumes/experiences', params); }
function createCareerExperience(payload) { return write('POST', '/api/v4/resumes/experiences', payload); }
function updateCareerExperience(id, payload) { return write('PATCH', '/api/v4/resumes/experiences/' + encodeURIComponent(id), payload); }
function archiveCareerExperience(id) { return write('POST', '/api/v4/resumes/experiences/' + encodeURIComponent(id) + '/archive'); }
function getV4Resumes(params) { return get('/api/v4/resumes', params); }
function createV4Resume(payload) { return write('POST', '/api/v4/resumes', payload); }
function updateV4Resume(id, payload) { return write('PATCH', '/api/v4/resumes/' + encodeURIComponent(id), payload); }
function copyV4Resume(id, payload) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/copy', payload); }
function archiveV4Resume(id) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/archive'); }
function setDefaultV4Resume(id) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/default'); }
function linkV4Resume(id, payload) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/links', payload); }
function getResumeVersions(id) { return get('/api/v4/resumes/' + encodeURIComponent(id) + '/versions'); }
function compareResumeVersions(id, from, to) { return get('/api/v4/resumes/' + encodeURIComponent(id) + '/versions/compare', { from, to }); }
function restoreResumeVersion(id, versionId) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/versions/' + encodeURIComponent(versionId) + '/restore'); }
function createResumeChangeSet(id, payload) { return write('POST', '/api/v4/resumes/' + encodeURIComponent(id) + '/ai-change-sets', payload); }
function confirmResumeChangeSet(id, payload) { return write('POST', '/api/v4/resumes/ai-change-sets/' + encodeURIComponent(id) + '/confirm', payload); }
function rejectResumeChangeSet(id, payload) { return write('POST', '/api/v4/resumes/ai-change-sets/' + encodeURIComponent(id) + '/reject', payload); }
function getMaterialQuota() { return get('/api/v4/materials/quota'); }
function getMaterialDrafts(params) { return get('/api/v4/materials/drafts', params); }
function createMaterialDraft(payload) { return write('POST', '/api/v4/materials/drafts', payload); }
function confirmMaterialDraft(id, payload) { return write('POST', '/api/v4/materials/drafts/' + encodeURIComponent(id) + '/confirm', payload); }
function rejectMaterialDraft(id) { return write('POST', '/api/v4/materials/drafts/' + encodeURIComponent(id) + '/reject'); }
function trackOfficialApply(id) { return write('POST', '/api/v4/applications/' + encodeURIComponent(id) + '/official-apply'); }
function getInterviewSpaces() { return get('/api/v4/interviews/spaces'); }
function getInterviewSpace(id) { return get('/api/v4/interviews/spaces/' + encodeURIComponent(id)); }
function updateInterviewSpace(id, payload) { return write('PATCH', '/api/v4/interviews/spaces/' + encodeURIComponent(id), payload); }
function startInterviewSession(id, payload) { return write('POST', '/api/v4/interviews/spaces/' + encodeURIComponent(id) + '/sessions', payload); }
function answerInterviewQuestion(id, payload) { return write('POST', '/api/v4/interviews/sessions/' + encodeURIComponent(id) + '/answers', payload); }
function completeInterviewSession(id) { return write('POST', '/api/v4/interviews/sessions/' + encodeURIComponent(id) + '/complete'); }
function cancelInterviewSession(id) { return write('POST', '/api/v4/interviews/sessions/' + encodeURIComponent(id) + '/cancel'); }
function getInterviewReports() { return get('/api/v4/interviews/reports'); }
function getInterviewTrends() { return get('/api/v4/interviews/trends'); }
function getTodayTasks() { return get('/api/v4/interviews/today-tasks'); }
function updateTodayTask(id, payload) { return write('PATCH', '/api/v4/interviews/today-tasks/' + encodeURIComponent(id), payload); }
function getAgents() { return get('/api/v4/agents'); }
function getAgentTasks() { return get('/api/v4/agents/tasks'); }
function createAgentTask(payload) { return write('POST', '/api/v4/agents/tasks', payload); }
function retryAgentTask(id, payload) { return write('POST', '/api/v4/agents/tasks/' + encodeURIComponent(id) + '/retry', payload); }
function cancelAgentTask(id) { return write('POST', '/api/v4/agents/tasks/' + encodeURIComponent(id) + '/cancel'); }
function confirmAgentTask(id, payload) { return write('POST', '/api/v4/agents/tasks/' + encodeURIComponent(id) + '/confirm', payload); }
function getMembershipPlans() { return get('/api/v4/membership/plans'); }
function getMembershipStatus() { return get('/api/v4/membership/status'); }

module.exports = {
  getProfile,
  getProfileCompletion,
  updateProfile,
  getJobs,
  getJobDetail,
  calculateJobMatch,
  getJobMatch,
  getApplicationBoard,
  createApplication,
  getApplicationDetail,
  updateApplication,
  updateApplicationStatus,
  addApplicationContact,
  addApplicationTask,
  updateApplicationTask,
  getResumeTemplates,
  getCareerExperiences,
  createCareerExperience,
  updateCareerExperience,
  archiveCareerExperience,
  getV4Resumes,
  createV4Resume,
  updateV4Resume,
  copyV4Resume,
  archiveV4Resume,
  setDefaultV4Resume,
  linkV4Resume,
  getResumeVersions,
  compareResumeVersions,
  restoreResumeVersion,
  createResumeChangeSet,
  confirmResumeChangeSet,
  rejectResumeChangeSet,
  getMaterialQuota,
  getMaterialDrafts,
  createMaterialDraft,
  confirmMaterialDraft,
  rejectMaterialDraft,
  trackOfficialApply,
  getInterviewSpaces,
  getInterviewSpace,
  updateInterviewSpace,
  startInterviewSession,
  answerInterviewQuestion,
  completeInterviewSession,
  cancelInterviewSession,
  getInterviewReports,
  getInterviewTrends,
  getTodayTasks,
  updateTodayTask,
  getAgents,
  getAgentTasks,
  createAgentTask,
  retryAgentTask,
  cancelAgentTask,
  confirmAgentTask,
  getMembershipPlans,
  getMembershipStatus,
};
