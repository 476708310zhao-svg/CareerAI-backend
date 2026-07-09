// utils/api-campus.js
// 校招日历模块

const { request, _write } = require('./api-client.js');

function getCampusList(params) {
  const {
    region = '', positionType = '', year = '', keyword = '',
    recruitType = '', writtenTest = '', gradYear = '', page = 0, pageSize = 20,
    industry = '', educationLevel = '', overseasFriendly = '', visa = '', deadlineWindow = '',
    sort = '', latestDay = '', latestDate = '', timeout = 10000
  } = params || {};
  return request({
    path: '/api/campus',
    params: {
      region, position_type: positionType, year, keyword,
      recruit_type: recruitType, written_test: writtenTest, industry,
      education_level: educationLevel, overseas_friendly: overseasFriendly,
      visa, deadline_window: deadlineWindow, grad_year: gradYear,
      sort, latest_day: latestDay, latest_date: latestDate, page, pageSize
    },
    noCache: true,
    cacheTTL: 0,
    timeout
  });
}

function getCampusMeta() {
  return request({ path: '/api/campus/meta', params: {}, noCache: true, cacheTTL: 0 });
}

function getCampusDetail(id) {
  return request({ path: `/api/campus/${id}` });
}

function getNotifyTemplates() {
  return request({ path: '/api/notify/templates', params: {}, timeout: 5000 });
}

function subscribeCampusReminder(campusId, company, deadlineDate, positionName) {
  return _write({
    method: 'POST',
    path:   '/api/notify/campus-subscribe',
    body:   { campusId, company, deadlineDate: deadlineDate || '', positionName: positionName || '' }
  });
}

module.exports = { getCampusList, getCampusMeta, getCampusDetail, getNotifyTemplates, subscribeCampusReminder };
