const crypto = require('crypto');
const db = require('../db/database');
const aiRuntime = require('./v4AiRuntime');

const AGENTS = {
  job_advisor: { name: 'AI 岗位顾问', promptVersion: 'job-advisor-v4.0-1' },
  application_assistant: { name: 'AI 申请助手', promptVersion: 'application-assistant-v4.0-1' },
  interview_coach: { name: 'AI 面试教练', promptVersion: 'interview-coach-v4.0-1' },
  career_planner: { name: 'AI 职业规划师', promptVersion: 'career-planner-v4.0-1' }
};

function parseJson(value, fallback) { try { return JSON.parse(value); } catch (e) { return fallback; } }
function redact(value) {
  return String(value || '')
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已脱敏]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[邮箱已脱敏]')
    .replace(/\b\d{15,18}[0-9X]\b/ig, '[证件号已脱敏]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[银行卡已脱敏]');
}

function context(userId, applicationId) {
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id=?').get(userId) || {};
  const application = applicationId ? db.prepare('SELECT id,company,job_title,progress_status,deadline,next_action FROM applications WHERE id=? AND user_id=?').get(applicationId, userId) : null;
  return { profile: { school: profile.school || '', major: profile.major || '', degree: profile.degree || '', targetRoles: parseJson(profile.target_roles, []), skills: parseJson(profile.skills, []) }, application };
}

function buildOutput(agentType, input, snapshot) {
  const query = redact(input.query || input.message || '');
  const app = snapshot.application;
  const base = app ? `${app.company || '目标公司'} ${app.job_title || '目标岗位'}` : '当前求职目标';
  const responses = {
    job_advisor: `围绕 ${base}，建议先核验硬性资格，再按岗位技能、经历证据和投递时机排序。${query ? `你关注的问题是：${query}` : ''}`,
    application_assistant: `针对 ${base}，先确认默认简历版本和 JD，再生成申请材料草稿；任何保存动作都需要你确认。`,
    interview_coach: `针对 ${base}，建议从岗位专项题、行为题和一次短模拟开始，并用 STAR 结构复盘低分回答。`,
    career_planner: `结合画像中的目标岗位与技能，建议按“本周投递—能力补强—复盘”建立可完成的行动节奏。`
  };
  return { message: responses[agentType], suggestedActions: input.requestWrite ? [{ type: input.writeAction || 'create_today_task', requiresConfirmation: true }] : [] };
}

function normalizeOutput(value, input) {
  const message = String(value && value.message || '').trim().slice(0, 6000);
  return {
    message,
    suggestedActions: input.requestWrite ? [{
      type: String(input.writeAction || 'create_today_task').slice(0, 80),
      requiresConfirmation: true
    }] : []
  };
}

async function runTask(userId, taskId) {
  const row = db.prepare('SELECT * FROM ai_agent_tasks_v4 WHERE id=? AND user_id=?').get(taskId, userId);
  if (!row) return null;
  if (row.status === 'cancelled') return row;
  db.prepare("UPDATE ai_agent_tasks_v4 SET status='running', started_at=datetime('now') WHERE id=?").run(row.id);
  const input = parseJson(row.input, {});
  if (Number(row.timeout_ms) < 50 || input.simulateFailure === 'timeout') {
    db.prepare("UPDATE ai_agent_tasks_v4 SET status='failed', error_code='AI_TIMEOUT', error_message='AI 请求超时，已使用降级结果', output=?, finished_at=datetime('now') WHERE id=?")
      .run(JSON.stringify({ message: 'AI 暂时繁忙，已保留任务，可稍后重试。', degraded: true }), row.id);
    return db.prepare('SELECT * FROM ai_agent_tasks_v4 WHERE id=?').get(row.id);
  }
  const snapshot = parseJson(row.context_snapshot, {});
  const config = AGENTS[row.agent_type];
  const generated = await aiRuntime.generate({
    systemPrompt: '你是' + config.name + '。仅基于提供的用户画像和申请快照回答，不得编造经历、公司信息或申请状态。输出 JSON：{"message":"建议正文","suggestedActions":[]}。你不能直接执行写操作。',
    userPrompt: JSON.stringify({ input, context: snapshot }),
    temperature: 0.3,
    maxTokens: 1800,
    timeoutMs: Number(row.timeout_ms),
    fallback: () => buildOutput(row.agent_type, input, snapshot),
    validate: value => !!(value && typeof value.message === 'string' && value.message.trim())
  });
  const output = {
    ...normalizeOutput(generated.value, input),
    generation: aiRuntime.safeMetadata(generated)
  };
  if (generated.error && generated.attempts > 0) {
    db.prepare("UPDATE ai_agent_tasks_v4 SET status='failed', error_code=?, error_message=?, output=?, ai_model=?, finished_at=datetime('now') WHERE id=?")
      .run(generated.error.code, generated.error.message, JSON.stringify(output), generated.model, row.id);
    return db.prepare('SELECT * FROM ai_agent_tasks_v4 WHERE id=?').get(row.id);
  }
  const needsConfirmation = !!row.write_action;
  db.prepare("UPDATE ai_agent_tasks_v4 SET status=?, output=?, ai_model=?, finished_at=datetime('now') WHERE id=?")
    .run(needsConfirmation ? 'awaiting_confirmation' : 'completed', JSON.stringify(output), generated.model, row.id);
  return db.prepare('SELECT * FROM ai_agent_tasks_v4 WHERE id=?').get(row.id);
}

