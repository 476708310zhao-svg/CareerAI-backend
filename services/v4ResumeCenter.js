const db = require('../db/database');
const membership = require('./v4Membership');
const aiRuntime = require('./v4AiRuntime');

const RESUME_TYPES = ['sde', 'ai_engineer', 'data', 'quant', 'general'];
const EXPERIENCE_TYPES = ['education', 'experience', 'project', 'skill', 'award'];
const AI_MODEL = process.env.RESUME_AI_MODEL || aiRuntime.getStatus().model;
const PROMPT_VERSION = process.env.RESUME_PROMPT_VERSION || 'resume-v4.0-s2-2';

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function cleanText(value, max = 200) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

function normalizeResumeType(value) {
  const type = cleanText(value || 'general', 40).toLowerCase();
  return RESUME_TYPES.includes(type) ? type : 'general';
}

function legacyResumeContent(row) {
  const data = parseJson(row.data, null);
  if (data && typeof data === 'object') return data;
  return {
    education: parseJson(row.education, []),
    experience: parseJson(row.experience, []),
    projects: [],
    skills: parseJson(row.skills, []),
    awards: []
  };
}

function versionView(row) {
  if (!row) return null;
  return {
    id: row.id,
    resumeId: row.resume_id,
    versionNo: row.version_no,
    name: row.name,
    resumeType: row.resume_type,
    content: parseJson(row.content, {}),
    sourceVersionId: row.source_version_id || null,
    changeSetId: row.change_set_id || null,
    changeSummary: row.change_summary || '',
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function ensureCurrentVersion(userId, resumeId) {
  const resume = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(resumeId, userId);
  if (!resume) return null;
  let version = resume.current_version_id
    ? db.prepare('SELECT * FROM resume_versions_v4 WHERE id=? AND user_id=?').get(resume.current_version_id, userId)
    : null;
  if (!version) {
    version = db.prepare('SELECT * FROM resume_versions_v4 WHERE resume_id=? AND user_id=? ORDER BY version_no DESC LIMIT 1')
      .get(resumeId, userId);
  }
  if (!version) {
    const result = db.prepare(`
      INSERT INTO resume_versions_v4
        (resume_id, user_id, version_no, name, resume_type, content, change_summary, created_by)
      VALUES (?, ?, 1, ?, ?, ?, '导入原简历', 'migration')
    `).run(resumeId, userId, resume.name || '我的简历', normalizeResumeType(resume.resume_type), JSON.stringify(legacyResumeContent(resume)));
    version = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=?').get(result.lastInsertRowid);
  }
  if (Number(resume.current_version_id) !== Number(version.id)) {
    db.prepare('UPDATE resumes SET current_version_id=? WHERE id=? AND user_id=?').run(version.id, resumeId, userId);
  }
  return { resume, version };
}

function createVersion({ userId, resumeId, content, sourceVersionId, changeSetId = null, summary = '', createdBy = 'user', name, resumeType }) {
  const owned = ensureCurrentVersion(userId, resumeId);
  if (!owned) throw Object.assign(new Error('简历不存在'), { status: 404 });
  const entitlement = membership.getMembership(userId).entitlements;
  const versionLimit = Number(entitlement.resume_versions || 0);
  const currentCount = db.prepare('SELECT COUNT(*) AS count FROM resume_versions_v4 WHERE resume_id=? AND user_id=?').get(resumeId, userId).count;
  if (versionLimit >= 0 && currentCount >= versionLimit) {
    throw Object.assign(new Error(`当前套餐每份简历最多保留 ${versionLimit} 个版本`), { status: 429, code: 'RESUME_VERSION_LIMIT' });
  }
  const nextNo = db.prepare('SELECT COALESCE(MAX(version_no), 0) + 1 AS value FROM resume_versions_v4 WHERE resume_id=?')
    .get(resumeId).value;
  const result = db.prepare(`
    INSERT INTO resume_versions_v4
      (resume_id, user_id, version_no, name, resume_type, content, source_version_id, change_set_id, change_summary, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    resumeId, userId, nextNo, cleanText(name || owned.resume.name || '我的简历', 80),
    normalizeResumeType(resumeType || owned.resume.resume_type), JSON.stringify(content || {}),
    sourceVersionId || owned.version.id, changeSetId, cleanText(summary, 500), cleanText(createdBy, 30)
  );
  const version = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=?').get(result.lastInsertRowid);
  db.prepare(`
    UPDATE resumes SET data=?, current_version_id=?, resume_type=?, updated_at=datetime('now')
    WHERE id=? AND user_id=?
  `).run(version.content, version.id, version.resume_type, resumeId, userId);
  return versionView(version);
}

function flatten(value, prefix = '', output = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, output));
  } else if (value && typeof value === 'object') {
    Object.keys(value).sort().forEach(key => flatten(value[key], prefix ? `${prefix}.${key}` : key, output));
  } else {
    output[prefix || '$'] = value;
  }
  return output;
}

function compareContent(left, right) {
  const a = flatten(left);
  const b = flatten(right);
  return Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort().reduce((items, path) => {
    if (JSON.stringify(a[path]) !== JSON.stringify(b[path])) {
      items.push({ path, before: a[path] === undefined ? null : a[path], after: b[path] === undefined ? null : b[path] });
    }
    return items;
  }, []);
}

function collectStrings(value, output = []) {
  if (typeof value === 'string' && value.trim()) output.push(value.trim());
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, output));
  return output;
}

function collectStringEntries(value, prefix = '', output = []) {
  if (typeof value === 'string' && value.trim()) {
    output.push({ path: prefix || '$', text: value.trim() });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringEntries(item, `${prefix}[${index}]`, output));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      collectStringEntries(item, prefix ? `${prefix}.${key}` : key, output);
    });
  }
  return output;
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isNonResumeMetadata(value) {
  const text = normalizeComparableText(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/i.test(text)
    || /^(?:created|updated|timestamp|version)[_-]?(?:at|time)?\s*[:：]/i.test(text);
}

function containsSensitivePersonalInfo(value) {
  const text = String(value || '');
  return /\b1[3-9]\d{9}\b/.test(text)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /(?:联系电话|手机号码?|手机号|联系方式|电话)\s*[:：]?/i.test(text)
    || /\b\d{15,18}[0-9X]\b/i.test(text);
}

function compactDelimitedResumeText(value) {
  const source = normalizeComparableText(value);
  const parts = source.split(/[；;|｜\n]+/).map(item => item.trim()).filter(Boolean);
  if (parts.length < 2) return source;

  const hasResumeContext = parts.some(item => /工作经验|学历|本科|硕士|博士|项目|技能|教育/.test(item));
  const kept = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const next = parts[index + 1] || '';
    if (containsSensitivePersonalInfo(part)) continue;
    if (/^\d{1,2}$/.test(part) && /^岁(?:男|女)?$/.test(next)) {
      index += 1;
      continue;
    }
    if (/^\d{1,2}\s*岁(?:男|女)?$/.test(part) || /^(?:男|女)$/.test(part)) continue;
    if (index === 0 && hasResumeContext && /^[\u3400-\u9fff·]{2,5}$/.test(part)) continue;
    if (/^\d{1,2}$/.test(part) && /^年(?:工作)?经验/.test(next)) {
      kept.push(`${part}${next}`);
      index += 1;
      continue;
    }
    kept.push(part);
  }
  return kept.join('｜');
}

function polishFallbackText(value) {
  let after = normalizeComparableText(value);
  if (/[；;|｜\n]/.test(after)) after = compactDelimitedResumeText(after);
  after = after
    .replace(/(?:本人|我)\s*(?:主要)?负责(?:了)?/g, '负责')
    .replace(/主要负责(?:了)?/g, '负责')
    .replace(/参与了/g, '参与')
    .replace(/进行了/g, '开展')
    .replace(/，并且/g, '，')
    .replace(/([，,；;])\s*\1+/g, '$1')
    .replace(/\s+([，。；：])/g, '$1')
    .replace(/^[｜；;，,\s]+|[｜；;，,\s]+$/g, '')
    .trim();
  return after;
}

function defaultSuggestions(content, jdText) {
  return collectStringEntries(content)
    .filter(item => item.text.length >= 8 && !isNonResumeMetadata(item.text))
    .map(item => ({ ...item, after: polishFallbackText(item.text) }))
    .filter(item => item.after && normalizeComparableText(item.after) !== normalizeComparableText(item.text))
    .slice(0, 5)
    .map((item, index) => ({
      id: `suggestion_${index + 1}`,
      path: item.path,
      before: item.text,
      after: item.after,
      reason: containsSensitivePersonalInfo(item.text)
        ? '移除与求职无关的隐私信息，并整理为易读表达'
        : (jdText ? '压缩冗余表达，使真实经历更便于与岗位要求对照' : '压缩冗余表达，提高可读性'),
      sourceExperienceIds: [],
      addsFacts: false
    }));
}

function validateSuggestions(userId, content, suggestions) {
  const sourceText = collectStrings(content).join(' ');
  return suggestions.map((raw, index) => {
    const suggestion = {
      id: cleanText(raw.id || `suggestion_${index + 1}`, 80),
      path: cleanText(raw.path || '$', 200),
      before: cleanText(raw.before, 8000),
      after: cleanText(raw.after, 8000),
      reason: cleanText(raw.reason, 500),
      sourceExperienceIds: Array.isArray(raw.sourceExperienceIds) ? raw.sourceExperienceIds.map(Number).filter(Boolean) : [],
      addsFacts: raw.addsFacts === true
    };
    if (!suggestion.after) throw Object.assign(new Error(`第 ${index + 1} 条建议缺少修改后内容`), { status: 400 });
    if (normalizeComparableText(suggestion.before) === normalizeComparableText(suggestion.after)) {
      throw Object.assign(new Error(`第 ${index + 1} 条建议与原内容相同`), { status: 422, code: 'AI_SUGGESTION_UNCHANGED' });
    }
    if (isNonResumeMetadata(suggestion.before)) {
      throw Object.assign(new Error(`第 ${index + 1} 条建议引用的是系统元数据，不是简历内容`), { status: 422, code: 'AI_SUGGESTION_INVALID_FIELD' });
    }
    if (!suggestion.before || !sourceText.includes(suggestion.before)) {
      throw Object.assign(new Error(`第 ${index + 1} 条建议未准确引用原简历内容`), { status: 422, code: 'UNVERIFIED_FACT' });
    }
    let evidenceText = sourceText;
    if (suggestion.sourceExperienceIds.length) {
      const placeholders = suggestion.sourceExperienceIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id, content FROM career_experience_library WHERE user_id=? AND verified=1 AND archived_at='' AND id IN (${placeholders})`)
        .all(userId, ...suggestion.sourceExperienceIds);
      if (rows.length !== suggestion.sourceExperienceIds.length) {
        throw Object.assign(new Error(`第 ${index + 1} 条建议引用了不存在或未核验的经历`), { status: 422, code: 'UNVERIFIED_FACT' });
      }
      evidenceText += ' ' + rows.map(row => row.content).join(' ');
    }
    const newNumbers = (suggestion.after.match(/\b\d+(?:\.\d+)?%?\b/g) || [])
      .filter(token => !evidenceText.includes(token) && !suggestion.before.includes(token));
    if (newNumbers.length || (suggestion.addsFacts && !suggestion.sourceExperienceIds.length)) {
      throw Object.assign(new Error(`第 ${index + 1} 条建议包含无经历依据的新事实`), { status: 422, code: 'UNVERIFIED_FACT', details: newNumbers });
    }
    return suggestion;
  });
}

