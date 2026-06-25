'use strict';

const TIME_ZONE = 'Asia/Shanghai';

function limitText(value, fallback = '', max = 20) {
  const text = String(value || fallback || '').trim();
  return text.slice(0, max);
}

function formatWxTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`;
}

function applicationFeedbackData({ title, company, result = '已投递', remark = '请关注后续进展', date } = {}) {
  return {
    thing1: { value: limitText(title, '职位') },
    thing2: { value: limitText(company, '招聘企业') },
    thing3: { value: limitText(result, '已投递') },
    time4: { value: formatWxTime(date) },
    thing5: { value: limitText(remark, '请关注后续进展') },
  };
}

function scheduleReminderData({ topic, description, time, status = '已订阅' } = {}) {
  return {
    thing1: { value: limitText(topic, '校招截止提醒') },
    thing2: { value: limitText(description, '截止前7天及当天提醒') },
    time8: { value: limitText(time, formatWxTime()) },
    phrase5: { value: limitText(status, '已订阅', 5) },
  };
}

function paymentSuccessData({ orderNo, productName, amount, expireDate, result = '支付成功' } = {}) {
  return {
    character_string1: { value: limitText(orderNo, '会员订单', 32) },
    thing2: { value: limitText(productName, '会员权益') },
    amount3: { value: limitText(amount, '0.00元', 12) },
    date4: { value: limitText(expireDate, formatWxTime(new Date()).slice(0, 10), 10) },
    phrase5: { value: limitText(result, '支付成功', 5) },
  };
}

function paymentReminderData({ orderTime, amount, orderNo, deadline } = {}) {
  const now = new Date();
  const deadlineDate = deadline || new Date(now.getTime() + 15 * 60 * 1000);
  return {
    time1: { value: limitText(orderTime || formatWxTime(now), formatWxTime(now), 16) },
    amount2: { value: limitText(amount, '0.00元', 12) },
    character_string3: { value: limitText(orderNo, '会员订单', 32) },
    time4: { value: limitText(formatWxTime(deadlineDate), formatWxTime(deadlineDate), 16) },
  };
}

module.exports = {
  applicationFeedbackData,
  paymentReminderData,
  paymentSuccessData,
  scheduleReminderData,
  formatWxTime,
};
