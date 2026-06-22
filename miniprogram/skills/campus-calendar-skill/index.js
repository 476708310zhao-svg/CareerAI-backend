const searchCampusOpportunities = require('./apis/searchCampusOpportunities.js');
const getUpcomingDeadlines = require('./apis/getUpcomingDeadlines.js');

const skill = wx.modelContext.createSkill('skills/campus-calendar-skill');

skill.registerAPI('searchCampusOpportunities', searchCampusOpportunities);
skill.registerAPI('getUpcomingDeadlines', getUpcomingDeadlines);
