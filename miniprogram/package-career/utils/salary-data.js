// Curated salary presets used by the salary tool UI.

const SALARY_ROLES = [
  { name: 'Software Engineer', emoji: '💻', naRange: '$110k–$220k', cnRange: '20k–60k' },
  { name: 'Product Manager',   emoji: '🎯', naRange: '$100k–$180k', cnRange: '18k–50k' },
  { name: 'Data Scientist',    emoji: '📊', naRange: '$110k–$200k', cnRange: '20k–55k' },
  { name: 'UX Designer',       emoji: '🎨', naRange: '$80k–$150k',  cnRange: '12k–35k' },
  { name: 'DevOps Engineer',   emoji: '⚙️', naRange: '$100k–$180k', cnRange: '18k–45k' },
  { name: 'ML Engineer',       emoji: '🤖', naRange: '$130k–$230k', cnRange: '25k–70k' }
];

const SALARY_COMPANIES = ['Google', 'Amazon', 'Meta', 'Microsoft', 'Apple', '字节跳动', '腾讯', '阿里巴巴'];

const COMPANY_SALARY_BASE = {
  'Google__Software Engineer__NA':    { min: 160000, median: 195000, max: 240000 },
  'Meta__Software Engineer__NA':      { min: 165000, median: 200000, max: 250000 },
  'Apple__Software Engineer__NA':     { min: 155000, median: 185000, max: 225000 },
  'Amazon__Software Engineer__NA':    { min: 145000, median: 172000, max: 215000 },
  'Microsoft__Software Engineer__NA': { min: 140000, median: 168000, max: 210000 },
  'Netflix__Software Engineer__NA':   { min: 180000, median: 220000, max: 280000 },
  'Stripe__Software Engineer__NA':    { min: 155000, median: 185000, max: 230000 },
  'Uber__Software Engineer__NA':      { min: 148000, median: 175000, max: 218000 },
  'Google__Data Scientist__NA':       { min: 150000, median: 185000, max: 228000 },
  'Meta__Data Scientist__NA':         { min: 155000, median: 192000, max: 238000 },
  'Amazon__Data Scientist__NA':       { min: 135000, median: 162000, max: 200000 },
  'Microsoft__Data Scientist__NA':    { min: 132000, median: 158000, max: 195000 },
  'Google__Product Manager__NA':      { min: 145000, median: 180000, max: 225000 },
  'Meta__Product Manager__NA':        { min: 150000, median: 185000, max: 230000 },
  'Amazon__Product Manager__NA':      { min: 135000, median: 165000, max: 205000 },
  'Microsoft__Product Manager__NA':   { min: 130000, median: 158000, max: 198000 },
  '字节跳动__软件工程师__CN':         { min: 300000, median: 500000, max: 700000 },
  '腾讯__软件工程师__CN':             { min: 280000, median: 460000, max: 650000 },
  '阿里巴巴__软件工程师__CN':         { min: 260000, median: 430000, max: 600000 },
  '美团__软件工程师__CN':             { min: 240000, median: 390000, max: 550000 },
  '京东__软件工程师__CN':             { min: 200000, median: 340000, max: 480000 },
  '华为__软件工程师__CN':             { min: 280000, median: 450000, max: 620000 },
  '快手__软件工程师__CN':             { min: 260000, median: 420000, max: 580000 },
  '字节跳动__产品经理__CN':           { min: 240000, median: 400000, max: 580000 },
  '腾讯__产品经理__CN':               { min: 220000, median: 360000, max: 520000 },
  '阿里巴巴__产品经理__CN':           { min: 200000, median: 340000, max: 490000 },
  '美团__产品经理__CN':               { min: 180000, median: 300000, max: 430000 }
};

module.exports = { SALARY_ROLES, SALARY_COMPANIES, COMPANY_SALARY_BASE };
