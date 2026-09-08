'use strict';

const db = require('../db/database');
const { getProfile } = require('./v4Profile');
const { toV4Status } = require('../utils/applicationStatus');

const DIMENSION_ORDER = ['education', 'experience', 'skills', 'projects', 'resume', 'interview', 'networking'];
const DIMENSION_META = Object.freeze({
  education: {
    label: '教育与目标', taskTitle: '完善教育背景与求职目标',
    taskDetail: '补齐学校、专业、学历、毕业时间和目标岗位，让匹配结论建立在完整画像上。',
    url: '/package-user/pages/profile-edit/profile-edit', taskType: 'career_education'
  },
  experience: {
    label: '经历证据', taskTitle: '补充一段可核验经历',
    taskDetail: '写清职责、行动、结果和个人贡献；没有数据时不要编造指标。',
    url: '/package-career/pages/resume-center/resume-center', taskType: 'career_experience'
  },
  skills: {
    label: '技能证据', taskTitle: '补齐目标岗位技能证据',
    taskDetail: '选择一个目标岗位技能，并补充课程、项目或工作中的真实使用证据。',
    url: '/package-user/pages/profile-edit/profile-edit', taskType: 'career_skills'
  },
  projects: {
    label: '项目作品', taskTitle: '整理一个真实项目成果',
    taskDetail: '为项目补齐问题、方法、个人贡献、交付物与可验证结果。',
    url: '/package-career/pages/resume-center/resume-center', taskType: 'career_projects'
  },
  resume: {
    label: '简历就绪', taskTitle: '完成一版岗位定制简历',
    taskDetail: '选择真实简历版本，按目标 JD 逐条确认建议并保留历史版本。',
    url: '/package-career/pages/resume-center/resume-center', taskType: 'career_resume'
  },
  interview: {
    label: '面试准备', taskTitle: '完成一次专项模拟面试',
    taskDetail: '围绕目标岗位完成练习，并根据报告中的低分维度复练。',
    url: '/package-ai/pages/interview-space/interview-space', taskType: 'career_interview'
  },
  networking: {
    label: 'Networking', taskTitle: '建立一条真实联系人记录',
    taskDetail: '记录联系人、公司、岗位和下一步；不得虚构校友、共同经历或推荐关系。',
    url: '/package-career/pages/networking/networking', taskType: 'career_networking'
  }
});

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function endOfWeek(value = new Date()) {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 6);
  return date;
}

