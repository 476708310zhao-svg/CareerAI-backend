const searchCampusOpportunities = require('./searchCampusOpportunities.js');

function getUpcomingDeadlines(input) {
  const args = Object.assign({ deadlineWithinDays: 7 }, input || {});
  return searchCampusOpportunities(args, {
    componentPath: 'components/deadline-list/index'
  });
}

module.exports = getUpcomingDeadlines;
