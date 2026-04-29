// utils/api-campus.js
// 校招日历模块

const { request, _write } = require('./api-client.js');

function getCampusList(params) {
  const {
    region = '', positionType = '', year = '', keyword = '',
    recruitType = '', writtenTest = '', gradYear = '', page = 0, pageSize = 20
  } = params || {};
  return request({
    path: '/api/campus',
    params: {
      region, position_type: positionType, year, keyword,
      recruit_type: recruitType, written_test: writtenTest,
      grad_year: gradYear, page, pageSize
    }
  });
}

function getCampusMeta() {
  return request({ path: '/api/campus/meta', params: {} });
}

function getCampusDetail(id) {
  return request({ path: `/api/campus/${id}` });
}

function getNotifyTemplates() {
  return request({ path: '/api/notify/templates', params: {} });
}

function subscribeCampusReminder(campusId, company, deadlineDate, positionName) {
  return _write({
    method: 'POST',
    path:   '/api/notify/campus-subscribe',
    body:   { campusId, company, deadlineDate: deadlineDate || '', positionName: positionName || '' }
  });
}

module.exports = { getCampusList, getCampusMeta, getCampusDetail, getNotifyTemplates, subscribeCampusReminder };
