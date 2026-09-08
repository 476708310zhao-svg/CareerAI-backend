'use strict';

const db = require('../db/database');
const { getProfile } = require('./v4Profile');

const STAGES = ['prospect', 'contacted', 'replied', 'coffee_chat', 'referral'];
const STAGE_LABELS = Object.freeze({
  prospect: '待联系', contacted: '已联系', replied: '已回复', coffee_chat: 'Coffee Chat', referral: 'Referral', closed: '已结束'
});
const DRAFT_TYPES = Object.freeze({
  connect_note: 'Connect Note',
  cold_message: 'Cold Message',
  coffee_chat: 'Coffee Chat',
  follow_up: 'Follow-up',
  referral_request: 'Referral Request'
});
const CHANNELS = new Set(['linkedin', 'email', 'alumni', 'event', 'other']);
const REFERRAL_OUTCOMES = new Set(['none', 'requested', 'pending', 'referred', 'declined']);

function clean(value, max = 1000) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 5000) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function error(code, message, status = 400) {
  const problem = new Error(message);
  problem.code = code;
  problem.status = status;
  return problem;
}

function dateOnly(value) {
  const text = clean(value, 40);
  if (!text) return '';
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  const parsed = match ? new Date(`${match[1]}T00:00:00Z`) : null;
  if (!match || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1]) {
    throw error('INVALID_DATE', '日期格式必须为 YYYY-MM-DD');
  }
  return match[1];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ownedApplication(userId, id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!row) throw error('APPLICATION_NOT_FOUND', '关联申请不存在', 404);
  return row;
}

function ownedResume(userId, id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!row) throw error('RESUME_NOT_FOUND', '关联简历不存在', 404);
  return row;
}

function ownedResumeVersion(userId, resumeId, id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=? AND resume_id=? AND user_id=?')
    .get(Number(id), Number(resumeId), userId);
  if (!row) throw error('RESUME_VERSION_NOT_FOUND', '关联简历版本不存在', 404);
  return row;
}

function ownedContact(userId, id) {
  const row = db.prepare("SELECT * FROM networking_contacts_v4 WHERE id=? AND user_id=? AND COALESCE(archived_at,'')='' ")
    .get(Number(id), userId);
  if (!row) throw error('CONTACT_NOT_FOUND', '联系人不存在', 404);
  return row;
}

function ownedDraft(userId, id) {
  const row = db.prepare(`SELECT d.*, c.name AS contact_name, c.company AS contact_company, c.role AS contact_role,
      c.status AS contact_status, c.referral_outcome AS contact_referral_outcome
    FROM networking_drafts_v4 d JOIN networking_contacts_v4 c ON c.id=d.contact_id
    WHERE d.id=? AND d.user_id=? AND c.user_id=?`).get(Number(id), userId, userId);
  if (!row) throw error('DRAFT_NOT_FOUND', '话术草稿不存在', 404);
  return row;
}

