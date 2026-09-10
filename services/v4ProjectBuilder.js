'use strict';

const db = require('../db/database');
const { findJobById } = require('../utils/jobData');
const { getProfile } = require('./v4Profile');
const { getSponsorProfile } = require('./v4Sponsor');
const { buildJobMatch } = require('./v4JobMatch');

const TRACKS = Object.freeze({
  data: {
    label: '数据分析',
    problem: '围绕公开数据定义一个可复现的业务问题，建立清洗、分析、验证与呈现链路。',
    sources: ['政府或国际组织开放数据', '公司公开报告或公开 API', '用户自行记录并说明许可的数据'],
    deliverables: ['可复现的数据字典与处理脚本', '分析报告或可交互看板', '结论限制与复现说明']
  },
  pm: {
    label: '产品',
    problem: '围绕目标用户的真实问题完成调研、需求取舍、原型与验证，不虚构用户量或增长结果。',
    sources: ['公开产品评论', '本人完成并留档的用户访谈', '公开行业报告'],
    deliverables: ['问题定义与证据', '需求优先级和原型', '可验证的测试记录与迭代说明']
  },
  tech: {
    label: '工程',
    problem: '实现一个可运行、可测试、可演示的最小产品，用真实测试和运行记录证明工程质量。',
    sources: ['官方技术文档', '许可明确的开源数据或 API', '本人生成的匿名测试数据'],
    deliverables: ['可运行代码与 README', '自动化测试和质量记录', '部署或本地演示说明']
  },
  consulting: {
    label: '咨询',
    problem: '围绕公开可验证的业务问题建立假设、分析框架、证据和建议，并明确数据限制。',
    sources: ['公司财报和官网', '政府与行业协会数据', '权威研究机构公开报告'],
    deliverables: ['问题树与关键假设', '带来源的分析模型', '建议、风险和实施路线图']
  },
  marketing: {
    label: '市场',
    problem: '基于公开内容或本人获授权的数据设计可测量的营销实验，不预先承诺不存在的增长。',
    sources: ['公开社媒内容', '平台公开趋势数据', '本人实际投放或内容实验记录'],
    deliverables: ['受众与渠道假设', '内容或活动方案', '真实实验数据与复盘']
  },
  ops: {
    label: '运营',
    problem: '选择一个真实流程建立现状基线、改进方案和验收口径，只记录实际发生的效率变化。',
    sources: ['本人可使用的流程记录', '公开运营基准', '匿名化的手工采样数据'],
    deliverables: ['流程图与现状基线', '改进方案和执行清单', '验收记录与风险复盘']
  }
});

function clean(value, max = 1000) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 5000) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function problem(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function uniqueList(value, limit = 20, max = 300) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map(item => clean(item, max)).filter(item => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function ownedApplication(userId, id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!row) throw problem('APPLICATION_NOT_FOUND', '关联申请不存在', 404);
  return row;
}

function ownedProject(userId, id) {
  const row = db.prepare("SELECT * FROM career_projects_v4 WHERE id=? AND user_id=? AND status!='archived'")
    .get(Number(id), userId);
  if (!row) throw problem('PROJECT_NOT_FOUND', '项目计划不存在', 404);
  return row;
}

function milestoneView(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || '',
    order: row.sort_order,
    status: row.status,
    evidenceNote: row.evidence_note || '',
    completedAt: row.completed_at || '',
    updatedAt: row.updated_at
  };
}

