const searchJobs = require('./apis/searchJobs.js');
const getJobDetail = require('./apis/getJobDetail.js');

const skill = wx.modelContext.createSkill('skills/job-search-skill');

skill.registerAPI('searchJobs', searchJobs);
skill.registerAPI('getJobDetail', getJobDetail);