function replaceExact(value, before, after) {
  if (typeof value === 'string') return value === before ? after : value;
  if (Array.isArray(value)) return value.map(item => replaceExact(item, before, after));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceExact(item, before, after)]));
  }
  return value;
}

async function createChangeSet({ userId, resumeId, jobId = '', applicationId = null, suggestions, jdText = '' }) {
  const owned = ensureCurrentVersion(userId, resumeId);
  if (!owned) throw Object.assign(new Error('简历不存在'), { status: 404 });
  const content = parseJson(owned.version.content, {});
  let checked;
  let model = AI_MODEL;
  let generation = { source: 'client_provided', degraded: false, provider: '', model, attempts: 0, fallbackReason: '', errorCode: '' };
  if (Array.isArray(suggestions) && suggestions.length) {
    checked = validateSuggestions(userId, content, suggestions);
  } else {
    const resumeFields = collectStringEntries(content)
      .filter(item => item.text.length >= 8 && !isNonResumeMetadata(item.text) && !containsSensitivePersonalInfo(item.text))
      .slice(0, 40);
    const generated = await aiRuntime.generate({
      systemPrompt: '你是职引的专业简历优化助手。请针对求职价值、动作表达、结果呈现和可读性进行实质改写。只能改写 resumeFields 中已经存在的完整原文，不得新增经历、技能、学历、公司、日期、数字或任何未经证实的事实；不得返回与原文相同或仅改空格的内容；不得处理姓名、电话、邮箱、年龄、性别和系统时间戳。输出 JSON 数组，每项格式为 {"id":"suggestion_1","path":"原字段路径","before":"原文完整内容","after":"实质优化后的内容","reason":"具体修改原因","sourceExperienceIds":[],"addsFacts":false}。返回 1 到 5 条。',
      userPrompt: JSON.stringify({ resumeFields, jd: cleanText(jdText, 8000) }),
      temperature: 0.2,
      maxTokens: 2400,
      fallback: () => defaultSuggestions(content, jdText),
      validate: value => {
        if (!Array.isArray(value) || !value.length || value.length > 5) return false;
        validateSuggestions(userId, content, value);
        return true;
      }
    });
    checked = validateSuggestions(userId, content, generated.value);
    model = generated.model;
    generation = aiRuntime.safeMetadata(generated);
  }
  if (!checked.length) {
    throw Object.assign(new Error('当前简历没有可安全生成的有效优化建议，请补充项目、工作或教育经历后重试'), {
      status: 503,
      code: 'AI_SUGGESTION_UNAVAILABLE'
    });
  }
  const result = db.prepare(`
    INSERT INTO resume_ai_change_sets
      (user_id, resume_id, source_version_id, job_id, application_id, suggestions, ai_model, prompt_version, prompt_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, resumeId, owned.version.id, cleanText(jobId, 120), applicationId || null,
    JSON.stringify(checked), model, PROMPT_VERSION, cleanText(aiRuntime.redactSensitive(jdText), 8000));
  return Object.assign(getChangeSet(userId, result.lastInsertRowid), { generation });
}

function getChangeSet(userId, id) {
  const row = db.prepare('SELECT * FROM resume_ai_change_sets WHERE id=? AND user_id=?').get(id, userId);
  if (!row) return null;
  const source = db.prepare('SELECT content FROM resume_versions_v4 WHERE id=? AND user_id=?').get(row.source_version_id, userId);
  return {
    id: row.id, resumeId: row.resume_id, sourceVersionId: row.source_version_id,
    jobId: row.job_id, applicationId: row.application_id, status: row.status,
    suggestions: parseJson(row.suggestions, []), decisions: parseJson(row.decisions, {}),
    sourceContent: parseJson(source && source.content, {}),
    manualContent: parseJson(row.manual_content, null), aiModel: row.ai_model,
    promptVersion: row.prompt_version, quotaCost: row.quota_cost,
    resultVersionId: row.result_version_id, createdAt: row.created_at, confirmedAt: row.confirmed_at
  };
}

function confirmChangeSet({ userId, changeSetId, decisions = {}, manualContent }) {
  const row = db.prepare('SELECT * FROM resume_ai_change_sets WHERE id=? AND user_id=?').get(changeSetId, userId);
  if (!row) throw Object.assign(new Error('修改方案不存在'), { status: 404 });
  if (row.status !== 'pending') throw Object.assign(new Error('修改方案已处理，不能重复保存'), { status: 409 });
  const source = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=? AND user_id=?').get(row.source_version_id, userId);
  if (!source) throw Object.assign(new Error('原简历版本不存在'), { status: 409 });
  const suggestions = parseJson(row.suggestions, []);
  const normalizedDecisions = {};
  let content = parseJson(source.content, {});
  suggestions.forEach(item => {
    const decision = decisions[item.id] === 'accept' ? 'accept' : 'reject';
    normalizedDecisions[item.id] = decision;
    if (decision === 'accept') content = replaceExact(content, item.before, item.after);
  });
  if (manualContent !== undefined && manualContent !== null) {
    if (!manualContent || typeof manualContent !== 'object' || Array.isArray(manualContent)) {
      throw Object.assign(new Error('手动编辑内容必须是完整简历对象'), { status: 400 });
    }
    content = manualContent;
  }
  const tx = db.transaction(() => {
    const version = createVersion({
      userId, resumeId: row.resume_id, content, sourceVersionId: row.source_version_id,
      changeSetId: row.id, summary: `AI 建议确认：接受 ${Object.values(normalizedDecisions).filter(v => v === 'accept').length} 条`,
      createdBy: manualContent ? 'ai_confirmed_manual' : 'ai_confirmed'
    });
    db.prepare(`UPDATE resume_ai_change_sets SET status='confirmed', decisions=?, manual_content=?, result_version_id=?, confirmed_at=datetime('now') WHERE id=?`)
      .run(JSON.stringify(normalizedDecisions), manualContent ? JSON.stringify(manualContent) : '', version.id, row.id);
    return version;
  });
  const version = tx();
  return { changeSet: getChangeSet(userId, row.id), version };
}

module.exports = {
  RESUME_TYPES,
  EXPERIENCE_TYPES,
  AI_MODEL,
  PROMPT_VERSION,
  parseJson,
  cleanText,
  normalizeResumeType,
  versionView,
  ensureCurrentVersion,
  createVersion,
  compareContent,
  defaultSuggestions,
  validateSuggestions,
  createChangeSet,
  getChangeSet,
  confirmChangeSet
};
