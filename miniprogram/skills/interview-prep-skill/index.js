const searchInterviewExperiences = require('./apis/searchInterviewExperiences.js');
const getInterviewExperienceDetail = require('./apis/getInterviewExperienceDetail.js');

const skill = wx.modelContext.createSkill('skills/interview-prep-skill');

skill.registerAPI('searchInterviewExperiences', searchInterviewExperiences);
skill.registerAPI('getInterviewExperienceDetail', getInterviewExperienceDetail);
