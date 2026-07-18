const AGENT_ROLES = {
  job_advisor: '你是一位留学生求职岗位顾问，重点判断资格硬伤、岗位匹配度和投递优先级。',
  application_assistant: '你是一位留学生求职申请助手，重点检查材料缺口、沟通内容和跟进节奏。',
  interview_coach: '你是一位留学生求职面试教练，重点训练 STAR、岗位题、表达结构和复盘。',
  career_planner: '你是一位留学生职业规划师，重点拆解目标、能力差距和阶段行动计划。'
};

function redactSensitive(value) {
  return String(value || '')
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, '[手机号已脱敏]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已脱敏]');
}

function isV4EndpointMissing(error) {
  const message = String(error && error.message || '');
  return !!error && (Number(error.statusCode) === 404 || /(?:HTTP\s*404|not found)/i.test(message));
}

function buildLegacyMessages(payload, context) {
  const input = payload && payload.input || {};
  const agentType = payload && payload.agentType || 'job_advisor';
  const agent = context && context.agent || {};
  const application = context && context.application || {};
  const applicationText = application && (application.company || application.jobTitle)
    ? `\n当前申请：${redactSensitive(application.company || '未填写公司')} · ${redactSensitive(application.jobTitle || '未填写岗位')}`
    : '\n当前申请：未关联，请只根据用户本次提供的信息回答';
  const system = [
    AGENT_ROLES[agentType] || AGENT_ROLES.job_advisor,
    `当前专家名称：${agent.name || 'AI 求职专家'}。`,
    '请用中文给出简洁、具体、可执行的建议，优先使用分点结构，控制在 600 字以内。',
    '只能依据用户明确提供的信息，不得虚构经历、数据、公司政策、签证资格或申请结果。信息不足时，请直接列出需要补充的信息。',
    '当前处于兼容模式：只能生成建议，不得声称已经保存、写入、创建任务或修改任何用户数据。'
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `我的问题：${redactSensitive(input.query)}${applicationText}` }
  ];
}

function extractChatContent(response) {
  const payload = response && response.data && response.data.choices ? response.data : response;
  return String(payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content || '').trim();
}

function createLocalTask(payload, content, context) {
  const agent = context && context.agent || {};
  const now = new Date();
  return {
    id: `compat_${now.getTime()}`,
    agentType: payload && payload.agentType || 'job_advisor',
    agentName: agent.name || 'AI 求职专家',
    input: {
      query: redactSensitive(payload && payload.input && payload.input.query),
      requestWrite: false
    },
    output: { message: String(content || '').trim() },
    status: 'completed',
    aiModel: '兼容 AI 通道',
    promptVersion: 'agent-compat-v1',
    createdAt: now.toLocaleString('zh-CN'),
    compatibilityMode: true
  };
}

function mergeTasks(remoteTasks, localTasks) {
  const seen = new Set();
  return [...(localTasks || []), ...(remoteTasks || [])].filter(item => {
    const id = String(item && item.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

module.exports = {
  buildLegacyMessages,
  createLocalTask,
  extractChatContent,
  isV4EndpointMissing,
  mergeTasks,
  redactSensitive
};
