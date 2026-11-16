const VISA_PATTERNS = [
  { tag: 'H-1B', positive: /(?:\b(?:will|can|may|does|do)\s+sponsor\b[^.!?\n]{0,55}\bH[- ]?1B\b|\bH[- ]?1B\b[^.!?\n]{0,55}\bsponsorship\s+(?:is\s+)?(?:available|provided|offered))/i },
  { tag: 'OPT', positive: /(?:\b(?:accept|welcome|support)\b[^.!?\n]{0,45}\bOPT\b|\bOPT\b[^.!?\n]{0,45}\b(?:accepted|welcome|eligible)\b)/i },
  { tag: 'CPT', positive: /(?:\b(?:accept|welcome|support)\b[^.!?\n]{0,45}\bCPT\b|\bCPT\b[^.!?\n]{0,45}\b(?:accepted|welcome|eligible)\b)/i },
  { tag: 'E-Verify', positive: /\b(?:participat(?:e|es|ing)\s+in\s+E-?Verify|E-?Verify\s+employer)\b/i }
];
const NEGATIVE_VISA = /\b(?:no|not|never|without|unable|cannot|can't|won't|will\s+not|does\s+not|do\s+not)\b[^.!?\n]{0,70}\b(?:sponsor|sponsorship|OPT|CPT|H[- ]?1B|E-?Verify)\b|\b(?:sponsor|sponsorship|OPT|CPT|H[- ]?1B|E-?Verify)\b[^.!?\n]{0,55}\b(?:not|unavailable|ineligible)\b/i;

function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function visaFromDescription(description) {
  const sentences = String(description || '').replace(/<[^>]*>/g, ' ')
    .split(/[.!?\n]+/).map(plainText).filter(Boolean);
  const evidence = [];
  for (const rule of VISA_PATTERNS) {
    const sentence = sentences.find(value => rule.positive.test(value) && !NEGATIVE_VISA.test(value));
    if (sentence) evidence.push({ tag: rule.tag, quote: sentence.slice(0, 160), source: '岗位描述' });
  }
  return evidence;
}

function salaryFromSource(job) {
  const source = job || {};
  const raw = plainText(source.job_salary_string || '');
  if (raw && /\d/.test(raw)) return { text: raw.slice(0, 100), source: '岗位源薪资原文' };
  const min = Number(source.job_min_salary);
  const max = Number(source.job_max_salary);
  if ((!Number.isFinite(min) || min <= 0) && (!Number.isFinite(max) || max <= 0)) return { text: '', source: '' };
  const currency = /^[A-Z]{3}$/.test(String(source.job_salary_currency || '')) ? source.job_salary_currency : '';
  const period = ({ YEAR: '年', ANNUAL: '年', MONTH: '月', WEEK: '周', DAY: '天', HOUR: '小时' })[
    String(source.job_salary_period || '').toUpperCase()];
  if (!currency || !period) return { text: '', source: '' };
  const number = value => Math.round(value).toLocaleString();
  const text = min > 0 && max > 0 ? `${currency} ${number(min)}–${number(max)}`
    : `${currency} ${number(min > 0 ? min : max)}${min > 0 ? '+' : ' 以下'}`;
  return { text: `${text}/${period}`, source: '岗位源薪资字段' };
}

module.exports = { plainText, visaFromDescription, salaryFromSource };