function projectView(row) {
  const milestones = db.prepare('SELECT * FROM career_project_milestones_v4 WHERE project_id=? AND user_id=? ORDER BY sort_order, id')
    .all(row.id, row.user_id).map(milestoneView);
  return {
    id: row.id,
    applicationId: row.application_id || null,
    jobId: row.job_id || '',
    track: row.track,
    trackLabel: TRACKS[row.track] ? TRACKS[row.track].label : row.track,
    title: row.title,
    targetRole: row.target_role || '',
    gaps: parseJson(row.gap_summary, []),
    problemStatement: row.problem_statement || '',
    dataSources: parseJson(row.data_sources, []),
    deliverables: parseJson(row.deliverables, []),
    acceptanceCriteria: parseJson(row.acceptance_criteria, []),
    status: row.status,
    progress: row.progress,
    verifiedCompletion: Boolean(row.verified_completion),
    completionEvidence: parseJson(row.completion_evidence, {}),
    resumeExperienceId: row.resume_experience_id || null,
    source: row.source,
    milestones,
    safetyNotice: '计划不是已完成经历；只有真实完成、逐项留证并由你确认后，才能转入简历经历库。',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function resolveContext(userId, payload) {
  const application = ownedApplication(userId, payload.applicationId);
  const jobId = clean(payload.jobId || (application && (application.source_job_id || application.job_id)), 160);
  let job = jobId ? findJobById(jobId) : null;
  if (!job && application) {
    const snapshot = parseJson(application.job_snapshot, {});
    job = {
      id: jobId,
      title: application.job_title || snapshot.title || '',
      company: application.company || snapshot.company || '',
      location: application.city || snapshot.location || '',
      description: snapshot.description || '',
      requirements: snapshot.requirements || []
    };
  }
  return { application, jobId, job };
}

function createProject(userId, payload = {}) {
  const track = clean(payload.track, 40);
  const template = TRACKS[track];
  if (!template) throw problem('INVALID_PROJECT_TRACK', '请选择有效的项目方向');
  const context = resolveContext(userId, payload);
  const targetRole = clean(payload.targetRole || (context.job && context.job.title) ||
    (context.application && context.application.job_title), 160);
  if (!targetRole) throw problem('TARGET_ROLE_REQUIRED', '请关联岗位或填写目标岗位');

  const profile = getProfile(userId) || {};
  let matchGaps = [];
  if (context.job && profile.completion >= 40) {
    matchGaps = buildJobMatch(context.job, profile, getSponsorProfile(context.job)).gaps || [];
  }
  const gaps = uniqueList([...(Array.isArray(payload.gaps) ? payload.gaps : []), ...matchGaps], 6, 240);
  if (!gaps.length) gaps.push(`缺少与 ${targetRole} 直接对应的可验证项目证据`);

  const title = clean(payload.title, 160) || `${targetRole} · ${template.label}证据项目`;
  const problemStatement = cleanMultiline(payload.problemStatement, 1500) || template.problem;
  const dataSources = uniqueList(payload.dataSources, 8, 300);
  const resolvedSources = dataSources.length ? dataSources : template.sources;
  const deliverables = uniqueList(payload.deliverables, 8, 300);
  const resolvedDeliverables = deliverables.length ? deliverables : template.deliverables;
  const acceptance = uniqueList(payload.acceptanceCriteria, 10, 300);
  const resolvedAcceptance = acceptance.length ? acceptance : [
    '每个数据来源均记录 URL、获取日期、许可或使用边界',
    '核心交付物可由第三方按照 README 或说明复现',
    '所有数字均来自实际测试或真实结果，不使用预估值冒充成果',
    '明确记录未完成项、失败结果和结论限制'
  ];

  const transaction = db.transaction(() => {
    const result = db.prepare(`INSERT INTO career_projects_v4
      (user_id, application_id, job_id, track, title, target_role, gap_summary, problem_statement,
       data_sources, deliverables, acceptance_criteria, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rules')`).run(
      userId, context.application && context.application.id, context.jobId, track, title, targetRole,
      JSON.stringify(gaps), problemStatement, JSON.stringify(resolvedSources),
      JSON.stringify(resolvedDeliverables), JSON.stringify(resolvedAcceptance));
    const insert = db.prepare(`INSERT INTO career_project_milestones_v4
      (project_id, user_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)`);
    [
      ['定义问题与证据边界', `确认目标岗位差距：${gaps.join('；')}。记录可用数据、许可和不能声称的内容。`],
      ['建立基线与最小方案', `完成可复现的最小版本，并记录当前基线、失败情况和测试方式。`],
      ['完成核心交付物', `交付：${resolvedDeliverables.join('；')}。每项保留链接、截图或运行记录。`],
      ['按验收标准复核', `逐条核对：${resolvedAcceptance.join('；')}。未通过项不能标记完成。`]
    ].forEach(([milestoneTitle, description], index) => insert.run(result.lastInsertRowid, userId, milestoneTitle, description, index + 1));
    return result.lastInsertRowid;
  });
  return projectView(ownedProject(userId, transaction()));
}

function recalculateProject(userId, projectId) {
  const project = ownedProject(userId, projectId);
  const totals = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='doing' THEN 1 ELSE 0 END) AS doing
    FROM career_project_milestones_v4 WHERE project_id=? AND user_id=?`).get(project.id, userId);
  const total = Number(totals.total || 0);
  const completed = Number(totals.completed || 0);
  const progress = total ? Math.round(completed / total * 100) : 0;
  const status = project.status === 'completed' ? 'completed' : (completed > 0 || Number(totals.doing || 0) > 0 ? 'in_progress' : 'planned');
  db.prepare(`UPDATE career_projects_v4 SET progress=?, status=?,
    started_at=CASE WHEN ?='in_progress' AND started_at='' THEN datetime('now') ELSE started_at END,
    updated_at=datetime('now') WHERE id=? AND user_id=?`).run(progress, status, status, project.id, userId);
  return ownedProject(userId, project.id);
}

function updateMilestone(userId, projectId, milestoneId, payload = {}) {
  const project = ownedProject(userId, projectId);
  if (project.status === 'completed') throw problem('PROJECT_ALREADY_COMPLETED', '已完成项目不能覆盖里程碑证据', 409);
  const milestone = db.prepare('SELECT * FROM career_project_milestones_v4 WHERE id=? AND project_id=? AND user_id=?')
    .get(Number(milestoneId), project.id, userId);
  if (!milestone) throw problem('MILESTONE_NOT_FOUND', '项目里程碑不存在', 404);
  const status = clean(payload.status, 30);
  if (!['pending', 'doing', 'completed'].includes(status)) throw problem('INVALID_MILESTONE_STATUS', '里程碑状态无效');
  const evidenceNote = payload.evidenceNote === undefined ? milestone.evidence_note : cleanMultiline(payload.evidenceNote, 3000);
  if (status === 'completed' && (payload.confirmEvidence !== true || !evidenceNote)) {
    throw problem('MILESTONE_EVIDENCE_REQUIRED', '完成里程碑前必须填写真实证据并确认');
  }
  db.prepare(`UPDATE career_project_milestones_v4 SET status=?, evidence_note=?,
    completed_at=CASE WHEN ?='completed' THEN datetime('now') ELSE '' END,
    updated_at=datetime('now') WHERE id=? AND project_id=? AND user_id=?`).run(
    status, evidenceNote, status, milestone.id, project.id, userId);
  return projectView(recalculateProject(userId, project.id));
}

function normalizeEvidence(payload) {
  const outcomes = uniqueList(payload && payload.outcomes, 10, 500);
  const artifacts = uniqueList(payload && payload.artifacts, 10, 1000);
  const limitations = uniqueList(payload && payload.limitations, 10, 500);
  if (!outcomes.length || !artifacts.length) {
    throw problem('PROJECT_COMPLETION_EVIDENCE_REQUIRED', '请至少记录一项真实成果和一项可核验交付物');
  }
  return { outcomes, artifacts, limitations, confirmedAt: new Date().toISOString(), source: 'user_confirmed' };
}

function completeProject(userId, id, payload = {}) {
  if (payload.confirmRealCompletion !== true) {
    throw problem('PROJECT_COMPLETION_CONFIRMATION_REQUIRED', '请确认项目和填写的成果均已真实完成');
  }
  const project = ownedProject(userId, id);
  const milestones = db.prepare('SELECT status, evidence_note FROM career_project_milestones_v4 WHERE project_id=? AND user_id=?')
    .all(project.id, userId);
  if (!milestones.length || milestones.some(item => item.status !== 'completed' || !clean(item.evidence_note))) {
    throw problem('PROJECT_MILESTONES_INCOMPLETE', '全部里程碑完成并留证后才能确认项目完成', 409);
  }
  const evidence = normalizeEvidence(payload.evidence);
  db.prepare(`UPDATE career_projects_v4 SET status='completed', progress=100, verified_completion=1,
    completion_evidence=?, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?`)
    .run(JSON.stringify(evidence), project.id, userId);
  return projectView(ownedProject(userId, project.id));
}

function numericalTokens(text) {
  return [...new Set((String(text || '').match(/\d+(?:\.\d+)?%?/g) || []))];
}

function exportToExperience(userId, id, payload = {}) {
  if (payload.confirmResumeWriteback !== true) {
    throw problem('RESUME_WRITEBACK_CONFIRMATION_REQUIRED', '请确认只把真实完成的成果写入简历素材');
  }
  const project = ownedProject(userId, id);
  if (project.status !== 'completed' || !project.verified_completion) {
    throw problem('PROJECT_NOT_VERIFIED', '项目未真实完成，不能写入简历素材', 409);
  }
  if (project.resume_experience_id) throw problem('PROJECT_ALREADY_EXPORTED', '该项目已写入经历库', 409);
  const resumeBullet = cleanMultiline(payload.resumeBullet, 1200);
  if (!resumeBullet) throw problem('RESUME_BULLET_REQUIRED', '请填写基于真实成果的简历描述');
  const evidence = parseJson(project.completion_evidence, {});
  const evidenceText = JSON.stringify(evidence);
  const unsupportedNumbers = numericalTokens(resumeBullet).filter(token => !evidenceText.includes(token));
  if (unsupportedNumbers.length) {
    throw problem('UNVERIFIED_PROJECT_METRIC', `简历描述包含未在完成证据中出现的数字：${unsupportedNumbers.join('、')}`, 422);
  }
  const content = {
    summary: resumeBullet,
    outcomes: evidence.outcomes || [],
    artifacts: evidence.artifacts || [],
    limitations: evidence.limitations || [],
    projectId: project.id,
    jobId: project.job_id || '',
    verifiedCompletion: true,
    evidenceSource: 'user_confirmed'
  };
  const transaction = db.transaction(() => {
    const result = db.prepare(`INSERT INTO career_experience_library
      (user_id, type, title, organization, start_date, end_date, content, verified)
      VALUES (?, 'project', ?, ?, ?, ?, ?, 1)`).run(
      userId, project.title, project.target_role || '', project.started_at || '', project.completed_at || '', JSON.stringify(content));
    db.prepare('UPDATE career_projects_v4 SET resume_experience_id=?, updated_at=datetime(\'now\') WHERE id=? AND user_id=?')
      .run(result.lastInsertRowid, project.id, userId);
    return result.lastInsertRowid;
  });
  const experienceId = transaction();
  return { project: projectView(ownedProject(userId, project.id)), experienceId, content };
}

function listProjects(userId) {
  return db.prepare("SELECT * FROM career_projects_v4 WHERE user_id=? AND status!='archived' ORDER BY updated_at DESC, id DESC")
    .all(userId).map(projectView);
}

function dashboard(userId) {
  const projects = listProjects(userId);
  const applications = db.prepare(`SELECT id, company, job_title AS jobTitle,
      source_job_id AS sourceJobId, job_id AS jobId FROM applications
    WHERE user_id=? AND COALESCE(archived_at,'')='' ORDER BY updated_at DESC, id DESC LIMIT 100`).all(userId);
  return {
    projects,
    applications,
    tracks: Object.entries(TRACKS).map(([value, item]) => ({ value, label: item.label })),
    summary: {
      active: projects.filter(item => ['planned', 'in_progress'].includes(item.status)).length,
      completed: projects.filter(item => item.status === 'completed').length,
      exported: projects.filter(item => item.resumeExperienceId).length
    },
    safetyNotice: '系统只生成项目计划，不声称项目已完成，也不会自动把计划或预估指标写入简历。'
  };
}

module.exports = {
  TRACKS,
  createProject,
  updateMilestone,
  completeProject,
  exportToExperience,
  listProjects,
  dashboard,
  numericalTokens
};
