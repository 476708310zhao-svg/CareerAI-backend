// utils/api-ats.js
const { post } = require('../../utils/api-client.js');

/**
 * ATS 简历优化分析
 * @param {{ resumeData: object, jobDescription: string, jobTitle?: string }} params
 */
function analyzeAts(params) {
  return post({
    path: '/api/ai/ats',
    body: {
      resumeData:     params.resumeData,
      jobDescription: params.jobDescription,
      jobTitle:       params.jobTitle || '',
    },
    timeout: 95000,
  });
}

module.exports = { analyzeAts };