function contactView(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company || '',
    role: row.role || '',
    channel: row.channel || 'linkedin',
    contactValue: row.contact_value || '',
    relationshipContext: row.relationship_context || '',
    contextVerified: Boolean(row.context_verified),
    status: row.status || 'prospect',
    statusLabel: STAGE_LABELS[row.status] || row.status,
    referralOutcome: row.referral_outcome || 'none',
    lastContactedAt: row.last_contacted_at || '',
    nextFollowUpAt: row.next_follow_up_at || '',
    notes: row.notes || '',
    applicationId: row.application_id || null,
    resumeId: row.resume_id || null,
    resumeVersionId: row.resume_version_id || null,
    jobId: row.job_id || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function draftView(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name || '',
    type: row.draft_type,
    typeLabel: DRAFT_TYPES[row.draft_type] || row.draft_type,
    language: row.language,
    tone: row.tone,
    subject: row.subject || '',
    content: row.content,
    status: row.status,
    source: row.source,
    evidence: parseJson(row.evidence_snapshot, {}),
    sentAt: row.sent_at || '',
    applicationId: row.application_id || null,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function recordEvent(userId, contactId, stage, note = '') {
  db.prepare('INSERT INTO networking_events_v4 (user_id, contact_id, stage, note) VALUES (?, ?, ?, ?)')
    .run(userId, contactId, stage, clean(note, 500));
}

function scheduleFollowUp(userId, contact) {
  db.prepare("DELETE FROM today_tasks_v4 WHERE user_id=? AND source_type='networking_contact' AND source_id=? AND status='pending'")
    .run(userId, contact.id);
  if (!contact.next_follow_up_at || ['referral', 'closed'].includes(contact.status)) return null;
  const taskDate = dateOnly(contact.next_follow_up_at);
  const title = `跟进 ${contact.name} · ${taskDate}`;
  const detail = `核对与 ${contact.name}${contact.company ? `（${contact.company}）` : ''} 的真实沟通进度，再决定是否发送已编辑草稿。系统不会自动外发。`;
  const result = db.prepare(`INSERT OR IGNORE INTO today_tasks_v4
    (user_id, source_type, source_id, local_key, task_type, title, detail, priority, status, task_date, url, updated_at)
    VALUES (?, 'networking_contact', ?, ?, 'networking_follow_up', ?, ?, 'medium', 'pending', ?, ?, datetime('now'))`)
    .run(userId, contact.id, `networking_followup_${contact.id}_${taskDate}`, title, detail, taskDate,
      `/package-career/pages/networking/networking?contactId=${contact.id}`);
  return result.changes;
}

function hydrateContact(userId, id) {
  return ownedContact(userId, id);
}

function createContact(userId, payload = {}) {
  const name = clean(payload.name, 120);
  if (!name) throw error('NAME_REQUIRED', '联系人姓名不能为空');
  const application = ownedApplication(userId, payload.applicationId);
  const resumeIdProvided = Object.prototype.hasOwnProperty.call(payload, 'resumeId');
  const resumeId = resumeIdProvided ? payload.resumeId : application && application.resume_id;
  const resume = ownedResume(userId, resumeId);
  const resumeMatchesApplication = application && Number(application.resume_id) === Number(resume && resume.id);
  const resumeVersionId = Object.prototype.hasOwnProperty.call(payload, 'resumeVersionId')
    ? payload.resumeVersionId
    : resumeMatchesApplication
      ? application.resume_version_id || (resume && resume.current_version_id)
      : resume && resume.current_version_id;
  if (resumeVersionId) ownedResumeVersion(userId, resume && resume.id, resumeVersionId);
  const channel = CHANNELS.has(payload.channel) ? payload.channel : 'linkedin';
  const nextFollowUpAt = dateOnly(payload.nextFollowUpAt);
  const status = STAGES.includes(payload.status) ? payload.status : 'prospect';
  const result = db.prepare(`INSERT INTO networking_contacts_v4
    (user_id, application_id, resume_id, resume_version_id, job_id, name, company, role, channel,
     contact_value, relationship_context, context_verified, status, next_follow_up_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, application && application.id, resume && resume.id, resumeVersionId || null,
      clean(payload.jobId || (application && (application.source_job_id || application.job_id)), 160), name,
      clean(payload.company || (application && application.company), 160),
      clean(payload.role || (application && application.job_title), 160), channel, clean(payload.contactValue, 500),
      clean(payload.relationshipContext, 500), payload.contextVerified === true ? 1 : 0,
      status, nextFollowUpAt, clean(payload.notes, 1500));
  recordEvent(userId, result.lastInsertRowid, status, '联系人已创建');
  const row = hydrateContact(userId, result.lastInsertRowid);
  scheduleFollowUp(userId, row);
  return contactView(row);
}

function updateContact(userId, id, payload = {}) {
  const current = ownedContact(userId, id);
  const applicationChanged = Object.prototype.hasOwnProperty.call(payload, 'applicationId')
    && Number(payload.applicationId || 0) !== Number(current.application_id || 0);
  const application = Object.prototype.hasOwnProperty.call(payload, 'applicationId')
    ? ownedApplication(userId, payload.applicationId) : ownedApplication(userId, current.application_id);
  const resumeChanged = Object.prototype.hasOwnProperty.call(payload, 'resumeId')
    && Number(payload.resumeId || 0) !== Number(current.resume_id || 0);
  const requestedResumeId = Object.prototype.hasOwnProperty.call(payload, 'resumeId')
    ? payload.resumeId
    : applicationChanged
      ? application && application.resume_id
      : current.resume_id || (application && application.resume_id);
  const resume = ownedResume(userId, requestedResumeId);
  let requestedVersionId;
  if (Object.prototype.hasOwnProperty.call(payload, 'resumeVersionId')) {
    requestedVersionId = payload.resumeVersionId;
  } else if (applicationChanged && application && Number(application.resume_id) === Number(resume && resume.id)) {
    requestedVersionId = application.resume_version_id || (resume && resume.current_version_id);
  } else if (resumeChanged) {
    requestedVersionId = resume && resume.current_version_id;
  } else {
    requestedVersionId = current.resume_version_id || (application && application.resume_version_id) || (resume && resume.current_version_id);
  }
  if (requestedVersionId) ownedResumeVersion(userId, resume && resume.id, requestedVersionId);
  const field = (key, currentValue, max) => Object.prototype.hasOwnProperty.call(payload, key) ? clean(payload[key], max) : currentValue || '';
  const nextFollowUpAt = Object.prototype.hasOwnProperty.call(payload, 'nextFollowUpAt')
    ? dateOnly(payload.nextFollowUpAt) : current.next_follow_up_at || '';
  const channel = Object.prototype.hasOwnProperty.call(payload, 'channel') && CHANNELS.has(payload.channel)
    ? payload.channel : current.channel;
  const name = field('name', current.name, 120);
  if (!name) throw error('NAME_REQUIRED', '联系人姓名不能为空');
  db.prepare(`UPDATE networking_contacts_v4 SET application_id=?, resume_id=?, resume_version_id=?, job_id=?,
    name=?, company=?, role=?, channel=?, contact_value=?, relationship_context=?, context_verified=?, next_follow_up_at=?, notes=?, updated_at=datetime('now')
    WHERE id=? AND user_id=?`).run(
    application && application.id, resume && resume.id, requestedVersionId || null,
    Object.prototype.hasOwnProperty.call(payload, 'jobId')
      ? clean(payload.jobId, 160)
      : clean(applicationChanged && application ? application.source_job_id || application.job_id : current.job_id, 160),
    name, field('company', current.company || (application && application.company), 160),
    field('role', current.role || (application && application.job_title), 160), channel,
    field('contactValue', current.contact_value, 500),
    field('relationshipContext', current.relationship_context, 500),
    Object.prototype.hasOwnProperty.call(payload, 'contextVerified') ? (payload.contextVerified === true ? 1 : 0) : current.context_verified,
    nextFollowUpAt, field('notes', current.notes, 1500), current.id, userId);
  const row = hydrateContact(userId, current.id);
  scheduleFollowUp(userId, row);
  return contactView(row);
}

function updateStage(userId, id, stage, note = '') {
  if (![...STAGES, 'closed'].includes(stage)) throw error('INVALID_STAGE', '联系人阶段无效');
  const contact = ownedContact(userId, id);
  const lastContactedAt = ['contacted', 'replied', 'coffee_chat', 'referral'].includes(stage)
    ? new Date().toISOString() : contact.last_contacted_at || '';
  db.transaction(() => {
    db.prepare("UPDATE networking_contacts_v4 SET status=?, last_contacted_at=?, updated_at=datetime('now') WHERE id=? AND user_id=?")
      .run(stage, lastContactedAt, contact.id, userId);
    recordEvent(userId, contact.id, stage, note);
  })();
  const row = hydrateContact(userId, contact.id);
  scheduleFollowUp(userId, row);
  return contactView(row);
}

function senderEvidence(userId) {
  const profile = getProfile(userId) || {};
  const user = db.prepare('SELECT nickname FROM users WHERE id=?').get(userId) || {};
  const identity = [profile.degree, profile.major, profile.school].filter(Boolean).join(' · ');
  const target = Array.isArray(profile.targetRoles) && profile.targetRoles.length ? profile.targetRoles[0] : '';
  const skills = Array.isArray(profile.skills) ? profile.skills.slice(0, 3) : [];
  return {
    displayName: user.nickname && user.nickname !== '新用户' ? clean(user.nickname, 60) : '',
    identity,
    target,
    skills
  };
}

function draftCopy(type, language, tone, contact, sender, requestDetail) {
  const company = contact.company || '贵公司';
  const role = contact.role || sender.target || '相关岗位';
  const name = contact.name;
  const identityZh = sender.identity ? `我是${sender.identity}背景的求职者` : '我是一名正在认真准备求职的学生';
  const identityEn = sender.identity ? `I am a candidate with a ${sender.identity} background` : 'I am a student preparing for my job search';
  const contextZh = contact.context_verified && contact.relationship_context ? `我联系您的真实背景是：${contact.relationship_context}。` : '';
  const contextEn = contact.context_verified && contact.relationship_context ? `The context I have verified for reaching out is: ${contact.relationship_context}. ` : '';
  const requestZh = requestDetail ? `我想具体请教：${requestDetail}。` : '';
  const requestEn = requestDetail ? `My specific question is: ${requestDetail}. ` : '';
  const signZh = sender.displayName ? `\n\n${sender.displayName}` : '';
  const signEn = sender.displayName ? `\n\n${sender.displayName}` : '';
  const casualZh = tone === 'casual' ? '如果方便，很想听听您的建议；不方便也完全没关系。' : '如您方便，我希望听取您的建议；若不便也完全理解。';
  const casualEn = tone === 'casual' ? 'If you have time, I would love to hear your perspective—no worries at all if not.' : 'If convenient, I would appreciate your perspective; I completely understand if your schedule does not allow.';

  const zh = {
    connect_note: { subject: '', content: `${name}您好，${identityZh}，正在关注${company}的${role}机会。希望与您建立联系，了解您公开分享的职业经验。谢谢！` },
    cold_message: { subject: `请教${company}${role}相关经验`, content: `${name}您好，${identityZh}，目前正在关注${company}的${role}机会。${contextZh}${requestZh}${casualZh}${signZh}` },
    coffee_chat: { subject: `想向您请教${company}的职业经验`, content: `${name}您好，感谢您阅读消息。${identityZh}，希望更真实地了解${company}${role}的工作与成长路径。${contextZh}${requestZh}如果您未来两周有 15 分钟，我很希望做一次简短 Coffee Chat；若不方便也完全理解。${signZh}` },
    follow_up: { subject: `跟进：${company}${role}交流`, content: `${name}您好，想简短跟进一下此前的联系。${requestZh || `我仍在认真准备${company}的${role}机会。`}${casualZh}${signZh}` },
    referral_request: { subject: `${company}${role}申请与推荐流程请教`, content: `${name}您好，感谢此前的交流。我正在准备${company}的${role}正式申请。${requestZh}如果您了解该岗位并认为我的真实背景匹配，想请教是否有合适的推荐流程；是否推荐完全由您判断，不方便也完全没关系。${signZh}` }
  };
  const en = {
    connect_note: { subject: '', content: `Hi ${name}, ${identityEn} and I am exploring ${role} opportunities at ${company}. I would value connecting and learning from the professional experience you have shared. Thank you.` },
    cold_message: { subject: `Question about ${role} at ${company}`, content: `Hi ${name}, ${identityEn} and I am currently exploring ${role} opportunities at ${company}. ${contextEn}${requestEn}${casualEn}${signEn}` },
    coffee_chat: { subject: `A brief question about your experience at ${company}`, content: `Hi ${name}, thank you for reading my note. ${identityEn}, and I hope to better understand the work and growth path for ${role} at ${company}. ${contextEn}${requestEn}If you have 15 minutes in the next two weeks, I would appreciate a brief coffee chat. I completely understand if your schedule does not allow.${signEn}` },
    follow_up: { subject: `Follow-up: ${role} at ${company}`, content: `Hi ${name}, I wanted to briefly follow up on my earlier message. ${requestEn || `I am still thoughtfully preparing for ${role} opportunities at ${company}. `}${casualEn}${signEn}` },
    referral_request: { subject: `Question about the referral process for ${role} at ${company}`, content: `Hi ${name}, thank you again for our earlier conversation. I am preparing a formal application for the ${role} role at ${company}. ${requestEn}If you know the role and believe my verified background is relevant, could I ask whether there is an appropriate referral process? I completely understand if not.${signEn}` }
  };
  return (language === 'en' ? en : zh)[type];
}

function createDraft(userId, contactId, payload = {}) {
  const contact = ownedContact(userId, contactId);
  const type = clean(payload.type, 40);
  if (!Object.prototype.hasOwnProperty.call(DRAFT_TYPES, type)) throw error('INVALID_DRAFT_TYPE', '话术类型无效');
  if (type === 'referral_request' && !['replied', 'coffee_chat', 'referral'].includes(contact.status)) {
    throw error('RELATIONSHIP_NOT_READY', '至少记录“已回复”后再生成 Referral Request', 409);
  }
  const language = payload.language === 'en' ? 'en' : 'zh';
  const tone = payload.tone === 'casual' ? 'casual' : 'formal';
  const requestDetail = clean(payload.requestDetail, 240);
  const sender = senderEvidence(userId);
  const copy = draftCopy(type, language, tone, contact, sender, requestDetail);
  const evidence = {
    contact: { name: contact.name, company: contact.company || '', role: contact.role || '' },
    sender: { identity: sender.identity, target: sender.target, skills: sender.skills },
    verifiedRelationshipContext: contact.context_verified ? contact.relationship_context || '' : '',
    requestDetail,
    notice: '只使用账户内资料和用户确认的信息；未调用外部 AI，不代表消息已发送。'
  };
  const result = db.prepare(`INSERT INTO networking_drafts_v4
    (user_id, contact_id, application_id, draft_type, language, tone, subject, content, source, evidence_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rules', ?)`)
    .run(userId, contact.id, contact.application_id || null, type, language, tone, copy.subject, copy.content, JSON.stringify(evidence));
  return draftView(ownedDraft(userId, result.lastInsertRowid));
}

function updateDraft(userId, id, payload = {}) {
  const draft = ownedDraft(userId, id);
  if (draft.status === 'user_sent') throw error('DRAFT_ALREADY_SENT', '已标记发送的版本不可覆盖，请创建新草稿', 409);
  const subject = Object.prototype.hasOwnProperty.call(payload, 'subject') ? clean(payload.subject, 240) : draft.subject || '';
  const content = Object.prototype.hasOwnProperty.call(payload, 'content') ? cleanMultiline(payload.content, 5000) : draft.content;
  if (!content) throw error('CONTENT_REQUIRED', '草稿正文不能为空');
  const status = payload.status === 'copied' ? 'copied' : draft.status;
  db.prepare("UPDATE networking_drafts_v4 SET subject=?, content=?, status=?, updated_at=datetime('now') WHERE id=? AND user_id=?")
    .run(subject, content, status, draft.id, userId);
  return draftView(ownedDraft(userId, draft.id));
}

function markDraftSent(userId, id, payload = {}) {
  if (payload.confirmExternalSend !== true) {
    throw error('SEND_CONFIRMATION_REQUIRED', '请确认已由你本人在外部平台发送', 400);
  }
  const draft = ownedDraft(userId, id);
  const contact = ownedContact(userId, draft.contact_id);
  const nextFollowUpAt = dateOnly(payload.nextFollowUpAt);
  db.transaction(() => {
    db.prepare("UPDATE networking_drafts_v4 SET status='user_sent', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?")
      .run(draft.id, userId);
    const nextStatus = contact.status === 'prospect' ? 'contacted' : contact.status;
    const referralOutcome = draft.draft_type === 'referral_request' ? 'requested' : contact.referral_outcome;
    db.prepare(`UPDATE networking_contacts_v4 SET status=?, referral_outcome=?, last_contacted_at=datetime('now'),
      next_follow_up_at=?, updated_at=datetime('now') WHERE id=? AND user_id=?`)
      .run(nextStatus, referralOutcome, nextFollowUpAt || contact.next_follow_up_at || '', contact.id, userId);
    if (nextStatus !== contact.status) recordEvent(userId, contact.id, nextStatus, '用户确认已在外部平台发送');
  })();
  const updatedContact = hydrateContact(userId, contact.id);
  scheduleFollowUp(userId, updatedContact);
  return { draft: draftView(ownedDraft(userId, draft.id)), contact: contactView(updatedContact), sentBySystem: false };
}

function recordReferral(userId, contactId, payload = {}) {
  const contact = ownedContact(userId, contactId);
  const outcome = clean(payload.outcome, 30);
  if (!REFERRAL_OUTCOMES.has(outcome) || outcome === 'none') throw error('INVALID_REFERRAL_OUTCOME', 'Referral 结果无效');
  const applicationIdProvided = Object.prototype.hasOwnProperty.call(payload, 'applicationId');
  const application = ownedApplication(userId, applicationIdProvided ? payload.applicationId : contact.application_id);
  const applicationChanged = Number(application && application.id || 0) !== Number(contact.application_id || 0);
  const resumeIdProvided = Object.prototype.hasOwnProperty.call(payload, 'resumeId');
  const requestedResumeId = resumeIdProvided
    ? payload.resumeId
    : applicationChanged
      ? application && application.resume_id
      : contact.resume_id || (application && application.resume_id);
  const resume = ownedResume(userId, requestedResumeId);
  const resumeChanged = Number(resume && resume.id || 0) !== Number(contact.resume_id || 0);
  let resumeVersionId;
  if (Object.prototype.hasOwnProperty.call(payload, 'resumeVersionId')) {
    resumeVersionId = payload.resumeVersionId;
  } else if (applicationChanged && application && Number(application.resume_id) === Number(resume && resume.id)) {
    resumeVersionId = application.resume_version_id || (resume && resume.current_version_id);
  } else if (resumeChanged) {
    resumeVersionId = resume && resume.current_version_id;
  } else {
    resumeVersionId = contact.resume_version_id || (application && application.resume_version_id) || (resume && resume.current_version_id);
  }
  if (outcome === 'referred' && (!application || !resume || !resumeVersionId)) {
    throw error('REFERRAL_LINKS_REQUIRED', '记录 Referral 成功前必须关联正式申请和简历版本', 400);
  }
  if (resumeVersionId) ownedResumeVersion(userId, resume && resume.id, resumeVersionId);
  const nextStatus = outcome === 'referred' ? 'referral' : contact.status;
  db.transaction(() => {
    db.prepare(`UPDATE networking_contacts_v4 SET application_id=?, resume_id=?, resume_version_id=?, job_id=?,
      referral_outcome=?, status=?, next_follow_up_at=CASE WHEN ?='referred' THEN '' ELSE next_follow_up_at END,
      updated_at=datetime('now') WHERE id=? AND user_id=?`).run(
      application && application.id, resume && resume.id, resumeVersionId || null,
      Object.prototype.hasOwnProperty.call(payload, 'jobId')
        ? clean(payload.jobId, 160)
        : clean(applicationChanged && application
          ? application.source_job_id || application.job_id
          : contact.job_id || (application && (application.source_job_id || application.job_id)), 160),
      outcome, nextStatus, outcome, contact.id, userId);
    if (nextStatus !== contact.status) recordEvent(userId, contact.id, nextStatus, clean(payload.note, 500) || 'Referral 已记录');
  })();
  const row = hydrateContact(userId, contact.id);
  scheduleFollowUp(userId, row);
  return contactView(row);
}

function listContacts(userId, status = '') {
  const filter = [...STAGES, 'closed'].includes(status) ? status : '';
  const rows = filter
    ? db.prepare("SELECT * FROM networking_contacts_v4 WHERE user_id=? AND status=? AND COALESCE(archived_at,'')='' ORDER BY next_follow_up_at='', next_follow_up_at, updated_at DESC").all(userId, filter)
    : db.prepare("SELECT * FROM networking_contacts_v4 WHERE user_id=? AND COALESCE(archived_at,'')='' ORDER BY next_follow_up_at='', next_follow_up_at, updated_at DESC").all(userId);
  return rows.map(contactView);
}

function listDrafts(userId, contactId = null, limit = 20) {
  const cap = Math.max(1, Math.min(50, Number(limit) || 20));
  const rows = contactId
    ? db.prepare(`SELECT d.*, c.name AS contact_name FROM networking_drafts_v4 d
        JOIN networking_contacts_v4 c ON c.id=d.contact_id
        WHERE d.user_id=? AND d.contact_id=? ORDER BY d.id DESC LIMIT ?`).all(userId, Number(contactId), cap)
    : db.prepare(`SELECT d.*, c.name AS contact_name FROM networking_drafts_v4 d
        JOIN networking_contacts_v4 c ON c.id=d.contact_id
        WHERE d.user_id=? ORDER BY d.id DESC LIMIT ?`).all(userId, cap);
  return rows.map(draftView);
}

function funnel(userId, contacts) {
  const reached = new Map(contacts.map(item => [item.id, item.status === 'closed' ? 0 : Math.max(0, STAGES.indexOf(item.status))]));
  db.prepare('SELECT contact_id, stage FROM networking_events_v4 WHERE user_id=?').all(userId).forEach(item => {
    reached.set(item.contact_id, Math.max(reached.get(item.contact_id) || 0, STAGES.indexOf(item.stage)));
  });
  const stages = STAGES.slice(1).map((stage, index) => {
    const count = [...reached.values()].filter(rank => rank >= index + 1).length;
    const previous = index === 0 ? contacts.length : [...reached.values()].filter(rank => rank >= index).length;
    return {
      stage,
      label: STAGE_LABELS[stage],
      count,
      fromPrevious: previous > 0 ? Math.round(count / previous * 100) : null,
      display: previous > 0 ? `${count}/${previous}` : '样本不足'
    };
  });
  return { total: contacts.length, stages, notice: '漏斗只统计用户已记录的真实阶段，不预测回复或 Referral 成功率。' };
}

function options(userId) {
  const applications = db.prepare(`SELECT id, company, job_title AS jobTitle, source_job_id AS sourceJobId, job_id AS jobId,
      resume_id AS resumeId, resume_version_id AS resumeVersionId FROM applications
    WHERE user_id=? AND COALESCE(archived_at,'')='' ORDER BY updated_at DESC, id DESC LIMIT 100`).all(userId);
  const resumes = db.prepare("SELECT id, name, current_version_id AS currentVersionId FROM resumes WHERE user_id=? AND COALESCE(archived_at,'')='' ORDER BY updated_at DESC, id DESC LIMIT 100")
    .all(userId);
  return { applications, resumes };
}

function dashboard(userId) {
  const contacts = listContacts(userId);
  const today = todayKey();
  return {
    contacts,
    dueFollowUps: contacts.filter(item => item.nextFollowUpAt && item.nextFollowUpAt <= today && !['referral', 'closed'].includes(item.status)),
    drafts: listDrafts(userId, null, 10),
    funnel: funnel(userId, contacts),
    options: options(userId),
    stages: [...STAGES, 'closed'].map(value => ({ value, label: STAGE_LABELS[value] })),
    draftTypes: Object.entries(DRAFT_TYPES).map(([value, label]) => ({ value, label })),
    safetyNotice: '系统只生成、保存和复制可编辑草稿，不会代替你向任何外部联系人发送消息。'
  };
}

module.exports = {
  STAGES,
  STAGE_LABELS,
  DRAFT_TYPES,
  draftCopy,
  createContact,
  updateContact,
  updateStage,
  createDraft,
  updateDraft,
  markDraftSent,
  recordReferral,
  listContacts,
  listDrafts,
  funnel,
  dashboard
};