function textSize(value) {
  return JSON.stringify(parseJson(value, value || {})).replace(/[\s{}\[\]",:]/g, '').length;
}

function scoreStatus(score) {
  if (score >= 75) return { code: 'strong', label: '证据较完整' };
  if (score >= 50) return { code: 'building', label: '正在建设' };
  return { code: 'priority', label: '优先补强' };
}

function dimension(key, score, evidence, gap) {
  const meta = DIMENSION_META[key];
  const normalizedScore = clamp(score);
  return {
    key,
    label: meta.label,
    score: normalizedScore,
    status: scoreStatus(normalizedScore),
    evidence,
    gap,
    action: {
      title: meta.taskTitle,
      detail: meta.taskDetail,
      url: meta.url,
      taskType: meta.taskType,
      priority: normalizedScore < 50 ? 'high' : 'medium'
    }
  };
}

function collectCareerSnapshot(userId, now = new Date()) {
  const profile = getProfile(userId) || {};
  const experiences = db.prepare(`SELECT type, title, verified, content, updated_at
    FROM career_experience_library
    WHERE user_id=? AND COALESCE(archived_at,'')=''`).all(userId);
  const resumes = db.prepare(`SELECT id, current_version_id, target_job_id, updated_at
    FROM resumes WHERE user_id=? AND COALESCE(archived_at,'')=''`).all(userId);
  const resumeVersions = db.prepare('SELECT COUNT(*) AS count FROM resume_versions_v4 WHERE user_id=?').get(userId).count;
  const confirmedResumeChanges = db.prepare("SELECT COUNT(*) AS count FROM resume_ai_change_sets WHERE user_id=? AND status='confirmed'").get(userId).count;
  const resumeLinks = db.prepare('SELECT COUNT(*) AS count FROM resume_job_links WHERE user_id=?').get(userId).count;
  const interviewReports = db.prepare('SELECT overall_score, created_at FROM interview_reports_v4 WHERE user_id=? ORDER BY id DESC').all(userId);
  const legacyContactRows = db.prepare('SELECT application_id FROM application_contacts WHERE user_id=?').all(userId);
  const networkingContactRows = db.prepare(`SELECT application_id FROM networking_contacts_v4
    WHERE user_id=? AND COALESCE(archived_at,'')=''`).all(userId);
  const contactRows = legacyContactRows.concat(networkingContactRows);
  const applications = db.prepare(`SELECT id, v4_status, progress_status, status, company, job_title,
      deadline, interview_time, next_action, applied_at, updated_at
    FROM applications WHERE user_id=? AND COALESCE(archived_at,'')=''`).all(userId)
    .map(row => ({ ...row, normalizedStatus: toV4Status(row) }));
  const history = db.prepare('SELECT application_id, to_status, created_at FROM application_history WHERE user_id=? ORDER BY id').all(userId);
  const weekStart = dateKey(startOfWeek(now));
  const weekEnd = dateKey(endOfWeek(now));
  const eventRows = db.prepare(`SELECT event_name, COUNT(*) AS count FROM analytics_events
    WHERE user_id=? AND date(created_at) BETWEEN ? AND ? GROUP BY event_name`).all(userId, weekStart, weekEnd);
  const completedTodayTasks = db.prepare(`SELECT COUNT(*) AS count FROM today_tasks_v4
    WHERE user_id=? AND status='completed' AND date(completed_at) BETWEEN ? AND ?`).get(userId, weekStart, weekEnd).count;
  return {
    userId, now, profile, experiences, resumes,
    resumeVersions: Number(resumeVersions || 0),
    confirmedResumeChanges: Number(confirmedResumeChanges || 0),
    resumeLinks: Number(resumeLinks || 0),
    interviewReports, contacts: contactRows.length,
    contactApplications: new Set(contactRows.map(item => item.application_id)).size,
    applications, history,
    eventCounts: Object.fromEntries(eventRows.map(row => [row.event_name, Number(row.count || 0)])),
    completedTodayTasks: Number(completedTodayTasks || 0),
    weekStart, weekEnd
  };
}

function buildDiagnostic(snapshot) {
  const profile = snapshot.profile || {};
  const verified = snapshot.experiences.filter(item => Boolean(item.verified));
  const workItems = verified.filter(item => item.type === 'experience');
  const skillItems = verified.filter(item => item.type === 'skill');
  const projectItems = verified.filter(item => item.type === 'project');
  const detailedWork = workItems.filter(item => textSize(item.content) >= 50).length;
  const detailedProjects = projectItems.filter(item => textSize(item.content) >= 50).length;
  const profileSkills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
  const profileProjects = Array.isArray(profile.projects) ? profile.projects.filter(Boolean) : [];

  const educationFields = [profile.school, profile.major, profile.degree, profile.graduationYear].filter(Boolean).length;
  const hasTarget = Array.isArray(profile.targetRoles) && profile.targetRoles.length > 0;
  const educationScore = educationFields * 20 + (hasTarget ? 20 : 0);
  const educationMissing = [];
  if (educationFields < 4) educationMissing.push('教育基础字段');
  if (!hasTarget) educationMissing.push('目标岗位');

  const experienceScore = 20 + Math.min(50, workItems.length * 20) + Math.min(30, detailedWork * 15);
  const skillCount = new Set(profileSkills.concat(skillItems.map(item => item.title).filter(Boolean)).map(item => String(item).toLowerCase())).size;
  const skillsScore = 15 + Math.min(70, skillCount * 12) + Math.min(15, skillItems.length * 8);
  const projectCount = profileProjects.length + projectItems.length;
  const projectScore = 15 + Math.min(55, projectCount * 20) + Math.min(30, detailedProjects * 15);
  const resumeScore = 15 + (snapshot.resumes.length ? 35 : 0)
    + (snapshot.resumes.some(item => item.current_version_id) ? 15 : 0)
    + (snapshot.resumeVersions > snapshot.resumes.length ? 10 : 0)
    + (snapshot.resumeLinks ? 15 : 0)
    + (snapshot.confirmedResumeChanges ? 10 : 0);
  const averageInterview = snapshot.interviewReports.length
    ? Math.round(snapshot.interviewReports.reduce((sum, item) => sum + Number(item.overall_score || 0), 0) / snapshot.interviewReports.length)
    : 0;
  const interviewScore = snapshot.interviewReports.length
    ? 35 + averageInterview * 0.55 + Math.min(10, (snapshot.interviewReports.length - 1) * 5)
    : 20;
  const applicationsWithContacts = Number(snapshot.contactApplications || 0);
  const networkingScore = 15 + Math.min(65, snapshot.contacts * 18) + Math.min(20, applicationsWithContacts * 5);

  const dimensions = [
    dimension('education', educationScore,
      [`教育基础字段 ${educationFields}/4`, `目标岗位 ${hasTarget ? '已设置' : '未设置'}`],
      educationMissing.length ? `当前缺少：${educationMissing.join('、')}` : '教育与目标信息已形成基础证据'),
    dimension('experience', experienceScore,
      [`已核验工作/实践经历 ${workItems.length} 条`, `含较完整行动与结果描述 ${detailedWork} 条`],
      workItems.length ? '继续补齐个人贡献和可验证结果' : '当前系统没有可核验的工作或实践经历'),
    dimension('skills', skillsScore,
      [`画像与经历库共记录 ${skillCount} 项技能`, `独立技能证据 ${skillItems.length} 条`],
      skillCount >= 5 ? '继续把技能连接到项目、经历或作品' : '目标岗位所需技能及使用证据仍不完整'),
    dimension('projects', projectScore,
      [`画像/经历库共记录 ${projectCount} 个项目`, `含较完整过程与结果 ${detailedProjects} 个`],
      projectCount ? '继续补齐交付物、个人贡献和真实结果' : '当前系统没有可验证的项目作品'),
    dimension('resume', resumeScore,
      [`有效简历 ${snapshot.resumes.length} 份，版本 ${snapshot.resumeVersions} 个`, `岗位关联 ${snapshot.resumeLinks} 条，已确认优化 ${snapshot.confirmedResumeChanges} 次`],
      snapshot.resumeLinks ? '用投递结果继续验证不同版本效果' : '尚未形成与目标岗位绑定的简历版本'),
    dimension('interview', interviewScore,
      [`已完成模拟报告 ${snapshot.interviewReports.length} 份`, `历史平均分 ${snapshot.interviewReports.length ? averageInterview : '暂无'}`],
      snapshot.interviewReports.length ? '根据报告低分维度持续复练' : '当前没有可验证的面试练习报告'),
    dimension('networking', networkingScore,
      [`已记录真实联系人 ${snapshot.contacts} 人`, `已建立联系人记录的申请 ${applicationsWithContacts} 个`],
      snapshot.contacts ? '补齐跟进节奏并记录真实回复' : '当前没有联系人与跟进证据')
  ];
  const overallScore = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  const priorities = dimensions.slice().sort((left, right) => left.score - right.score).slice(0, 3).map(item => item.key);
  return {
    overallScore,
    scoreLabel: scoreStatus(overallScore).label,
    scoreMeaning: '分数衡量当前系统中可核验的求职准备证据，不是个人能力、录用概率或成功率。',
    dimensions,
    priorities,
    profileVersion: Number(profile.profileVersion || 1),
    generatedAt: new Date(snapshot.now).toISOString()
  };
}

function funnelSets(snapshot) {
  const submitted = new Set();
  const interviews = new Set();
  const offers = new Set();
  const submittedStatuses = new Set(['applied', 'oa', 'phone_screen', 'interview_1', 'interview_2', 'final', 'offer', 'rejected']);
  const interviewStatuses = new Set(['phone_screen', 'interview_1', 'interview_2', 'final', 'offer']);
  snapshot.applications.forEach(item => {
    if (submittedStatuses.has(item.normalizedStatus)) submitted.add(item.id);
    if (interviewStatuses.has(item.normalizedStatus)) interviews.add(item.id);
    if (item.normalizedStatus === 'offer') offers.add(item.id);
  });
  snapshot.history.forEach(item => {
    if (submittedStatuses.has(item.to_status)) submitted.add(item.application_id);
    if (interviewStatuses.has(item.to_status)) interviews.add(item.application_id);
    if (item.to_status === 'offer') offers.add(item.application_id);
  });
  return { submitted, interviews, offers };
}

function conversion(numerator, denominator, label) {
  return {
    label,
    numerator,
    denominator,
    rate: denominator > 0 ? Math.round(numerator / denominator * 100) : null,
    display: denominator > 0 ? `${numerator}/${denominator}` : '样本不足'
  };
}

function parseTimestamp(value) {
  if (!value) return 0;
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T') + 'Z';
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function identifyBottleneck(snapshot, sets) {
  const staleBefore = new Date(snapshot.now).getTime() - 7 * 86400000;
  const stale = snapshot.applications.filter(item => !['offer', 'rejected', 'withdrawn'].includes(item.normalizedStatus)
    && parseTimestamp(item.updated_at || item.applied_at) < staleBefore);
  if (!snapshot.applications.length) return { code: 'sourcing', label: '目标岗位与申请样本不足', evidence: '当前申请看板为空，无法形成真实转化判断。' };
  if (sets.submitted.size < 3) return { code: 'application_volume', label: '有效投递样本不足', evidence: `当前仅记录 ${sets.submitted.size} 个已投递申请，优先建立可复盘样本。` };
  if (sets.interviews.size / sets.submitted.size < 0.2) return { code: 'resume_targeting', label: '投递到面试环节偏弱', evidence: `历史记录为 ${sets.interviews.size}/${sets.submitted.size}；这是历史样本，不是未来成功率。` };
  if (sets.interviews.size >= 2 && sets.offers.size / sets.interviews.size < 0.2) return { code: 'interview_conversion', label: '面试到 Offer 环节偏弱', evidence: `历史记录为 ${sets.offers.size}/${sets.interviews.size}；应优先复盘面试证据和表达。` };
  if (stale.length) return { code: 'follow_up', label: '申请跟进存在停滞', evidence: `${stale.length} 个进行中申请超过 7 天没有更新。` };
  return { code: 'consistency', label: '保持稳定执行节奏', evidence: '暂未发现单一明显瓶颈，继续累积真实样本并每周复盘。' };
}

function buildWeeklyReport(snapshot) {
  const sets = funnelSets(snapshot);
  const weekHistory = snapshot.history.filter(item => String(item.created_at || '').slice(0, 10) >= snapshot.weekStart
    && String(item.created_at || '').slice(0, 10) <= snapshot.weekEnd);
  const weeklySubmitted = new Set(weekHistory.filter(item => ['applied', 'oa'].includes(item.to_status)).map(item => item.application_id)).size;
  const weeklyInterviews = new Set(weekHistory.filter(item => ['phone_screen', 'interview_1', 'interview_2', 'final'].includes(item.to_status)).map(item => item.application_id)).size;
  const weeklyOffers = new Set(weekHistory.filter(item => item.to_status === 'offer').map(item => item.application_id)).size;
  const events = snapshot.eventCounts;
  const bottleneck = identifyBottleneck(snapshot, sets);
  const conversions = [
    conversion(sets.interviews.size, sets.submitted.size, '投递 → 面试'),
    conversion(sets.offers.size, sets.interviews.size, '面试 → Offer')
  ];
  const input = {
    jobsViewed: Number(events.job_viewed || 0),
    jobsMatched: Number(events.job_matched || 0),
    resumesConfirmed: Number(events.resume_optimized || 0),
    applicationsAdded: Number(events.application_added || 0),
    applicationsSubmitted: Math.max(Number(events.application_submitted || 0), weeklySubmitted),
    interviewsReached: Math.max(Number(events.interview_reached || 0), weeklyInterviews),
    offersReceived: Math.max(Number(events.offer_received || 0), weeklyOffers),
    todayTasksCompleted: snapshot.completedTodayTasks
  };
  const focusByBottleneck = {
    sourcing: ['完善目标岗位与筛选条件', '建立第一批 Target/Reach/Safe 岗位池', '只记录真实投递动作'],
    application_volume: ['完成 3 个高质量目标投递', '每个岗位绑定定制简历版本', '记录投递日期和下一步'],
    resume_targeting: ['复盘低转化岗位的资格和技能差距', '调整 Target/Reach/Safe 配比', '验证一版定制简历后再扩大投递'],
    interview_conversion: ['按低分维度完成专项复练', '为目标公司准备 STAR 证据', '面试后 24 小时记录复盘'],
    follow_up: ['处理超过 7 天未更新的申请', '更新下一步和截止时间', '对可联系对象安排真实跟进'],
    consistency: ['保持每日 3～5 个关键任务', '周末核对漏斗和未完成事项', '继续累积真实样本']
  };
  return {
    period: { start: snapshot.weekStart, end: snapshot.weekEnd },
    input,
    funnel: {
      applications: snapshot.applications.length,
      submitted: sets.submitted.size,
      interviews: sets.interviews.size,
      offers: sets.offers.size
    },
    conversions,
    bottleneck,
    nextWeekFocus: focusByBottleneck[bottleneck.code],
    evidenceNotice: '转化只描述当前账户已记录的历史样本；样本不足时不计算比例，也不预测未来录用概率。',
    generatedAt: new Date(snapshot.now).toISOString()
  };
}

function buildDynamicPlan(diagnostic, weeklyReport) {
  const lowest = diagnostic.dimensions.slice().sort((left, right) => left.score - right.score).slice(0, 3);
  const priorityLabels = lowest.map(item => item.label);
  const bottleneck = weeklyReport.bottleneck;
  return {
    basis: {
      bottleneck: bottleneck.label,
      evidence: bottleneck.evidence,
      priorityDimensions: priorityLabels
    },
    horizons: [
      {
        months: 3,
        title: '求职就绪与真实投递验证',
        objective: `先处理“${bottleneck.label}”，同时补强 ${priorityLabels.slice(0, 2).join('、')}。`,
        actions: weeklyReport.nextWeekFocus,
        metric: '以真实完成任务、有效投递、面试反馈和证据完善数量验收'
      },
      {
        months: 6,
        title: '稳定转化与证据迭代',
        objective: '根据真实漏斗变化调整岗位梯次、简历版本和面试训练优先级。',
        actions: ['每周复盘一次历史转化', '保留有效简历版本与面试证据', '停止低证据、低反馈的重复投入'],
        metric: '连续 4 周保持数据记录完整，并能解释优先级变化原因'
      },
      {
        months: 12,
        title: '长期竞争力与备选路径',
        objective: `把 ${priorityLabels.join('、')} 沉淀为可展示、可复用的真实证据。`,
        actions: ['形成持续更新的经历与项目证据库', '维护真实联系人和跟进记录', '根据市场反馈保留主路径与备选路径'],
        metric: '每个核心能力都有作品、经历、简历或面试反馈作为证据'
      }
    ],
    refreshTriggers: ['申请状态变化', '新简历版本确认', '完成面试报告', '每周首次打开陪跑中心'],
    generatedAt: weeklyReport.generatedAt
  };
}

function daysUntil(dateText, now) {
  if (!dateText) return null;
  const target = new Date(`${String(dateText).slice(0, 10)}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / 86400000);
}

function dailyCandidates(snapshot, diagnostic, weeklyReport) {
  const candidates = [];
  const add = item => {
    if (!item || !item.key || candidates.some(existing => existing.key === item.key)) return;
    candidates.push(item);
  };
  snapshot.applications.forEach(item => {
    const interviewDays = daysUntil(item.interview_time, snapshot.now);
    if (interviewDays !== null && interviewDays >= 0 && interviewDays <= 7) add({
      key: `interview_${item.id}`, type: 'career_interview', priority: 'high',
      title: `准备 ${item.company || '目标公司'} ${item.job_title || '岗位'}面试`,
      detail: `面试在 ${interviewDays === 0 ? '今天' : `${interviewDays} 天内`}，先查看 Interview Brief 并完成一次专项复练。`,
      url: '/package-ai/pages/interview-space/interview-space'
    });
    const deadlineDays = daysUntil(item.deadline, snapshot.now);
    if (deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 3 && ['interested', 'preparing'].includes(item.normalizedStatus)) add({
      key: `deadline_${item.id}`, type: 'career_application', priority: 'high',
      title: `处理 ${item.company || '目标岗位'} 申请截止`,
      detail: `距离截止 ${deadlineDays} 天，核对资格、简历版本和官方申请入口。`,
      url: `/package-user/pages/application-detail/application-detail?id=${item.id}`
    });
  });
  const bottleneckTask = {
    sourcing: { key: 'bottleneck_sourcing', type: 'career_jobs', title: '建立 3 个目标岗位梯次', detail: '各选择一个 Target、Reach、Safe 岗位，并核对身份与 Sponsor 条件。', url: '/pages/jobs/jobs' },
    application_volume: { key: 'bottleneck_apply', type: 'career_application', title: '完成一个高质量目标投递', detail: '使用真实简历版本并记录申请状态，不以点击官网代替确认投递。', url: '/pages/applications/applications' },
    resume_targeting: { key: 'bottleneck_resume', type: 'career_resume', title: '复盘一个低转化岗位', detail: '检查岗位梯次、资格差距与定制简历版本，形成一项可验证调整。', url: '/package-career/pages/resume-center/resume-center' },
    interview_conversion: { key: 'bottleneck_interview', type: 'career_interview', title: '完成一次面试弱项复练', detail: '选择报告中的最低分维度重新回答并自检证据。', url: '/package-ai/pages/interview-space/interview-space' },
    follow_up: { key: 'bottleneck_followup', type: 'career_follow_up', title: '更新一个停滞申请', detail: '核对状态、下一步与截止时间；有真实联系人时再安排跟进。', url: '/pages/applications/applications' },
    consistency: { key: 'bottleneck_review', type: 'career_review', title: '完成今日求职复盘', detail: '更新真实进度并确认明天最重要的一项行动。', url: '/pages/applications/applications' }
  }[weeklyReport.bottleneck.code];
  add({ ...bottleneckTask, priority: 'high' });
  diagnostic.dimensions.slice().sort((left, right) => left.score - right.score).forEach(item => add({
    key: `dimension_${item.key}`,
    type: item.action.taskType,
    priority: item.action.priority,
    title: item.action.title,
    detail: `${item.gap} ${item.action.detail}`,
    url: item.action.url
  }));
  [
    { key: 'fallback_progress', type: 'career_review', priority: 'medium', title: '更新一个申请的真实进度', detail: '补齐状态、下一步和时间，不用估计替代真实记录。', url: '/pages/applications/applications' },
    { key: 'fallback_profile', type: 'career_profile', priority: 'medium', title: '核对求职画像完整度', detail: '确认目标岗位、地区、工作授权和技能仍然准确。', url: '/package-user/pages/profile-edit/profile-edit' },
    { key: 'fallback_evidence', type: 'career_evidence', priority: 'low', title: '整理一条真实求职证据', detail: '从经历、项目、简历或面试反馈中补充一条可核验记录。', url: '/package-career/pages/resume-center/resume-center' }
  ].forEach(add);
  return candidates.slice(0, 5);
}

function hashKey(value) {
  let hash = 2166136261;
  const input = String(value || '');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0) || 1;
}

function insertCareerTasks(userId, candidates, date = dateKey()) {
  const insert = db.prepare(`INSERT OR IGNORE INTO today_tasks_v4
    (user_id, source_type, source_id, local_key, task_type, title, detail, priority, status, task_date, url, updated_at)
    VALUES (?, 'career_coach', ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'))`);
  let created = 0;
  db.transaction(() => {
    candidates.slice(0, 5).forEach(item => {
      const localKey = `career_coach_${item.key}`.slice(0, 120);
      const sourceId = hashKey(`${date}:${item.key}`);
      created += insert.run(userId, sourceId, localKey, item.type, item.title, item.detail, item.priority || 'medium', date, item.url || '').changes;
    });
  })();
  return created;
}

function saveDiagnostic(userId, date, diagnostic) {
  db.prepare(`INSERT INTO career_diagnostics_v4
    (user_id, snapshot_date, profile_version, overall_score, dimensions, evidence_notice, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
      profile_version=excluded.profile_version, overall_score=excluded.overall_score,
      dimensions=excluded.dimensions, evidence_notice=excluded.evidence_notice, updated_at=datetime('now')`)
    .run(userId, date, diagnostic.profileVersion, diagnostic.overallScore,
      JSON.stringify(diagnostic.dimensions), diagnostic.scoreMeaning);
}

function saveWeeklyReport(userId, report) {
  db.prepare(`INSERT INTO career_weekly_reports_v4 (user_id, week_start, week_end, report, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, week_start) DO UPDATE SET
      week_end=excluded.week_end, report=excluded.report, updated_at=datetime('now')`)
    .run(userId, report.period.start, report.period.end, JSON.stringify(report));
}

function buildCareerState(userId, now = new Date()) {
  const snapshot = collectCareerSnapshot(userId, now);
  const diagnostic = buildDiagnostic(snapshot);
  const weeklyReport = buildWeeklyReport(snapshot);
  const dynamicPlan = buildDynamicPlan(diagnostic, weeklyReport);
  saveDiagnostic(userId, dateKey(now), diagnostic);
  saveWeeklyReport(userId, weeklyReport);
  return { snapshot, diagnostic, weeklyReport, dynamicPlan };
}

function ensureDailyTasks(userId, now = new Date(), existingState = null) {
  const state = existingState || buildCareerState(userId, now);
  const candidates = dailyCandidates(state.snapshot, state.diagnostic, state.weeklyReport);
  const created = insertCareerTasks(userId, candidates, dateKey(now));
  return { created, planned: candidates.length, date: dateKey(now) };
}

function createDiagnosticTasks(userId, keys, now = new Date()) {
  const state = buildCareerState(userId, now);
  const requested = new Set((Array.isArray(keys) && keys.length ? keys : state.diagnostic.priorities)
    .filter(key => DIMENSION_ORDER.includes(key)));
  const candidates = state.diagnostic.dimensions.filter(item => requested.has(item.key)).slice(0, 5).map(item => ({
    key: `dimension_${item.key}`,
    type: item.action.taskType,
    priority: item.action.priority,
    title: item.action.title,
    detail: `${item.gap} ${item.action.detail}`,
    url: item.action.url
  }));
  const created = insertCareerTasks(userId, candidates, dateKey(now));
  return { created, requested: candidates.length, date: dateKey(now) };
}

module.exports = {
  DIMENSION_ORDER,
  DIMENSION_META,
  dateKey,
  startOfWeek,
  collectCareerSnapshot,
  buildDiagnostic,
  buildWeeklyReport,
  buildDynamicPlan,
  dailyCandidates,
  buildCareerState,
  ensureDailyTasks,
  createDiagnosticTasks
};
