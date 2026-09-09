'use strict';

const SOURCE_MESSAGES = {
  timeout: '竞争力数据加载超时，请稍后重试',
  networkError: '无法连接竞争力服务，请检查网络后重试',
  rateLimit: '请求较频繁，请稍后再试',
  error: '竞争力服务暂时不可用，请稍后重试'
};

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasDashboardShape(data) {
  if (!isObject(data)) return false;
  const diagnostic = data.diagnostic;
  const plan = data.dynamicPlan;
  const weekly = data.weeklyReport;
  const today = data.today;
  return isObject(diagnostic)
    && Number.isFinite(Number(diagnostic.overallScore))
    && Array.isArray(diagnostic.dimensions)
    && diagnostic.dimensions.length === 7
    && isObject(plan)
    && isObject(plan.basis)
    && Array.isArray(plan.horizons)
    && plan.horizons.length === 3
    && isObject(weekly)
    && isObject(weekly.period)
    && isObject(weekly.input)
    && isObject(weekly.bottleneck)
    && Array.isArray(weekly.conversions)
    && Array.isArray(weekly.nextWeekFocus)
    && isObject(today)
    && Array.isArray(today.tasks)
    && Array.isArray(today.scheduled);
}

function parseDashboardResponse(response) {
  if (response && response._source === 'unauthorized') {
    return { state: 'login', message: '登录状态已失效，请重新登录' };
  }
  if (response && response._source) {
    return {
      state: 'error',
      message: SOURCE_MESSAGES[response._source] || SOURCE_MESSAGES.error
    };
  }
  if (!response || response.code !== 0) {
    return {
      state: 'error',
      message: response && response.message || SOURCE_MESSAGES.error
    };
  }
  if (!hasDashboardShape(response.data)) {
    return { state: 'error', message: '竞争力数据返回不完整，请稍后重试' };
  }
  return { state: 'ready', data: response.data };
}

module.exports = { hasDashboardShape, parseDashboardResponse };
