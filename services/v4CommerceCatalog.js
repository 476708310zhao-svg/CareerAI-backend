'use strict';

const PRODUCTS = Object.freeze({
  0: Object.freeze({ planCode: 'pro_month', name: '求职 Pro 月卡', price: 4000, days: 30, kind: 'subscription', description: '完整求职工作台与 Pro 权益' }),
  1: Object.freeze({ planCode: 'pro_quarter', name: '求职 Pro 季卡', price: 10000, days: 90, kind: 'subscription', description: '完整求职工作台与 Pro 权益' }),
  2: Object.freeze({ planCode: 'pro_year', name: '求职 Pro 年卡', price: 29900, days: 365, kind: 'subscription', description: '长期求职与职业成长权益' }),
  3: Object.freeze({ planCode: 'pro_trial_7d', name: '体验会员', price: 1000, days: 7, kind: 'subscription', description: '7 天完整 Pro 权益体验' }),
  4: Object.freeze({ planCode: 'jd_resume_pack', name: 'JD 简历包', price: 1990, days: 30, kind: 'scenario', description: '定制简历版本与申请文案额度' }),
  5: Object.freeze({ planCode: 'interview_sprint_7d', name: '7 天面试冲刺包', price: 2990, days: 7, kind: 'scenario', description: '短期集中模拟面试与复练' }),
  6: Object.freeze({ planCode: 'autumn_recruit_quarter', name: '秋招季度包', price: 9900, days: 90, kind: 'scenario', description: '覆盖集中投递、面试和申请材料准备' })
});

const SCENARIO_CODES = new Set(Object.values(PRODUCTS).filter(item => item.kind === 'scenario').map(item => item.planCode));
const SUBSCRIPTION_CODES = new Set(Object.values(PRODUCTS).filter(item => item.kind === 'subscription').map(item => item.planCode));

function productById(id) { return PRODUCTS[Number(id)] || null; }
function productByCode(code) { return Object.values(PRODUCTS).find(item => item.planCode === code) || null; }
function planKind(code) { return SCENARIO_CODES.has(code) ? 'scenario' : (SUBSCRIPTION_CODES.has(code) ? 'subscription' : code === 'free' ? 'free' : 'unknown'); }

module.exports = { PRODUCTS, SCENARIO_CODES, SUBSCRIPTION_CODES, productById, productByCode, planKind };