async function createTask(userId, agentType, applicationId, input, timeoutMs) {
  if (!AGENTS[agentType]) { const error = new Error('Agent 类型无效'); error.status = 400; throw error; }
  if (applicationId && !db.prepare('SELECT id FROM applications WHERE id=? AND user_id=?').get(applicationId, userId)) {
    const error = new Error('当前申请不存在'); error.status = 404; throw error;
  }
  const safeInput = { ...input, query: redact(input.query || input.message || '') };
  const writeAction = input.requestWrite ? String(input.writeAction || 'create_today_task').slice(0, 80) : '';
  const token = writeAction ? crypto.randomBytes(24).toString('hex') : '';
  const result = db.prepare(`INSERT INTO ai_agent_tasks_v4
    (user_id,agent_type,application_id,input,context_snapshot,write_action,confirmation_token,ai_model,prompt_version,timeout_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(userId, agentType, applicationId || null, JSON.stringify(safeInput), JSON.stringify(context(userId, applicationId)),
      writeAction, token, aiRuntime.getStatus().model, AGENTS[agentType].promptVersion, Math.max(1, Math.min(60000, Number(timeoutMs) || 20000)));
  return await runTask(userId, result.lastInsertRowid);
}

function view(row) { return row ? { id: row.id, agentType: row.agent_type, agentName: AGENTS[row.agent_type] && AGENTS[row.agent_type].name,
  applicationId: row.application_id, status: row.status, input: parseJson(row.input, {}), output: parseJson(row.output, {}),
  error: row.error_code ? { code: row.error_code, message: row.error_message } : null, retryCount: row.retry_count,
  writeAction: row.write_action, confirmationToken: row.status === 'awaiting_confirmation' ? row.confirmation_token : '',
  aiModel: row.ai_model, promptVersion: row.prompt_version, createdAt: row.created_at, finishedAt: row.finished_at } : null; }

function confirmWrite(userId, taskId, token) {
  const row = db.prepare("SELECT * FROM ai_agent_tasks_v4 WHERE id=? AND user_id=? AND status='awaiting_confirmation'").get(taskId, userId);
  if (!row || !token || token !== row.confirmation_token) { const error = new Error('确认令牌无效或任务已处理'); error.status = 409; throw error; }
  const input = parseJson(row.input, {}); const output = parseJson(row.output, {});
  if (row.write_action === 'update_application_next_action' && row.application_id) {
    db.prepare("UPDATE applications SET next_action=?,updated_at=datetime('now') WHERE id=? AND user_id=?").run(String(input.writeValue || output.message).slice(0, 300), row.application_id, userId);
  } else {
    db.prepare(`INSERT OR IGNORE INTO today_tasks_v4 (user_id,source_type,source_id,title,detail,priority)
      VALUES (?,'ai_agent',?,?,?,'medium')`).run(userId, row.id, String(input.taskTitle || `${AGENTS[row.agent_type].name}建议`).slice(0, 160), String(input.writeValue || output.message).slice(0, 1000));
  }
  db.prepare("UPDATE ai_agent_tasks_v4 SET status='completed',confirmed_at=datetime('now'),confirmation_token='' WHERE id=?").run(row.id);
  return db.prepare('SELECT * FROM ai_agent_tasks_v4 WHERE id=?').get(row.id);
}

module.exports = { AGENTS, redact, createTask, runTask, view, confirmWrite };
